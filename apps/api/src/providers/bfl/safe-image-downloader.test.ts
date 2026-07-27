import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import type { IncomingMessage } from 'node:http';
import { describe, expect, it, vi } from 'vitest';
import {
  isPublicImageAddress,
  SafeBflImageDownloader,
  type HttpsRequestImplementation,
} from './safe-image-downloader.js';

describe('SafeBflImageDownloader', () => {
  it.each([
    ['127.0.0.1', false],
    ['10.0.0.1', false],
    ['169.254.169.254', false],
    ['192.168.1.2', false],
    ['::1', false],
    ['fc00::1', false],
    ['::ffff:127.0.0.1', false],
    ['8.8.8.8', true],
    ['2606:4700:4700::1111', true],
  ] as const)('classifies %s as public=%s', (address, expected) => {
    expect(isPublicImageAddress(address)).toBe(expected);
  });

  it('rejects a hostname if any resolved address is private before opening a request', async () => {
    const request = vi.fn();
    const downloader = new SafeBflImageDownloader({
      resolveHostname: () =>
        Promise.resolve([
          { address: '8.8.8.8', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ]),
      request: request as unknown as HttpsRequestImplementation,
    });

    await expect(
      downloader.download('https://cdn.example.test/image', new AbortController().signal),
    ).rejects.toMatchObject({ providerId: 'bfl', reason: 'invalid-response' });
    expect(request).not.toHaveBeenCalled();
  });

  it('pins a public DNS result and accepts only supported bounded image content', async () => {
    const request: HttpsRequestImplementation = (_url, options, callback) => {
      const emitter = new EventEmitter() as EventEmitter & {
        end: () => void;
      };
      emitter.end = () => {
        const response = Readable.from([Buffer.from('image-bytes')]) as IncomingMessage;
        response.statusCode = 200;
        response.headers = {
          'content-type': 'image/png',
          'content-length': String(Buffer.byteLength('image-bytes')),
        };
        callback(response);
      };
      expect(options.lookup).toBeTypeOf('function');
      options.lookup?.('cdn.example.test', { all: true }, (error, addresses) => {
        expect(error).toBeNull();
        expect(addresses).toEqual([{ address: '8.8.8.8', family: 4 }]);
      });
      return emitter as ReturnType<HttpsRequestImplementation>;
    };
    const downloader = new SafeBflImageDownloader({
      resolveHostname: () => Promise.resolve([{ address: '8.8.8.8', family: 4 }]),
      request,
    });

    await expect(
      downloader.download('https://cdn.example.test/image', new AbortController().signal),
    ).resolves.toEqual({ bytes: Buffer.from('image-bytes'), mimeType: 'image/png' });
  });

  it('revalidates every redirect before opening the next connection', async () => {
    const request: HttpsRequestImplementation = (_url, _options, callback) => {
      const emitter = new EventEmitter() as EventEmitter & { end: () => void };
      emitter.end = () => {
        const response = Readable.from([]) as IncomingMessage;
        response.statusCode = 302;
        response.headers = { location: 'https://private.example.test/image' };
        callback(response);
      };
      return emitter as ReturnType<HttpsRequestImplementation>;
    };
    const resolveHostname = vi.fn((hostname: string) =>
      Promise.resolve([
        hostname === 'private.example.test'
          ? { address: '127.0.0.1', family: 4 as const }
          : { address: '8.8.8.8', family: 4 as const },
      ]),
    );
    const downloader = new SafeBflImageDownloader({ resolveHostname, request });

    await expect(
      downloader.download('https://cdn.example.test/image', new AbortController().signal),
    ).rejects.toMatchObject({ providerId: 'bfl', reason: 'invalid-response' });
    expect(resolveHostname).toHaveBeenCalledWith('cdn.example.test');
    expect(resolveHostname).toHaveBeenCalledWith('private.example.test');
  });

  it('rejects unsupported media types before buffering a result body', async () => {
    const request: HttpsRequestImplementation = (_url, _options, callback) => {
      const emitter = new EventEmitter() as EventEmitter & { end: () => void };
      emitter.end = () => {
        const response = Readable.from([Buffer.from('not-an-image')]) as IncomingMessage;
        response.statusCode = 200;
        response.headers = { 'content-type': 'text/html' };
        callback(response);
      };
      return emitter as ReturnType<HttpsRequestImplementation>;
    };
    const downloader = new SafeBflImageDownloader({
      resolveHostname: () => Promise.resolve([{ address: '8.8.8.8', family: 4 }]),
      request,
    });

    await expect(
      downloader.download('https://cdn.example.test/image', new AbortController().signal),
    ).rejects.toMatchObject({ providerId: 'bfl', reason: 'invalid-response' });
  });
});
