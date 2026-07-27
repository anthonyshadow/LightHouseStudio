import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import {
  isPublicWiroImageAddress,
  SafeWiroImageDownloader,
  type WiroHttpsRequestImplementation,
} from './safe-image-downloader.js';

describe('SafeWiroImageDownloader', () => {
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
    expect(isPublicWiroImageAddress(address)).toBe(expected);
  });

  it('rejects mixed public/private DNS results before opening a request', async () => {
    const request = vi.fn();
    const downloader = new SafeWiroImageDownloader({
      resolveHostname: () =>
        Promise.resolve([
          { address: '8.8.8.8', family: 4 },
          { address: '127.0.0.1', family: 4 },
        ]),
      request: request as unknown as WiroHttpsRequestImplementation,
    });

    await expect(
      downloader.download('https://cdn.example.test/image', new AbortController().signal),
    ).rejects.toMatchObject({ providerId: 'wiro', reason: 'invalid-response' });
    expect(request).not.toHaveBeenCalled();
  });

  it('pins a public DNS result and accepts only supported bounded image content', async () => {
    const request: WiroHttpsRequestImplementation = (_url, options, callback) => {
      const emitter = new EventEmitter() as EventEmitter & { end: () => void };
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
      return emitter as ReturnType<WiroHttpsRequestImplementation>;
    };
    const downloader = new SafeWiroImageDownloader({
      resolveHostname: () => Promise.resolve([{ address: '8.8.8.8', family: 4 }]),
      request,
    });

    await expect(
      downloader.download('https://cdn.example.test/image', new AbortController().signal),
    ).resolves.toEqual({ bytes: Buffer.from('image-bytes'), mimeType: 'image/png' });
  });

  it('revalidates redirects and rejects unsupported MIME types', async () => {
    const redirectRequest: WiroHttpsRequestImplementation = (_url, _options, callback) => {
      const emitter = new EventEmitter() as EventEmitter & { end: () => void };
      emitter.end = () => {
        const response = Readable.from([]) as IncomingMessage;
        response.statusCode = 302;
        response.headers = { location: 'https://private.example.test/image' };
        callback(response);
      };
      return emitter as ReturnType<WiroHttpsRequestImplementation>;
    };
    const redirectDownloader = new SafeWiroImageDownloader({
      resolveHostname: (hostname) =>
        Promise.resolve([
          hostname === 'private.example.test'
            ? { address: '127.0.0.1', family: 4 as const }
            : { address: '8.8.8.8', family: 4 as const },
        ]),
      request: redirectRequest,
    });
    await expect(
      redirectDownloader.download('https://cdn.example.test/image', new AbortController().signal),
    ).rejects.toMatchObject({ providerId: 'wiro', reason: 'invalid-response' });

    const mimeRequest: WiroHttpsRequestImplementation = (_url, _options, callback) => {
      const emitter = new EventEmitter() as EventEmitter & { end: () => void };
      emitter.end = () => {
        const response = Readable.from([Buffer.from('not-an-image')]) as IncomingMessage;
        response.statusCode = 200;
        response.headers = { 'content-type': 'text/html' };
        callback(response);
      };
      return emitter as ReturnType<WiroHttpsRequestImplementation>;
    };
    const mimeDownloader = new SafeWiroImageDownloader({
      resolveHostname: () => Promise.resolve([{ address: '8.8.8.8', family: 4 }]),
      request: mimeRequest,
    });
    await expect(
      mimeDownloader.download('https://cdn.example.test/image', new AbortController().signal),
    ).rejects.toMatchObject({ providerId: 'wiro', reason: 'invalid-response' });
  });
});
