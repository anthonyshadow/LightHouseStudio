import { writeSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isSpooledAudioUpload } from '../application/spooled-upload.js';
import { AppError } from './app-error.js';
import { parseBody, requestInterruptionError, type BodyReaderOptions } from './body-reader.js';

const signal = (): AbortSignal => new AbortController().signal;

const parse = (
  request: Request,
  maximumBytes: number,
  options: BodyReaderOptions,
  abortSignal: AbortSignal = signal(),
): Promise<unknown> => parseBody(request, maximumBytes, options, abortSignal);

const expectAppError = async (
  promise: Promise<unknown>,
  expected: Pick<AppError, 'statusCode' | 'code' | 'message'>,
): Promise<void> => {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject(expected);
};

describe('HTTP body reader', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps each interruption phase to the app-owned status and safe message', () => {
    expect(requestInterruptionError('request-receive-timeout')).toMatchObject({
      statusCode: 408,
      code: 'request_timeout',
      message: 'The request body was not received before the deadline.',
    });
    expect(requestInterruptionError('request-inactivity-timeout')).toMatchObject({
      statusCode: 504,
      code: 'request_timeout',
      message: 'The request timed out before it could complete.',
    });
    expect(requestInterruptionError('socket-closed')).toMatchObject({
      statusCode: 499,
      code: 'request_aborted',
      message: 'The request was interrupted before it completed.',
    });
  });

  it('parses parameterized and vendor JSON while preserving malformed-json errors', async () => {
    await expect(
      parse(
        new Request('http://localhost/json', {
          method: 'POST',
          headers: { 'content-type': 'Application/Problem+JSON; charset=utf-8' },
          body: '{"ok":true}',
        }),
        32,
        {},
      ),
    ).resolves.toEqual({ ok: true });

    await expectAppError(
      parse(
        new Request('http://localhost/json', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{',
        }),
        32,
        {},
      ),
      {
        statusCode: 400,
        code: 'bad_request',
        message: 'The request body is not valid.',
      },
    );
  });

  it('accepts configured media prefixes and returns the exact buffered bytes', async () => {
    const body = await parse(
      new Request('http://localhost/image', {
        method: 'POST',
        headers: { 'content-type': 'image/png; charset=binary' },
        body: new Uint8Array([0, 1, 2, 255]),
      }),
      4,
      { bodyParser: 'buffer', acceptedContentTypePrefixes: ['image/'] },
    );

    expect(Buffer.isBuffer(body)).toBe(true);
    expect(body).toEqual(Buffer.from([0, 1, 2, 255]));
  });

  it('uses the configured unsupported-media response', async () => {
    await expectAppError(
      parse(
        new Request('http://localhost/audio', {
          method: 'POST',
          headers: { 'content-type': 'text/plain' },
          body: 'ignored',
        }),
        16,
        {
          bodyParser: 'buffer',
          acceptedContentTypes: ['audio/wav'],
          unsupportedMediaType: { statusCode: 415, message: 'Upload supported audio.' },
        },
      ),
      {
        statusCode: 415,
        code: 'unsupported_media_type',
        message: 'Upload supported audio.',
      },
    );
  });

  it('rejects declared and streamed overruns and cancels the overflowing stream', async () => {
    await expectAppError(
      parse(
        new Request('http://localhost/buffer', {
          method: 'POST',
          headers: {
            'content-type': 'application/octet-stream',
            'content-length': '5',
          },
          body: 'x',
        }),
        4,
        { bodyParser: 'buffer', acceptedContentTypes: ['application/octet-stream'] },
      ),
      {
        statusCode: 413,
        code: 'payload_too_large',
        message: 'The request body exceeds the allowed size.',
      },
    );

    let cancellationReason: unknown;
    const streamedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2]));
        controller.enqueue(new Uint8Array([3, 4]));
      },
      cancel(reason) {
        cancellationReason = reason;
      },
    });
    await expectAppError(
      parse(
        new Request('http://localhost/buffer', {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream' },
          body: streamedBody,
          duplex: 'half',
        } as RequestInit & { duplex: 'half' }),
        3,
        { bodyParser: 'buffer', acceptedContentTypes: ['application/octet-stream'] },
      ),
      {
        statusCode: 413,
        code: 'payload_too_large',
        message: 'The request body exceeds the allowed size.',
      },
    );
    expect(cancellationReason).toBe('payload-too-large');
  });

  it('cancels an already-aborted body and preserves the receive-timeout contract', async () => {
    let cancellationReason: unknown;
    const body = new ReadableStream<Uint8Array>({
      cancel(reason) {
        cancellationReason = reason;
      },
    });
    const controller = new AbortController();
    controller.abort('request-receive-timeout');

    await expectAppError(
      parse(
        new Request('http://localhost/buffer', {
          method: 'POST',
          headers: { 'content-type': 'application/octet-stream' },
          body,
          duplex: 'half',
        } as RequestInit & { duplex: 'half' }),
        8,
        { bodyParser: 'buffer', acceptedContentTypes: ['application/octet-stream'] },
        controller.signal,
      ),
      {
        statusCode: 408,
        code: 'request_timeout',
        message: 'The request body was not received before the deadline.',
      },
    );
    expect(cancellationReason).toBe('request-receive-timeout');
  });

  it('validates multipart metadata without consuming media', async () => {
    await expect(
      parse(
        new Request('http://localhost/multipart', {
          method: 'POST',
          headers: {
            'content-type': 'multipart/form-data; boundary=test',
            'content-length': '8',
          },
          body: 'ignored',
        }),
        8,
        { bodyParser: 'multipart' },
      ),
    ).resolves.toBeUndefined();

    await expectAppError(
      parse(
        new Request('http://localhost/multipart', {
          method: 'POST',
          headers: {
            'content-type': 'multipart/form-data; boundary=test',
            'content-length': '9',
          },
          body: 'ignored',
        }),
        8,
        { bodyParser: 'multipart', payloadTooLargeMessage: 'Video request too large.' },
      ),
      {
        statusCode: 413,
        code: 'payload_too_large',
        message: 'Video request too large.',
      },
    );
  });

  it('spools accepted media with checksum and idempotent cleanup', async () => {
    const parsed = await parse(
      new Request('http://localhost/audio', {
        method: 'POST',
        headers: { 'content-type': 'audio/wav' },
        body: 'voice-data',
      }),
      10,
      { bodyParser: 'spooled', acceptedContentTypePrefixes: ['audio/'] },
    );

    expect(isSpooledAudioUpload(parsed)).toBe(true);
    if (!isSpooledAudioUpload(parsed)) throw new Error('Expected a spooled upload.');
    expect(parsed.byteLength).toBe(10);
    expect(parsed.checksumSha256).toBe(
      '52c57dd2c32c19a2cbd996024cd98267fdbc08e4ea0087d3a4e37cd1afeac4c7',
    );
    await expect(readFile(parsed.path, 'utf8')).resolves.toBe('voice-data');
    await parsed.cleanup();
    await parsed.cleanup();
    await expect(access(parsed.path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('keeps the exclusive descriptor as the Bun file-sink target', async () => {
    let bunFileTarget: unknown;
    vi.stubGlobal('Bun', {
      file: (fileDescriptor: number) => {
        bunFileTarget = fileDescriptor;
        return {
          writer: () => {
            const chunks: Buffer[] = [];
            return {
              write: (chunk: Uint8Array) => {
                chunks.push(Buffer.from(chunk));
                return Promise.resolve(chunk.byteLength);
              },
              flush: () => Promise.resolve(),
              end: () => writeSync(fileDescriptor, Buffer.concat(chunks)),
            };
          },
        };
      },
    });

    const parsed = await parse(
      new Request('http://localhost/audio', {
        method: 'POST',
        headers: { 'content-type': 'audio/wav' },
        body: 'bun-voice-data',
      }),
      14,
      { bodyParser: 'spooled', acceptedContentTypePrefixes: ['audio/'] },
    );

    expect(isSpooledAudioUpload(parsed)).toBe(true);
    if (!isSpooledAudioUpload(parsed)) throw new Error('Expected a spooled upload.');
    expect(bunFileTarget).toEqual(expect.any(Number));
    await expect(readFile(parsed.path, 'utf8')).resolves.toBe('bun-voice-data');
    await parsed.cleanup();
  });

  it('maps a streamed spool overrun to the route-specific payload message', async () => {
    await expectAppError(
      parse(
        new Request('http://localhost/audio', {
          method: 'POST',
          headers: { 'content-type': 'audio/wav' },
          body: 'voice-data',
        }),
        9,
        {
          bodyParser: 'spooled',
          acceptedContentTypePrefixes: ['audio/'],
          payloadTooLargeMessage: 'The recording exceeds 9 bytes.',
        },
      ),
      {
        statusCode: 413,
        code: 'payload_too_large',
        message: 'The recording exceeds 9 bytes.',
      },
    );
  });

  it('propagates an active spool interruption with the app-owned timeout status', async () => {
    const body = new ReadableStream<Uint8Array>({
      pull: () => new Promise(() => undefined),
    });
    const controller = new AbortController();
    const parsing = parse(
      new Request('http://localhost/audio', {
        method: 'POST',
        headers: { 'content-type': 'audio/wav' },
        body,
        duplex: 'half',
      } as RequestInit & { duplex: 'half' }),
      16,
      { bodyParser: 'spooled', acceptedContentTypePrefixes: ['audio/'] },
      controller.signal,
    );

    setTimeout(() => controller.abort('request-inactivity-timeout'), 0);

    await expectAppError(parsing, {
      statusCode: 504,
      code: 'request_timeout',
      message: 'The request timed out before it could complete.',
    });
  });

  it('does not parse bodies for safe reads', async () => {
    await expect(
      parse(new Request('http://localhost/read'), 1, { bodyParser: 'json' }),
    ).resolves.toBeUndefined();
    await expect(
      parse(new Request('http://localhost/read', { method: 'HEAD' }), 1, {
        bodyParser: 'json',
      }),
    ).resolves.toBeUndefined();
  });
});
