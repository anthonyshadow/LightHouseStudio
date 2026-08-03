import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { DecartHttpVideoJobProvider, DecartVideoProviderError } from './video-job-provider.js';

describe('DecartHttpVideoJobProvider', () => {
  it('pins the exact batch endpoint and fixed 720p provider payload', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-decart-provider-'));
    const videoPath = path.join(root, 'input.video');
    const referencePath = path.join(root, 'reference.image');
    await writeFile(videoPath, 'video');
    await writeFile(referencePath, 'reference');
    const fetchImplementation = vi.fn<typeof fetch>();
    fetchImplementation.mockResolvedValue(
      new Response(JSON.stringify({ job_id: 'provider-job', status: 'pending' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const provider = new DecartHttpVideoJobProvider(
      'server-secret',
      fetchImplementation,
      'https://provider.invalid',
    );

    await provider.submit({
      operation: 'virtual-try-on',
      recipe: {
        operation: 'virtual-try-on',
        inputKind: 'reference-image',
        prompt: 'Apply the jacket',
        enhancePrompt: false,
        hasReferenceImage: true,
      },
      videoPath,
      videoMimeType: 'video/quicktime',
      referenceImagePath: referencePath,
      referenceImageMimeType: 'image/webp',
      signal: new AbortController().signal,
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, init] = fetchImplementation.mock.calls[0]!;
    expect(url).toBe('https://provider.invalid/v1/jobs/lucy-vton-latest');
    expect(init?.headers).toEqual({ 'X-API-KEY': 'server-secret' });
    const form = init?.body;
    expect(form).toBeInstanceOf(FormData);
    if (!(form instanceof FormData)) throw new Error('Expected a provider multipart body.');
    expect(form.get('resolution')).toBe('720p');
    expect(form.get('enhance_prompt')).toBe('false');
    expect((form.get('data') as File).name).toBe('input.mov');
    expect((form.get('reference_image') as File).name).toBe('reference.webp');
  });

  it('does not retry an initial billable submission', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-decart-no-retry-'));
    const videoPath = path.join(root, 'input.video');
    await writeFile(videoPath, 'video');
    const fetchImplementation = vi.fn<typeof fetch>();
    fetchImplementation.mockResolvedValue(new Response('', { status: 503 }));
    const provider = new DecartHttpVideoJobProvider(
      'server-secret',
      fetchImplementation,
      'https://provider.invalid',
    );

    await expect(
      provider.submit({
        operation: 'character-swap',
        recipe: {
          operation: 'character-swap',
          prompt: 'Change the lighting',
          enhancePrompt: false,
          hasReferenceImage: false,
        },
        videoPath,
        videoMimeType: 'video/mp4',
        referenceImagePath: null,
        referenceImageMimeType: null,
        signal: new AbortController().signal,
      }),
    ).rejects.toBeInstanceOf(DecartVideoProviderError);
    expect(fetchImplementation).toHaveBeenCalledOnce();
    const [url, init] = fetchImplementation.mock.calls[0]!;
    expect(url).toBe('https://provider.invalid/v1/jobs/lucy-latest');
    const form = init?.body;
    expect(form).toBeInstanceOf(FormData);
    if (!(form instanceof FormData)) throw new Error('Expected a provider multipart body.');
    expect([...form.keys()]).toEqual(['data', 'prompt', 'resolution', 'enhance_prompt']);
    expect(form.get('prompt')).toBe('Change the lighting');
    expect(form.get('resolution')).toBe('720p');
    expect(form.get('enhance_prompt')).toBe('false');
  });
});
