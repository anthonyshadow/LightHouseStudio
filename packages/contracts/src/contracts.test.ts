import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARACTER_MODEL_ID,
  PAGE_SIZE_LIMIT,
  SUPPORTED_MODEL_IDS,
  VOICE_CONVERSION_MAX_BYTES,
  apiErrorResponseSchema,
  capabilitiesResponseSchema,
  characterPromptOptimizationResultSchema,
  createReferenceImageRequestSchema,
  healthResponseSchema,
  importSharedVoiceRequestSchema,
  optimizeCharacterReferencePromptRequestSchema,
  optimizeCharacterReferencePromptResponseSchema,
  realtimeTokenRequestSchema,
  realtimeTokenResponseSchema,
  referenceImageAssetSchema,
  sharedVoicePreviewParamsSchema,
  sharedVoicesQuerySchema,
  sharedVoicesResponseSchema,
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
  previewAvailable: true,
};

describe('health and capabilities contracts', () => {
  it('accepts only the exact health response', () => {
    expect(healthResponseSchema.parse({ ok: true })).toEqual({ ok: true });
    expect(healthResponseSchema.safeParse({ ok: true, secret: 'no' }).success).toBe(false);
  });

  it('normalizes provider availability without exposing credentials', () => {
    expect(
      capabilitiesResponseSchema.parse({
        realtimeVideo: { available: true, models: [...SUPPORTED_MODEL_IDS] },
        elevenLabs: { available: false, modelId: null },
        referenceImages: {
          available: true,
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
    ).toEqual({
      realtimeVideo: { available: true, models: ['lucy-2.5', 'lucy-vton-3'] },
      elevenLabs: { available: false, modelId: null },
      referenceImages: {
        available: true,
        modelId: 'gpt-image-2',
        sizes: ['1024x1024', '1024x1536', '1536x1024'],
        quality: 'high',
        optimizer: {
          available: true,
          model: 'gpt-5.6',
          version: 'lucy-character-reference-v1',
        },
      },
    });
    expect(
      capabilitiesResponseSchema.safeParse({
        realtimeVideo: { available: true, models: ['local'] },
        elevenLabs: { available: false, modelId: null },
        referenceImages: {
          available: false,
          modelId: 'gpt-image-2',
          sizes: ['1024x1024', '1024x1536', '1536x1024'],
          quality: 'high',
          optimizer: {
            available: false,
            model: 'gpt-5.6',
            version: 'lucy-character-reference-v1',
          },
        },
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
      referenceImageAssetSchema.safeParse({ ...metadata, storageKey: 'private/image.jpg' }).success,
    ).toBe(false);
    expect(
      referenceImageAssetSchema.safeParse({ ...metadata, providerRequestId: 'private-request' })
        .success,
    ).toBe(false);
    expect(
      referenceImageAssetSchema.safeParse({
        ...metadata,
        size: '1024x1536',
        width: 1536,
        height: 1536,
      }).success,
    ).toBe(false);
  });
});

describe('realtime credential contracts', () => {
  it('supports exactly Character 2.5 and VTON 3', () => {
    expect(DEFAULT_CHARACTER_MODEL_ID).toBe('lucy-2.5');
    expect(supportedModelIdSchema.parse('lucy-2.5')).toBe('lucy-2.5');
    expect(supportedModelIdSchema.parse('lucy-vton-3')).toBe('lucy-vton-3');
    expect(supportedModelIdSchema.safeParse('lucy-2.1').success).toBe(false);
    expect(supportedModelIdSchema.safeParse('local').success).toBe(false);
  });

  it('defaults an omitted body or model to Character and rejects unknown fields', () => {
    expect(realtimeTokenRequestSchema.parse(undefined)).toEqual({ model: 'lucy-2.5' });
    expect(realtimeTokenRequestSchema.parse({})).toEqual({ model: 'lucy-2.5' });
    expect(realtimeTokenRequestSchema.safeParse({ model: 'lucy-2.5', apiKey: 'bad' }).success).toBe(
      false,
    );
  });

  it('requires a nonempty temporary key and ISO expiry', () => {
    expect(
      realtimeTokenResponseSchema.parse({
        apiKey: 'temporary-only',
        expiresAt: '2026-07-14T12:05:00.000Z',
        constraints: { model: 'lucy-2.5', maxSessionDurationSeconds: 300 },
      }),
    ).toMatchObject({ apiKey: 'temporary-only' });
    expect(realtimeTokenResponseSchema.safeParse({ apiKey: '', expiresAt: 'soon' }).success).toBe(
      false,
    );
  });
});

describe('ElevenLabs contracts', () => {
  it('trims search and caps workspace pagination at 10', () => {
    expect(workspaceVoicesQuerySchema.parse({ search: '  narrator  ' })).toEqual({
      search: 'narrator',
      pageSize: PAGE_SIZE_LIMIT,
    });
    expect(workspaceVoicesQuerySchema.parse({ pageSize: '3', pageToken: ' next ' })).toEqual({
      search: '',
      pageSize: 3,
      pageToken: 'next',
    });
    expect(workspaceVoicesQuerySchema.safeParse({ pageSize: 11 }).success).toBe(false);
  });

  it('supports zero-based shared pages and strict public preview/import identifiers', () => {
    expect(sharedVoicesQuerySchema.parse({ page: '0', pageSize: '10' })).toEqual({
      search: '',
      page: 0,
      pageSize: 10,
    });
    expect(sharedVoicesQuerySchema.safeParse({ page: -1 }).success).toBe(false);
    expect(
      sharedVoicePreviewParamsSchema.parse({
        publicOwnerId: ' owner ',
        voiceId: ' voice ',
      }),
    ).toEqual({ publicOwnerId: 'owner', voiceId: 'voice' });
    expect(
      importSharedVoiceRequestSchema.parse({
        name: '  Studio voice ',
        publicOwnerId: 'owner',
        voiceId: 'voice',
      }),
    ).toEqual({ name: 'Studio voice', publicOwnerId: 'owner', voiceId: 'voice' });
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
      sharedVoicesResponseSchema.parse({
        voices: [{ ...voice, publicOwnerId: 'owner' }],
        page: 0,
        hasMore: true,
        nextPageToken: 'opaque',
        total: null,
      }),
    ).toMatchObject({ page: 0, total: null });
    expect(
      workspaceVoicesResponseSchema.safeParse({
        voices: [{ ...voice, previewUrl: 'https://provider.example/audio' }],
        hasMore: false,
        nextPageToken: null,
        total: 1,
      }).success,
    ).toBe(false);
  });

  it('validates audio-only conversion parameters and the 25 MiB boundary constant', () => {
    expect(voiceChangerQuerySchema.parse({ voiceId: ' voice-1 ' })).toEqual({
      voiceId: 'voice-1',
    });
    expect(voiceChangerQuerySchema.safeParse({ voiceId: '' }).success).toBe(false);
    expect(voiceConversionContentTypeSchema.parse('audio/webm')).toBe('audio/webm');
    expect(voiceConversionContentTypeSchema.safeParse('video/webm').success).toBe(false);
    expect(VOICE_CONVERSION_MAX_BYTES).toBe(25 * 1024 * 1024);
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
