import { describe, expect, it, vi } from 'vitest';
import { ProviderError } from '../provider-error.js';
import { ElevenLabsHttpProvider } from './http-provider.js';

const jsonResponse = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });

const signal = (): AbortSignal => new AbortController().signal;
const requestedUrl = (input: RequestInfo | URL | undefined): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? '';
};

describe('ElevenLabsHttpProvider', () => {
  it('normalizes workspace voices and sends only provider-required query/header values', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          voices: [
            {
              voice_id: 'voice-one',
              name: 'Nova',
              category: 'generated',
              description: 'Friendly',
              labels: { accent: 'Canadian', unsafe: { nested: true } },
              preview_url: 'https://storage.googleapis.com/eleven-public-prod/nova.mp3',
            },
          ],
          has_more: true,
          next_page_token: 'opaque-next',
        }),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

    await expect(
      provider.listWorkspaceVoices({
        search: 'warm voice',
        pageSize: 8,
        nextPageToken: 'opaque-current',
        signal: signal(),
      }),
    ).resolves.toEqual({
      voices: [
        {
          voiceId: 'voice-one',
          name: 'Nova',
          category: 'generated',
          description: 'Friendly',
          labels: { accent: 'Canadian' },
          previewUrl: 'https://storage.googleapis.com/eleven-public-prod/nova.mp3',
        },
      ],
      hasMore: true,
      nextPageToken: 'opaque-next',
    });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(requestedUrl(url)).toContain('/v2/voices?');
    expect(requestedUrl(url)).toContain('page_size=8');
    expect(requestedUrl(url)).toContain('search=warm+voice');
    expect(new Headers(init?.headers).get('xi-api-key')).toBe('server-only-placeholder');
  });

  it('refuses untrusted provider preview URLs before making a fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

    await expect(
      provider.fetchPreview('https://example.com/pretend-preview.mp3', signal()),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses multipart audio for provider conversion while returning a streamed result', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(Buffer.from('converted'), {
          status: 200,
          headers: { 'content-type': 'application/octet-stream', 'content-length': '9' },
        }),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);
    const result = await provider.convertRecording(
      'voice-one',
      'eleven_multilingual_sts_v2',
      Buffer.from('original'),
      'audio/webm',
      false,
      signal(),
    );

    expect(result.contentType).toBe('audio/mpeg');
    expect(result.contentLength).toBe(9);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(requestedUrl(url)).toContain('/v1/speech-to-speech/voice-one');
    expect(requestedUrl(url)).toContain('enable_logging=false');
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.get('model_id')).toBe('eleven_multilingual_sts_v2');
    expect(form.get('audio')).toBeInstanceOf(Blob);
  });

  it('rejects malformed provider booleans instead of silently changing capability truth', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse([
          {
            model_id: 'eleven_multilingual_sts_v2',
            can_do_voice_conversion: 'true',
            serves_pro_voices: false,
          },
        ]),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

    await expect(provider.listModels(signal())).rejects.toMatchObject({
      reason: 'invalid-response',
      operation: 'models',
    });
  });

  it('does not expose raw upstream error bodies', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('sensitive upstream diagnostic', {
          status: 401,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

    const error = await provider.listModels(signal()).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(ProviderError);
    expect(error).toMatchObject({ upstreamStatus: 401, reason: 'upstream' });
    expect(String(error)).not.toContain('sensitive upstream diagnostic');
  });

  it('identifies a zero-retention entitlement failure only from bounded code and parameter data', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse(
          {
            detail: {
              code: 'subscription_required',
              param: 'enable_logging',
              message: 'sensitive diagnostic is ignored',
            },
          },
          403,
        ),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

    await expect(
      provider.convertRecording(
        'voice-one',
        'eleven_multilingual_sts_v2',
        Buffer.from('audio'),
        'audio/webm',
        false,
        signal(),
      ),
    ).rejects.toMatchObject({
      reason: 'zero-retention-unavailable',
      upstreamStatus: 403,
    });
  });

  it.each([
    [401, 'insufficient_credits', 'quota'],
    [429, 'rate_limit_exceeded', 'rate-limit'],
    [422, 'invalid_audio_format', 'invalid-audio'],
    [403, 'subscription_required', 'feature-unavailable'],
  ] as const)(
    'classifies safe provider status metadata for upstream %s responses',
    async (status, providerStatus, reason) => {
      const fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          jsonResponse(
            { detail: { code: providerStatus, status: 'legacy-value', message: 'not exposed' } },
            status,
          ),
        ),
      );
      const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

      const request =
        reason === 'invalid-audio'
          ? provider.convertRecording(
              'voice-one',
              'eleven_multilingual_sts_v2',
              Buffer.from('audio'),
              'audio/webm',
              false,
              signal(),
            )
          : provider.listModels(signal());
      await expect(request).rejects.toMatchObject({
        reason,
        upstreamStatus: status,
      });
    },
  );

  it('propagates caller cancellation to an in-flight upstream fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);
    const controller = new AbortController();
    const pending = provider.listModels(controller.signal);
    controller.abort();

    await expect(pending).rejects.toMatchObject({ reason: 'aborted', operation: 'models' });
  });
});
