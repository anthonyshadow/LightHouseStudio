import { createReadStream, openAsBlob } from 'node:fs';
import { chmod, mkdtemp, open, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  PAGE_SIZE_LIMIT,
  VOICE_CONVERSION_OUTPUT_MAX_BYTES,
  VOICE_PREVIEW_MAX_BYTES,
  type VoiceConversionContentType,
} from '@studio/contracts';
import { z } from 'zod';
import { ProviderError, type ProviderOperation } from '../provider-error.js';
import {
  authenticatedProviderFetch,
  readBoundedJson,
} from '../transport/bounded-provider-transport.js';
import type { AudioStream } from '../../application/audio-stream.js';
import type {
  ElevenLabsModel,
  ElevenLabsProvider,
  ProviderVoice,
  ProviderSharedVoice,
  ProviderSharedVoicePage,
  ProviderWorkspaceVoicePage,
  SharedVoiceSearchInput,
  VoiceSearchInput,
  VoiceConversionAudio,
} from './types.js';

const ELEVENLABS_API_ORIGIN = 'https://api.elevenlabs.io';
const ALLOWED_PREVIEW_HOSTS = new Set(['storage.googleapis.com']);
const providerIdSchema = z.string().trim().min(1).max(200);
const ELEVENLABS_PROVIDER_PAGE_LIMIT = 100;

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

const readBoundedAudio = async (
  providerResponse: ProviderResponse,
  operation: ProviderOperation,
  maximumBytes: number,
): Promise<{
  readonly path: string;
  readonly signature: Uint8Array;
  readonly byteLength: number;
  readonly cleanup: () => Promise<void>;
}> => {
  const { response, callerSignal, timeoutSignal, combinedSignal } = providerResponse;
  if (response.body === null) {
    throw new ProviderError(operation, 'invalid-response', response.status);
  }
  const reader = response.body.getReader();
  const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-elevenlabs-'));
  const audioPath = path.join(directory, 'audio.bin');
  let handle: Awaited<ReturnType<typeof open>>;
  try {
    await chmod(directory, 0o700);
    handle = await open(audioPath, 'wx', 0o600);
  } catch {
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
    throw new ProviderError(operation, 'invalid-response', response.status);
  }
  const signature = new Uint8Array(3);
  let signatureLength = 0;
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
      if (signatureLength < signature.byteLength) {
        const copied = Math.min(signature.byteLength - signatureLength, chunk.value.byteLength);
        signature.set(chunk.value.subarray(0, copied), signatureLength);
        signatureLength += copied;
      }
      await handle.write(chunk.value);
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
    await handle.close().catch(() => undefined);
    if (!completed) await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }

  if (byteLength === 0) {
    throw new ProviderError(operation, 'invalid-response', response.status);
  }
  return {
    path: audioPath,
    signature: signature.subarray(0, signatureLength),
    byteLength,
    cleanup: () => rm(directory, { recursive: true, force: true }),
  };
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
    is_owner: z.boolean().nullish(),
    is_bookmarked: z.boolean().nullish(),
    sharing: z.object({ public_owner_id: providerIdSchema.nullish() }).passthrough().nullish(),
    verified_languages: z
      .array(
        z
          .object({
            language: z.string().nullish(),
            accent: z.string().nullish(),
          })
          .passthrough(),
      )
      .max(100)
      .nullish(),
  })
  .passthrough();

const workspaceVoicePageSchema = z
  .object({
    voices: z.array(workspaceVoiceSchema).max(ELEVENLABS_PROVIDER_PAGE_LIMIT),
    has_more: z.boolean(),
    next_page_token: z.string().nullish(),
  })
  .passthrough();

const sharedVoiceSchema = z
  .object({
    public_owner_id: providerIdSchema,
    voice_id: providerIdSchema,
    name: z.string().nullish(),
    accent: z.string().nullish(),
    gender: z.string().nullish(),
    age: z.string().nullish(),
    descriptive: z.string().nullish(),
    use_case: z.string().nullish(),
    category: z.string().nullish(),
    free_users_allowed: z.boolean(),
    language: z.string().nullish(),
    description: z.string().nullish(),
    preview_url: z.string().nullish(),
    rate: z.number().finite().nonnegative(),
  })
  .passthrough();

const sharedVoicePageSchema = z
  .object({
    voices: z.array(z.unknown()).max(ELEVENLABS_PROVIDER_PAGE_LIMIT),
    has_more: z.boolean(),
    total_count: z.number().int().nonnegative().default(0),
  })
  .passthrough();

const addedVoiceSchema = z.object({ voice_id: providerIdSchema }).passthrough();
const deletedVoiceSchema = z.object({ status: z.literal('ok') }).passthrough();

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

const normalizedAttribute = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() !== '' ? value.trim().slice(0, 80) : null;

const labelAttribute = (
  labels: Readonly<Record<string, string>>,
  ...keys: readonly string[]
): string | null => {
  for (const key of keys) {
    const value = normalizedAttribute(labels[key]);
    if (value !== null) return value;
  }
  return null;
};

const normalizeWorkspaceVoice = (voice: z.infer<typeof workspaceVoiceSchema>): ProviderVoice => {
  const labels = normalizeLabels(voice.labels);
  const verifiedLanguage = voice.verified_languages?.[0];
  return {
    voiceId: voice.voice_id,
    name: (voice.name?.trim() || 'Untitled voice').slice(0, 100),
    category: voice.category?.trim().slice(0, 100) || null,
    description: voice.description?.trim().slice(0, 500) || null,
    labels,
    previewUrl: voice.preview_url?.trim() || null,
    language: labelAttribute(labels, 'language') ?? normalizedAttribute(verifiedLanguage?.language),
    gender: labelAttribute(labels, 'gender'),
    age: labelAttribute(labels, 'age'),
    accent: labelAttribute(labels, 'accent') ?? normalizedAttribute(verifiedLanguage?.accent),
    useCase: labelAttribute(labels, 'use_case', 'use case', 'useCase'),
    descriptive: labelAttribute(labels, 'descriptive', 'tone', 'style'),
    isOwner: voice.is_owner ?? null,
    isBookmarked: voice.is_bookmarked ?? null,
    publicOwnerId: voice.sharing?.public_owner_id?.trim() || null,
  };
};

const normalizeSharedVoice = (voice: z.infer<typeof sharedVoiceSchema>): ProviderSharedVoice => ({
  publicOwnerId: voice.public_owner_id,
  voiceId: voice.voice_id,
  name: (voice.name?.trim() || 'Untitled voice').slice(0, 100),
  category: voice.category?.trim().slice(0, 100) || null,
  description: voice.description?.trim().slice(0, 500) || null,
  previewUrl: voice.preview_url?.trim() || null,
  language: normalizedAttribute(voice.language),
  gender: normalizedAttribute(voice.gender),
  age: normalizedAttribute(voice.age),
  accent: normalizedAttribute(voice.accent),
  useCase: normalizedAttribute(voice.use_case),
  descriptive: normalizedAttribute(voice.descriptive),
  rate: voice.rate,
  freeUsersAllowed: voice.free_users_allowed,
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
      response = await authenticatedProviderFetch(
        this.#fetch,
        new URL(path, ELEVENLABS_API_ORIGIN),
        {
          ...init,
          headers,
          signal: combinedSignal,
        },
      );
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
      await audio.cleanup().catch(() => undefined);
      throw new ProviderError(operation, 'invalid-response', response.status);
    }
    if (contentType === 'audio/mpeg' && !isMp3Signature(audio.signature)) {
      await audio.cleanup().catch(() => undefined);
      throw new ProviderError(operation, 'invalid-response', response.status);
    }

    const body = createReadStream(audio.path);
    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      void audio.cleanup().catch(() => undefined);
    };
    body.once('close', cleanup);
    return {
      body,
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

  async getWorkspaceVoicesByIds(
    voiceIds: readonly string[],
    signal: AbortSignal,
  ): Promise<readonly ProviderVoice[]> {
    const uniqueIds = [...new Set(voiceIds)].slice(0, PAGE_SIZE_LIMIT);
    if (uniqueIds.length === 0) return [];
    const url = new URL('/v2/voices', ELEVENLABS_API_ORIGIN);
    url.searchParams.set('page_size', String(uniqueIds.length));
    url.searchParams.set('include_total_count', 'false');
    url.searchParams.set('voice_type', 'saved');
    for (const voiceId of uniqueIds) url.searchParams.append('voice_ids', voiceId);
    const data = await this.#json(
      this.#request(url.pathname + url.search, 'workspace-voices', signal),
      'workspace-voices',
    );
    const parsed = workspaceVoicePageSchema.safeParse(data);
    if (!parsed.success || parsed.data.voices.length > uniqueIds.length) {
      throw new ProviderError('workspace-voices', 'invalid-response');
    }
    const allowed = new Set(uniqueIds);
    return parsed.data.voices
      .filter((voice) => allowed.has(voice.voice_id))
      .map(normalizeWorkspaceVoice);
  }

  async listSharedVoices(input: SharedVoiceSearchInput): Promise<ProviderSharedVoicePage> {
    const url = new URL('/v1/shared-voices', ELEVENLABS_API_ORIGIN);
    url.searchParams.set('page_size', String(input.pageSize));
    url.searchParams.set('page', String(input.page));
    url.searchParams.set('sort', input.sort);
    url.searchParams.set('include_custom_rates', 'false');
    if (input.search !== '') url.searchParams.set('search', input.search);
    if (input.language !== '') url.searchParams.set('language', input.language);
    if (input.gender !== '') url.searchParams.set('gender', input.gender);
    if (input.age !== '') url.searchParams.set('age', input.age);
    if (input.accent !== '') url.searchParams.set('accent', input.accent);
    if (input.useCase !== '') url.searchParams.append('use_cases', input.useCase);
    if (input.descriptive !== '') {
      url.searchParams.append('descriptives', input.descriptive);
    }

    const data = await this.#json(
      this.#request(url.pathname + url.search, 'shared-voices', input.signal),
      'shared-voices',
    );
    const parsed = sharedVoicePageSchema.safeParse(data);
    if (!parsed.success || parsed.data.voices.length > input.pageSize) {
      throw new ProviderError('shared-voices', 'invalid-response');
    }
    const voices = parsed.data.voices.flatMap((candidate) => {
      const voice = sharedVoiceSchema.safeParse(candidate);
      return voice.success ? [normalizeSharedVoice(voice.data)] : [];
    });
    return {
      voices,
      hasMore: parsed.data.has_more,
      total: parsed.data.total_count,
    };
  }

  async getSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    signal: AbortSignal,
  ): Promise<ProviderSharedVoice | null> {
    const url = new URL('/v1/shared-voices', ELEVENLABS_API_ORIGIN);
    url.searchParams.set('page_size', String(PAGE_SIZE_LIMIT));
    url.searchParams.set('page', '0');
    url.searchParams.set('owner_id', publicOwnerId);
    url.searchParams.set('search', voiceId);
    url.searchParams.set('include_custom_rates', 'false');
    const data = await this.#json(
      this.#request(url.pathname + url.search, 'shared-voice', signal),
      'shared-voice',
    );
    const parsed = sharedVoicePageSchema.safeParse(data);
    if (!parsed.success || parsed.data.voices.length > PAGE_SIZE_LIMIT) {
      throw new ProviderError('shared-voice', 'invalid-response');
    }
    for (const candidate of parsed.data.voices) {
      const parsedVoice = sharedVoiceSchema.safeParse(candidate);
      if (
        parsedVoice.success &&
        parsedVoice.data.public_owner_id === publicOwnerId &&
        parsedVoice.data.voice_id === voiceId
      ) {
        return normalizeSharedVoice(parsedVoice.data);
      }
    }
    return null;
  }

  async addSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    name: string,
    signal: AbortSignal,
  ): Promise<string> {
    const path = `/v1/voices/add/${encodeURIComponent(publicOwnerId)}/${encodeURIComponent(voiceId)}`;
    const data = await this.#json(
      this.#request(path, 'add-shared-voice', signal, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_name: name, bookmarked: true }),
      }),
      'add-shared-voice',
    );
    const parsed = addedVoiceSchema.safeParse(data);
    if (!parsed.success) throw new ProviderError('add-shared-voice', 'invalid-response');
    return parsed.data.voice_id;
  }

  async deleteWorkspaceVoice(voiceId: string, signal: AbortSignal): Promise<void> {
    const data = await this.#json(
      this.#request(`/v1/voices/${encodeURIComponent(voiceId)}`, 'delete-workspace-voice', signal, {
        method: 'DELETE',
      }),
      'delete-workspace-voice',
    );
    const parsed = deletedVoiceSchema.safeParse(data);
    if (!parsed.success) throw new ProviderError('delete-workspace-voice', 'invalid-response');
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
    audio: VoiceConversionAudio,
    mimeType: VoiceConversionContentType,
    enableLogging: boolean,
    signal: AbortSignal,
  ): Promise<AudioStream> {
    const form = new FormData();
    const audioBlob =
      audio instanceof Uint8Array
        ? new Blob([audio.slice()], { type: mimeType })
        : await openAsBlob(audio.path, { type: mimeType });
    form.append('audio', audioBlob, `recording.${audioExtension(mimeType)}`);
    form.append('model_id', modelId);

    const path = `/v1/speech-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128&enable_logging=${String(enableLogging)}`;
    const response = await this.#request(path, 'conversion', signal, {
      method: 'POST',
      body: form,
    });
    return this.#audioResponse(response, 'conversion', this.#audioLimits.conversionBytes);
  }
}
