import { writeSync } from 'node:fs';
import { access, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../http/app-error.js';
import { parseVideoJobMultipart, type VideoJobUploadPaths } from './multipart.js';

const recipe = (hasReferenceImage: boolean) =>
  JSON.stringify({
    operation: 'character-swap',
    inputKind: 'character',
    prompt: 'Change the lighting',
    enhancePrompt: false,
    hasReferenceImage,
    outputResolution: '720p',
  });

const requestFor = (form: FormData): Request =>
  new Request('http://localhost/video-job', { method: 'PUT', body: form });

const expectAppError = async (
  promise: Promise<unknown>,
  expected: Pick<AppError, 'statusCode' | 'code' | 'message'>,
): Promise<void> => {
  const error = await promise.catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(AppError);
  expect(error).toMatchObject(expected);
};

describe('video-job multipart boundary', () => {
  const directories: string[] = [];

  const paths = async (): Promise<VideoJobUploadPaths> => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-video-multipart-test-'));
    directories.push(directory);
    return {
      inputPath: path.join(directory, 'input.video'),
      referencePath: path.join(directory, 'reference.image'),
    };
  };

  afterEach(async () => {
    vi.unstubAllGlobals();
    await Promise.all(
      directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
  });

  it('uses the Bun file-sink path without buffering the completed upload', async () => {
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
    const uploadPaths = await paths();
    const form = new FormData();
    form.append('request', recipe(false));
    form.append('data', new Blob(['bun-video'], { type: 'video/mp4' }), 'source.mp4');

    const parsed = await parseVideoJobMultipart(
      requestFor(form),
      uploadPaths,
      1_024,
      new AbortController().signal,
    );

    expect(parsed.referenceReceived).toBe(false);
    expect(bunFileTarget).toEqual(expect.any(Number));
    await expect(readFile(uploadPaths.inputPath, 'utf8')).resolves.toBe('bun-video');
  });

  it('persists ordered video and reference parts with the validated recipe and MIME type', async () => {
    const uploadPaths = await paths();
    const form = new FormData();
    form.append('request', recipe(true));
    form.append('data', new Blob(['video-bytes'], { type: 'video/mp4' }), 'source.mp4');
    form.append(
      'reference_image',
      new Blob(['reference-bytes'], { type: 'image/png' }),
      'reference.png',
    );

    const parsed = await parseVideoJobMultipart(
      requestFor(form),
      uploadPaths,
      1_024 * 1_024,
      new AbortController().signal,
    );

    expect(parsed).toMatchObject({
      recipe: { operation: 'character-swap', hasReferenceImage: true },
      referenceReceived: true,
      referenceMimeType: 'image/png',
    });
    await expect(readFile(uploadPaths.inputPath, 'utf8')).resolves.toBe('video-bytes');
    await expect(readFile(uploadPaths.referencePath, 'utf8')).resolves.toBe('reference-bytes');
  });

  it('rejects a missing body and malformed multipart metadata before creating files', async () => {
    const missingPaths = await paths();
    await expectAppError(
      parseVideoJobMultipart(
        new Request('http://localhost/video-job', {
          method: 'PUT',
          headers: { 'content-type': 'multipart/form-data; boundary=missing' },
        }),
        missingPaths,
        1_024,
        new AbortController().signal,
      ),
      {
        statusCode: 400,
        code: 'validation_error',
        message: 'The video job media is incomplete.',
      },
    );

    const invalidPaths = await paths();
    await expectAppError(
      parseVideoJobMultipart(
        new Request('http://localhost/video-job', {
          method: 'PUT',
          headers: { 'content-type': 'multipart/form-data' },
          body: 'not-multipart',
        }),
        invalidPaths,
        1_024,
        new AbortController().signal,
      ),
      {
        statusCode: 400,
        code: 'validation_error',
        message: 'The video job request is invalid.',
      },
    );
    await expect(access(invalidPaths.inputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('requires the recipe to be valid and ordered before any media file', async () => {
    const invalidRecipePaths = await paths();
    const invalidRecipe = new FormData();
    invalidRecipe.append('request', '{');
    invalidRecipe.append('data', new Blob(['video'], { type: 'video/mp4' }), 'source.mp4');
    await expectAppError(
      parseVideoJobMultipart(
        requestFor(invalidRecipe),
        invalidRecipePaths,
        1_024,
        new AbortController().signal,
      ),
      {
        statusCode: 400,
        code: 'validation_error',
        message: 'The video job recipe is invalid.',
      },
    );

    const unorderedPaths = await paths();
    const unordered = new FormData();
    unordered.append('data', new Blob(['video'], { type: 'video/mp4' }), 'source.mp4');
    unordered.append('request', recipe(false));
    await expectAppError(
      parseVideoJobMultipart(
        requestFor(unordered),
        unorderedPaths,
        1_024,
        new AbortController().signal,
      ),
      {
        statusCode: 400,
        code: 'validation_error',
        message: 'Send the recipe before media files.',
      },
    );
    await expect(access(unorderedPaths.inputPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects invalid recipe policy and unsupported reference media', async () => {
    const policyPaths = await paths();
    const invalidPolicy = new FormData();
    invalidPolicy.append(
      'request',
      JSON.stringify({
        operation: 'character-swap',
        inputKind: 'character',
        prompt: '',
        enhancePrompt: false,
        hasReferenceImage: false,
        outputResolution: '720p',
      }),
    );
    invalidPolicy.append('data', new Blob(['video'], { type: 'video/mp4' }), 'source.mp4');
    await expectAppError(
      parseVideoJobMultipart(
        requestFor(invalidPolicy),
        policyPaths,
        1_024,
        new AbortController().signal,
      ),
      {
        statusCode: 400,
        code: 'validation_error',
        message: 'Add a valid prompt, reference image, or both.',
      },
    );

    const mimePaths = await paths();
    const invalidMime = new FormData();
    invalidMime.append('request', recipe(true));
    invalidMime.append('data', new Blob(['video'], { type: 'video/mp4' }), 'source.mp4');
    invalidMime.append(
      'reference_image',
      new Blob(['reference'], { type: 'application/pdf' }),
      'reference.pdf',
    );
    await expectAppError(
      parseVideoJobMultipart(
        requestFor(invalidMime),
        mimePaths,
        1_024,
        new AbortController().signal,
      ),
      {
        statusCode: 400,
        code: 'validation_error',
        message: 'Use a JPEG, PNG, or WebP reference image.',
      },
    );
  });

  it('requires the file set to match the recipe exactly', async () => {
    const missingReferencePaths = await paths();
    const missingReference = new FormData();
    missingReference.append('request', recipe(true));
    missingReference.append('data', new Blob(['video'], { type: 'video/mp4' }), 'source.mp4');
    await expectAppError(
      parseVideoJobMultipart(
        requestFor(missingReference),
        missingReferencePaths,
        1_024,
        new AbortController().signal,
      ),
      {
        statusCode: 400,
        code: 'validation_error',
        message: 'The video job media is incomplete.',
      },
    );

    const extraFilePaths = await paths();
    const extraFile = new FormData();
    extraFile.append('request', recipe(false));
    extraFile.append('data', new Blob(['video'], { type: 'video/mp4' }), 'source.mp4');
    extraFile.append('reference_image', new Blob(['extra'], { type: 'image/png' }), 'extra.png');
    await expectAppError(
      parseVideoJobMultipart(
        requestFor(extraFile),
        extraFilePaths,
        1_024,
        new AbortController().signal,
      ),
      {
        statusCode: 400,
        code: 'validation_error',
        message: 'The video job files are invalid.',
      },
    );
  });

  it('rejects empty video media and total-body overruns with distinct errors', async () => {
    const emptyPaths = await paths();
    const empty = new FormData();
    empty.append('request', recipe(false));
    empty.append('data', new Blob([], { type: 'video/mp4' }), 'source.mp4');
    await expectAppError(
      parseVideoJobMultipart(requestFor(empty), emptyPaths, 1_024, new AbortController().signal),
      {
        statusCode: 400,
        code: 'invalid_video',
        message: 'The uploaded media is empty.',
      },
    );

    const oversizedPaths = await paths();
    let cancellationReason: unknown;
    const oversizedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(9));
      },
      cancel(reason) {
        cancellationReason = reason;
      },
    });
    await expectAppError(
      parseVideoJobMultipart(
        new Request('http://localhost/video-job', {
          method: 'PUT',
          headers: { 'content-type': 'multipart/form-data; boundary=test' },
          body: oversizedBody,
          duplex: 'half',
        } as RequestInit & { duplex: 'half' }),
        oversizedPaths,
        8,
        new AbortController().signal,
      ),
      {
        statusCode: 413,
        code: 'payload_too_large',
        message: 'The uploaded media exceeds its safe limit.',
      },
    );
    expect(cancellationReason).toBe('payload-too-large');
  });

  it('enforces the single recipe field limit', async () => {
    const uploadPaths = await paths();
    const form = new FormData();
    form.append('request', recipe(false));
    form.append('request', recipe(false));
    form.append('data', new Blob(['video'], { type: 'video/mp4' }), 'source.mp4');

    await expectAppError(
      parseVideoJobMultipart(
        requestFor(form),
        uploadPaths,
        1_024 * 1_024,
        new AbortController().signal,
      ),
      {
        statusCode: 413,
        code: 'payload_too_large',
        message: 'The multipart upload has too many fields.',
      },
    );
  });

  it('enforces file and total-part limits', async () => {
    const uploadPaths = await paths();
    const form = new FormData();
    form.append('request', recipe(true));
    form.append('data', new Blob(['video'], { type: 'video/mp4' }), 'source.mp4');
    form.append('reference_image', new Blob(['image'], { type: 'image/png' }), 'reference.png');
    form.append('extra', new Blob(['extra'], { type: 'image/png' }), 'extra.png');

    const error = await parseVideoJobMultipart(
      requestFor(form),
      uploadPaths,
      1_024 * 1_024,
      new AbortController().signal,
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ statusCode: 413, code: 'payload_too_large' });
    expect((error as Error).message).toMatch(
      /^The multipart upload has too many (?:files|parts)\.$/u,
    );
  });

  it('cancels an already-aborted multipart body with its phase-specific status', async () => {
    let cancellationReason: unknown;
    const body = new ReadableStream<Uint8Array>({
      cancel(reason) {
        cancellationReason = reason;
      },
    });
    const controller = new AbortController();
    controller.abort('request-receive-timeout');

    await expectAppError(
      parseVideoJobMultipart(
        new Request('http://localhost/video-job', {
          method: 'PUT',
          headers: { 'content-type': 'multipart/form-data; boundary=test' },
          body,
          duplex: 'half',
        } as RequestInit & { duplex: 'half' }),
        await paths(),
        1_024,
        controller.signal,
      ),
      {
        statusCode: 408,
        code: 'request_timeout',
        message: 'The request body was not received before the deadline.',
      },
    );
    expect(cancellationReason).toBeInstanceOf(AppError);
  });
});
