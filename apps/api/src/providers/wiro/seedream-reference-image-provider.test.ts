import { createHmac } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderFetch } from '../transport/provider-fetch.js';
import {
  WIRO_SEEDREAM_RUN_ENDPOINT,
  WIRO_TASK_DELETE_ENDPOINT,
  WIRO_TASK_DETAIL_ENDPOINT,
  type WiroLifecycleObserver,
  WiroSeedreamReferenceImageProvider,
} from './seedream-reference-image-provider.js';

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const taskDetail = (
  status: string,
  overrides: Readonly<Record<string, unknown>> = {},
): unknown => ({
  result: true,
  errors: [],
  total: '1',
  tasklist: [
    {
      id: 'task-one',
      status,
      pexit: status === 'task_postprocess_end' ? '0' : null,
      modelslugowner: 'ByteDance',
      modelslugproject: 'seedream-v5-lite-uncensored',
      outputs:
        status === 'task_postprocess_end'
          ? [
              {
                name: '0.png',
                contenttype: 'image/png',
                size: '100',
                url: 'https://cdn.example.test/output.png',
              },
            ]
          : [],
      ...overrides,
    },
  ],
});

const submitResponse = {
  result: true,
  errors: [],
  taskid: 'task-one',
  socketaccesstoken: 'private-task-token',
};

const image = (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: '#49637a' } })
    .png()
    .toBuffer();

describe('WiroSeedreamReferenceImageProvider', () => {
  it('signs one billable submission, polls through post-processing, normalizes output, and deletes remote files on acknowledgement', async () => {
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(jsonResponse(submitResponse))
      .mockResolvedValueOnce(jsonResponse(taskDetail('task_start')))
      .mockResolvedValueOnce(
        jsonResponse(taskDetail('task_postprocess_end', { totalcost: '0.035000000000' })),
      )
      .mockResolvedValueOnce(jsonResponse({ result: true, errors: [] }));
    const download = vi.fn().mockResolvedValue({
      bytes: await image(320, 480),
      mimeType: 'image/png' as const,
    });
    const observeLifecycle = vi.fn<WiroLifecycleObserver>();
    const provider = new WiroSeedreamReferenceImageProvider('wiro-key', 'wiro-secret', {
      fetchImplementation,
      downloader: { download },
      pollDelayMs: 0,
      createNonce: () => '123456',
      observeLifecycle,
    });

    const result = await provider.generate({
      prompt: 'A precise character reference.',
      size: '1024x1536',
      format: 'webp',
    });

    expect(result).toMatchObject({
      mimeType: 'image/webp',
      providerId: 'wiro',
      modelId: 'seedream-v5-lite-uncensored',
      providerRequestId: 'task-one',
      safeUsage: { cost: 0.035 },
    });
    await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({
      width: 1024,
      height: 1536,
      format: 'webp',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(fetchImplementation.mock.calls.map((call) => call[0])).toEqual([
      WIRO_SEEDREAM_RUN_ENDPOINT,
      WIRO_TASK_DETAIL_ENDPOINT,
      WIRO_TASK_DETAIL_ENDPOINT,
    ]);
    const [endpoint, submission] = fetchImplementation.mock.calls[0] ?? [];
    expect(endpoint).toBe('https://api.wiro.ai/v1/Run/ByteDance/seedream-v5-lite-uncensored');
    const expectedSignature = createHmac('sha256', 'wiro-key')
      .update('wiro-secret123456')
      .digest('hex');
    expect(submission?.headers).toMatchObject({
      'x-api-key': 'wiro-key',
      'x-nonce': '123456',
      'x-signature': expectedSignature,
      'Content-Type': 'application/json',
    });
    if (typeof submission?.body !== 'string') throw new TypeError('Expected JSON body.');
    expect(JSON.parse(submission.body)).toEqual({
      prompt: 'A precise character reference.',
      resolution: '2k',
      aspectRatio: '2:3',
      maxImages: 1,
      watermark: 'false',
    });
    expect(download).toHaveBeenCalledWith(
      'https://cdn.example.test/output.png',
      expect.any(AbortSignal),
    );

    await result.cleanupRemoteArtifacts?.();

    expect(fetchImplementation).toHaveBeenCalledTimes(4);
    const [cleanupEndpoint, cleanupRequest] = fetchImplementation.mock.calls[3] ?? [];
    expect(cleanupEndpoint).toBe(WIRO_TASK_DELETE_ENDPOINT);
    expect(cleanupRequest).toMatchObject({ method: 'POST', redirect: 'error' });
    if (typeof cleanupRequest?.body !== 'string') throw new TypeError('Expected JSON body.');
    expect(JSON.parse(cleanupRequest.body)).toEqual({ tasktoken: 'private-task-token' });
    expect(observeLifecycle.mock.calls.map(([event]) => event.stage)).toEqual([
      'submitted',
      'downloading',
      'normalized',
      'cleanup_started',
      'cleanup_succeeded',
    ]);
    expect(JSON.stringify(observeLifecycle.mock.calls)).not.toContain('private-task-token');
  });

  it('uses multipart input for edits while preserving the same size and output contract', async () => {
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(jsonResponse(submitResponse))
      .mockResolvedValueOnce(jsonResponse(taskDetail('task_postprocess_end')));
    const provider = new WiroSeedreamReferenceImageProvider('wiro-key', 'wiro-secret', {
      fetchImplementation,
      downloader: {
        download: async () => ({
          bytes: await image(480, 320),
          mimeType: 'image/png',
        }),
      },
      pollDelayMs: 0,
      createNonce: () => '123456',
    });

    const result = await provider.edit({
      prompt: 'Preserve identity and change the coat.',
      size: '1536x1024',
      format: 'jpeg',
      source: { bytes: Buffer.from([1, 2, 3]), mimeType: 'image/png' },
    });

    const body = fetchImplementation.mock.calls[0]?.[1]?.body;
    expect(body).toBeInstanceOf(FormData);
    if (!(body instanceof FormData)) throw new TypeError('Expected multipart body.');
    expect(body.get('prompt')).toBe('Preserve identity and change the coat.');
    expect(body.get('resolution')).toBe('2k');
    expect(body.get('aspectRatio')).toBe('3:2');
    expect(body.get('maxImages')).toBe('1');
    expect(body.get('watermark')).toBe('false');
    expect(body.get('inputImage')).toBeInstanceOf(File);
    expect(fetchImplementation.mock.calls[0]?.[1]?.headers).not.toHaveProperty('Content-Type');
    expect(result).toMatchObject({ providerId: 'wiro', mimeType: 'image/jpeg' });
    await expect(sharp(result.bytes).metadata()).resolves.toMatchObject({
      width: 1536,
      height: 1024,
      format: 'jpeg',
    });
  });

  it('does not treat task_error as terminal and requires postprocess success', async () => {
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(jsonResponse(submitResponse))
      .mockResolvedValueOnce(jsonResponse(taskDetail('task_error')))
      .mockResolvedValueOnce(
        jsonResponse(taskDetail('task_postprocess_end', { pexit: '1', outputs: [] })),
      )
      .mockResolvedValueOnce(jsonResponse({ result: true, errors: [] }));
    const provider = new WiroSeedreamReferenceImageProvider('wiro-key', 'wiro-secret', {
      fetchImplementation,
      pollDelayMs: 0,
      createNonce: () => '123456',
    });

    await expect(
      provider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({
      providerId: 'wiro',
      providerRequestId: 'task-one',
      reason: 'failure',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(4);
    expect(fetchImplementation.mock.calls[3]?.[0]).toBe(WIRO_TASK_DELETE_ENDPOINT);
  });

  it.each([
    [401, 'authentication'],
    [402, 'credits'],
    [409, 'rate-limit'],
    [429, 'rate-limit'],
    [422, 'invalid-request'],
    [503, 'failure'],
  ] as const)(
    'maps initial HTTP %s without retrying the billable Run request',
    async (status, reason) => {
      const fetchImplementation = vi
        .fn<ProviderFetch>()
        .mockResolvedValue(jsonResponse({ result: false, errors: [] }, status));
      const provider = new WiroSeedreamReferenceImageProvider('wiro-key', 'wiro-secret', {
        fetchImplementation,
        pollDelayMs: 0,
        createNonce: () => '123456',
      });

      await expect(
        provider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
      ).rejects.toMatchObject({ providerId: 'wiro', reason, upstreamStatus: status });
      expect(fetchImplementation).toHaveBeenCalledOnce();
    },
  );

  it('bounds polling retries without ever resubmitting the billable Run request', async () => {
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(jsonResponse(submitResponse))
      .mockResolvedValue(jsonResponse({ result: false, errors: ['concurrency limit'] }, 429));
    const provider = new WiroSeedreamReferenceImageProvider('wiro-key', 'wiro-secret', {
      fetchImplementation,
      pollDelayMs: 0,
      createNonce: () => '123456',
    });

    await expect(
      provider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({
      providerId: 'wiro',
      providerRequestId: 'task-one',
      reason: 'rate-limit',
    });
    expect(
      fetchImplementation.mock.calls.filter(
        ([endpoint]) => endpoint === WIRO_SEEDREAM_RUN_ENDPOINT,
      ),
    ).toHaveLength(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(6);
    expect(fetchImplementation.mock.calls[5]?.[0]).toBe(WIRO_TASK_DELETE_ENDPOINT);
  });

  it('maps caller cancellation and the shared operation deadline distinctly', async () => {
    const hangingFetch = vi.fn<ProviderFetch>((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    });
    const timeoutProvider = new WiroSeedreamReferenceImageProvider('wiro-key', 'wiro-secret', {
      fetchImplementation: hangingFetch,
      timeoutMs: 10,
      pollDelayMs: 0,
    });
    await expect(
      timeoutProvider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({ providerId: 'wiro', reason: 'timeout' });

    const abortProvider = new WiroSeedreamReferenceImageProvider('wiro-key', 'wiro-secret', {
      fetchImplementation: hangingFetch,
      timeoutMs: 5_000,
      pollDelayMs: 0,
    });
    const controller = new AbortController();
    const pending = abortProvider.generate({
      prompt: 'prompt',
      size: '1024x1024',
      format: 'jpeg',
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ providerId: 'wiro', reason: 'aborted' });
  });

  it('keeps cleanup best-effort and reports only safe lifecycle metadata', async () => {
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(jsonResponse(submitResponse))
      .mockResolvedValueOnce(jsonResponse(taskDetail('task_postprocess_end')))
      .mockResolvedValueOnce(jsonResponse({ result: false, errors: ['private error'] }, 500));
    const observeLifecycle = vi.fn<WiroLifecycleObserver>();
    const provider = new WiroSeedreamReferenceImageProvider('wiro-key', 'wiro-secret', {
      fetchImplementation,
      downloader: {
        download: async () => ({
          bytes: await image(320, 320),
          mimeType: 'image/png',
        }),
      },
      pollDelayMs: 0,
      observeLifecycle,
    });

    const result = await provider.generate({
      prompt: 'prompt',
      size: '1024x1024',
      format: 'png',
    });
    await expect(result.cleanupRemoteArtifacts?.()).resolves.toBeUndefined();
    expect(observeLifecycle).toHaveBeenLastCalledWith(
      expect.objectContaining({
        stage: 'cleanup_failed',
        providerRequestId: 'task-one',
      }),
    );
    expect(JSON.stringify(observeLifecycle.mock.calls)).not.toContain('private error');
    expect(JSON.stringify(observeLifecycle.mock.calls)).not.toContain('private-task-token');
  });
});
