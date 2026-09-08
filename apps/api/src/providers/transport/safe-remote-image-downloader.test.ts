import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  isPublicRemoteImageAddress,
  SafeRemoteImageDownloader,
  type RemoteImageRequestImplementation,
} from './safe-remote-image-downloader.js';

const policy = {
  maxRedirects: 2,
  maxBytes: 16,
  acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
} as const;

const createError = (reason: 'failure' | 'invalid-response') => new Error(`safe:${reason}`);

const response = (
  statusCode: number,
  headers: Record<string, string>,
  chunks: readonly (Buffer | string)[] = [],
): IncomingMessage =>
  Object.assign(Readable.from(chunks), { statusCode, headers }) as unknown as IncomingMessage;

const requestSequence = (
  responses: readonly IncomingMessage[],
): RemoteImageRequestImplementation => {
  let index = 0;
  const implementation: RemoteImageRequestImplementation = (_url, options, callback) => {
    const request = new EventEmitter() as EventEmitter & { end: () => void };
    request.end = () => {
      const selected = responses[index++];
      if (!selected) {
        request.emit('error', new Error('unexpected request'));
        return;
      }
      queueMicrotask(() => callback(selected));
    };
    options.signal?.addEventListener(
      'abort',
      () => request.emit('error', new DOMException('aborted', 'AbortError')),
      { once: true },
    );
    return request as unknown as ReturnType<RemoteImageRequestImplementation>;
  };
  return vi.fn(implementation);
};

describe('safe remote image downloader', () => {
  it('classifies the complete public/private address boundary', () => {
    for (const [address, expected] of [
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
    ] as const) {
      expect(isPublicRemoteImageAddress(address), address).toBe(expected);
    }
  });

  it('rejects non-HTTPS, credentials, fragments, and mixed public/private DNS before a request', async () => {
    const request = requestSequence([]);
    const resolveHostname = vi.fn().mockResolvedValue([
      { address: '8.8.8.8', family: 4 as const },
      { address: '127.0.0.1', family: 4 as const },
    ]);
    const downloader = new SafeRemoteImageDownloader({
      policy,
      createError,
      resolveHostname,
      request,
    });

    await expect(
      downloader.download('http://images.example.test/a.jpg', new AbortController().signal),
    ).rejects.toThrow('safe:invalid-response');
    await expect(
      downloader.download(
        'https://user:secret@images.example.test/a.jpg',
        new AbortController().signal,
      ),
    ).rejects.toThrow('safe:invalid-response');
    await expect(
      downloader.download(
        'https://images.example.test/a.jpg#fragment',
        new AbortController().signal,
      ),
    ).rejects.toThrow('safe:invalid-response');
    await expect(
      downloader.download('https://images.example.test/a.jpg', new AbortController().signal),
    ).rejects.toThrow('safe:invalid-response');
    expect(request).not.toHaveBeenCalled();
  });

  it('pins resolved public DNS, accepts bounded bytes, and revalidates redirect targets', async () => {
    const request = requestSequence([
      response(302, { location: 'https://cdn.example.test/outfit.webp' }),
      response(200, { 'content-type': 'image/webp', 'content-length': '4' }, [
        Buffer.from([1, 2, 3, 4]),
      ]),
    ]);
    const resolveHostname = vi.fn((hostname: string) =>
      Promise.resolve([
        {
          address: hostname === 'cdn.example.test' ? '1.1.1.1' : '8.8.8.8',
          family: 4 as const,
        },
      ]),
    );
    const downloader = new SafeRemoteImageDownloader({
      policy,
      createError,
      resolveHostname,
      request,
    });

    await expect(
      downloader.download('https://images.example.test/a.webp', new AbortController().signal),
    ).resolves.toEqual({
      bytes: Buffer.from([1, 2, 3, 4]),
      mimeType: 'image/webp',
    });
    expect(resolveHostname).toHaveBeenNthCalledWith(1, 'images.example.test');
    expect(resolveHostname).toHaveBeenNthCalledWith(2, 'cdn.example.test');
    const lookup = vi.mocked(request).mock.calls[0]?.[1].lookup;
    expect(lookup).toBeTypeOf('function');
  });

  it('blocks redirects to private DNS and rejects MIME, empty, and oversized responses', async () => {
    const redirectDownloader = new SafeRemoteImageDownloader({
      policy,
      createError,
      resolveHostname: vi.fn((hostname: string) =>
        Promise.resolve([
          {
            address: hostname === 'private.example.test' ? '192.168.1.20' : '8.8.8.8',
            family: 4 as const,
          },
        ]),
      ),
      request: requestSequence([
        response(302, { location: 'https://private.example.test/outfit.jpg' }),
      ]),
    });
    await expect(
      redirectDownloader.download(
        'https://images.example.test/a.jpg',
        new AbortController().signal,
      ),
    ).rejects.toThrow('safe:invalid-response');

    for (const invalidResponse of [
      response(200, { 'content-type': 'text/html' }, ['no']),
      response(200, { 'content-type': 'image/jpeg' }),
      response(200, { 'content-type': 'image/jpeg', 'content-length': '17' }, [Buffer.alloc(17)]),
    ]) {
      const downloader = new SafeRemoteImageDownloader({
        policy,
        createError,
        resolveHostname: vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
        request: requestSequence([invalidResponse]),
      });
      await expect(
        downloader.download('https://images.example.test/a.jpg', new AbortController().signal),
      ).rejects.toThrow('safe:invalid-response');
    }
  });

  it('propagates cancellation without publishing response bytes', async () => {
    const implementation: RemoteImageRequestImplementation = (_url, options) => {
      const pending = new EventEmitter() as EventEmitter & { end: () => void };
      pending.end = () => {
        if (options.signal?.aborted) {
          queueMicrotask(() => pending.emit('error', new DOMException('aborted', 'AbortError')));
        }
      };
      options.signal?.addEventListener(
        'abort',
        () => pending.emit('error', new DOMException('aborted', 'AbortError')),
        { once: true },
      );
      return pending as unknown as ReturnType<RemoteImageRequestImplementation>;
    };
    const request = vi.fn(implementation);
    const downloader = new SafeRemoteImageDownloader({
      policy,
      createError,
      resolveHostname: vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }]),
      request,
    });
    const controller = new AbortController();
    const pending = downloader.download('https://images.example.test/a.jpg', controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});
