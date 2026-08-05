import { describe, expect, it, vi } from 'vitest';
import { VOICE_CONVERSION_CONTENT_TYPES, type VoiceConversionContentType } from '@studio/contracts';
import { ProviderError } from '../provider-error.js';
import { MAX_PROVIDER_JSON_BYTES } from '../transport/bounded-provider-transport.js';
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
const mp3Bytes = (byteLength: number): Uint8Array<ArrayBuffer> => {
  const bytes = new Uint8Array(byteLength);
  if (byteLength >= 3) bytes.set([0x49, 0x44, 0x33], 0);
  return bytes;
};
const conversionExtensions = {
  'audio/aac': 'm4a',
  'audio/mp4': 'm4a',
  'audio/mpeg': 'mp3',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/webm': 'webm',
} satisfies Record<VoiceConversionContentType, string>;

describe('ElevenLabsHttpProvider', () => {
  it('normalizes saved-library voices and sends only provider-required query/header values', async () => {
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
    expect(requestedUrl(url)).toContain('voice_type=saved');
    expect(new Headers(init?.headers).get('xi-api-key')).toBe('server-only-placeholder');
    expect(init?.redirect).toBe('error');
  });

  it.each([
    [1, 2],
    [10, 11],
  ] as const)(
    'rejects a provider voice page with %s requested entries and %s returned entries',
    async (pageSize, returnedCount) => {
      const fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          jsonResponse({
            voices: Array.from({ length: returnedCount }, (_, index) => ({
              voice_id: `voice-${index}`,
              name: `Voice ${index}`,
            })),
            has_more: false,
            next_page_token: null,
          }),
        ),
      );
      const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

      await expect(
        provider.listWorkspaceVoices({
          search: '',
          pageSize,
          nextPageToken: null,
          signal: signal(),
        }),
      ).rejects.toMatchObject({
        operation: 'workspace-voices',
        reason: 'invalid-response',
      });
    },
  );

  it('rejects declared oversized successful metadata and cancels before reading', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new TextEncoder().encode('[]'));
        controller.close();
      },
      cancel,
    });
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(body, {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-length': String(MAX_PROVIDER_JSON_BYTES + 1),
          },
        }),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

    await expect(provider.listModels(signal())).rejects.toMatchObject({
      operation: 'models',
      reason: 'response-too-large',
      upstreamStatus: 200,
    });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });

  it('rejects and cancels streamed successful metadata over the JSON limit', async () => {
    const cancel = vi.fn();
    const chunks = [new Uint8Array(MAX_PROVIDER_JSON_BYTES), new Uint8Array([0])];
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        const chunk = chunks.shift();
        if (chunk === undefined) return;
        controller.enqueue(chunk);
      },
      cancel,
    });
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

    await expect(provider.listModels(signal())).rejects.toMatchObject({
      operation: 'models',
      reason: 'response-too-large',
      upstreamStatus: 200,
    });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });

  it.each(['declared', 'streamed'] as const)(
    'falls back to status classification for %s oversized provider error JSON',
    async (mode) => {
      const cancel = vi.fn();
      const chunks =
        mode === 'declared'
          ? [new TextEncoder().encode('{}')]
          : [new Uint8Array(MAX_PROVIDER_JSON_BYTES), new Uint8Array([0])];
      const body = new ReadableStream<Uint8Array>({
        pull(controller) {
          const chunk = chunks.shift();
          if (chunk === undefined) return;
          controller.enqueue(chunk);
        },
        cancel,
      });
      const fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(body, {
            status: 429,
            headers: {
              'content-type': 'application/json',
              ...(mode === 'declared'
                ? { 'content-length': String(MAX_PROVIDER_JSON_BYTES + 1) }
                : {}),
            },
          }),
        ),
      );
      const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

      await expect(provider.listModels(signal())).rejects.toMatchObject({
        operation: 'models',
        reason: 'rate-limit',
        upstreamStatus: 429,
      });
      await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
    },
  );

  it('revalidates a submitted voice id against the saved library', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse({
          voices: [],
          has_more: false,
          next_page_token: null,
        }),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

    await expect(provider.getWorkspaceVoice('not-saved', signal())).resolves.toBeNull();

    const [url] = fetchMock.mock.calls[0] ?? [];
    const request = new URL(requestedUrl(url));
    expect(request.pathname).toBe('/v2/voices');
    expect(request.searchParams.get('voice_type')).toBe('saved');
    expect(request.searchParams.get('voice_ids')).toBe('not-saved');
    expect(request.searchParams.get('page_size')).toBe('1');
  });

  it('refuses untrusted provider preview URLs before making a fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

    await expect(
      provider.fetchPreview('https://example.com/pretend-preview.mp3', signal()),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates and proxies an ElevenLabs MP3 preview mislabeled as text', async () => {
    const previewBytes = Buffer.from([
      0x49, 0x44, 0x33, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x23, 0x54, 0x53,
    ]);
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(previewBytes, {
          status: 200,
          headers: {
            'content-type': 'text/plain',
            'content-length': String(previewBytes.byteLength),
          },
        }),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

    const result = await provider.fetchPreview(
      'https://storage.googleapis.com/eleven-public-prod/voice/preview.mp3',
      signal(),
    );
    const chunks: Uint8Array[] = [];
    for await (const chunk of result.body) {
      if (!(chunk instanceof Uint8Array)) throw new TypeError('Expected binary preview data.');
      chunks.push(chunk);
    }

    expect(result.contentType).toBe('audio/mpeg');
    expect(result.contentLength).toBe(previewBytes.byteLength);
    expect(Buffer.concat(chunks)).toEqual(previewBytes);
  });

  it('rejects mislabeled preview content without an MP3 signature', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response('not audio', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        }),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

    await expect(
      provider.fetchPreview(
        'https://storage.googleapis.com/eleven-public-prod/voice/preview.mp3',
        signal(),
      ),
    ).rejects.toMatchObject({
      operation: 'preview',
      reason: 'invalid-response',
    });
  });

  it('uses multipart audio for provider conversion while returning a streamed result', async () => {
    const convertedBytes = mp3Bytes(9);
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(convertedBytes, {
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
    const chunks: Uint8Array[] = [];
    for await (const chunk of result.body) {
      if (!(chunk instanceof Uint8Array)) throw new TypeError('Expected binary conversion data.');
      chunks.push(chunk);
    }
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(convertedBytes));
  });

  it.each(VOICE_CONVERSION_CONTENT_TYPES)(
    'uses the exhaustive filename extension for validated %s audio',
    async (mimeType) => {
      const convertedBytes = mp3Bytes(3);
      const fetchMock = vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(convertedBytes, {
            status: 200,
            headers: { 'content-type': 'audio/mpeg' },
          }),
        ),
      );
      const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);

      await provider.convertRecording(
        'voice-one',
        'eleven_multilingual_sts_v2',
        Buffer.from('original'),
        mimeType,
        false,
        signal(),
      );

      const form = fetchMock.mock.calls[0]?.[1]?.body;
      if (!(form instanceof FormData)) throw new TypeError('Expected multipart conversion data.');
      expect(form.get('audio')).toMatchObject({
        name: `recording.${conversionExtensions[mimeType]}`,
        type: mimeType,
      });
    },
  );

  it('accepts below-boundary and exact-boundary conversion audio', async () => {
    const limits = { previewBytes: 8, conversionBytes: 12 };
    const responses = [mp3Bytes(11), mp3Bytes(12)];
    const fetchMock = vi.fn<typeof fetch>(() => {
      const bytes = responses.shift();
      if (!bytes) throw new Error('Missing audio fixture.');
      return Promise.resolve(
        new Response(bytes, {
          status: 200,
          headers: {
            'content-type': 'audio/mpeg',
            'content-length': String(bytes.byteLength),
          },
        }),
      );
    });
    const provider = new ElevenLabsHttpProvider(
      'server-only-placeholder',
      fetchMock,
      1_000,
      limits,
    );

    const below = await provider.convertRecording(
      'voice-one',
      'eleven_multilingual_sts_v2',
      Buffer.from('original'),
      'audio/webm',
      false,
      signal(),
    );
    const exact = await provider.convertRecording(
      'voice-one',
      'eleven_multilingual_sts_v2',
      Buffer.from('original'),
      'audio/webm',
      false,
      signal(),
    );

    expect(below.contentLength).toBe(11);
    expect(exact.contentLength).toBe(12);
  });

  it('rejects and cancels a declared oversized successful response before reading it', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(mp3Bytes(3));
      },
      cancel,
    });
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg', 'content-length': '13' },
        }),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000, {
      previewBytes: 8,
      conversionBytes: 12,
    });

    await expect(
      provider.convertRecording(
        'voice-one',
        'eleven_multilingual_sts_v2',
        Buffer.from('original'),
        'audio/webm',
        false,
        signal(),
      ),
    ).rejects.toMatchObject({
      operation: 'conversion',
      reason: 'response-too-large',
    });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });

  it('counts chunked output, rejects overflow, and cancels an endless upstream stream', async () => {
    const cancel = vi.fn();
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(pulls++ === 0 ? mp3Bytes(4) : Buffer.alloc(4, 1));
      },
      cancel,
    });
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        }),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000, {
      previewBytes: 8,
      conversionBytes: 8,
    });

    await expect(
      provider.convertRecording(
        'voice-one',
        'eleven_multilingual_sts_v2',
        Buffer.from('original'),
        'audio/webm',
        false,
        signal(),
      ),
    ).rejects.toMatchObject({
      operation: 'conversion',
      reason: 'response-too-large',
    });
    expect(pulls).toBeLessThanOrEqual(4);
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });

  it('cancels a successful response body when the caller cancels during streaming', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({ cancel });
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        }),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000, {
      previewBytes: 8,
      conversionBytes: 8,
    });
    const controller = new AbortController();
    const pending = provider.convertRecording(
      'voice-one',
      'eleven_multilingual_sts_v2',
      Buffer.from('original'),
      'audio/webm',
      false,
      controller.signal,
    );
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    controller.abort();

    await expect(pending).rejects.toMatchObject({
      operation: 'conversion',
      reason: 'aborted',
    });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });

  it('rejects a successful audio response with a malformed declared length or MP3 body', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(mp3Bytes(4), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg', 'content-length': '4bytes' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(new TextEncoder().encode('not-mp3'), {
          status: 200,
          headers: { 'content-type': 'audio/mpeg' },
        }),
      );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000, {
      previewBytes: 16,
      conversionBytes: 16,
    });
    const convert = () =>
      provider.convertRecording(
        'voice-one',
        'eleven_multilingual_sts_v2',
        Buffer.from('original'),
        'audio/webm',
        false,
        signal(),
      );

    await expect(convert()).rejects.toMatchObject({ reason: 'invalid-response' });
    await expect(convert()).rejects.toMatchObject({ reason: 'invalid-response' });
  });

  it('rejects malformed provider booleans instead of silently changing capability truth', async () => {
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        jsonResponse([
          {
            model_id: 'eleven_multilingual_sts_v2',
            can_do_voice_conversion: 'true',
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

  it('cancels a successful metadata body when the caller aborts during JSON streaming', async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('[]'));
      },
      cancel,
    });
    const fetchMock = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const provider = new ElevenLabsHttpProvider('server-only-placeholder', fetchMock, 1_000);
    const controller = new AbortController();
    const pending = provider.listModels(controller.signal);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());

    controller.abort();

    await expect(pending).rejects.toMatchObject({ reason: 'aborted', operation: 'models' });
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
});
