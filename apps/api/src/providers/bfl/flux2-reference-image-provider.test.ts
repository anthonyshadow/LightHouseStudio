import { describe, expect, it, vi } from 'vitest';
import type { ProviderFetch } from '../transport/provider-fetch.js';
import {
  BFL_FLUX_2_PRO_ENDPOINT,
  BflFlux2ReferenceImageProvider,
} from './flux2-reference-image-provider.js';

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('BflFlux2ReferenceImageProvider', () => {
  it('aligns direct construction with the configured safety defaults', () => {
    const provider = new BflFlux2ReferenceImageProvider('bfl-secret');

    expect(provider.descriptor.effectiveSettings).toEqual({
      safetyTolerance: 2,
      disablePromptUpsampling: true,
    });
  });

  it('submits a prompt-only task once, polls the exact returned URL, and returns downloaded bytes with provenance', async () => {
    const pollingUrl = 'https://api.us1.bfl.ai/v1/get_result?id=task-one&token=signed';
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-one',
          polling_url: pollingUrl,
          cost: 0.05,
          input_mp: 0,
          output_mp: 1.5,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'Pending' }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'Ready',
          result: { sample: 'https://cdn.example.test/signed-output' },
        }),
      );
    const download = vi.fn().mockResolvedValue({
      bytes: Buffer.from('provider-image'),
      mimeType: 'image/webp' as const,
    });
    const observeLifecycle = vi.fn();
    const provider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation,
      downloader: { download },
      pollDelayMs: 0,
      safetyTolerance: 4,
      disablePromptUpsampling: true,
      observeLifecycle,
    });

    await expect(
      provider.generate({
        prompt: 'A precise character reference.',
        size: '1024x1536',
        format: 'webp',
      }),
    ).resolves.toEqual({
      bytes: Buffer.from('provider-image'),
      mimeType: 'image/webp',
      providerId: 'bfl',
      modelId: 'flux-2-pro',
      providerRequestId: 'task-one',
      safeUsage: { cost: 0.05, inputMegapixels: 0, outputMegapixels: 1.5 },
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    const [endpoint, submit] = fetchImplementation.mock.calls[0] ?? [];
    expect(endpoint).toBe(BFL_FLUX_2_PRO_ENDPOINT);
    expect(endpoint).toBe('https://api.us2.bfl.ai/v1/flux-2-pro');
    expect(submit).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'x-key': 'bfl-secret',
      },
    });
    if (typeof submit?.body !== 'string') throw new TypeError('Expected a JSON request body.');
    expect(JSON.parse(submit.body)).toEqual({
      prompt: 'A precise character reference.',
      width: 1024,
      height: 1536,
      output_format: 'webp',
      safety_tolerance: 4,
      disable_pup: true,
    });
    expect(fetchImplementation.mock.calls[1]?.[0]).toBe(pollingUrl);
    expect(fetchImplementation.mock.calls[2]?.[0]).toBe(pollingUrl);
    expect(fetchImplementation.mock.calls[1]?.[1]?.redirect).toBe('error');
    expect(fetchImplementation.mock.calls[2]?.[1]?.redirect).toBe('error');
    expect(download).toHaveBeenCalledWith(
      'https://cdn.example.test/signed-output',
      expect.any(AbortSignal),
    );
    expect(observeLifecycle).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        stage: 'submitted',
        providerRequestId: 'task-one',
        pollingOrigin: 'https://api.us1.bfl.ai',
      }),
    );
    expect(observeLifecycle).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        stage: 'downloading',
        providerRequestId: 'task-one',
        deliveryOrigin: 'https://cdn.example.test',
      }),
    );
    expect(observeLifecycle).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ stage: 'ready', providerRequestId: 'task-one' }),
    );
  });

  it.each([
    'https://api.bfl.ai',
    'https://api.eu.bfl.ai',
    'https://api.us.bfl.ai',
    'https://api.eu1.bfl.ai',
    'https://api.us1.bfl.ai',
    'https://api.us2.bfl.ai',
    'https://api.us-central1.bfl.ai',
  ])('accepts the returned BFL API polling origin %s', async (origin) => {
    const pollingUrl = `${origin}/v1/get_result?id=regional-task`;
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'regional-task',
          polling_url: pollingUrl,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'Ready',
          result: { sample: 'https://delivery-us1.bfl.ai/signed-output' },
        }),
      );
    const provider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation,
      downloader: {
        download: () =>
          Promise.resolve({ bytes: Buffer.from('regional-image'), mimeType: 'image/jpeg' }),
      },
      pollDelayMs: 0,
    });

    await expect(
      provider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).resolves.toMatchObject({
      providerId: 'bfl',
      providerRequestId: 'regional-task',
    });
    expect(fetchImplementation.mock.calls[1]?.[0]).toBe(pollingUrl);
  });

  it.each([
    'https://api.bfl.ai.attacker.example/v1/get_result?id=untrusted-task',
    'https://attacker.bfl.ai/v1/get_result?id=untrusted-task',
    'https://api.us2.bfl.ai:8443/v1/get_result?id=untrusted-task',
    'http://api.us2.bfl.ai/v1/get_result?id=untrusted-task',
  ])('rejects untrusted polling URL %s before forwarding the API key', async (pollingUrl) => {
    const fetchImplementation = vi.fn<ProviderFetch>().mockResolvedValueOnce(
      jsonResponse({
        id: 'untrusted-task',
        polling_url: pollingUrl,
      }),
    );
    const provider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation,
      pollDelayMs: 0,
    });

    await expect(
      provider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({
      providerId: 'bfl',
      providerRequestId: 'untrusted-task',
      reason: 'invalid-response',
    });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('submits a prompt-and-reference task with raw base64 and no data URL prefix', async () => {
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-edit',
          polling_url: 'https://api.us.bfl.ai/v1/get_result?id=task-edit',
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'Ready',
          result: { sample: 'https://cdn.example.test/edit-output' },
        }),
      );
    const provider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation,
      downloader: {
        download: () => Promise.resolve({ bytes: Buffer.from('edited'), mimeType: 'image/jpeg' }),
      },
      pollDelayMs: 0,
    });

    await provider.edit({
      prompt: 'Preserve identity and change the coat.',
      size: '1536x1024',
      format: 'jpeg',
      source: { bytes: Buffer.from([1, 2, 3]), mimeType: 'image/png' },
    });

    const requestBody = fetchImplementation.mock.calls[0]?.[1]?.body;
    if (typeof requestBody !== 'string') throw new TypeError('Expected a JSON request body.');
    const body = JSON.parse(requestBody) as Record<string, unknown>;
    expect(fetchImplementation.mock.calls[0]?.[0]).toBe(BFL_FLUX_2_PRO_ENDPOINT);
    expect(
      fetchImplementation.mock.calls.filter((call) => call[1]?.method === 'POST'),
    ).toHaveLength(1);
    expect(body.prompt).toBe('Preserve identity and change the coat.');
    expect(body.input_image).toBe('AQID');
    expect(String(body.input_image)).not.toContain('data:');
  });

  it('accepts nullable submit usage and pending result fields from the published API schema', async () => {
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-nullable',
          polling_url: 'https://api.us2.bfl.ai/v1/get_result?id=task-nullable',
          cost: null,
          input_mp: null,
          output_mp: null,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'task-nullable', status: 'Pending', result: null }))
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'task-nullable',
          status: 'Ready',
          result: { sample: 'https://delivery-us2.bfl.ai/signed-output' },
        }),
      );
    const provider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation,
      downloader: {
        download: () => Promise.resolve({ bytes: Buffer.from('ready'), mimeType: 'image/jpeg' }),
      },
      pollDelayMs: 0,
    });

    await expect(
      provider.generate({ prompt: 'prompt only', size: '1024x1024', format: 'jpeg' }),
    ).resolves.toEqual({
      bytes: Buffer.from('ready'),
      mimeType: 'image/jpeg',
      providerId: 'bfl',
      modelId: 'flux-2-pro',
      providerRequestId: 'task-nullable',
    });
  });

  it('classifies native transport failures by provider stage without exposing URLs', async () => {
    const submissionProvider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation: vi.fn<ProviderFetch>().mockRejectedValue(new Error('socket failed')),
      pollDelayMs: 0,
    });
    await expect(
      submissionProvider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({
      providerId: 'bfl',
      providerStage: 'submission',
      reason: 'connection',
    });

    const pollingProvider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation: vi
        .fn<ProviderFetch>()
        .mockResolvedValueOnce(
          jsonResponse({
            id: 'poll-connection-task',
            polling_url: 'https://api.us2.bfl.ai/v1/get_result?id=poll-connection-task',
          }),
        )
        .mockRejectedValueOnce(new Error('poll socket failed')),
      pollDelayMs: 0,
    });
    await expect(
      pollingProvider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({
      providerId: 'bfl',
      providerRequestId: 'poll-connection-task',
      providerStage: 'polling',
      reason: 'connection',
    });

    const downloadProvider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation: vi
        .fn<ProviderFetch>()
        .mockResolvedValueOnce(
          jsonResponse({
            id: 'download-connection-task',
            polling_url: 'https://api.us2.bfl.ai/v1/get_result?id=download-connection-task',
          }),
        )
        .mockResolvedValueOnce(
          jsonResponse({
            status: 'Ready',
            result: { sample: 'https://delivery.us2.bfl.ai/signed-secret-path' },
          }),
        ),
      downloader: { download: () => Promise.reject(new Error('download socket failed')) },
      pollDelayMs: 0,
    });
    await expect(
      downloadProvider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({
      providerId: 'bfl',
      providerRequestId: 'download-connection-task',
      providerStage: 'download',
      reason: 'connection',
    });
  });

  it.each([
    [401, 'authentication'],
    [402, 'credits'],
    [429, 'rate-limit'],
    [422, 'invalid-request'],
    [503, 'failure'],
  ] as const)('maps initial HTTP %s without retrying the billable POST', async (status, reason) => {
    const fetchImplementation = vi.fn<ProviderFetch>().mockResolvedValue(jsonResponse({}, status));
    const provider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation,
      pollDelayMs: 0,
    });

    await expect(
      provider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({ providerId: 'bfl', reason, upstreamStatus: status });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('maps terminal moderation and keeps the task id for safe diagnostics', async () => {
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'moderated-task',
          polling_url: 'https://api.us.bfl.ai/v1/get_result?id=moderated-task',
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'Content Moderated' }));
    const provider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation,
      pollDelayMs: 0,
    });

    await expect(
      provider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({
      providerId: 'bfl',
      providerRequestId: 'moderated-task',
      reason: 'moderation',
    });
  });

  it('bounds retryable polling failures without resubmitting the task', async () => {
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          id: 'rate-limited-task',
          polling_url: 'https://api.us.bfl.ai/v1/get_result?id=rate-limited-task',
        }),
      )
      .mockResolvedValue(jsonResponse({}, 429));
    const provider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation,
      pollDelayMs: 0,
    });

    await expect(
      provider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({
      providerId: 'bfl',
      providerRequestId: 'rate-limited-task',
      reason: 'rate-limit',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(5);
    expect(
      fetchImplementation.mock.calls.filter((call) => call[1]?.method === 'POST'),
    ).toHaveLength(1);
  });

  it('applies one deadline across submission, polling, and download', async () => {
    const fetchImplementation = vi.fn<ProviderFetch>((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    });
    const provider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation,
      timeoutMs: 10,
      pollDelayMs: 0,
    });

    await expect(
      provider.generate({ prompt: 'prompt', size: '1024x1024', format: 'jpeg' }),
    ).rejects.toMatchObject({ providerId: 'bfl', reason: 'timeout' });
    expect(fetchImplementation).toHaveBeenCalledOnce();
  });

  it('propagates caller cancellation without converting it to a timeout', async () => {
    const fetchImplementation = vi.fn<ProviderFetch>((_input, init) => {
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          'abort',
          () => reject(new DOMException('Aborted', 'AbortError')),
          { once: true },
        );
      });
    });
    const provider = new BflFlux2ReferenceImageProvider('bfl-secret', {
      fetchImplementation,
      timeoutMs: 5_000,
      pollDelayMs: 0,
    });
    const controller = new AbortController();
    const pending = provider.generate({
      prompt: 'prompt',
      size: '1024x1024',
      format: 'jpeg',
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ providerId: 'bfl', reason: 'aborted' });
  });
});
