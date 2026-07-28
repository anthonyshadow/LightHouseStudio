import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { request as httpsRequest, RequestOptions } from 'node:https';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { SafeBflImageDownloader, isPublicImageAddress } from '../bfl/safe-image-downloader.js';
import {
  SafeWiroImageDownloader,
  isPublicWiroImageAddress,
} from '../wiro/safe-image-downloader.js';
import {
  MAX_PROVIDER_IMAGE_BYTES,
  type ReferenceImageMimeType,
} from './reference-image-provider.js';

interface ResolvedImageAddress {
  readonly address: string;
  readonly family: 4 | 6;
}

type ResolveHostname = (hostname: string) => Promise<readonly ResolvedImageAddress[]>;
type RequestImplementation = (
  url: URL,
  options: RequestOptions,
  callback: (response: IncomingMessage) => void,
) => ReturnType<typeof httpsRequest>;

interface ContractDownloader {
  download(
    url: string,
    signal: AbortSignal,
  ): Promise<{ readonly bytes: Buffer; readonly mimeType: ReferenceImageMimeType }>;
}

interface DownloaderContract {
  readonly providerId: 'bfl' | 'wiro';
  readonly create: (options?: {
    readonly resolveHostname?: ResolveHostname;
    readonly request?: RequestImplementation;
  }) => ContractDownloader;
  readonly isPublicAddress: (address: string) => boolean;
}

const contracts: readonly DownloaderContract[] = [
  {
    providerId: 'bfl',
    create: (options) => new SafeBflImageDownloader(options),
    isPublicAddress: isPublicImageAddress,
  },
  {
    providerId: 'wiro',
    create: (options) => new SafeWiroImageDownloader(options),
    isPublicAddress: isPublicWiroImageAddress,
  },
];

type RequestStub = EventEmitter & { end: () => void };

const response = (
  statusCode: number,
  headers: IncomingMessage['headers'],
  chunks: readonly (Buffer | string)[] = [],
): IncomingMessage => {
  const message = Readable.from(chunks) as IncomingMessage;
  message.statusCode = statusCode;
  message.headers = headers;
  return message;
};

const requestReturning =
  (createResponse: (url: URL, options: RequestOptions) => IncomingMessage): RequestImplementation =>
  (url, options, callback) => {
    const request = new EventEmitter() as RequestStub;
    request.end = () => callback(createResponse(url, options));
    return request as ReturnType<RequestImplementation>;
  };

const publicResolver: ResolveHostname = () => Promise.resolve([{ address: '8.8.8.8', family: 4 }]);

describe.each(contracts)(
  '$providerId safe remote-image downloader adversarial contract',
  ({ providerId, create, isPublicAddress }) => {
    it.each([
      ['0.0.0.1', false],
      ['10.0.0.1', false],
      ['100.64.0.1', false],
      ['127.0.0.1', false],
      ['169.254.169.254', false],
      ['172.16.0.1', false],
      ['192.0.0.1', false],
      ['192.0.2.1', false],
      ['192.168.1.2', false],
      ['198.18.0.1', false],
      ['198.51.100.1', false],
      ['203.0.113.1', false],
      ['224.0.0.1', false],
      ['240.0.0.1', false],
      ['::', false],
      ['::1', false],
      ['64:ff9b::1', false],
      ['100::1', false],
      ['2001:db8::1', false],
      ['fc00::1', false],
      ['fe80::1', false],
      ['ff00::1', false],
      ['::ffff:127.0.0.1', false],
      ['8.8.8.8', true],
      ['2606:4700:4700::1111', true],
      ['not-an-address', false],
    ] as const)('classifies address %s as public=%s', (address, expected) => {
      expect(isPublicAddress(address)).toBe(expected);
    });

    it.each([
      'http://cdn.example.test/image',
      'ftp://cdn.example.test/image',
      'https://user@cdn.example.test/image',
      'https://user:secret@cdn.example.test/image',
      'https://cdn.example.test/image#fragment',
    ])('rejects disallowed URL form %s before DNS or a connection', async (url) => {
      const resolveHostname = vi.fn(publicResolver);
      const request = vi.fn();
      const downloader = create({
        resolveHostname,
        request: request as unknown as RequestImplementation,
      });

      await expect(downloader.download(url, new AbortController().signal)).rejects.toMatchObject({
        providerId,
        reason: 'invalid-response',
      });
      expect(resolveHostname).not.toHaveBeenCalled();
      expect(request).not.toHaveBeenCalled();
    });

    it('rejects malformed and unresolved URLs before opening a connection', async () => {
      const request = vi.fn();
      const downloader = create({
        resolveHostname: () => Promise.resolve([]),
        request: request as unknown as RequestImplementation,
      });

      await expect(
        Promise.resolve().then(() =>
          downloader.download('not a URL', new AbortController().signal),
        ),
      ).rejects.toBeInstanceOf(TypeError);
      await expect(
        downloader.download('https://missing.example.test/image', new AbortController().signal),
      ).rejects.toMatchObject({ providerId, reason: 'invalid-response' });
      expect(request).not.toHaveBeenCalled();
    });

    it('rejects mixed public/private DNS results before opening a connection', async () => {
      const request = vi.fn();
      const downloader = create({
        resolveHostname: () =>
          Promise.resolve([
            { address: '8.8.8.8', family: 4 },
            { address: '127.0.0.1', family: 4 },
          ]),
        request: request as unknown as RequestImplementation,
      });

      await expect(
        downloader.download('https://cdn.example.test/image', new AbortController().signal),
      ).rejects.toMatchObject({ providerId, reason: 'invalid-response' });
      expect(request).not.toHaveBeenCalled();
    });

    it('pins every validated DNS result and forwards the caller signal', async () => {
      const signal = new AbortController().signal;
      const addresses = [
        { address: '8.8.8.8', family: 4 as const },
        { address: '2606:4700:4700::1111', family: 6 as const },
      ];
      const request = requestReturning((_url, options) => {
        expect(options.signal).toBe(signal);
        expect(options.lookup).toBeTypeOf('function');
        options.lookup?.('cdn.example.test', { all: true }, (error, resolved) => {
          expect(error).toBeNull();
          expect(resolved).toEqual(addresses);
        });
        return response(
          200,
          {
            'content-type': 'Image/PNG; charset=binary',
            'content-length': String(Buffer.byteLength('image-bytes')),
          },
          [Buffer.from('image-bytes')],
        );
      });
      const downloader = create({
        resolveHostname: () => Promise.resolve(addresses),
        request,
      });

      await expect(
        downloader.download('https://cdn.example.test/image?token=signed', signal),
      ).resolves.toEqual({ bytes: Buffer.from('image-bytes'), mimeType: 'image/png' });
    });

    it('pins a public IP literal without invoking DNS', async () => {
      const resolveHostname = vi.fn(publicResolver);
      const request = requestReturning((_url, options) => {
        options.lookup?.('8.8.8.8', { all: true }, (error, addresses) => {
          expect(error).toBeNull();
          expect(addresses).toEqual([{ address: '8.8.8.8', family: 4 }]);
        });
        return response(200, { 'content-type': 'image/jpeg' }, ['image']);
      });
      const downloader = create({ resolveHostname, request });

      await expect(
        downloader.download('https://8.8.8.8/image', new AbortController().signal),
      ).resolves.toMatchObject({ mimeType: 'image/jpeg' });
      expect(resolveHostname).not.toHaveBeenCalled();
    });

    it('revalidates DNS and URL policy before every redirected connection', async () => {
      const request = vi.fn<RequestImplementation>(
        requestReturning(() => response(302, { location: 'https://private.example.test/image' })),
      );
      const resolveHostname = vi.fn<ResolveHostname>((hostname) =>
        Promise.resolve([
          hostname === 'private.example.test'
            ? { address: '127.0.0.1', family: 4 }
            : { address: '8.8.8.8', family: 4 },
        ]),
      );
      const downloader = create({ resolveHostname, request });

      await expect(
        downloader.download('https://cdn.example.test/image', new AbortController().signal),
      ).rejects.toMatchObject({ providerId, reason: 'invalid-response' });
      expect(resolveHostname.mock.calls.map(([hostname]) => hostname)).toEqual([
        'cdn.example.test',
        'private.example.test',
      ]);
      expect(request).toHaveBeenCalledOnce();
    });

    it('rejects a redirect that downgrades the scheme before the next connection', async () => {
      const request = vi.fn<RequestImplementation>(
        requestReturning(() => response(302, { location: 'http://cdn.example.test/image' })),
      );
      const downloader = create({ resolveHostname: publicResolver, request });

      await expect(
        downloader.download('https://cdn.example.test/image', new AbortController().signal),
      ).rejects.toMatchObject({ providerId, reason: 'invalid-response' });
      expect(request).toHaveBeenCalledOnce();
    });

    it('follows no more than three redirects', async () => {
      const request = vi.fn<RequestImplementation>(
        requestReturning((url) =>
          response(302, { location: `https://cdn.example.test${url.pathname}/next` }),
        ),
      );
      const resolveHostname = vi.fn(publicResolver);
      const downloader = create({ resolveHostname, request });

      await expect(
        downloader.download('https://cdn.example.test/image', new AbortController().signal),
      ).rejects.toMatchObject({ providerId, reason: 'invalid-response' });
      expect(request).toHaveBeenCalledTimes(4);
      expect(resolveHostname).toHaveBeenCalledTimes(4);
    });

    it.each([
      [302, {}, 'failure'],
      [404, {}, 'failure'],
      [503, {}, 'failure'],
      [200, {}, 'invalid-response'],
      [200, { 'content-type': 'text/html' }, 'invalid-response'],
    ] as const)('rejects status %s with headers %j as %s', async (statusCode, headers, reason) => {
      const downloader = create({
        resolveHostname: publicResolver,
        request: requestReturning(() => response(statusCode, headers)),
      });

      await expect(
        downloader.download('https://cdn.example.test/image', new AbortController().signal),
      ).rejects.toMatchObject({
        providerId,
        reason,
        ...(reason === 'failure' ? { upstreamStatus: statusCode } : {}),
      });
    });

    it.each(['0', '-1', String(MAX_PROVIDER_IMAGE_BYTES + 1)])(
      'rejects declared content length %s before buffering',
      async (contentLength) => {
        const downloader = create({
          resolveHostname: publicResolver,
          request: requestReturning(() =>
            response(200, {
              'content-type': 'image/webp',
              'content-length': contentLength,
            }),
          ),
        });

        await expect(
          downloader.download('https://cdn.example.test/image', new AbortController().signal),
        ).rejects.toMatchObject({ providerId, reason: 'invalid-response' });
      },
    );

    it('rejects an empty body and a streamed body over the byte limit', async () => {
      const emptyDownloader = create({
        resolveHostname: publicResolver,
        request: requestReturning(() => response(200, { 'content-type': 'image/png' })),
      });
      await expect(
        emptyDownloader.download('https://cdn.example.test/empty', new AbortController().signal),
      ).rejects.toMatchObject({ providerId, reason: 'invalid-response' });

      const oversizedDownloader = create({
        resolveHostname: publicResolver,
        request: requestReturning(() =>
          response(200, { 'content-type': 'image/png' }, [
            Buffer.alloc(MAX_PROVIDER_IMAGE_BYTES),
            Buffer.from([0]),
          ]),
        ),
      });
      await expect(
        oversizedDownloader.download(
          'https://cdn.example.test/oversized',
          new AbortController().signal,
        ),
      ).rejects.toMatchObject({ providerId, reason: 'invalid-response' });
    });

    it('propagates request abort without converting its reason', async () => {
      const controller = new AbortController();
      const request: RequestImplementation = (_url, options) => {
        const emitter = new EventEmitter() as RequestStub;
        emitter.end = () => {
          const rejectForAbort = () =>
            emitter.emit('error', new DOMException('Aborted', 'AbortError'));
          if (options.signal?.aborted === true) rejectForAbort();
          else options.signal?.addEventListener('abort', rejectForAbort, { once: true });
        };
        return emitter as ReturnType<RequestImplementation>;
      };
      const downloader = create({ resolveHostname: publicResolver, request });
      const pending = downloader.download('https://cdn.example.test/image', controller.signal);

      controller.abort();

      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });
  },
);
