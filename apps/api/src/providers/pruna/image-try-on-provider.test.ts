import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { PRUNA_IMAGE_TRY_ON_MODEL } from '@studio/contracts';
import { ReferenceImageProviderError } from '../reference-images/reference-image-provider.js';
import type { ProviderFetch } from '../transport/provider-fetch.js';
import { PrunaImageTryOnProvider } from './image-try-on-provider.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const jpeg = () =>
  sharp({ create: { width: 64, height: 96, channels: 3, background: '#4b6175' } })
    .jpeg()
    .toBuffer();

const input = (bytes: Uint8Array, signal?: AbortSignal) => ({
  person: { bytes, mimeType: 'image/jpeg' as const },
  garment: { bytes, mimeType: 'image/jpeg' as const },
  ...(signal ? { signal } : {}),
});

describe('PrunaImageTryOnProvider', () => {
  it('uploads both images, submits exactly one pinned asynchronous prediction, polls, and downloads', async () => {
    const output = await jpeg();
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(
        json({ id: 'file-person', urls: { get: 'https://api.pruna.ai/v1/files/file-person' } }),
      )
      .mockResolvedValueOnce(
        json({ id: 'file-garment', urls: { get: 'https://api.pruna.ai/v1/files/file-garment' } }),
      )
      .mockResolvedValueOnce(
        json(
          {
            id: 'prediction-one',
            model: PRUNA_IMAGE_TRY_ON_MODEL,
            input: {},
            get_url: 'https://api.pruna.ai/v1/predictions/status/prediction-one',
          },
          201,
        ),
      )
      .mockResolvedValueOnce(json({ status: 'processing' }))
      .mockResolvedValueOnce(
        json({
          status: 'succeeded',
          generation_url: 'https://api.pruna.ai/v1/predictions/delivery/zone/result/output.jpg',
        }),
      )
      .mockResolvedValueOnce(
        new Response(output, {
          headers: { 'content-type': 'image/jpeg', 'content-length': String(output.byteLength) },
        }),
      );
    const provider = new PrunaImageTryOnProvider('server-secret', {
      fetchImplementation,
      pollDelayMs: 0,
    });

    await expect(provider.tryOn(input(output))).resolves.toMatchObject({
      bytes: new Uint8Array(output),
      mimeType: 'image/jpeg',
      providerId: 'pruna',
      modelId: PRUNA_IMAGE_TRY_ON_MODEL,
      providerRequestId: 'prediction-one',
    });

    expect(fetchImplementation).toHaveBeenCalledTimes(6);
    const uploadCalls = fetchImplementation.mock.calls.slice(0, 2);
    expect(
      uploadCalls.every(
        ([url, init]) =>
          url === 'https://api.pruna.ai/v1/files' &&
          init?.method === 'POST' &&
          init.body instanceof FormData,
      ),
    ).toBe(true);
    const [submissionUrl, submissionInit] = fetchImplementation.mock.calls[2]!;
    expect(submissionUrl).toBe('https://api.pruna.ai/v1/predictions');
    expect(new Headers(submissionInit?.headers).get('model')).toBe(PRUNA_IMAGE_TRY_ON_MODEL);
    expect(new Headers(submissionInit?.headers).has('try-sync')).toBe(false);
    const submissionBody = submissionInit?.body;
    expect(typeof submissionBody).toBe('string');
    if (typeof submissionBody !== 'string') throw new Error('Expected a JSON submission body.');
    expect(JSON.parse(submissionBody)).toEqual({
      input: {
        person_image: 'https://api.pruna.ai/v1/files/file-person',
        garment_images: ['https://api.pruna.ai/v1/files/file-garment'],
        turbo: false,
        output_format: 'jpg',
        output_quality: 95,
        preserve_input_size: true,
      },
    });
    expect(fetchImplementation.mock.calls[5]?.[1]?.headers).toEqual({ apikey: 'server-secret' });
  });

  it('rejects an untrusted delivery URL without downloading it', async () => {
    const bytes = await jpeg();
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(json({ urls: { get: 'https://api.pruna.ai/v1/files/person' } }))
      .mockResolvedValueOnce(json({ urls: { get: 'https://api.pruna.ai/v1/files/garment' } }))
      .mockResolvedValueOnce(
        json(
          {
            id: 'prediction-two',
            get_url: 'https://api.pruna.ai/v1/predictions/status/prediction-two',
          },
          201,
        ),
      )
      .mockResolvedValueOnce(
        json({ status: 'succeeded', generation_url: 'https://attacker.example/output.jpg' }),
      );
    const provider = new PrunaImageTryOnProvider('secret', { fetchImplementation, pollDelayMs: 0 });

    await expect(provider.tryOn(input(bytes))).rejects.toMatchObject({
      name: 'ReferenceImageProviderError',
      providerId: 'pruna',
      reason: 'invalid-response',
    });
    expect(fetchImplementation).toHaveBeenCalledTimes(4);
  });

  it('does not retry a failed billable submission', async () => {
    const bytes = await jpeg();
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(json({ urls: { get: 'https://api.pruna.ai/v1/files/person' } }))
      .mockResolvedValueOnce(json({ urls: { get: 'https://api.pruna.ai/v1/files/garment' } }))
      .mockResolvedValueOnce(json({ error: 'private upstream body' }, 500));
    const provider = new PrunaImageTryOnProvider('secret', { fetchImplementation, pollDelayMs: 0 });

    await expect(provider.tryOn(input(bytes))).rejects.toBeInstanceOf(ReferenceImageProviderError);
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });

  it('aborts local polling without claiming remote cancellation', async () => {
    const bytes = await jpeg();
    const controller = new AbortController();
    const fetchImplementation = vi
      .fn<ProviderFetch>()
      .mockResolvedValueOnce(json({ urls: { get: 'https://api.pruna.ai/v1/files/person' } }))
      .mockResolvedValueOnce(json({ urls: { get: 'https://api.pruna.ai/v1/files/garment' } }))
      .mockResolvedValueOnce(
        json(
          {
            id: 'prediction-three',
            get_url: 'https://api.pruna.ai/v1/predictions/status/prediction-three',
          },
          201,
        ),
      );
    const provider = new PrunaImageTryOnProvider('secret', {
      fetchImplementation,
      pollDelayMs: 50,
    });
    const operation = provider.tryOn(input(bytes, controller.signal));
    await vi.waitFor(() => expect(fetchImplementation).toHaveBeenCalledTimes(3));
    controller.abort();

    await expect(operation).rejects.toMatchObject({ providerId: 'pruna', reason: 'aborted' });
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
  });
});
