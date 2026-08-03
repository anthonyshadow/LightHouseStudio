// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadVideoJobResult, submitVideoJob } from './videoJobsApi';

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

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('videoJobsApi', () => {
  it('uses fixed multipart order, synthetic filenames, and explicit provider intent', async () => {
    const jobId = crypto.randomUUID();
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(status(jobId)), { status: 202 }));
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

    const request = fetchMock.mock.calls[0]![1]!;
    const form = request.body as FormData;
    const entries = [...form.entries()];
    expect(entries.map(([name]) => name)).toEqual(['request', 'data', 'reference_image']);
    expect((entries[1]![1] as File).name).toBe('input.mp4');
    expect((entries[2]![1] as File).name).toBe('reference.png');
    expect(JSON.stringify(entries)).not.toContain(privateName);
    expect(request.headers).toMatchObject({ 'x-lightframe-provider-intent': 'video' });
  });

  it('rejects a declared oversized result before buffering it', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('not-read', {
        headers: { 'content-length': '300000001', 'content-type': 'video/mp4' },
      }),
    );

    await expect(
      downloadVideoJobResult(crypto.randomUUID(), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'result_too_large' });
  });
});
