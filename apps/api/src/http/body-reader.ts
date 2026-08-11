import { createHash } from 'node:crypto';
import { chmod, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { FileSink } from 'bun';
import {
  spoolAudioUpload,
  SpooledUploadTooLargeError,
  type SpooledAudioUpload,
} from '../application/spooled-upload.js';
import { AppError } from './app-error.js';

const BUN_FILE_SINK_HIGH_WATER_MARK_BYTES = 64 * 1_024;
const UPLOAD_DIRECTORY_PREFIX = 'lightframe-voice-upload-';
const UPLOAD_FILE_NAME = 'recording.audio';

export interface BodyReaderOptions {
  readonly bodyParser?: 'json' | 'buffer' | 'spooled' | 'multipart';
  readonly acceptedContentTypes?: readonly string[];
  readonly acceptedContentTypePrefixes?: readonly string[];
  readonly unsupportedMediaType?: {
    readonly statusCode: number;
    readonly message: string;
  };
  readonly payloadTooLargeMessage?: string;
}

export const requestInterruptionError = (reason: unknown): AppError => {
  if (reason === 'request-receive-timeout') {
    return new AppError(
      408,
      'request_timeout',
      'The request body was not received before the deadline.',
    );
  }
  if (reason === 'request-inactivity-timeout') {
    return new AppError(504, 'request_timeout', 'The request timed out before it could complete.');
  }
  return new AppError(499, 'request_aborted', 'The request was interrupted before it completed.');
};

const contentTypeEssence = (request: Request): string =>
  request.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';

const isJsonContentType = (contentType: string): boolean =>
  contentType === 'application/json' ||
  (contentType.startsWith('application/') && contentType.endsWith('+json'));

const declaredBodyLength = (request: Request): number | undefined => {
  const value = request.headers.get('content-length');
  if (value === null || !/^\d+$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
};

const readBoundedBody = async (
  request: Request,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<Buffer> => {
  const declared = declaredBodyLength(request);
  if (declared !== undefined && declared > maximumBytes) {
    throw new AppError(413, 'payload_too_large', 'The request body exceeds the allowed size.');
  }
  if (request.body === null) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const cancel = (): void => {
    void reader.cancel(signal.reason as unknown).catch(() => undefined);
  };
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });
  const chunks: Buffer[] = [];
  let received = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      const chunk = Buffer.from(next.value);
      received += chunk.byteLength;
      if (received > maximumBytes) {
        await reader.cancel('payload-too-large').catch(() => undefined);
        throw new AppError(413, 'payload_too_large', 'The request body exceeds the allowed size.');
      }
      chunks.push(chunk);
    }
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
  if (signal.aborted) throw requestInterruptionError(signal.reason as unknown);
  return Buffer.concat(chunks, received);
};

const webBodyAsNodeReadable = (request: Request, signal: AbortSignal): Readable => {
  const stream =
    request.body === null
      ? Readable.from([])
      : Readable.fromWeb(request.body as unknown as Parameters<typeof Readable.fromWeb>[0]);
  const abort = (): void => {
    // Abort can race temporary-directory setup before the async iterator observes stream errors.
    stream.once('error', () => undefined);
    stream.destroy(requestInterruptionError(signal.reason as unknown));
  };
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });
  stream.once('close', () => signal.removeEventListener('abort', abort));
  return stream;
};

const spoolBunRequestBody = async (
  body: ReadableStream<Uint8Array>,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<SpooledAudioUpload> => {
  const directory = await mkdtemp(path.join(tmpdir(), UPLOAD_DIRECTORY_PREFIX));
  const filePath = path.join(directory, UPLOAD_FILE_NAME);
  const reader = body.getReader();
  const hash = createHash('sha256');
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let writer: FileSink | undefined;
  let byteLength = 0;
  const cancel = (): void => {
    void reader.cancel(signal.reason as unknown).catch(() => undefined);
  };
  if (signal.aborted) cancel();
  else signal.addEventListener('abort', cancel, { once: true });

  try {
    await chmod(directory, 0o700);
    handle = await open(filePath, 'wx', 0o600);
    writer = Bun.file(handle.fd).writer({
      highWaterMark: BUN_FILE_SINK_HIGH_WATER_MARK_BYTES,
    });

    while (true) {
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > maximumBytes) {
        await reader.cancel('payload-too-large').catch(() => undefined);
        throw new SpooledUploadTooLargeError();
      }
      hash.update(next.value);
      await writer.write(next.value);
      await writer.flush();
    }
    if (signal.aborted) throw requestInterruptionError(signal.reason as unknown);

    await writer.end();
    writer = undefined;
    await handle.sync();
    await handle.close();
    handle = undefined;

    let cleaned = false;
    return {
      kind: 'spooled-audio-upload',
      path: filePath,
      byteLength,
      checksumSha256: hash.digest('hex'),
      cleanup: async () => {
        if (cleaned) return;
        cleaned = true;
        await rm(directory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (writer !== undefined) {
      await Promise.resolve(writer.end(error instanceof Error ? error : undefined)).catch(
        () => undefined,
      );
    }
    await handle?.close().catch(() => undefined);
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
};

export const parseBody = async (
  request: Request,
  maximumBytes: number,
  options: BodyReaderOptions,
  signal: AbortSignal,
): Promise<unknown> => {
  if (request.method === 'GET' || request.method === 'HEAD' || request.body === null)
    return undefined;
  const contentType = contentTypeEssence(request);
  const parser = options.bodyParser ?? 'json';
  const accepted = options.acceptedContentTypes;
  const acceptedPrefixes = options.acceptedContentTypePrefixes;
  if (
    (accepted !== undefined || acceptedPrefixes !== undefined) &&
    accepted?.includes(contentType) !== true &&
    acceptedPrefixes?.some((prefix) => contentType.startsWith(prefix)) !== true
  ) {
    throw new AppError(
      options.unsupportedMediaType?.statusCode ?? 400,
      'unsupported_media_type',
      options.unsupportedMediaType?.message ?? 'The request media type is not supported.',
    );
  }
  if (parser === 'multipart') {
    if (contentType !== 'multipart/form-data') {
      throw new AppError(
        options.unsupportedMediaType?.statusCode ?? 400,
        'unsupported_media_type',
        options.unsupportedMediaType?.message ?? 'Upload multipart form data.',
      );
    }
    const declared = declaredBodyLength(request);
    if (declared !== undefined && declared > maximumBytes) {
      throw new AppError(
        413,
        'payload_too_large',
        options.payloadTooLargeMessage ?? 'The request body exceeds the allowed size.',
      );
    }
    return undefined;
  }
  if (parser === 'spooled') {
    const declared = declaredBodyLength(request);
    if (declared !== undefined && declared > maximumBytes) {
      throw new AppError(
        413,
        'payload_too_large',
        options.payloadTooLargeMessage ?? 'The request body exceeds the allowed size.',
      );
    }
    try {
      return typeof Bun === 'undefined'
        ? await spoolAudioUpload(webBodyAsNodeReadable(request, signal), maximumBytes)
        : await spoolBunRequestBody(request.body, maximumBytes, signal);
    } catch (error) {
      if (error instanceof SpooledUploadTooLargeError) {
        throw new AppError(
          413,
          'payload_too_large',
          options.payloadTooLargeMessage ?? 'The request body exceeds the allowed size.',
        );
      }
      throw error;
    }
  }
  if (parser === 'buffer') return readBoundedBody(request, maximumBytes, signal);
  if (!isJsonContentType(contentType)) {
    throw new AppError(
      options.unsupportedMediaType?.statusCode ?? 400,
      'unsupported_media_type',
      options.unsupportedMediaType?.message ?? 'Send a JSON request body.',
    );
  }
  const bytes = await readBoundedBody(request, maximumBytes, signal);
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new AppError(400, 'bad_request', 'The request body is not valid.');
  }
};
