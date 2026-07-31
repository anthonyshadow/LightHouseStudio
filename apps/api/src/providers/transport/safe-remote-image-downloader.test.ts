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
  it('classifies loopback, private, link-local, mapped, and documentation addresses as unsafe', () => {
    expect(isPublicRemoteImageAddress('8.8.8.8')).toBe(true);
    expect(isPublicRemoteImageAddress('127.0.0.1')).toBe(false);
    expect(isPublicRemoteImageAddress('10.0.0.4')).toBe(false);
    expect(isPublicRemoteImageAddress('169.254.1.1')).toBe(false);
    expect(isPublicRemoteImageAddress('::1')).toBe(false);
    expect(isPublicRemoteImageAddress('::ffff:127.0.0.1')).toBe(false);
    expect(isPublicRemoteImageAddress('2001:db8::1')).toBe(false);
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
