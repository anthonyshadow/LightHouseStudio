// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  abandonVideoJob,
  downloadVideoJobResult,
  listActiveVideoJobs,
  submitVideoJob,
} from './videoJobsApi';
import { jsonScenario, responseScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';

const status = (jobId: string) => ({
  jobId,
  operation: 'character-swap',
  status: 'validating',
  createdAt: '2026-07-30T12:00:00.000Z',
  updatedAt: '2026-07-30T12:00:00.000Z',
  expiresAt: '2026-07-30T13:00:00.000Z',
  result: null,
  error: null,
});

describe('videoJobsApi', () => {
  it('uses fixed multipart order, synthetic filenames, and explicit provider intent', async () => {
    const jobId = crypto.randomUUID();
    mockApiServer.use(
      jsonScenario('PUT', `/api/video-jobs/${jobId}`, { body: status(jobId), status: 202 }),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const privateName = 'private-original-filename.mp4';
    const video = new File(['video'], privateName, { type: 'video/mp4' });
    const reference = new File(['reference'], 'private-reference.png', {
      type: 'image/png',
    });

    await submitVideoJob(
      jobId,
      {
        operation: 'character-swap',
        prompt: 'Change the scene',
        enhancePrompt: false,
        hasReferenceImage: true,
      },
      video,
      reference,
      new AbortController().signal,
    );

    const request = fetchSpy.mock.calls[0]![1]!;
    const form = request.body as FormData;
    const entries = [...form.entries()];
    expect(entries.map(([name]) => name)).toEqual(['request', 'data', 'reference_image']);
    expect((entries[1]![1] as File).name).toBe('input.mp4');
    expect((entries[2]![1] as File).name).toBe('reference.png');
    expect(JSON.stringify(entries)).not.toContain(privateName);
    expect(new Headers(request.headers).get('x-lightframe-provider-intent')).toBe('video');
  });

  it('rejects a declared oversized result before buffering it', async () => {
    const jobId = crypto.randomUUID();
    mockApiServer.use(
      responseScenario('GET', `/api/video-jobs/${jobId}/content`, 'not-read', {
        headers: { 'content-length': '300000001', 'content-type': 'video/mp4' },
      }),
    );

    await expect(downloadVideoJobResult(jobId, new AbortController().signal)).rejects.toMatchObject(
      { code: 'result_too_large' },
    );
  });

  it('lists active jobs and explicitly acknowledges local-only abandonment', async () => {
    const jobId = crypto.randomUUID();
    mockApiServer.use(
      jsonScenario('GET', '/api/video-jobs', {
        body: {
          jobs: [
            {
              jobId,
              operation: 'virtual-try-on',
              provider: 'decart',
              status: 'processing',
              createdAt: '2026-07-30T12:00:00.000Z',
              updatedAt: '2026-07-30T12:01:00.000Z',
              expiresAt: '2026-07-30T13:00:00.000Z',
              providerCancellationSupported: false,
            },
          ],
        },
      }),
      responseScenario('POST', `/api/video-jobs/${jobId}/abandon`, null, { status: 204 }),
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    await expect(listActiveVideoJobs()).resolves.toMatchObject({
      jobs: [{ jobId, status: 'processing', providerCancellationSupported: false }],
    });
    await abandonVideoJob(jobId);

    const abandonPath = `/api/video-jobs/${jobId}/abandon`;
    const abandonRequest = fetchSpy.mock.calls.find(([input]) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      return url.endsWith(abandonPath);
    })?.[1];
    expect(abandonRequest?.method).toBe('POST');
    expect(new Headers(abandonRequest?.headers).get('x-lightframe-provider-intent')).toBe('video');
    if (typeof abandonRequest?.body !== 'string') throw new Error('Expected a JSON request body.');
    expect(JSON.parse(abandonRequest.body) as unknown).toEqual({
      acknowledgeProviderMayContinue: true,
    });
  });

  it('cancels a chunked result as soon as its streamed bytes exceed the limit', async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue({ byteLength: 300_000_001 } as Uint8Array);
      },
      cancel,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(body, { headers: { 'content-type': 'video/mp4' } }),
    );

    await expect(
      downloadVideoJobResult(crypto.randomUUID(), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'result_too_large' });
    expect(pulls).toBeLessThanOrEqual(3);
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
});
