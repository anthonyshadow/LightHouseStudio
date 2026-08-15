// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ComposeReferenceImageRequest,
  CreateReferenceImageRequest,
  EditReferenceImageRequest,
  OptimizeCharacterReferencePromptResponse,
  ReferenceImageAsset,
  UploadedReferenceImageAsset,
} from '@studio/contracts';
import {
  composeReferenceImage,
  createReferenceImage,
  discardReferenceImage,
  editReferenceImage,
  apiFetch,
  fetchProviderAvailability,
  hydrateReferenceImage,
  importRemoteReferenceImage,
  optimizeCharacterReferencePrompt,
  referenceImageContentUrl,
  requestRealtimeToken,
  uploadReferenceImage,
} from './apiClient';
import {
  authenticationExpiryScenario,
  captureRequests,
  jsonScenario,
  malformedContractScenario,
  providerAvailabilityScenario,
  responseScenario,
  serverConflictScenario,
  uploadFailureScenario,
} from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';

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
const uploadedAsset: UploadedReferenceImageAsset = {
  assetId: '033aa515-7ac4-4d7b-8222-ecff83757ca9',
  mimeType: 'image/png',
  byteSize: 4,
  source: 'uploaded',
  width: 800,
  height: 1200,
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
  contentUrl: '/api/reference-images/033aa515-7ac4-4d7b-8222-ecff83757ca9/content',
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('realtime API client', () => {
  it('suppresses auth-expiry events only for the exact login endpoint', async () => {
    mockApiServer.use(
      authenticationExpiryScenario('/api/auth/login'),
      authenticationExpiryScenario('/api/auth/login-history'),
    );
    const listener = vi.fn();
    window.addEventListener('lightframe:authentication-required', listener);
    try {
      await expect(apiFetch('/api/auth/login?return=/studio')).rejects.toMatchObject({
        status: 401,
      });
      expect(listener).not.toHaveBeenCalled();

      await expect(apiFetch('/api/auth/login-history')).rejects.toMatchObject({ status: 401 });
      expect(listener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener('lightframe:authentication-required', listener);
    }
  });

  it('preserves the app-owned active-session maximum from the validated token response', async () => {
    mockApiServer.use(
      jsonScenario('POST', '/api/realtime-token', {
        body: {
          apiKey: 'short-lived-browser-token',
          expiresAt: '2030-01-01T00:00:00.000Z',
          constraints: {
            model: 'lucy-latest',
            maxSessionDurationSeconds: 300,
          },
        },
      }),
    );

    await expect(
      requestRealtimeToken('lucy-latest', new AbortController().signal),
    ).resolves.toEqual({
      apiKey: 'short-lived-browser-token',
      expiresAt: '2030-01-01T00:00:00.000Z',
      maxSessionDurationSeconds: 300,
    });
  });

  it('rejects a missing or mismatched active-session constraint', async () => {
    mockApiServer.use(
      jsonScenario('POST', '/api/realtime-token', [
        {
          body: {
            apiKey: 'short-lived-browser-token',
            expiresAt: '2030-01-01T00:00:00.000Z',
          },
        },
        {
          body: {
            apiKey: 'short-lived-browser-token',
            expiresAt: '2030-01-01T00:00:00.000Z',
            constraints: {
              model: 'lucy-vton-latest',
              maxSessionDurationSeconds: 300,
            },
          },
        },
      ]),
    );

    await expect(
      requestRealtimeToken('lucy-latest', new AbortController().signal),
    ).rejects.toMatchObject({ code: 'bad-token', status: 502 });
    await expect(
      requestRealtimeToken('lucy-latest', new AbortController().signal),
    ).rejects.toMatchObject({ code: 'bad-token', status: 502 });
  });
});

describe('reference image API client', () => {
  it('preserves the canonical encoded content route export', () => {
    expect(referenceImageContentUrl('asset/with spaces')).toBe(
      '/api/reference-images/asset%2Fwith%20spaces/content',
    );
  });

  it('normalizes malformed JSON through the endpoint invalid-response contract', async () => {
    mockApiServer.use(malformedContractScenario('GET', '/api/capabilities'));

    await expect(fetchProviderAvailability()).rejects.toMatchObject({
      code: 'invalid-response',
      status: 502,
    });
  });

  it('preserves normalized server conflicts and abort rejections', async () => {
    mockApiServer.use(
      serverConflictScenario('GET', '/api/capabilities', 'conflict', 'Refresh capabilities.'),
    );
    await expect(fetchProviderAvailability()).rejects.toMatchObject({
      code: 'conflict',
      message: 'Refresh capabilities.',
      status: 409,
    });

    mockApiServer.use(jsonScenario('GET', '/api/capabilities', { kind: 'pending' }));
    const controller = new AbortController();
    const pending = fetchProviderAvailability(controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('maps generator and optimizer capability metadata for the workshop', async () => {
    mockApiServer.use(
      providerAvailabilityScenario({
        body: {
          realtimeVideo: { available: true, betaEnabled: true },
          videoProcessing: {
            characterSwap: {
              available: true,
              inputPreparation: 'h264-mp4',
              referencePolicy: 'required',
              promptInput: 'server-default',
              promptEnhancement: false,
              terminalFailureRelease: 'explicit-user',
              outputResolutions: ['720p', '1080p'],
            },
            virtualTryOn: {
              available: true,
              inputPreparation: 'none',
              referencePolicy: 'optional',
              promptInput: 'editable',
              promptEnhancement: true,
              terminalFailureRelease: 'automatic',
              outputResolutions: ['720p'],
            },
          },
          elevenLabs: { available: false, modelId: null },
          referenceImages: {
            available: true,
            editAvailable: true,
            providerId: 'openai',
            modelId: 'gpt-image-2',
            sizes: ['1024x1024', '1024x1536', '1536x1024'],
            optimizer: {
              available: true,
              model: 'gpt-5.6',
              version: 'lucy-character-reference-v1',
            },
          },
          wardrobe: { addOutfitAvailable: true },
          savedVideos: { directMultipartUpload: true },
        },
      }),
    );

    await expect(fetchProviderAvailability()).resolves.toMatchObject({
      videoProcessing: {
        characterSwap: {
          available: true,
          inputPreparation: 'h264-mp4',
          referencePolicy: 'required',
          promptInput: 'server-default',
          promptEnhancement: false,
          terminalFailureRelease: 'explicit-user',
          outputResolutions: ['720p', '1080p'],
        },
      },
      referenceImages: true,
      referenceImageEditAvailable: true,
      referenceImageProvider: 'openai',
      referenceImageModel: 'gpt-image-2',
      referenceImageSizes: ['1024x1024', '1024x1536', '1536x1024'],
      referenceImageOptimizerAvailable: true,
      referenceImageOptimizerModel: 'gpt-5.6',
      referenceImageOptimizerVersion: 'lucy-character-reference-v1',
      wardrobeAddOutfitAvailable: true,
      directSavedVideoUploadAvailable: true,
    });
  });

  it('validates the structured prompt-optimization response', async () => {
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'POST',
        '/api/reference-images/optimize',
        { body: optimizationResponse },
        observe,
      ),
    );
    const controller = new AbortController();

    await expect(
      optimizeCharacterReferencePrompt({ rawPrompt, options }, controller.signal),
    ).resolves.toEqual(optimizationResponse);

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'POST', cache: 'no-store' });
    await expect(requests[0]!.json()).resolves.toEqual({ rawPrompt, options });
  });

  it('sends one explicit idempotent generation request and validates safe metadata', async () => {
    const { requests, observe } = captureRequests();
    mockApiServer.use(jsonScenario('POST', '/api/reference-images', { body: { asset } }, observe));

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

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: 'POST', cache: 'no-store' });
    await expect(requests[0]!.json()).resolves.toEqual(request);
  });

  it('edits by opaque source asset ID without sending source image bytes', async () => {
    const editedAsset: ReferenceImageAsset = {
      ...asset,
      assetId: '7bf5e842-3cfe-4c5d-b945-a6ead02a3f01',
      derivation: { kind: 'edit', sourceAssetId: asset.assetId },
      contentUrl: '/api/reference-images/7bf5e842-3cfe-4c5d-b945-a6ead02a3f01/content',
    };
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'POST',
        `/api/reference-images/${asset.assetId}/edits`,
        { body: { asset: editedAsset } },
        observe,
      ),
    );
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
    expect(requests[0]).toMatchObject({ method: 'POST', cache: 'no-store' });
    await expect(requests[0]!.json()).resolves.toEqual(request);
    expect(JSON.stringify(request)).not.toContain('sourceImage');
    expect(JSON.stringify(request)).not.toContain('base64');
  });

  it('uploads immutable source bytes with stable idempotency and normalizes upload failures', async () => {
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'POST',
        '/api/reference-images/uploads',
        { body: { asset: uploadedAsset }, status: 201 },
        observe,
      ),
    );
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'portrait.png', {
      type: 'image/png',
      lastModified: 1,
    });
    const requestId = '96701f87-aeb6-41b6-ab76-2cbe3275714e';

    await expect(uploadReferenceImage(file, requestId)).resolves.toEqual(uploadedAsset);
    expect(requests).toHaveLength(1);
    expect(requests[0]!.method).toBe('POST');
    expect(requests[0]!.headers.get('Content-Type')).toBe('image/png');
    expect(requests[0]!.headers.get('Idempotency-Key')).toBe(requestId);
    await expect(requests[0]!.arrayBuffer()).resolves.toEqual(new Uint8Array([1, 2, 3, 4]).buffer);

    mockApiServer.use(uploadFailureScenario('/api/reference-images/uploads'));
    await expect(uploadReferenceImage(file, requestId)).rejects.toMatchObject({
      code: 'invalid_image_upload',
      status: 503,
    });
  });

  it('discards an unsaved reference through the owner-scoped lifecycle endpoint', async () => {
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      responseScenario(
        'DELETE',
        `/api/reference-images/${uploadedAsset.assetId}`,
        null,
        { status: 204 },
        observe,
      ),
    );

    await expect(discardReferenceImage(uploadedAsset.assetId)).resolves.toBeUndefined();
    expect(requests[0]).toMatchObject({ method: 'DELETE', cache: 'no-store' });
    expect(requests[0]?.headers.get('Content-Type')).toBe('application/json');
    await expect(requests[0]?.text()).resolves.toBe('{}');
  });

  it('imports a remote image through the explicit same-origin reference-import endpoint', async () => {
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      responseScenario(
        'POST',
        '/api/reference-images/import',
        jpegBytes,
        {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Disposition': 'attachment; filename="imported-reference-ab12cd34.jpg"',
          },
        },
        observe,
      ),
    );
    const controller = new AbortController();
    const sourceUrl = 'https://images.example.test/outfit.jpg';

    const imported = await importRemoteReferenceImage(sourceUrl, controller.signal);

    expect(imported.name).toBe('imported-reference-ab12cd34.jpg');
    expect(imported.type).toBe('image/jpeg');
    expect(requests[0]).toMatchObject({ method: 'POST', cache: 'no-store' });
    await expect(requests[0]!.json()).resolves.toEqual({ url: sourceUrl });
    expect(requests[0]!.headers.get('x-lightframe-provider-intent')).toBe('reference-image-import');
  });

  it('composes a generated asset from an opaque uploaded source identity', async () => {
    const composedAsset: ReferenceImageAsset = {
      ...asset,
      assetId: '48ea3acf-9ef5-4237-bcc7-961d81842569',
      derivation: { kind: 'compose', sourceAssetId: uploadedAsset.assetId },
      contentUrl: '/api/reference-images/48ea3acf-9ef5-4237-bcc7-961d81842569/content',
    };
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'POST',
        `/api/reference-images/${uploadedAsset.assetId}/compositions`,
        { body: { asset: composedAsset } },
        observe,
      ),
    );
    const request: ComposeReferenceImageRequest = {
      requestId: 'caa39308-f797-4542-84bc-9a14f99afdcf',
      rawPrompt,
      options,
      optimization: {
        enabled: true,
        ...optimizationResponse,
        manuallyEdited: false,
      },
    };

    await expect(composeReferenceImage(uploadedAsset.assetId, request)).resolves.toEqual(
      composedAsset,
    );
    expect(requests[0]!.method).toBe('POST');
    await expect(requests[0]!.json()).resolves.toEqual(request);
    expect(JSON.stringify(request)).not.toContain('sourceImage');
  });

  it('hydrates a persisted reference from its stable URL and validates exact integrity', async () => {
    const { requests, observe } = captureRequests();
    mockApiServer.use(
      responseScenario(
        'GET',
        asset.contentUrl,
        jpegBytes,
        {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        },
        observe,
      ),
    );
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockResolvedValue({ width: 1024, height: 1024, close: vi.fn() }),
    );

    const reference = await hydrateReferenceImage(asset.assetId, asset);

    expect(reference).toMatchObject({
      kind: 'persisted',
      assetId: asset.assetId,
      contentUrl: asset.contentUrl,
    });
    expect(reference.file.name).toBe(`reference-${asset.assetId}.jpg`);
    expect(reference.file.type).toBe('image/jpeg');
    expect(reference.file.size).toBe(jpegBytes.length);
    expect(requests[0]!.cache).toBe('no-store');
    expect(requests[0]!.headers.get('Accept')).toBe('image/jpeg');
  });

  it('rejects content that does not match immutable metadata', async () => {
    mockApiServer.use(
      responseScenario('GET', asset.contentUrl, jpegBytes, {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      }),
    );

    await expect(hydrateReferenceImage(asset.assetId, asset)).rejects.toMatchObject({
      code: 'invalid_provider_image',
    });
  });

  it('never hydrates a content URL belonging to a different asset identity', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
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
