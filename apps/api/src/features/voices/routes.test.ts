import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  VOICE_PROVIDER_INTENT_HEADER,
  VOICE_PROVIDER_INTENT_VALUE,
  type ApiErrorResponse,
} from '@studio/contracts';
import { createApp } from '../../app.js';
import { ProviderError } from '../../providers/provider-error.js';
import { FakeElevenLabsProvider, standardModel, testConfig, voice } from '../../test/fakes.js';
import { MAX_RECORDING_AUDIO_BYTES } from './routes.js';
import { VOICE_MODEL_CACHE_TTL_MS } from './voice-service.js';

const intentHeaders = { [VOICE_PROVIDER_INTENT_HEADER]: VOICE_PROVIDER_INTENT_VALUE };
const originHeaders = {
  ...intentHeaders,
  origin: 'http://localhost:5173',
  host: 'localhost:5173',
};

describe('ElevenLabs voice API', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  afterEach(async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  const setup = (provider = new FakeElevenLabsProvider()) => {
    const app = createApp({ config: testConfig(), elevenLabsProvider: provider });
    apps.push(app);
    return { app, provider };
  };

  it('trims workspace search, caps paging, and returns every saved voice category', async () => {
    const { app, provider } = setup();
    provider.workspaceVoices = [
      voice(),
      voice({ voiceId: 'professional-one', name: 'Pro', category: 'professional' }),
    ];
    provider.workspaceHasMore = true;
    provider.workspaceNextPageToken = 'next-opaque';

    const response = await app.inject({
      method: 'GET',
      url: '/api/elevenlabs/voices?search=%20nova%20&pageSize=10&pageToken=current',
      headers: intentHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.json()).toEqual({
      voices: [
        {
          voiceId: 'voice-one',
          name: 'Nova',
          category: 'generated',
          description: 'Bright and conversational',
          labels: { accent: 'Canadian' },
          previewAvailable: true,
        },
        {
          voiceId: 'professional-one',
          name: 'Pro',
          category: 'professional',
          description: 'Bright and conversational',
          labels: { accent: 'Canadian' },
          previewAvailable: true,
        },
      ],
      hasMore: true,
      nextPageToken: 'next-opaque',
      total: null,
    });
    expect(provider.workspaceSearches[0]).toMatchObject({
      search: 'nova',
      pageSize: 10,
      nextPageToken: 'current',
    });

    const tooLarge = await app.inject({
      method: 'GET',
      url: '/api/elevenlabs/voices?pageSize=11',
      headers: intentHeaders,
    });
    expect(tooLarge.statusCode).toBe(400);
    expect(provider.workspaceSearches).toHaveLength(1);
  });

  it('keeps browsing independent of conversion-model discovery', async () => {
    const { app, provider } = setup();
    const listModels = vi.spyOn(provider, 'listModels');

    await app.inject({ method: 'GET', url: '/api/elevenlabs/voices', headers: intentHeaders });
    await app.inject({
      method: 'GET',
      url: '/api/elevenlabs/voices/voice-one/preview',
      headers: intentHeaders,
    });

    expect(listModels).not.toHaveBeenCalled();
  });

  it('shares conversion-model discovery briefly, then refreshes it after the bounded TTL', async () => {
    const now = vi
      .spyOn(Date, 'now')
      .mockReturnValue(new Date('2026-07-26T12:00:00.000Z').getTime());
    const { app, provider } = setup();
    const listModels = vi.spyOn(provider, 'listModels');
    const conversion = {
      method: 'POST' as const,
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'audio/webm' },
      payload: Buffer.from('original-sidecar'),
    };

    await app.inject(conversion);
    await app.inject(conversion);
    expect(listModels).toHaveBeenCalledOnce();

    now.mockReturnValue(Date.now() + VOICE_MODEL_CACHE_TTL_MS);
    await app.inject(conversion);
    expect(listModels).toHaveBeenCalledTimes(2);
  });

  it('proxies workspace previews without exposing the upstream URL', async () => {
    const { app, provider } = setup();
    const response = await app.inject({
      method: 'GET',
      url: '/api/elevenlabs/voices/voice-one/preview',
      headers: intentHeaders,
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('audio/mpeg');
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.rawPayload).toEqual(provider.previewBytes);
    expect(response.body).not.toContain('storage.googleapis.com');
  });

  it('rejects every provider-backed read without explicit voice intent before provider contact', async () => {
    const { app, provider } = setup();
    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/api/elevenlabs/voices' }),
      app.inject({ method: 'GET', url: '/api/elevenlabs/voices/voice-one/preview' }),
    ]);

    expect(responses.map((response) => response.statusCode)).toEqual([403, 403]);
    expect(provider.workspaceSearches).toHaveLength(0);
    expect(provider.previewUrls).toHaveLength(0);
  });

  it('does not expose public discovery or voice-import routes', async () => {
    const { app, provider } = setup();
    const sharedList = await app.inject({
      method: 'GET',
      url: '/api/elevenlabs/shared-voices',
      headers: intentHeaders,
    });
    const importVoice = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/shared-voices/import',
      headers: originHeaders,
      payload: { publicOwnerId: 'owner-one', voiceId: 'voice-one', name: 'My Nova' },
    });

    expect(sharedList.statusCode).toBe(404);
    expect(importVoice.statusCode).toBe(404);
    expect(provider.workspaceSearches).toHaveLength(0);
  });

  it('rejects a voice that is not in the saved library even if its id is submitted directly', async () => {
    const { app, provider } = setup();
    provider.workspaceVoices = [];
    const response = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'audio/webm' },
      payload: Buffer.from('original-sidecar'),
    });

    expect(response.statusCode).toBe(404);
    expect(response.json<ApiErrorResponse>().error).toEqual({
      code: 'not_found',
      message:
        'That voice is no longer in your ElevenLabs library. Refresh the library and choose another.',
    });
    expect(provider.conversions).toHaveLength(0);
  });

  it('converts only explicit nonempty audio from an immutable sidecar request', async () => {
    const { app, provider } = setup();
    const audio = Buffer.from('original-sidecar');
    const response = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'audio/webm;codecs=opus' },
      payload: audio,
    });

    expect(response.statusCode).toBe(200);
    expect(response.rawPayload).toEqual(provider.convertedBytes);
    expect(provider.conversions).toHaveLength(1);
    expect(provider.conversions[0]).toMatchObject({
      voiceId: 'voice-one',
      modelId: standardModel.modelId,
      mimeType: 'audio/webm',
      enableLogging: false,
    });
    expect(Buffer.from(provider.conversions[0]?.audio ?? [])).toEqual(audio);
  });

  it('allows a saved professional-library voice to reach Voice Changer', async () => {
    const { app, provider } = setup();
    provider.workspaceVoices = [voice({ category: 'professional' })];
    const response = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'audio/webm' },
      payload: Buffer.from('original-sidecar'),
    });

    expect(response.statusCode).toBe(200);
    expect(provider.conversions).toHaveLength(1);
  });

  it('validates conversion origin, media type, emptiness, and the 25 MiB limit', async () => {
    const { app, provider } = setup();
    const noOrigin = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...intentHeaders, 'content-type': 'audio/webm' },
      payload: Buffer.from('audio'),
    });
    const unsupported = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'video/webm' },
      payload: Buffer.from('audio'),
    });
    const empty = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'audio/webm' },
      payload: Buffer.alloc(0),
    });
    const oversized = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'audio/webm' },
      payload: Buffer.alloc(MAX_RECORDING_AUDIO_BYTES + 1),
    });

    expect(noOrigin.statusCode).toBe(403);
    expect(unsupported.statusCode).toBe(400);
    expect(empty.statusCode).toBe(400);
    expect(oversized.statusCode).toBe(413);
    expect(provider.conversions).toHaveLength(0);
  });

  it('accepts a recording exactly at the 25 MiB boundary', async () => {
    const { app, provider } = setup();
    const response = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'audio/webm' },
      payload: Buffer.alloc(MAX_RECORDING_AUDIO_BYTES),
    });

    expect(response.statusCode).toBe(200);
    expect(provider.conversions[0]?.audio.byteLength).toBe(MAX_RECORDING_AUDIO_BYTES);
  });

  it('maps provider failures without leaking upstream bodies or secrets', async () => {
    class FailingProvider extends FakeElevenLabsProvider {
      override listModels(): Promise<never> {
        return Promise.reject(new ProviderError('models', 'upstream', 401));
      }
    }
    const { app } = setup(new FailingProvider());
    const response = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'audio/webm' },
      payload: Buffer.from('original-sidecar'),
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: 'provider_authentication',
        message: 'ElevenLabs rejected the configured server credential. Check the integration key.',
        upstreamStatus: 401,
      },
    });
    expect(response.body).not.toContain('placeholder');
    expect(response.body).not.toContain('stack');
  });

  it('cancels a stalled parallel provider branch when its sibling fails', async () => {
    let siblingAborted = false;
    class FailingProvider extends FakeElevenLabsProvider {
      override getWorkspaceVoice(): Promise<never> {
        return Promise.reject(new ProviderError('workspace-voice', 'upstream', 502));
      }

      override listModels(signal: AbortSignal): Promise<never> {
        return new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              siblingAborted = true;
              reject(new ProviderError('models', 'aborted'));
            },
            { once: true },
          );
        });
      }
    }
    const { app } = setup(new FailingProvider());

    const response = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'audio/webm' },
      payload: Buffer.from('original-sidecar'),
    });

    expect(response.statusCode).toBe(502);
    expect(siblingAborted).toBe(true);
  });

  it.each([
    ['quota' as const, 401, 'provider_quota'],
    ['rate-limit' as const, 429, 'rate_limited'],
  ])('maps provider %s failures to actionable safe errors', async (reason, upstream, code) => {
    class LimitedProvider extends FakeElevenLabsProvider {
      override listModels(): Promise<never> {
        return Promise.reject(new ProviderError('models', reason, upstream));
      }
    }
    const { app } = setup(new LimitedProvider());
    const response = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'audio/webm' },
      payload: Buffer.from('original-sidecar'),
    });

    expect(response.statusCode).toBe(429);
    expect(response.json()).toMatchObject({
      error: { code, upstreamStatus: upstream },
    });
    expect(response.body).not.toContain('not exposed');
  });

  it('explains zero-retention account rejection without exposing the upstream body', async () => {
    class ZeroRetentionRejectedProvider extends FakeElevenLabsProvider {
      override convertRecording(): Promise<never> {
        return Promise.reject(new ProviderError('conversion', 'zero-retention-unavailable', 422));
      }
    }
    const { app } = setup(new ZeroRetentionRejectedProvider());
    const response = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'audio/webm' },
      payload: Buffer.from('original-sidecar'),
    });

    expect(response.statusCode).toBe(502);
    expect(response.json()).toEqual({
      error: {
        code: 'provider_policy',
        message:
          'ElevenLabs rejected the zero-retention conversion request. Verify enterprise eligibility, or deliberately enable provider logging after reviewing retention terms.',
        upstreamStatus: 422,
      },
    });
  });

  it('does not mislabel invalid audio as a zero-retention entitlement failure', async () => {
    class InvalidAudioProvider extends FakeElevenLabsProvider {
      override convertRecording(): Promise<never> {
        return Promise.reject(new ProviderError('conversion', 'invalid-audio', 422));
      }
    }
    const { app } = setup(new InvalidAudioProvider());
    const response = await app.inject({
      method: 'POST',
      url: '/api/elevenlabs/voice-changer/recording?voiceId=voice-one',
      headers: { ...originHeaders, 'content-type': 'audio/webm' },
      payload: Buffer.from('unreadable-sidecar'),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<ApiErrorResponse>().error.code).toBe('invalid_audio');
    expect(response.body).not.toContain('zero-retention');
  });

  it('returns an isolated 503 when ElevenLabs is not configured', async () => {
    const app = createApp({ config: testConfig(), elevenLabsProvider: null });
    apps.push(app);
    const response = await app.inject({
      method: 'GET',
      url: '/api/elevenlabs/voices',
      headers: intentHeaders,
    });
    const health = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(503);
    expect(response.json<ApiErrorResponse>().error.code).toBe('feature_unavailable');
    expect(health.statusCode).toBe(200);
  });
});
