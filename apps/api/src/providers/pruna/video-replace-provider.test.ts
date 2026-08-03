import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { VideoJobProviderError } from '../video-jobs/video-job-provider.js';
import { PrunaVideoReplaceProvider } from './video-replace-provider.js';

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const fixture = async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lightframe-pruna-provider-'));
  const videoPath = path.join(root, 'input.mp4');
  const referencePath = path.join(root, 'reference.png');
  await writeFile(videoPath, 'video');
  await writeFile(referencePath, 'reference');
  return { root, videoPath, referencePath };
};

const submission = (
  videoPath: string,
  referencePath: string,
  signal = new AbortController().signal,
) => ({
  operation: 'character-swap' as const,
  recipe: {
    operation: 'character-swap' as const,
    inputKind: 'character' as const,
    prompt: '',
    enhancePrompt: false,
    hasReferenceImage: true,
  },
  videoPath,
  videoMimeType: 'video/mp4' as const,
  referenceImagePath: referencePath,
  referenceImageMimeType: 'image/png' as const,
  signal,
});

describe('PrunaVideoReplaceProvider', () => {
  it('uploads synthetic-named media and submits the pinned model exactly once', async () => {
    const { videoPath, referencePath } = await fixture();
    const fetchImplementation = vi.fn<typeof fetch>();
    fetchImplementation
      .mockResolvedValueOnce(
        jsonResponse({ urls: { get: 'https://api.pruna.ai/v1/files/file-video' } }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ urls: { get: 'https://api.pruna.ai/v1/files/file-reference' } }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            id: 'prediction-one',
            get_url: 'https://api.pruna.ai/v1/predictions/status/prediction-one',
          },
          201,
        ),
      );
    const provider = new PrunaVideoReplaceProvider('server-secret', '720p', fetchImplementation);

    await expect(provider.submit(submission(videoPath, referencePath))).resolves.toEqual({
      providerJobId: 'prediction-one',
      status: 'pending',
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    for (const call of fetchImplementation.mock.calls.slice(0, 2)) {
      expect(call[0]).toBe('https://api.pruna.ai/v1/files');
      expect(call[1]?.headers).toEqual({ apikey: 'server-secret' });
    }
    const videoForm = fetchImplementation.mock.calls[0]![1]?.body;
    const referenceForm = fetchImplementation.mock.calls[1]![1]?.body;
    expect(videoForm).toBeInstanceOf(FormData);
    expect(referenceForm).toBeInstanceOf(FormData);
    if (!(videoForm instanceof FormData) || !(referenceForm instanceof FormData)) {
      throw new Error('Expected upload multipart bodies.');
    }
    expect((videoForm.get('content') as File).name).toBe('character-swap-source.mp4');
    expect((referenceForm.get('content') as File).name).toBe('character-swap-reference.png');

    const [predictionUrl, predictionInit] = fetchImplementation.mock.calls[2]!;
    expect(predictionUrl).toBe('https://api.pruna.ai/v1/predictions');
    expect(predictionInit?.headers).toEqual({
      apikey: 'server-secret',
      'Content-Type': 'application/json',
      Model: 'p-video-replace',
    });
    if (typeof predictionInit?.body !== 'string') {
      throw new Error('Expected prediction request JSON.');
    }
    expect(JSON.parse(predictionInit.body)).toEqual({
      input: {
        video: 'https://api.pruna.ai/v1/files/file-video',
        images: ['https://api.pruna.ai/v1/files/file-reference'],
        instruction_prompt:
          'Replace the person in the source video with the identity from reference image 1. Keep lip sync, motion, audio, and camera from the source video.',
        resolution: '720p',
        save_audio: true,
      },
    });
  });

  it.each([
    ['starting', 'pending', undefined],
    ['processing', 'processing', undefined],
    ['failed', 'failed', 'generation-failed'],
    ['canceled', 'failed', 'aborted'],
  ] as const)(
    'maps %s status safely to %s',
    async (providerStatus, expectedStatus, expectedFailureReason) => {
      const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const fetchImplementation = vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          jsonResponse({ status: providerStatus, message: 'private status detail' }),
        );
      const provider = new PrunaVideoReplaceProvider('server-secret', '1080p', fetchImplementation);

      await expect(provider.status('opaque-id', new AbortController().signal)).resolves.toEqual({
        status: expectedStatus,
        ...(expectedFailureReason === undefined ? {} : { failureReason: expectedFailureReason }),
      });
      expect(fetchImplementation).toHaveBeenCalledWith(
        'https://api.pruna.ai/v1/predictions/status/opaque-id',
        expect.objectContaining({ headers: { apikey: 'server-secret' } }),
      );
      if (providerStatus === 'failed' || providerStatus === 'canceled') {
        expect(warning).toHaveBeenCalledWith(
          '[pruna-video-replace] Prediction reached a terminal state without a result.',
          { status: providerStatus, failureReason: expectedFailureReason },
        );
      } else {
        expect(warning).not.toHaveBeenCalled();
      }
      warning.mockRestore();
    },
  );

  it.each([
    ['Safety checker rejected private subject details.', 'policy'],
    ['Account credit balance is insufficient.', 'billing'],
    ['Prediction quota reached.', 'quota'],
    ['Worker timed out after private duration.', 'timeout'],
    ['Unsupported video codec with private filename.', 'rejected'],
    ['Private infrastructure exception.', 'generation-failed'],
  ] as const)('classifies failed prediction details as safe %s failure', async (error, reason) => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ status: 'failed', error }));
    const provider = new PrunaVideoReplaceProvider('server-secret', '1080p', fetchImplementation);

    const status = await provider.status('opaque-id', new AbortController().signal);

    expect(status).toEqual({ status: 'failed', failureReason: reason });
    expect(JSON.stringify(status)).not.toContain(error);
    expect(warning).toHaveBeenCalledWith(
      '[pruna-video-replace] Prediction reached a terminal state without a result.',
      { status: 'failed', failureReason: reason },
    );
    warning.mockRestore();
  });

  it('allowlists succeeded delivery URLs and performs an authenticated bounded download', async () => {
    const { root } = await fixture();
    const destinationPath = path.join(root, 'result.mp4');
    const fetchImplementation = vi.fn<typeof fetch>();
    fetchImplementation
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'succeeded',
          generation_url: 'https://api.pruna.ai/v1/predictions/delivery/tenant/token/output.mp4',
        }),
      )
      .mockResolvedValueOnce(
        new Response('generated-video', {
          status: 200,
          headers: { 'content-length': '15', 'content-type': 'video/mp4' },
        }),
      );
    const provider = new PrunaVideoReplaceProvider('server-secret', '1080p', fetchImplementation);

    const status = await provider.status('prediction-one', new AbortController().signal);
    expect(status).toEqual({
      status: 'completed',
      outputLocation: 'https://api.pruna.ai/v1/predictions/delivery/tenant/token/output.mp4',
    });
    await provider.download(
      'prediction-one',
      destinationPath,
      new AbortController().signal,
      status.outputLocation,
    );
    expect(await readFile(destinationPath, 'utf8')).toBe('generated-video');
    expect(fetchImplementation.mock.calls[1]?.[1]).toEqual(
      expect.objectContaining({ headers: { apikey: 'server-secret' } }),
    );
  });

  it.each([
    'http://api.pruna.ai/v1/predictions/delivery/token/output.mp4',
    'https://evil.invalid/v1/predictions/delivery/token/output.mp4',
    'https://api.pruna.ai/v1/files/output.mp4',
    'https://api.pruna.ai/v1/predictions/delivery/token/output.mp4?secret=1',
  ])('rejects non-allowlisted delivery URL %s without downloading', async (generationUrl) => {
    const fetchImplementation = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse({ status: 'succeeded', generation_url: generationUrl }));
    const provider = new PrunaVideoReplaceProvider('server-secret', '720p', fetchImplementation);

    await expect(provider.status('prediction', new AbortController().signal)).rejects.toMatchObject(
      {
        reason: 'invalid-response',
      },
    );
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('does not retry an initial billable prediction submission', async () => {
    const { videoPath, referencePath } = await fixture();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fetchImplementation = vi.fn<typeof fetch>();
    fetchImplementation
      .mockResolvedValueOnce(
        jsonResponse({ urls: { get: 'https://api.pruna.ai/v1/files/file-video' } }, 201),
      )
      .mockResolvedValueOnce(
        jsonResponse({ urls: { get: 'https://api.pruna.ai/v1/files/file-reference' } }, 201),
      )
      .mockResolvedValueOnce(new Response('', { status: 503 }));
    const provider = new PrunaVideoReplaceProvider('server-secret', '720p', fetchImplementation);

    await expect(provider.submit(submission(videoPath, referencePath))).rejects.toMatchObject({
      reason: 'upstream',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(
      fetchImplementation.mock.calls.filter(
        ([url]) => url === 'https://api.pruna.ai/v1/predictions',
      ),
    ).toHaveLength(1);
    expect(warning).toHaveBeenCalledWith('[pruna-video-replace] Upstream HTTP request failed.', {
      status: 503,
    });
    warning.mockRestore();
  });

  it('bounds JSON/media and maps aborts without exposing upstream bodies', async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    fetchImplementation.mockResolvedValueOnce(
      new Response('x', { status: 200, headers: { 'content-length': '1048577' } }),
    );
    const provider = new PrunaVideoReplaceProvider('server-secret', '720p', fetchImplementation);
    await expect(provider.status('prediction', new AbortController().signal)).rejects.toEqual(
      expect.objectContaining<Partial<VideoJobProviderError>>({ reason: 'invalid-response' }),
    );

    const controller = new AbortController();
    controller.abort();
    fetchImplementation.mockRejectedValueOnce(new DOMException('private prompt', 'AbortError'));
    await expect(provider.status('prediction', controller.signal)).rejects.toMatchObject({
      reason: 'aborted',
      message: 'Visual processing provider request failed.',
    });
  });

  it('bounds status requests with a provider timeout', async () => {
    const fetchImplementation = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('private timeout detail', 'AbortError')),
            { once: true },
          );
        }),
    );
    const provider = new PrunaVideoReplaceProvider('server-secret', '720p', fetchImplementation, {
      uploadMs: 5,
      statusMs: 5,
      downloadMs: 5,
    });

    await expect(provider.status('prediction', new AbortController().signal)).rejects.toMatchObject(
      {
        reason: 'timeout',
        message: 'Visual processing provider request failed.',
      },
    );
  });
});
