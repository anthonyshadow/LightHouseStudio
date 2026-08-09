import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARACTER_MODEL_ID,
  PAGE_SIZE_LIMIT,
  VOICE_CONVERSION_MAX_BYTES,
  VOICE_CONVERSION_OUTPUT_MAX_BYTES,
  VOICE_PREVIEW_MAX_BYTES,
  VOICE_PROVIDER_INTENT_HEADER,
  VOICE_PROVIDER_INTENT_VALUE,
  apiErrorResponseSchema,
  capabilitiesResponseSchema,
  characterPromptOptimizationResultSchema,
  completeDirectSavedVideoUploadRequestSchema,
  composeReferenceImageRequestSchema,
  createDirectSavedVideoUploadRequestSchema,
  createReferenceImageRequestSchema,
  editReferenceImageRequestSchema,
  healthResponseSchema,
  optimizeCharacterReferencePromptRequestSchema,
  optimizeCharacterReferencePromptResponseSchema,
  realtimeTokenRequestSchema,
  realtimeTokenResponseSchema,
  sharedVoicesQuerySchema,
  sharedVoicesResponseSchema,
  savedVideoUploadMetadataSchema,
  directSavedVideoUploadPartParamsSchema,
  remoteReferenceImageImportRequestSchema,
  referenceImageAssetSchema,
  uploadReferenceImageResponseSchema,
  videoTransformRecipeSchema,
  supportedModelIdSchema,
  voiceChangerQuerySchema,
  voiceConversionContentTypeSchema,
  workspaceVoicesQuerySchema,
  workspaceVoicesResponseSchema,
} from './index';

const voice = {
  voiceId: 'voice-1',
  name: 'Clear Narrator',
  category: 'generated',
  description: null,
  labels: { accent: 'neutral' },
  traits: {
    language: 'en',
    gender: 'neutral',
    age: 'middle-aged',
    accent: 'neutral',
    useCase: 'narration',
    descriptive: 'clear',
  },
  previewAvailable: true,
  removable: true,
};

describe('health and capabilities contracts', () => {
  it('accepts only the exact health response', () => {
    expect(healthResponseSchema.parse({ ok: true })).toEqual({ ok: true });
    expect(healthResponseSchema.safeParse({ ok: true, secret: 'no' }).success).toBe(false);
  });

  it('normalizes provider availability without exposing credentials', () => {
    expect(
      capabilitiesResponseSchema.parse({
        realtimeVideo: { available: true },
        videoProcessing: {
          characterSwap: {
            available: true,
            inputPreparation: 'h264-mp4',
            referencePolicy: 'required',
            promptInput: 'server-default',
            promptEnhancement: false,
            terminalFailureRelease: 'explicit-user',
            outputResolutions: ['720p', '1080p'],
            defaultProvider: 'pruna',
            providers: [
              {
                providerId: 'pruna',
                inputPreparation: 'h264-mp4',
                referencePolicy: 'required',
                promptInput: 'server-default',
                promptEnhancement: false,
                terminalFailureRelease: 'explicit-user',
                outputResolutions: ['720p', '1080p'],
              },
            ],
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
      }),
    ).toEqual({
      realtimeVideo: { available: true },
      videoProcessing: {
        characterSwap: {
          available: true,
          inputPreparation: 'h264-mp4',
          referencePolicy: 'required',
          promptInput: 'server-default',
          promptEnhancement: false,
          terminalFailureRelease: 'explicit-user',
          outputResolutions: ['720p', '1080p'],
          defaultProvider: 'pruna',
          providers: [
            {
              providerId: 'pruna',
              inputPreparation: 'h264-mp4',
              referencePolicy: 'required',
              promptInput: 'server-default',
              promptEnhancement: false,
              terminalFailureRelease: 'explicit-user',
              outputResolutions: ['720p', '1080p'],
            },
          ],
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
    });
    expect(
      capabilitiesResponseSchema.safeParse({
        realtimeVideo: { available: true },
        videoProcessing: { available: false, models: [] },
        elevenLabs: { available: false, modelId: null },
        referenceImages: {
          available: false,
          editAvailable: false,
          providerId: 'openai',
          modelId: 'gpt-image-2',
          sizes: ['1024x1024', '1024x1536', '1536x1024'],
          optimizer: {
            available: false,
            model: 'gpt-5.6',
            version: 'lucy-character-reference-v1',
          },
        },
        wardrobe: { addOutfitAvailable: false },
        savedVideos: { directMultipartUpload: false },
      }).success,
    ).toBe(false);
  });
});

describe('saved video attribution contracts', () => {
  const metadata = {
    title: 'Character take',
    origin: 'character-swap' as const,
    filename: 'character-take.mp4',
    sourceVideoId: null,
    sourceVersionId: null,
  };

  it('stores the parent character separately from an optional display-only variant', () => {
    expect(
      savedVideoUploadMetadataSchema.parse({
        ...metadata,
        characterName: 'Mara',
        characterVariantName: 'Evening',
      }),
    ).toMatchObject({ characterName: 'Mara', characterVariantName: 'Evening' });
    expect(
      savedVideoUploadMetadataSchema.safeParse({
        ...metadata,
        characterName: null,
        characterVariantName: 'Evening',
      }).success,
    ).toBe(false);
  });

  it('keeps direct multipart authority opaque and bounded', () => {
    const idempotencyKey = '2efcc6c3-e82c-419a-8807-c0026170fb75';
    const upload = {
      idempotencyKey,
      mimeType: 'video/mp4' as const,
      sizeBytes: 8 * 1_024 * 1_024,
      metadata: {
        ...metadata,
        characterName: 'Mara',
        characterVariantName: null,
      },
      target: { kind: 'new' as const },
    };

    expect(createDirectSavedVideoUploadRequestSchema.safeParse(upload).success).toBe(true);
    expect(
      createDirectSavedVideoUploadRequestSchema.safeParse({
        ...upload,
        bucket: 'private-assets',
        key: 'media/untrusted',
      }).success,
    ).toBe(false);
    expect(
      directSavedVideoUploadPartParamsSchema.safeParse({
        uploadId: idempotencyKey,
        partNumber: '10001',
      }).success,
    ).toBe(false);
    expect(
      completeDirectSavedVideoUploadRequestSchema.safeParse({
        parts: [{ PartNumber: 1, ETag: '"part-1"', url: 'https://example.test' }],
      }).success,
    ).toBe(false);
  });
});

describe('existing-video input contracts', () => {
  it('accepts only supported output resolution choices', () => {
    const recipe = {
      operation: 'character-swap' as const,
      inputKind: 'character' as const,
      prompt: 'Use this character direction',
      enhancePrompt: false,
      hasReferenceImage: false,
    };

    expect(
      videoTransformRecipeSchema.safeParse({ ...recipe, outputResolution: '1080p' }).success,
    ).toBe(true);
    expect(
      videoTransformRecipeSchema.safeParse({ ...recipe, outputResolution: '4k' }).success,
    ).toBe(false);
  });

  it('accepts an explicit Character Swap provider and rejects provider choice for VTO', () => {
    const base = {
      prompt: 'Use this direction',
      enhancePrompt: false,
      hasReferenceImage: false,
    };
    expect(
      videoTransformRecipeSchema.safeParse({
        ...base,
        operation: 'character-swap',
        inputKind: 'character',
        provider: 'pruna',
      }).success,
    ).toBe(true);
    expect(
      videoTransformRecipeSchema.safeParse({
        ...base,
        operation: 'virtual-try-on',
        inputKind: 'prompt',
        provider: 'pruna',
      }).success,
    ).toBe(false);
  });

  it('requires one explicit VTO input mode and rejects incompatible fields', () => {
    const base = {
      operation: 'virtual-try-on' as const,
      prompt: '',
      enhancePrompt: false,
      hasReferenceImage: true,
    };
    expect(
      videoTransformRecipeSchema.safeParse({ ...base, inputKind: 'reference-image' }).success,
    ).toBe(true);
    expect(videoTransformRecipeSchema.safeParse(base).success).toBe(false);
    expect(
      videoTransformRecipeSchema.safeParse({
        ...base,
        inputKind: 'reference-image',
        prompt: 'incompatible prompt',
      }).success,
    ).toBe(false);
    expect(
      videoTransformRecipeSchema.safeParse({
        ...base,
        inputKind: 'prompt',
        prompt: 'A blue jacket',
      }).success,
    ).toBe(false);
  });

  it('accepts only public-shaped HTTPS remote image import requests', () => {
    expect(
      remoteReferenceImageImportRequestSchema.safeParse({
        url: 'https://images.example.test/outfit.webp',
      }).success,
    ).toBe(true);
    expect(
      remoteReferenceImageImportRequestSchema.safeParse({
        url: 'http://images.example.test/outfit.webp',
      }).success,
    ).toBe(false);
    expect(
      remoteReferenceImageImportRequestSchema.safeParse({
        url: 'https://user:password@images.example.test/outfit.webp',
      }).success,
    ).toBe(false);
  });
});

describe('reference image contracts', () => {
  const options = {
    framing: 'head_and_shoulders',
    orientation: 'square',
    renderingMode: 'photorealistic',
    expression: 'neutral',
    background: 'neutral_gray',
    targetUse: 'lucy_2_5_character_reference',
  } as const;
  const result = {
    optimizedImagePrompt: '  Canonical ceramic astronaut reference.\n',
    lucy25CharacterPrompt:
      'Replace the character in the video with the ceramic astronaut. Preserve motion naturally.',
    normalizedCharacterDescription: 'A ceramic astronaut.',
    preservedCharacterFacts: ['ceramic astronaut'],
    technicalDefaultsAdded: ['soft diffuse lighting'],
    warnings: [],
    recommendedSettings: {
      framing: 'head_and_shoulders',
      orientation: 'square',
      size: '1024x1024',
      quality: 'high',
      format: 'jpeg',
    },
  } as const;

  it('trims raw input, validates strict options, and rejects empty or invalid custom input', () => {
    expect(
      optimizeCharacterReferencePromptRequestSchema.parse({
        rawPrompt: '  A ceramic astronaut  ',
        options,
      }),
    ).toEqual({ rawPrompt: 'A ceramic astronaut', options });
    expect(
      optimizeCharacterReferencePromptRequestSchema.safeParse({ rawPrompt: '   ', options })
        .success,
    ).toBe(false);
    expect(
      optimizeCharacterReferencePromptRequestSchema.safeParse({
        rawPrompt: 'Astronaut',
        options: { ...options, background: 'plain_custom' },
      }).success,
    ).toBe(false);
    expect(
      optimizeCharacterReferencePromptRequestSchema.safeParse({
        rawPrompt: 'Astronaut',
        options: { ...options, framing: 'close_up' },
      }).success,
    ).toBe(false);
  });

  it('accepts the strict optimizer result and rejects a missing or blank image prompt', () => {
    expect(characterPromptOptimizationResultSchema.parse(result)).toEqual(result);
    expect(
      characterPromptOptimizationResultSchema.safeParse({
        ...result,
        optimizedImagePrompt: undefined,
      }).success,
    ).toBe(false);
    expect(
      characterPromptOptimizationResultSchema.safeParse({
        ...result,
        optimizedImagePrompt: '   ',
      }).success,
    ).toBe(false);
    expect(
      optimizeCharacterReferencePromptResponseSchema.parse({
        result,
        model: 'gpt-5.6',
        version: 'lucy-character-reference-v1',
        inputHash: 'b'.repeat(64),
      }).result.optimizedImagePrompt,
    ).toBe(result.optimizedImagePrompt);
  });

  it('requires an explicit optimization branch and preserves manual optimized prompt whitespace', () => {
    const enabled = createReferenceImageRequestSchema.parse({
      requestId: 'ffaf7176-b3f4-4506-9312-7a00d9dd6295',
      rawPrompt: '  A ceramic astronaut  ',
      options,
      optimization: {
        enabled: true,
        result,
        model: 'gpt-5.6',
        version: 'lucy-character-reference-v1',
        inputHash: 'b'.repeat(64),
        manuallyEdited: true,
      },
    });
    expect(enabled.rawPrompt).toBe('A ceramic astronaut');
    expect(enabled.optimization.enabled && enabled.optimization.result.optimizedImagePrompt).toBe(
      result.optimizedImagePrompt,
    );
    expect(
      createReferenceImageRequestSchema.parse({
        requestId: 'ffaf7176-b3f4-4506-9312-7a00d9dd6295',
        rawPrompt: 'Astronaut',
        options,
        optimization: { enabled: false },
      }).optimization,
    ).toEqual({ enabled: false });
    expect(
      createReferenceImageRequestSchema.safeParse({
        requestId: 'ffaf7176-b3f4-4506-9312-7a00d9dd6295',
        rawPrompt: 'Astronaut',
        options,
      }).success,
    ).toBe(false);
  });

  it('requires nonempty, bounded edit instructions and accepts the explicit fallback branch', () => {
    const request = {
      requestId: 'cb6ab812-0ebd-455b-8fe1-3a3665daf158',
      rawPrompt: 'A ceramic astronaut',
      changeInstructions: '  Make the visor amber.  ',
      options,
      optimization: {
        enabled: true as const,
        result,
        model: 'gpt-5.6',
        version: 'lucy-character-reference-v1',
        inputHash: 'b'.repeat(64),
        manuallyEdited: false,
      },
    };

    expect(editReferenceImageRequestSchema.parse(request).changeInstructions).toBe(
      'Make the visor amber.',
    );
    expect(
      editReferenceImageRequestSchema.safeParse({ ...request, changeInstructions: '   ' }).success,
    ).toBe(false);
    expect(
      editReferenceImageRequestSchema.parse({
        ...request,
        optimization: { enabled: false },
      }).optimization,
    ).toEqual({ enabled: false });
    expect(
      editReferenceImageRequestSchema.safeParse({ ...request, sourceImageBytes: 'private' })
        .success,
    ).toBe(false);
  });

  it('accepts image-only edits without a character prompt and rejects prompt leakage', () => {
    const request = {
      requestId: 'cb6ab812-0ebd-455b-8fe1-3a3665daf158',
      sourcePromptMode: 'image-only' as const,
      changeInstructions: 'Make the expression warmer.',
      options,
      optimization: { enabled: false as const },
    };

    expect(editReferenceImageRequestSchema.parse(request)).toEqual(request);
    expect(
      editReferenceImageRequestSchema.safeParse({
        ...request,
        rawPrompt: 'The parent character prompt must not be sent.',
      }).success,
    ).toBe(false);
  });

  it('accepts explicit drastic-change intent while default-compatible requests omit it', () => {
    const request = {
      requestId: 'cb6ab812-0ebd-455b-8fe1-3a3665daf158',
      sourcePromptMode: 'image-only' as const,
      allowDrasticChanges: true,
      changeInstructions: 'Replace the person with a crystalline alien.',
      options,
      optimization: { enabled: false as const },
    };

    expect(editReferenceImageRequestSchema.parse(request)).toEqual(request);
    expect(
      editReferenceImageRequestSchema.safeParse({ ...request, allowDrasticChanges: 'yes' }).success,
    ).toBe(false);
  });

  it('accepts optimized and explicit raw-fallback source-image composition', () => {
    const request = {
      requestId: 'cb6ab812-0ebd-455b-8fe1-3a3665daf158',
      rawPrompt: 'A ceramic astronaut',
      options,
      optimization: {
        enabled: true as const,
        result,
        model: 'gpt-5.6',
        version: 'lucy-character-reference-v1',
        inputHash: 'b'.repeat(64),
        manuallyEdited: false,
      },
    };

    expect(composeReferenceImageRequestSchema.parse(request)).toEqual(request);
    expect(
      composeReferenceImageRequestSchema.parse({
        ...request,
        optimization: { enabled: false },
      }).optimization,
    ).toEqual({ enabled: false });
    expect(
      composeReferenceImageRequestSchema.safeParse({ ...request, sourceImageBytes: 'private' })
        .success,
    ).toBe(false);
  });

  it('exposes owner-scoped prompt audit metadata but rejects internal storage/provider payloads', () => {
    const metadata = {
      assetId: '28d0b01f-70aa-4db6-ac65-379cdd916113',
      mimeType: 'image/jpeg',
      size: '1024x1024',
      width: 1024,
      height: 1024,
      byteSize: 123_456,
      source: 'generated',
      provider: 'openai',
      model: 'gpt-image-2',
      quality: 'high',
      promptHash: 'a'.repeat(64),
      optimizationEnabled: true,
      originalPrompt: 'A ceramic astronaut',
      optimizedImagePrompt: result.optimizedImagePrompt,
      lucy25CharacterPrompt: result.lucy25CharacterPrompt,
      normalizedCharacterDescription: result.normalizedCharacterDescription,
      preservedCharacterFacts: [...result.preservedCharacterFacts],
      technicalDefaultsAdded: [...result.technicalDefaultsAdded],
      warnings: [...result.warnings],
      options,
      requestedGenerator: null,
      optimizer: { model: 'gpt-5.6', version: 'lucy-character-reference-v1' },
      optimizationInputHash: 'b'.repeat(64),
      manuallyEdited: false,
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
      contentUrl: '/api/reference-images/28d0b01f-70aa-4db6-ac65-379cdd916113/content',
    };

    expect(referenceImageAssetSchema.parse(metadata)).toEqual(metadata);
    expect(
      referenceImageAssetSchema.parse({
        ...metadata,
        provider: 'bfl',
        model: 'flux-2-pro',
      }),
    ).toMatchObject({ provider: 'bfl', model: 'flux-2-pro' });
    expect(
      referenceImageAssetSchema.parse({
        ...metadata,
        provider: 'wiro',
        model: 'seedream-v5-lite-uncensored',
      }),
    ).toMatchObject({ provider: 'wiro', model: 'seedream-v5-lite-uncensored' });
    expect(
      referenceImageAssetSchema.parse({
        ...metadata,
        derivation: {
          kind: 'edit',
          sourceAssetId: '7bf5e842-3cfe-4c5d-b945-a6ead02a3f01',
        },
      }).derivation,
    ).toEqual({
      kind: 'edit',
      sourceAssetId: '7bf5e842-3cfe-4c5d-b945-a6ead02a3f01',
    });
    expect(
      referenceImageAssetSchema.safeParse({ ...metadata, storageKey: 'private/image.jpg' }).success,
    ).toBe(false);
    expect(
      referenceImageAssetSchema.safeParse({ ...metadata, providerRequestId: 'private-request' })
        .success,
    ).toBe(false);
    expect(
      referenceImageAssetSchema.safeParse({
        ...metadata,
        providerSettings: { safetyTolerance: 4 },
      }).success,
    ).toBe(false);
    expect(
      referenceImageAssetSchema.safeParse({
        ...metadata,
        size: '1024x1536',
        width: 1536,
        height: 1536,
      }).success,
    ).toBe(false);

    const uploaded = {
      assetId: '7bf5e842-3cfe-4c5d-b945-a6ead02a3f01',
      mimeType: 'image/webp',
      byteSize: 456_789,
      source: 'uploaded',
      width: 2000,
      height: 3000,
      createdAt: '2026-07-18T12:00:00.000Z',
      updatedAt: '2026-07-18T12:00:00.000Z',
      contentUrl: '/api/reference-images/7bf5e842-3cfe-4c5d-b945-a6ead02a3f01/content',
    } as const;
    expect(referenceImageAssetSchema.parse(uploaded)).toEqual(uploaded);
    expect(uploadReferenceImageResponseSchema.parse({ asset: uploaded }).asset.source).toBe(
      'uploaded',
    );
    expect(referenceImageAssetSchema.safeParse({ ...uploaded, provider: 'openai' }).success).toBe(
      false,
    );
    expect(
      referenceImageAssetSchema.safeParse({ ...uploaded, width: 8000, height: 6000 }).success,
    ).toBe(false);
  });
});

describe('realtime credential contracts', () => {
  it('supports exactly Character 2.5 and VTON 3', () => {
    expect(DEFAULT_CHARACTER_MODEL_ID).toBe('lucy-latest');
    expect(supportedModelIdSchema.parse('lucy-latest')).toBe('lucy-latest');
    expect(supportedModelIdSchema.parse('lucy-vton-latest')).toBe('lucy-vton-latest');
    expect(supportedModelIdSchema.safeParse('lucy-2.1').success).toBe(false);
    expect(supportedModelIdSchema.safeParse('local').success).toBe(false);
  });

  it('defaults an omitted body or model to Character and rejects unknown fields', () => {
    expect(realtimeTokenRequestSchema.parse(undefined)).toEqual({ model: 'lucy-latest' });
    expect(realtimeTokenRequestSchema.parse({})).toEqual({ model: 'lucy-latest' });
    expect(
      realtimeTokenRequestSchema.safeParse({ model: 'lucy-latest', apiKey: 'bad' }).success,
    ).toBe(false);
    expect(
      realtimeTokenRequestSchema.safeParse({ model: 'lucy-latest', sessionProfile: 'guided' })
        .success,
    ).toBe(false);
  });

  it('requires a nonempty temporary key and ISO expiry', () => {
    expect(
      realtimeTokenResponseSchema.parse({
        apiKey: 'temporary-only',
        expiresAt: '2026-07-14T12:05:00.000Z',
        constraints: { model: 'lucy-latest', maxSessionDurationSeconds: 300 },
      }),
    ).toMatchObject({ apiKey: 'temporary-only' });
    expect(realtimeTokenResponseSchema.safeParse({ apiKey: '', expiresAt: 'soon' }).success).toBe(
      false,
    );
  });
});

describe('ElevenLabs contracts', () => {
  it('trims filters and caps Saved and Browse pagination at 20', () => {
    expect(workspaceVoicesQuerySchema.parse({ search: '  narrator  ' })).toEqual({
      search: 'narrator',
      language: '',
      gender: '',
      age: '',
      accent: '',
      useCase: '',
      descriptive: '',
      pageSize: PAGE_SIZE_LIMIT,
      refresh: false,
    });
    expect(workspaceVoicesQuerySchema.parse({ pageSize: '3', pageToken: ' next ' })).toEqual({
      search: '',
      language: '',
      gender: '',
      age: '',
      accent: '',
      useCase: '',
      descriptive: '',
      pageSize: 3,
      pageToken: 'next',
      refresh: false,
    });
    expect(workspaceVoicesQuerySchema.safeParse({ pageSize: 21 }).success).toBe(false);
    expect(sharedVoicesQuerySchema.parse({ refresh: 'false' })).toMatchObject({
      pageSize: 20,
      page: 0,
      sort: 'trending',
      refresh: false,
    });
    expect(sharedVoicesQuerySchema.safeParse({ pageSize: 21 }).success).toBe(false);
  });

  it('models filtered totals honestly and keeps provider previews app-owned', () => {
    expect(
      workspaceVoicesResponseSchema.parse({
        voices: [voice],
        hasMore: false,
        nextPageToken: null,
        total: null,
      }),
    ).toMatchObject({ total: null });
    expect(
      workspaceVoicesResponseSchema.safeParse({
        voices: [{ ...voice, previewUrl: 'https://provider.example/audio' }],
        hasMore: false,
        nextPageToken: null,
        total: 1,
      }).success,
    ).toBe(false);
    expect(
      sharedVoicesResponseSchema.safeParse({
        voices: [
          {
            voiceId: voice.voiceId,
            name: voice.name,
            category: voice.category,
            description: voice.description,
            labels: voice.labels,
            traits: voice.traits,
            previewAvailable: voice.previewAvailable,
            publicOwnerId: 'owner-1',
            saved: false,
          },
        ],
        hasMore: false,
        page: 0,
        total: 1,
      }).success,
    ).toBe(true);
  });

  it('validates audio-only conversion parameters and the app-owned byte ceilings', () => {
    expect(voiceChangerQuerySchema.parse({ voiceId: ' voice-1 ' })).toEqual({
      voiceId: 'voice-1',
    });
    expect(voiceChangerQuerySchema.safeParse({ voiceId: '' }).success).toBe(false);
    expect(voiceConversionContentTypeSchema.parse('audio/webm')).toBe('audio/webm');
    expect(voiceConversionContentTypeSchema.safeParse('video/webm').success).toBe(false);
    expect(VOICE_CONVERSION_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(VOICE_PREVIEW_MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(VOICE_CONVERSION_OUTPUT_MAX_BYTES).toBe(8 * 1024 * 1024);
    expect(VOICE_PROVIDER_INTENT_HEADER).toBe('x-lightframe-provider-intent');
    expect(VOICE_PROVIDER_INTENT_VALUE).toBe('voice');
  });
});

describe('safe API errors', () => {
  it('allows only normalized fields and numeric upstream status', () => {
    expect(
      apiErrorResponseSchema.parse({
        error: {
          code: 'provider_failure',
          message: 'Voice provider is unavailable.',
          upstreamStatus: 503,
        },
      }),
    ).toMatchObject({ error: { upstreamStatus: 503 } });
    expect(
      apiErrorResponseSchema.parse({
        error: { code: 'internal_error', message: 'The server could not complete the request.' },
      }),
    ).toMatchObject({ error: { code: 'internal_error' } });
    expect(
      apiErrorResponseSchema.safeParse({
        error: {
          code: 'provider_failure',
          message: 'failed',
          upstreamBody: 'raw secret payload',
        },
      }).success,
    ).toBe(false);
  });
});
