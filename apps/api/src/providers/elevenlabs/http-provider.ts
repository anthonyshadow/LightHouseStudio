import { Readable } from 'node:stream';
import {
  PAGE_SIZE_LIMIT,
  VOICE_CONVERSION_OUTPUT_MAX_BYTES,
  VOICE_PREVIEW_MAX_BYTES,
  type VoiceConversionContentType,
} from '@studio/contracts';
import { z } from 'zod';
import { ProviderError, type ProviderOperation } from '../provider-error.js';
import { readBoundedJson } from '../transport/bounded-provider-transport.js';
import type { AudioStream } from '../../application/audio-stream.js';
import type {
  ElevenLabsModel,
  ElevenLabsProvider,
  ProviderVoice,
  ProviderWorkspaceVoicePage,
  VoiceSearchInput,
} from './types.js';

const ELEVENLABS_API_ORIGIN = 'https://api.elevenlabs.io';
const ALLOWED_PREVIEW_HOSTS = new Set(['storage.googleapis.com']);
const providerIdSchema = z.string().trim().min(1).max(200);

export type ElevenLabsAudioLimits = Readonly<{
  previewBytes: number;
  conversionBytes: number;
}>;

const DEFAULT_AUDIO_LIMITS: ElevenLabsAudioLimits = {
  previewBytes: VOICE_PREVIEW_MAX_BYTES,
  conversionBytes: VOICE_CONVERSION_OUTPUT_MAX_BYTES,
};

type ProviderResponse = Readonly<{
  response: Response;
  callerSignal: AbortSignal;
  timeoutSignal: AbortSignal;
  combinedSignal: AbortSignal;
}>;

const isMp3Signature = (bytes: Uint8Array): boolean =>
  (bytes.byteLength >= 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
  (bytes.byteLength >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0);

const hasMp3Path = (rawUrl: string): boolean => {
  try {
    return new URL(rawUrl).pathname.toLowerCase().endsWith('.mp3');
  } catch {
    return false;
  }
};

const firstBytes = (chunks: readonly Uint8Array[], count: number): Uint8Array => {
  const available = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  const signature = new Uint8Array(Math.min(available, count));
  let signatureOffset = 0;
  for (const chunk of chunks) {
    const remaining = signature.byteLength - signatureOffset;
    if (remaining <= 0) break;
    const bytesToCopy = Math.min(chunk.byteLength, remaining);
    signature.set(chunk.subarray(0, bytesToCopy), signatureOffset);
    signatureOffset += bytesToCopy;
  }
  return signature;
};

const readBoundedAudio = async (
  providerResponse: ProviderResponse,
  operation: ProviderOperation,
  maximumBytes: number,
): Promise<{ readonly chunks: readonly Uint8Array[]; readonly byteLength: number }> => {
  const { response, callerSignal, timeoutSignal, combinedSignal } = providerResponse;
  if (response.body === null) {
    throw new ProviderError(operation, 'invalid-response', response.status);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;
  let completed = false;
  const abortReader = () => {
    void reader.cancel().catch(() => undefined);
  };
  combinedSignal.addEventListener('abort', abortReader, { once: true });

  try {
    if (callerSignal.aborted) throw new ProviderError(operation, 'aborted');
    if (timeoutSignal.aborted) throw new ProviderError(operation, 'timeout');
    while (true) {
      const chunk = await reader.read();
      if (callerSignal.aborted) throw new ProviderError(operation, 'aborted');
      if (timeoutSignal.aborted) throw new ProviderError(operation, 'timeout');
      if (chunk.done) {
        completed = true;
        break;
      }
      if (chunk.value.byteLength === 0) continue;
      byteLength += chunk.value.byteLength;
      if (byteLength > maximumBytes) {
        throw new ProviderError(operation, 'response-too-large', response.status);
      }
      chunks.push(chunk.value.slice());
    }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (callerSignal.aborted) throw new ProviderError(operation, 'aborted');
    if (timeoutSignal.aborted) throw new ProviderError(operation, 'timeout');
    throw new ProviderError(operation, 'invalid-response', response.status);
  } finally {
    combinedSignal.removeEventListener('abort', abortReader);
    if (!completed) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }

  if (byteLength === 0) {
    throw new ProviderError(operation, 'invalid-response', response.status);
  }
  return { chunks, byteLength };
};

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
    voices: z.array(workspaceVoiceSchema).max(PAGE_SIZE_LIMIT),
    has_more: z.boolean(),
    next_page_token: z.string().nullish(),
  })
  .passthrough();

const modelSchema = z
  .object({
    model_id: z.string().trim().min(1).max(200),
    can_do_voice_conversion: z.boolean(),
  })
  .passthrough();

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

const parseContentLength = (
  header: string | null,
): { readonly present: false } | { readonly present: true; readonly value: number | null } => {
  if (header === null) return { present: false };
  if (!/^\d+$/u.test(header)) return { present: true, value: null };
  const value = Number(header);
  return {
    present: true,
    value: Number.isSafeInteger(value) && value >= 0 ? value : null,
  };
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

const audioExtension = (mimeType: VoiceConversionContentType): string => {
  switch (mimeType) {
    case 'audio/aac':
    case 'audio/mp4':
      return 'm4a';
    case 'audio/mpeg':
      return 'mp3';
    case 'audio/ogg':
      return 'ogg';
    case 'audio/wav':
      return 'wav';
    case 'audio/webm':
      return 'webm';
  }
};

const classifyProviderFailure = async (
  response: Response,
  operation: ProviderOperation,
  signal: AbortSignal,
): Promise<ProviderError['reason']> => {
  const fallback: ProviderError['reason'] = response.status === 429 ? 'rate-limit' : 'upstream';
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    return fallback;
  }
  try {
    const parsed = providerFailureSchema.safeParse(
      await readBoundedJson(
        response,
        () => new ProviderError(operation, 'invalid-response', response.status),
        () => new ProviderError(operation, 'response-too-large', response.status),
        signal,
      ),
    );
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
  readonly #audioLimits: ElevenLabsAudioLimits;

  constructor(
    apiKey: string,
    fetchImplementation: typeof fetch = fetch,
    timeoutMs = 30_000,
    audioLimits: ElevenLabsAudioLimits = DEFAULT_AUDIO_LIMITS,
  ) {
    this.#apiKey = apiKey;
    this.#fetch = fetchImplementation;
    this.#timeoutMs = timeoutMs;
    this.#audioLimits = audioLimits;
  }

  async #request(
    path: string,
    operation: ProviderOperation,
    signal: AbortSignal,
    init: RequestInit = {},
  ): Promise<ProviderResponse> {
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
      const reason = await classifyProviderFailure(response, operation, combinedSignal);
      void response.body?.cancel().catch(() => undefined);
      if (signal.aborted) throw new ProviderError(operation, 'aborted');
      if (timeoutSignal.aborted) throw new ProviderError(operation, 'timeout');
      throw new ProviderError(operation, reason, response.status);
    }
    return { response, callerSignal: signal, timeoutSignal, combinedSignal };
  }

  async #json(request: Promise<ProviderResponse>, operation: ProviderOperation): Promise<unknown> {
    const providerResponse = await request;
    const { response } = providerResponse;
    try {
      return await readBoundedJson(
        response,
        (options) =>
          new ProviderError(
            operation,
            'invalid-response',
            options?.upstreamStatus ?? response.status,
          ),
        (options) =>
          new ProviderError(
            operation,
            'response-too-large',
            options?.upstreamStatus ?? response.status,
          ),
        providerResponse.combinedSignal,
      );
    } catch (error) {
      if (providerResponse.callerSignal.aborted) {
        throw new ProviderError(operation, 'aborted');
      }
      if (providerResponse.timeoutSignal.aborted) {
        throw new ProviderError(operation, 'timeout');
      }
      if (error instanceof ProviderError) {
        if (error.reason === 'response-too-large') {
          await response.body?.cancel().catch(() => undefined);
        }
        throw error;
      }
      throw new ProviderError(operation, 'invalid-response', response.status);
    }
  }

  async #audioResponse(
    providerResponse: ProviderResponse,
    operation: ProviderOperation,
    maximumBytes: number,
    previewUrl?: string,
  ): Promise<AudioStream> {
    const { response } = providerResponse;
    const upstreamContentType =
      response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase() ?? '';
    let contentType =
      upstreamContentType === 'application/octet-stream' ? 'audio/mpeg' : upstreamContentType;
    if (response.body === null) {
      throw new ProviderError(operation, 'invalid-response', response.status);
    }

    const acceptsMislabeledPreview =
      operation === 'preview' &&
      upstreamContentType === 'text/plain' &&
      previewUrl !== undefined &&
      hasMp3Path(previewUrl);
    if (acceptsMislabeledPreview) {
      contentType = 'audio/mpeg';
    } else if (!contentType.startsWith('audio/')) {
      void response.body.cancel().catch(() => undefined);
      throw new ProviderError(operation, 'invalid-response', response.status);
    }

    const declaredLength = parseContentLength(response.headers.get('content-length'));
    if (declaredLength.present && declaredLength.value === null) {
      void response.body.cancel().catch(() => undefined);
      throw new ProviderError(operation, 'invalid-response', response.status);
    }
    if (
      declaredLength.present &&
      declaredLength.value !== null &&
      declaredLength.value > maximumBytes
    ) {
      void response.body.cancel().catch(() => undefined);
      throw new ProviderError(operation, 'response-too-large', response.status);
    }

    const audio = await readBoundedAudio(providerResponse, operation, maximumBytes);
    if (
      declaredLength.present &&
      declaredLength.value !== null &&
      declaredLength.value !== audio.byteLength
    ) {
      throw new ProviderError(operation, 'invalid-response', response.status);
    }
    if (contentType === 'audio/mpeg' && !isMp3Signature(firstBytes(audio.chunks, 3))) {
      throw new ProviderError(operation, 'invalid-response', response.status);
    }

    return {
      body: Readable.from(audio.chunks),
      contentType,
      contentLength: audio.byteLength,
    };
  }

  async listModels(signal: AbortSignal): Promise<readonly ElevenLabsModel[]> {
    const data = await this.#json(this.#request('/v1/models', 'models', signal), 'models');
    const parsed = z.array(modelSchema).safeParse(data);
    if (!parsed.success) throw new ProviderError('models', 'invalid-response');
    return parsed.data.map((model) => ({
      modelId: model.model_id,
      canDoVoiceConversion: model.can_do_voice_conversion,
    }));
  }

  async listWorkspaceVoices(
    input: VoiceSearchInput & { readonly nextPageToken: string | null },
  ): Promise<ProviderWorkspaceVoicePage> {
    const url = new URL('/v2/voices', ELEVENLABS_API_ORIGIN);
    url.searchParams.set('page_size', String(input.pageSize));
    url.searchParams.set('include_total_count', 'false');
    url.searchParams.set('voice_type', 'saved');
    if (input.search !== '') url.searchParams.set('search', input.search);
    if (input.nextPageToken !== null) {
      url.searchParams.set('next_page_token', input.nextPageToken);
    }

    const data = await this.#json(
      this.#request(url.pathname + url.search, 'workspace-voices', input.signal),
      'workspace-voices',
    );
    const parsed = workspaceVoicePageSchema.safeParse(data);
    if (!parsed.success || parsed.data.voices.length > input.pageSize) {
      throw new ProviderError('workspace-voices', 'invalid-response');
    }
    return {
      voices: parsed.data.voices.map(normalizeWorkspaceVoice),
      hasMore: parsed.data.has_more,
      nextPageToken: parsed.data.next_page_token?.trim().slice(0, 500) || null,
    };
  }

  async getWorkspaceVoice(voiceId: string, signal: AbortSignal): Promise<ProviderVoice | null> {
    const url = new URL('/v2/voices', ELEVENLABS_API_ORIGIN);
    url.searchParams.set('page_size', '1');
    url.searchParams.set('include_total_count', 'false');
    url.searchParams.set('voice_type', 'saved');
    url.searchParams.set('voice_ids', voiceId);
    const data = await this.#json(
      this.#request(url.pathname + url.search, 'workspace-voice', signal),
      'workspace-voice',
    );
    const parsed = workspaceVoicePageSchema.safeParse(data);
    if (!parsed.success || parsed.data.voices.length > 1) {
      throw new ProviderError('workspace-voice', 'invalid-response');
    }
    const voice = parsed.data.voices.find((candidate) => candidate.voice_id === voiceId);
    return voice === undefined ? null : normalizeWorkspaceVoice(voice);
  }

  async fetchPreview(rawUrl: string, signal: AbortSignal): Promise<AudioStream> {
    if (!isAllowedPreviewUrl(rawUrl)) {
      throw new ProviderError('preview', 'invalid-response');
    }

    const timeoutSignal = AbortSignal.timeout(this.#timeoutMs);
    const combinedSignal = AbortSignal.any([signal, timeoutSignal]);
    let response: Response;
    try {
      response = await this.#fetch(rawUrl, {
        method: 'GET',
        redirect: 'error',
        signal: combinedSignal,
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
    return this.#audioResponse(
      { response, callerSignal: signal, timeoutSignal, combinedSignal },
      'preview',
      this.#audioLimits.previewBytes,
      rawUrl,
    );
  }

  async convertRecording(
    voiceId: string,
    modelId: string,
    audio: Uint8Array,
    mimeType: VoiceConversionContentType,
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
    return this.#audioResponse(response, 'conversion', this.#audioLimits.conversionBytes);
  }
}
