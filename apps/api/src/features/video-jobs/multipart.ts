import { createWriteStream } from 'node:fs';
import { once } from 'node:events';
import { open, rm } from 'node:fs/promises';
import { Transform, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import Busboy, { type BusboyFileStream } from '@fastify/busboy';
import type { FileSink } from 'bun';
import {
  REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
  VIDEO_INPUT_MAX_BYTES,
  VTON_VIDEO_INPUT_MAX_BYTES,
  referenceImageMimeTypeSchema,
  videoTransformRecipeSchema,
  type VideoTransformRecipe,
} from '@studio/contracts';
import { AppError } from '../../http/app-error.js';
import { requestInterruptionError } from '../../http/body-reader.js';
import type { ValidReferenceImageMimeType } from '../reference-images/image-validation.js';

const BUN_FILE_SINK_HIGH_WATER_MARK_BYTES = 64 * 1_024;

export interface VideoJobUploadPaths {
  readonly inputPath: string;
  readonly referencePath: string;
}

export interface ParsedVideoJobUpload {
  readonly recipe: VideoTransformRecipe;
  readonly referenceReceived: boolean;
  readonly referenceMimeType: ValidReferenceImageMimeType | null;
}

const multipartError = (message: string): AppError =>
  new AppError(400, 'validation_error', message);

const byteLimit = (maximumBytes: number): Transform => {
  let received = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.byteLength;
      callback(
        received > maximumBytes
          ? new AppError(413, 'payload_too_large', 'The uploaded media exceeds its safe limit.')
          : null,
        received > maximumBytes ? undefined : chunk,
      );
    },
  });
};

const assertCompletedFilePart = (file: BusboyFileStream): void => {
  if (file.truncated) {
    throw new AppError(413, 'payload_too_large', 'The uploaded media is too large.');
  }
  if (file.bytesRead === 0) {
    throw new AppError(400, 'invalid_video', 'The uploaded media is empty.');
  }
};

const writeNodeFilePart = async (
  file: BusboyFileStream,
  destination: string,
  maximumBytes: number,
): Promise<void> => {
  try {
    await pipeline(
      file,
      byteLimit(maximumBytes),
      createWriteStream(destination, { flags: 'wx', mode: 0o600 }),
    );
    assertCompletedFilePart(file);
  } catch (error) {
    await rm(destination, { force: true }).catch(() => undefined);
    throw error;
  }
};

const writeBunFilePart = async (
  file: BusboyFileStream,
  destination: string,
  maximumBytes: number,
): Promise<void> => {
  let writer: FileSink | undefined;
  let received = 0;
  try {
    const initialHandle = await open(destination, 'wx', 0o600);
    await initialHandle.close();
    writer = Bun.file(destination).writer({
      highWaterMark: BUN_FILE_SINK_HIGH_WATER_MARK_BYTES,
    });
    for await (const rawChunk of file) {
      const chunk = rawChunk as Uint8Array;
      received += chunk.byteLength;
      if (received > maximumBytes) {
        throw new AppError(413, 'payload_too_large', 'The uploaded media exceeds its safe limit.');
      }
      await writer.write(chunk);
      await writer.flush();
    }
    assertCompletedFilePart(file);
    await writer.end();
    writer = undefined;
    const completedHandle = await open(destination, 'r');
    try {
      await completedHandle.sync();
    } finally {
      await completedHandle.close();
    }
  } catch (error) {
    file.destroy(error instanceof Error ? error : undefined);
    if (writer !== undefined) {
      await Promise.resolve(writer.end(error instanceof Error ? error : undefined)).catch(
        () => undefined,
      );
    }
    await rm(destination, { force: true }).catch(() => undefined);
    throw error;
  }
};

const writeFilePart = (
  file: BusboyFileStream,
  destination: string,
  maximumBytes: number,
): Promise<void> =>
  typeof Bun === 'undefined'
    ? writeNodeFilePart(file, destination, maximumBytes)
    : writeBunFilePart(file, destination, maximumBytes);

const pumpRequestBody = async (
  body: ReadableStream<Uint8Array>,
  parser: Writable,
  maximumBytes: number,
  signal: AbortSignal,
): Promise<void> => {
  const reader = body.getReader();
  let received = 0;
  const abort = (): void => {
    const error = requestInterruptionError(signal.reason as unknown);
    void reader.cancel(error).catch(() => undefined);
    parser.destroy(error);
  };
  if (signal.aborted) abort();
  else signal.addEventListener('abort', abort, { once: true });

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      received += next.value.byteLength;
      if (received > maximumBytes) {
        await reader.cancel('payload-too-large').catch(() => undefined);
        throw new AppError(413, 'payload_too_large', 'The uploaded media exceeds its safe limit.');
      }
      if (!parser.write(next.value)) await once(parser, 'drain');
    }
    if (signal.aborted) throw requestInterruptionError(signal.reason as unknown);
    parser.end();
  } catch (error) {
    parser.destroy(error instanceof Error ? error : undefined);
    throw error;
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
};

export const parseVideoJobMultipart = async (
  request: Request,
  paths: VideoJobUploadPaths,
  maximumRequestBytes: number,
  signal: AbortSignal,
): Promise<ParsedVideoJobUpload> => {
  const contentType = request.headers.get('content-type');
  if (contentType === null || request.body === null) {
    throw multipartError('The video job media is incomplete.');
  }

  let parser;
  try {
    parser = Busboy({
      headers: { 'content-type': contentType },
      limits: {
        fields: 1,
        files: 2,
        parts: 3,
        fieldSize: 16 * 1_024,
        fileSize: VIDEO_INPUT_MAX_BYTES,
        headerPairs: 32,
        headerSize: 16 * 1_024,
      },
    });
  } catch {
    throw multipartError('The video job request is invalid.');
  }

  let recipe: VideoTransformRecipe | null = null;
  let videoReceived = false;
  let referenceReceived = false;
  let referenceMimeType: ValidReferenceImageMimeType | null = null;
  let failure: unknown;
  const writes: Promise<void>[] = [];
  const fail = (error: unknown): void => {
    failure ??= error;
  };

  parser.on('field', (fieldName, value, fieldNameTruncated, valueTruncated) => {
    if (fieldNameTruncated || valueTruncated || fieldName !== 'request' || recipe !== null) {
      fail(multipartError('The video job request is invalid.'));
      return;
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(value) as unknown;
    } catch {
      fail(multipartError('The video job recipe is invalid.'));
      return;
    }
    const parsed = videoTransformRecipeSchema.safeParse(decoded);
    if (!parsed.success) {
      fail(multipartError('Add a valid prompt, reference image, or both.'));
      return;
    }
    recipe = parsed.data;
  });

  parser.on('file', (fieldName, file, _filename, _encoding, mimeType) => {
    if (failure !== undefined || recipe === null) {
      file.resume();
      fail(multipartError('Send the recipe before media files.'));
      return;
    }
    if (fieldName === 'data' && !videoReceived) {
      videoReceived = true;
      const maximumBytes =
        recipe.operation === 'virtual-try-on' ? VTON_VIDEO_INPUT_MAX_BYTES : VIDEO_INPUT_MAX_BYTES;
      const write = writeFilePart(file, paths.inputPath, maximumBytes).catch((error) => {
        fail(error);
      });
      writes.push(write);
      return;
    }
    if (fieldName === 'reference_image' && recipe.hasReferenceImage && !referenceReceived) {
      const parsedMimeType = referenceImageMimeTypeSchema.safeParse(mimeType);
      if (!parsedMimeType.success) {
        file.resume();
        fail(multipartError('Use a JPEG, PNG, or WebP reference image.'));
        return;
      }
      referenceReceived = true;
      referenceMimeType = parsedMimeType.data;
      const write = writeFilePart(
        file,
        paths.referencePath,
        REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
      ).catch((error) => {
        fail(error);
      });
      writes.push(write);
      return;
    }
    file.resume();
    fail(multipartError('The video job files are invalid.'));
  });

  parser.on('partsLimit', () =>
    fail(new AppError(413, 'payload_too_large', 'The multipart upload has too many parts.')),
  );
  parser.on('filesLimit', () =>
    fail(new AppError(413, 'payload_too_large', 'The multipart upload has too many files.')),
  );
  parser.on('fieldsLimit', () =>
    fail(new AppError(413, 'payload_too_large', 'The multipart upload has too many fields.')),
  );
  parser.on('error', fail);

  const finished = new Promise<void>((resolve, reject) => {
    parser.once('finish', resolve);
    parser.once('error', reject);
  });
  // The body pump can reject before this promise is awaited. Attach a handler immediately so the
  // parser's matching error event cannot escape as an unhandled rejection.
  void finished.catch(() => undefined);
  try {
    await pumpRequestBody(request.body, parser, maximumRequestBytes, signal);
    await finished;
    await Promise.all(writes);
  } catch (error) {
    fail(error);
  }

  if (failure !== undefined) {
    throw failure instanceof Error ? failure : new Error('Multipart parsing failed.');
  }
  const completedRecipe = recipe as VideoTransformRecipe | null;
  if (
    completedRecipe === null ||
    !videoReceived ||
    completedRecipe.hasReferenceImage !== referenceReceived
  ) {
    throw multipartError('The video job media is incomplete.');
  }
  return { recipe: completedRecipe, referenceReceived, referenceMimeType };
};
