import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../../app.js';
import type { ReferenceImageProvider } from '../../providers/openai/reference-image-provider.js';
import { ReferenceImageProviderError } from '../../providers/openai/reference-image-provider.js';
import { testConfig } from '../../test/fakes.js';
import { LocalReferenceImageAssetStore } from './asset-store.js';

const localHeaders = { origin: 'http://localhost:5173', host: 'localhost:5173' };
const requestId = '37d15fec-43a3-47b2-8330-7fb410698564';
const secondRequestId = '5f43d16c-81b7-445a-a70e-35a64a597086';

const createImage = async (): Promise<Buffer> =>
  sharp({
    create: { width: 1024, height: 1024, channels: 3, background: '#8f6c52' },
  })
    .jpeg({ quality: 90 })
    .toBuffer();

describe('reference image API', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  const directories: string[] = [];
  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
    await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
  });

  const setup = async (provider: ReferenceImageProvider | null) => {
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-reference-api-'));
    directories.push(directory);
    const app = createApp({
      config: testConfig({ lightframeDataDir: directory }),
      referenceImageProvider: provider,
      referenceImageAssetStore: new LocalReferenceImageAssetStore(directory),
    });
    apps.push(app);
    return app;
  };

  it('generates, validates, stores, and serves only safe owner-scoped asset data', async () => {
    const image = await createImage();
    const prompts: string[] = [];
    const provider: ReferenceImageProvider = {
      generate: vi.fn((prompt: string) => {
        prompts.push(prompt);
        return Promise.resolve({
          base64: image.toString('base64'),
          providerRequestId: 'provider-request-id',
        });
      }),
    };
    const app = await setup(provider);

    const generated = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: {
        requestId,
        workshopPrompt: 'Substitute the character in the video with a moss-covered guardian.',
      },
    });

    expect(generated.statusCode).toBe(200);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain('Exactly one character with one clearly visible face');
    expect(prompts[0]).toContain('moss-covered guardian');
    expect(generated.body).not.toContain('moss-covered');
    expect(generated.body).not.toContain('provider-request-id');
    expect(generated.body).not.toContain('storageKey');
    expect(generated.body).not.toContain('base64');
    const asset = generated.json().asset as { assetId: string; contentUrl: string };

    const metadata = await app.inject({
      method: 'GET',
      url: `/api/reference-images/${asset.assetId}`,
      headers: { host: 'localhost:5173' },
    });
    const content = await app.inject({
      method: 'GET',
      url: asset.contentUrl,
      headers: { host: 'localhost:5173' },
    });
    const otherOwner = await app.inject({
      method: 'GET',
      url: `/api/reference-images/${asset.assetId}`,
      headers: { host: '127.0.0.1:5173' },
    });

    expect(metadata.statusCode).toBe(200);
    expect(metadata.json()).toMatchObject({
      assetId: asset.assetId,
      mimeType: 'image/jpeg',
      width: 1024,
      height: 1024,
      model: 'gpt-image-2',
      contentUrl: asset.contentUrl,
    });
    expect(content.statusCode).toBe(200);
    expect(content.headers['content-type']).toContain('image/jpeg');
    expect(content.rawPayload).toEqual(image);
    expect(otherOwner.statusCode).toBe(404);
  });

  it('persistently replays the same request ID without a second billable provider call', async () => {
    const image = await createImage();
    const generate = vi.fn(() => Promise.resolve({ base64: image.toString('base64') }));
    const app = await setup({ generate });
    const input = {
      method: 'POST' as const,
      url: '/api/reference-images',
      headers: localHeaders,
      payload: { requestId, workshopPrompt: 'A clockwork character' },
    };

    const first = await app.inject(input);
    const replay = await app.inject({
      ...input,
      payload: { requestId, workshopPrompt: 'A different prompt cannot change this request' },
    });

    expect(replay.json()).toEqual(first.json());
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('coalesces a duplicate in flight and rejects a different generation until it finishes', async () => {
    const image = await createImage();
    let finish: ((payload: { readonly base64: string }) => void) | undefined;
    const generate = vi.fn(
      () =>
        new Promise<{ readonly base64: string }>((resolve) => {
          finish = resolve;
        }),
    );
    const app = await setup({ generate });
    const first = app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: { requestId, workshopPrompt: 'A coral explorer' },
    });
    await vi.waitFor(() => expect(generate).toHaveBeenCalledTimes(1));
    const duplicate = app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: { requestId, workshopPrompt: 'A coral explorer' },
    });
    const different = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: { requestId: secondRequestId, workshopPrompt: 'A silver explorer' },
    });

    expect(different.statusCode).toBe(409);
    expect(different.json().error.code).toBe('generation_in_progress');
    finish?.({ base64: image.toString('base64') });
    expect((await first).statusCode).toBe(200);
    expect((await duplicate).statusCode).toBe(200);
    expect(generate).toHaveBeenCalledTimes(1);
  });

  it('releases the generation slot after a structured provider failure', async () => {
    const image = await createImage();
    const generate = vi
      .fn<ReferenceImageProvider['generate']>()
      .mockRejectedValueOnce(new ReferenceImageProviderError('failure', { upstreamStatus: 502 }))
      .mockResolvedValueOnce({ base64: image.toString('base64') });
    const app = await setup({ generate });

    const failed = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: { requestId, workshopPrompt: 'A coral explorer' },
    });
    const retry = await app.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: { requestId: secondRequestId, workshopPrompt: 'A silver explorer' },
    });

    expect(failed.statusCode).toBe(502);
    expect(failed.json().error).toMatchObject({
      code: 'provider_failure',
      upstreamStatus: 502,
    });
    expect(retry.statusCode).toBe(200);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('requires exact loopback origin and reports configuration and moderation failures safely', async () => {
    const unconfigured = await setup(null);
    const noOrigin = await unconfigured.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: { host: 'localhost:5173' },
      payload: { requestId, workshopPrompt: 'A character' },
    });
    const notConfigured = await unconfigured.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: { requestId, workshopPrompt: 'A character' },
    });
    const moderated = await setup({
      generate: () => Promise.reject(new ReferenceImageProviderError('moderation')),
    });
    const blocked = await moderated.inject({
      method: 'POST',
      url: '/api/reference-images',
      headers: localHeaders,
      payload: { requestId: secondRequestId, workshopPrompt: 'A character' },
    });

    expect(noOrigin.statusCode).toBe(403);
    expect(notConfigured.statusCode).toBe(503);
    expect(notConfigured.json().error.code).toBe('provider_configuration');
    expect(blocked.statusCode).toBe(400);
    expect(blocked.json().error.code).toBe('moderation_blocked');
  });
});
