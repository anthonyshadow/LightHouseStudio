// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  CreateReferenceImageRequest,
  EditReferenceImageRequest,
  OptimizeCharacterReferencePromptResponse,
  ReferenceImageAsset,
} from '@studio/contracts';
import {
  createReferenceImage,
  editReferenceImage,
  fetchProviderAvailability,
  hydrateReferenceImage,
  optimizeCharacterReferencePrompt,
} from './apiClient';

const jpegBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xdb, 0xff, 0xd9]);
const rawPrompt = 'Substitute the character in the video with an adult lunar cartographer.';
const options = {
  framing: 'head_and_shoulders',
  orientation: 'auto',
  renderingMode: 'photorealistic',
  expression: 'neutral',
  background: 'neutral_gray',
  targetUse: 'lucy_2_5_character_reference',
} as const;

const optimizationResult: OptimizeCharacterReferencePromptResponse['result'] = {
  optimizedImagePrompt:
    'A canonical single-character reference photograph of the adult lunar cartographer.',
  lucy25CharacterPrompt:
    'Replace the character in the video with the adult lunar cartographer. Preserve source motion, expression, pose, and camera framing.',
  normalizedCharacterDescription: 'An adult lunar cartographer.',
  preservedCharacterFacts: ['adult', 'lunar cartographer'],
  technicalDefaultsAdded: ['front-facing pose', 'neutral gray background'],
  warnings: [],
  recommendedSettings: {
    framing: 'head_and_shoulders',
    orientation: 'square',
    size: '1024x1024',
    quality: 'high',
    format: 'png',
  },
};

const asset: ReferenceImageAsset = {
  assetId: '550e8400-e29b-41d4-a716-446655440000',
  mimeType: 'image/jpeg',
  size: '1024x1024',
  width: 1024,
  height: 1024,
  byteSize: jpegBytes.byteLength,
  source: 'generated',
  provider: 'openai',
  model: 'gpt-image-2',
  quality: 'high',
  promptHash: 'a'.repeat(64),
  optimizationEnabled: true,
  originalPrompt: rawPrompt,
  optimizedImagePrompt: optimizationResult.optimizedImagePrompt,
  lucy25CharacterPrompt: optimizationResult.lucy25CharacterPrompt,
  normalizedCharacterDescription: optimizationResult.normalizedCharacterDescription,
  preservedCharacterFacts: optimizationResult.preservedCharacterFacts,
  technicalDefaultsAdded: optimizationResult.technicalDefaultsAdded,
  warnings: optimizationResult.warnings,
  options,
  requestedGenerator: null,
  optimizer: { model: 'gpt-5.6', version: 'lucy-character-reference-v1' },
  optimizationInputHash: 'b'.repeat(64),
  manuallyEdited: false,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
  contentUrl: '/api/reference-images/550e8400-e29b-41d4-a716-446655440000/content',
};
const optimizationResponse: OptimizeCharacterReferencePromptResponse = {
  result: optimizationResult,
  model: 'gpt-5.6',
  version: 'lucy-character-reference-v1',
  inputHash: 'b'.repeat(64),
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('reference image API client', () => {
  it('maps generator and optimizer capability metadata for the workshop', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            realtimeVideo: { available: true, models: ['lucy-2.5'] },
            elevenLabs: { available: false, modelId: null },
            referenceImages: {
              available: true,
              editAvailable: true,
              modelId: 'gpt-image-2',
              sizes: ['1024x1024', '1024x1536', '1536x1024'],
              quality: 'high',
              optimizer: {
                available: true,
                model: 'gpt-5.6',
                version: 'lucy-character-reference-v1',
              },
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(fetchProviderAvailability()).resolves.toMatchObject({
      referenceImages: true,
      referenceImageEditAvailable: true,
      referenceImageModel: 'gpt-image-2',
      referenceImageSizes: ['1024x1024', '1024x1536', '1536x1024'],
      referenceImageOptimizerAvailable: true,
      referenceImageOptimizerModel: 'gpt-5.6',
      referenceImageOptimizerVersion: 'lucy-character-reference-v1',
    });
  });

  it('validates the structured prompt-optimization response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(optimizationResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      optimizeCharacterReferencePrompt({ rawPrompt, options }, controller.signal),
    ).resolves.toEqual(optimizationResponse);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reference-images/optimize',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        signal: controller.signal,
        body: JSON.stringify({ rawPrompt, options }),
      }),
    );
  });

  it('sends one explicit idempotent generation request and validates safe metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ asset }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const request: CreateReferenceImageRequest = {
      requestId: 'c35bd56f-5d16-4d54-b719-8bfb49d73080',
      rawPrompt,
      options,
      optimization: {
        enabled: true,
        ...optimizationResponse,
        manuallyEdited: false,
      },
    };
    await expect(createReferenceImage(request)).resolves.toEqual(asset);

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reference-images',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        body: JSON.stringify(request),
      }),
    );
  });

  it('edits by opaque source asset ID without sending source image bytes', async () => {
    const editedAsset: ReferenceImageAsset = {
      ...asset,
      assetId: '7bf5e842-3cfe-4c5d-b945-a6ead02a3f01',
      derivation: { kind: 'edit', sourceAssetId: asset.assetId },
      contentUrl: '/api/reference-images/7bf5e842-3cfe-4c5d-b945-a6ead02a3f01/content',
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ asset: editedAsset }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const request: EditReferenceImageRequest = {
      requestId: 'cb6ab812-0ebd-455b-8fe1-3a3665daf158',
      rawPrompt,
      changeInstructions: 'Change only the coat to green.',
      options,
      optimization: {
        enabled: true,
        ...optimizationResponse,
        manuallyEdited: false,
      },
    };

    await expect(editReferenceImage(asset.assetId, request)).resolves.toEqual(editedAsset);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/reference-images/${asset.assetId}/edits`,
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        body: JSON.stringify(request),
      }),
    );
    expect(JSON.stringify(request)).not.toContain('sourceImage');
    expect(JSON.stringify(request)).not.toContain('base64');
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
