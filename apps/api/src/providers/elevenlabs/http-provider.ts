import { Readable } from 'node:stream';
import { z } from 'zod';
import { ProviderError, type ProviderOperation } from '../provider-error.js';
import type { AudioStream } from '../../application/audio-stream.js';
import type {
  ElevenLabsModel,
  ElevenLabsProvider,
  ProviderSharedVoice,
  ProviderSharedVoicePage,
  ProviderVoice,
  ProviderWorkspaceVoicePage,
  VoiceSearchInput,
} from './types.js';

const ELEVENLABS_API_ORIGIN = 'https://api.elevenlabs.io';
const ALLOWED_PREVIEW_HOSTS = new Set(['storage.googleapis.com']);
const providerIdSchema = z.string().trim().min(1).max(200);

/** Bridges Fetch's web stream through its async iterator without unsafe type coercion. */
const nodeReadableFromWeb = (body: ReadableStream<Uint8Array>): Readable => Readable.from(body);

const labelsSchema = z.record(z.string(), z.unknown()).nullish();
const workspaceVoiceSchema = z
  .object({
    voice_id: providerIdSchema,
    name: z.string().nullish(),
    category: z.string().nullish(),
    description: z.string().nullish(),
    labels: labelsSchema,
    preview_url: z.string().nullish(),
  })
  .passthrough();

const workspaceVoicePageSchema = z
  .object({
    voices: z.array(workspaceVoiceSchema),
    has_more: z.boolean(),
    next_page_token: z.string().nullish(),
  })
  .passthrough();

const sharedVoiceSchema = z
  .object({
    public_owner_id: providerIdSchema,
    voice_id: providerIdSchema,
    name: z.string().nullish(),
    category: z.string().nullish(),
    description: z.string().nullish(),
    preview_url: z.string().nullish(),
    free_users_allowed: z.boolean(),
    accent: z.string().nullish(),
    gender: z.string().nullish(),
    age: z.string().nullish(),
    descriptive: z.string().nullish(),
    use_case: z.string().nullish(),
    language: z.string().nullish(),
  })
  .passthrough();

const sharedVoicePageSchema = z
  .object({ voices: z.array(sharedVoiceSchema), has_more: z.boolean() })
  .passthrough();

const modelSchema = z
  .object({
    model_id: z.string().trim().min(1).max(200),
    can_do_voice_conversion: z.boolean(),
    serves_pro_voices: z.boolean(),
  })
  .passthrough();

const importResponseSchema = z.object({ voice_id: providerIdSchema }).passthrough();
const providerFailureSchema = z.object({
  detail: z.object({
    type: z.string().max(100).optional(),
    code: z.string().max(100).optional(),
    status: z.string().max(100).optional(),
    param: z.string().max(100).nullish(),
  }),
});

const INVALID_AUDIO_CODES = new Set([
  'invalid_audio',
  'invalid_audio_format',
  'audio_too_short',
  'audio_too_long',
]);
const FEATURE_UNAVAILABLE_CODES = new Set(['feature_not_available', 'subscription_required']);
const QUOTA_CODES = new Set(['insufficient_credits', 'quota_exceeded']);
const RATE_LIMIT_CODES = new Set(['rate_limit_exceeded', 'too_many_requests']);

const normalizeLabels = (
  labels: Readonly<Record<string, unknown>> | null | undefined,
): Readonly<Record<string, string>> => {
  if (labels === undefined || labels === null) return {};
  const entries = Object.entries(labels)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => [key.slice(0, 80), value.slice(0, 160)] as const)
    .slice(0, 20);
  return Object.fromEntries(entries);
};

const normalizeWorkspaceVoice = (voice: z.infer<typeof workspaceVoiceSchema>): ProviderVoice => ({
  voiceId: voice.voice_id,
  name: (voice.name?.trim() || 'Untitled voice').slice(0, 100),
  category: voice.category?.trim().slice(0, 100) || null,
  description: voice.description?.trim().slice(0, 500) || null,
  labels: normalizeLabels(voice.labels),
  previewUrl: voice.preview_url?.trim() || null,
});

const normalizeSharedVoice = (voice: z.infer<typeof sharedVoiceSchema>): ProviderSharedVoice => {
  const rawLabels = {
    accent: voice.accent,
    gender: voice.gender,
    age: voice.age,
    descriptive: voice.descriptive,
    useCase: voice.use_case,
    language: voice.language,
  };

  return {
    voiceId: voice.voice_id,
    publicOwnerId: voice.public_owner_id,
    name: (voice.name?.trim() || 'Untitled voice').slice(0, 100),
    category: voice.category?.trim().slice(0, 100) || null,
    description: voice.description?.trim().slice(0, 500) || null,
    labels: normalizeLabels(rawLabels),
    previewUrl: voice.preview_url?.trim() || null,
    freeUsersAllowed: voice.free_users_allowed,
  };
};

const parseContentLength = (header: string | null): number | undefined => {
  if (header === null) return undefined;
  const value = Number.parseInt(header, 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
};

const isAllowedPreviewUrl = (rawUrl: string): boolean => {
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    return (
      url.protocol === 'https:' &&
      url.username === '' &&
      url.password === '' &&
      (url.port === '' || url.port === '443') &&
      (ALLOWED_PREVIEW_HOSTS.has(hostname) || hostname.endsWith('.elevenlabs.io'))
    );
  } catch {
    return false;
  }
};

const audioExtension = (mimeType: string): string => {
  if (mimeType.includes('mp4') || mimeType.includes('aac')) return 'm4a';
  if (mimeType.includes('ogg')) return 'ogg';
  if (mimeType.includes('wav')) return 'wav';
  if (mimeType.includes('mpeg')) return 'mp3';
  if (mimeType.includes('flac')) return 'flac';
  return 'webm';
};

const classifyProviderFailure = async (
  response: Response,
  operation: ProviderOperation,
): Promise<ProviderError['reason']> => {
  const fallback: ProviderError['reason'] = response.status === 429 ? 'rate-limit' : 'upstream';
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return fallback;
  }
  try {
    const parsed = providerFailureSchema.safeParse(await response.clone().json());
    if (!parsed.success) return fallback;
    const code = (parsed.data.detail.code ?? parsed.data.detail.status ?? '').toLowerCase();
    if (operation === 'conversion' && INVALID_AUDIO_CODES.has(code)) return 'invalid-audio';
    if (FEATURE_UNAVAILABLE_CODES.has(code)) {
      const param = parsed.data.detail.param?.toLowerCase();
      if (operation === 'conversion' && param === 'enable_logging') {
        return 'zero-retention-unavailable';
      }
      return 'feature-unavailable';
    }
    if (QUOTA_CODES.has(code)) return 'quota';
    if (RATE_LIMIT_CODES.has(code)) return 'rate-limit';
  } catch {
    return fallback;
  }
  return fallback;
};

export class ElevenLabsHttpProvider implements ElevenLabsProvider {
  readonly #apiKey: string;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(apiKey: string, fetchImplementation: typeof fetch = fetch, timeoutMs = 30_000) {
    this.#apiKey = apiKey;
    this.#fetch = fetchImplementation;
    this.#timeoutMs = timeoutMs;
  }

  async #request(
    path: string,
    operation: ProviderOperation,
    signal: AbortSignal,
    init: RequestInit = {},
  ): Promise<Response> {
    const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
    const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
    const headers = new Headers(init.headers);
    headers.set('xi-api-key', this.#apiKey);
    headers.set('Accept', init.method === 'POST' ? '*/*' : 'application/json');

    let response: Response;
    try {
      response = await this.#fetch(new URL(path, ELEVENLABS_API_ORIGIN), {
        ...init,
        headers,
        signal: combinedSignal,
      });
    } catch {
      if (signal.aborted) throw new ProviderError(operation, 'aborted');
      if (timeoutSignal.aborted) throw new ProviderError(operation, 'timeout');
      throw new ProviderError(operation, 'upstream');
    }

    if (!response.ok) {
      const reason = await classifyProviderFailure(response, operation);
      void response.body?.cancel().catch(() => undefined);
      throw new ProviderError(operation, reason, response.status);
    }
    return response;
  }

  async #json(request: Promise<Response>, operation: ProviderOperation): Promise<unknown> {
    const response = await request;
    try {
      return await response.json();
    } catch {
      throw new ProviderError(operation, 'invalid-response', response.status);
    }
  }

  #audioResponse(response: Response, operation: ProviderOperation): AudioStream {
    const upstreamContentType =
      response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    const contentType =
      upstreamContentType === 'application/octet-stream' ? 'audio/mpeg' : upstreamContentType;
    if (response.body === null || !contentType.startsWith('audio/')) {
      void response.body?.cancel().catch(() => undefined);
      throw new ProviderError(operation, 'invalid-response', response.status);
    }

    const contentLength = parseContentLength(response.headers.get('content-length'));
    return {
      body: nodeReadableFromWeb(response.body),
      contentType,
      ...(contentLength === undefined ? {} : { contentLength }),
    };
  }

  async listModels(signal: AbortSignal): Promise<readonly ElevenLabsModel[]> {
    const data = await this.#json(this.#request('/v1/models', 'models', signal), 'models');
    const parsed = z.array(modelSchema).safeParse(data);
    if (!parsed.success) throw new ProviderError('models', 'invalid-response');
    return parsed.data.map((model) => ({
      modelId: model.model_id,
      canDoVoiceConversion: model.can_do_voice_conversion,
      servesProfessionalVoices: model.serves_pro_voices,
    }));
  }

  async listWorkspaceVoices(
    input: VoiceSearchInput & { readonly nextPageToken: string | null },
  ): Promise<ProviderWorkspaceVoicePage> {
    const url = new URL('/v2/voices', ELEVENLABS_API_ORIGIN);
    url.searchParams.set('page_size', String(input.pageSize));
    url.searchParams.set('include_total_count', 'false');
    if (input.search !== '') url.searchParams.set('search', input.search);
    if (input.nextPageToken !== null) {
      url.searchParams.set('next_page_token', input.nextPageToken);
    }

    const data = await this.#json(
      this.#request(url.pathname + url.search, 'workspace-voices', input.signal),
      'workspace-voices',
    );
    const parsed = workspaceVoicePageSchema.safeParse(data);
    if (!parsed.success) throw new ProviderError('workspace-voices', 'invalid-response');
    return {
      voices: parsed.data.voices.map(normalizeWorkspaceVoice),
      hasMore: parsed.data.has_more,
      nextPageToken: parsed.data.next_page_token?.trim().slice(0, 500) || null,
    };
  }

  async getWorkspaceVoice(voiceId: string, signal: AbortSignal): Promise<ProviderVoice> {
    const data = await this.#json(
      this.#request(`/v1/voices/${encodeURIComponent(voiceId)}`, 'workspace-voice', signal),
      'workspace-voice',
    );
    const parsed = workspaceVoiceSchema.safeParse(data);
    if (!parsed.success) throw new ProviderError('workspace-voice', 'invalid-response');
    return normalizeWorkspaceVoice(parsed.data);
  }

  async listSharedVoices(
    input: VoiceSearchInput & { readonly page: number; readonly publicOwnerId?: string },
  ): Promise<ProviderSharedVoicePage> {
    const url = new URL('/v1/shared-voices', ELEVENLABS_API_ORIGIN);
    url.searchParams.set('page_size', String(input.pageSize));
    url.searchParams.set('page', String(input.page));
    if (input.search !== '') url.searchParams.set('search', input.search);
    if (input.publicOwnerId !== undefined) {
      url.searchParams.set('owner_id', input.publicOwnerId);
    }

    const data = await this.#json(
      this.#request(url.pathname + url.search, 'shared-voices', input.signal),
      'shared-voices',
    );
    const parsed = sharedVoicePageSchema.safeParse(data);
    if (!parsed.success) throw new ProviderError('shared-voices', 'invalid-response');
    return {
      voices: parsed.data.voices.map(normalizeSharedVoice),
      hasMore: parsed.data.has_more,
    };
  }

  async importSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    name: string,
    signal: AbortSignal,
  ): Promise<string> {
    const path = `/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`;
    const data = await this.#json(
      this.#request(path, 'import', signal, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: name, bookmarked: true }),
      }),
      'import',
    );
    const parsed = importResponseSchema.safeParse(data);
    if (!parsed.success) throw new ProviderError('import', 'invalid-response');
    return parsed.data.voice_id;
  }

  async fetchPreview(rawUrl: string, signal: AbortSignal): Promise<AudioStream> {
    if (!isAllowedPreviewUrl(rawUrl)) {
      throw new ProviderError('preview', 'invalid-response');
    }

    const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
    let response: Response;
    try {
      response = await this.#fetch(rawUrl, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.any([signal, timeoutSignal]),
        headers: { Accept: 'audio/*' },
      });
    } catch {
      if (signal.aborted) throw new ProviderError('preview', 'aborted');
      if (timeoutSignal.aborted) throw new ProviderError('preview', 'timeout');
      throw new ProviderError('preview', 'upstream');
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new ProviderError('preview', 'upstream', response.status);
    }
    return this.#audioResponse(response, 'preview');
  }

  async convertRecording(
    voiceId: string,
    modelId: string,
    audio: Uint8Array,
    mimeType: string,
    enableLogging: boolean,
    signal: AbortSignal,
  ): Promise<AudioStream> {
    const form = new FormData();
    const copiedAudio = audio.slice();
    form.append(
      'audio',
      new Blob([copiedAudio], { type: mimeType }),
      `recording.${audioExtension(mimeType)}`,
    );
    form.append('model_id', modelId);

    const path = `/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128&enable_logging=${String(enableLogging)}`;
    const response = await this.#request(path, 'conversion', signal, {
      method: 'POST',
      body: form,
    });
    return this.#audioResponse(response, 'conversion');
  }
}
