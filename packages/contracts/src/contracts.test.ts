import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CHARACTER_MODEL_ID,
  PAGE_SIZE_LIMIT,
  SUPPORTED_MODEL_IDS,
  VOICE_CONVERSION_MAX_BYTES,
  apiErrorResponseSchema,
  capabilitiesResponseSchema,
  healthResponseSchema,
  importSharedVoiceRequestSchema,
  realtimeTokenRequestSchema,
  realtimeTokenResponseSchema,
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
      }),
    ).toEqual({
      realtimeVideo: { available: true, models: ['lucy-2.5', 'lucy-vton-3'] },
      elevenLabs: { available: false, modelId: null },
    });
    expect(
      capabilitiesResponseSchema.safeParse({
        realtimeVideo: { available: true, models: ['local'] },
        elevenLabs: { available: false, modelId: null },
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
