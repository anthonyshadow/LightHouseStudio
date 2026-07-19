// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReferenceImageAsset } from '@studio/contracts';
import { createReferenceImage, hydrateReferenceImage } from './apiClient';

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0xff, 0xd9]);

const asset: ReferenceImageAsset = {
  assetId: '550e8400-e29b-41d4-a716-446655440000',
  mimeType: 'image/jpeg',
  width: 1024,
  height: 1024,
  byteSize: jpegBytes.byteLength,
  source: 'generated',
  provider: 'openai',
  model: 'gpt-image-2',
  promptHash: 'a'.repeat(64),
  createdAt: '2026-07-18T12:00:00.000Z',
  contentUrl: '/api/reference-images/550e8400-e29b-41d4-a716-446655440000/content',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reference image API client', () => {
  it('sends one explicit idempotent generation request and validates safe metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ asset }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      createReferenceImage(
        'c35bd56f-5d16-4d54-b719-8bfb49d73080',
        'Substitute the character in the video with an adult lunar cartographer.',
      ),
    ).resolves.toEqual(asset);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reference-images',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        body: JSON.stringify({
          requestId: 'c35bd56f-5d16-4d54-b719-8bfb49d73080',
          workshopPrompt: 'Substitute the character in the video with an adult lunar cartographer.',
        }),
      }),
    );
  });

  it('hydrates a persisted reference from its stable URL and validates exact integrity', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(jpegBytes, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1024, height: 1024, close: vi.fn() }),
    );

    const reference = await hydrateReferenceImage(asset.assetId, asset);

    expect(reference).toMatchObject({
      kind: 'persisted',
      assetId: asset.assetId,
      contentUrl: asset.contentUrl,
      file: { name: `reference-${asset.assetId}.jpg`, type: 'image/jpeg', size: jpegBytes.length },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      asset.contentUrl,
      expect.objectContaining({ cache: 'no-store', headers: { Accept: 'image/jpeg' } }),
    );
  });

  it('rejects content that does not match immutable metadata', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(jpegBytes, {
          status: 200,
          headers: { 'Content-Type': 'image/png' },
        }),
      ),
    );

    await expect(hydrateReferenceImage(asset.assetId, asset)).rejects.toMatchObject({
      code: 'invalid_provider_image',
    });
  });

  it('never hydrates a content URL belonging to a different asset identity', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const otherAsset = 'b29ac560-3c9d-44d7-b927-48f412cb3aa5';

    await expect(
      hydrateReferenceImage(asset.assetId, {
        ...asset,
        contentUrl: `/api/reference-images/${otherAsset}/content`,
      }),
    ).rejects.toMatchObject({ code: 'invalid_provider_image' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
