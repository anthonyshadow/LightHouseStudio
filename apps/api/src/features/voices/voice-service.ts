import { createHash } from 'node:crypto';
import type {
  SharedVoiceSummary,
  SharedVoicesQuery,
  SharedVoicesResponse,
  VoiceConversionContentType,
  VoiceLibraryMutationResponse,
  VoiceTraits,
  WorkspaceVoiceSummary,
  WorkspaceVoicesResponse,
} from '@studio/contracts';
import type { AudioStream } from '../../application/audio-stream.js';
import { createSharedOperation, type SharedOperation } from '../../application/shared-operation.js';
import type {
  ElevenLabsModel,
  ElevenLabsProvider,
  ProviderSharedVoice,
  ProviderSharedVoicePage,
  ProviderVoice,
  ProviderWorkspaceVoicePage,
  VoiceConversionAudio,
  VoiceFilters,
} from '../../providers/elevenlabs/types.js';
import { ProviderError } from '../../providers/provider-error.js';
import { VoiceServiceError } from './voice-service-error.js';

export const VOICE_MODEL_CACHE_TTL_MS = 30_000;
export const SHARED_VOICE_CACHE_TTL_MS = 5 * 60_000;
export const WORKSPACE_VOICE_CACHE_TTL_MS = 60_000;
const SHARED_VOICE_CACHE_LIMIT = 60;
const WORKSPACE_VOICE_CACHE_LIMIT = 40;
const MAX_SAVED_PROVIDER_PAGES_PER_REQUEST = 25;

class BoundedTtlCache<Value> {
  readonly #maximumEntries: number;
  readonly #entries = new Map<string, { readonly value: Value; readonly expiresAt: number }>();

  constructor(maximumEntries: number) {
    this.#maximumEntries = maximumEntries;
  }

  get(key: string): Value | null {
    const entry = this.#entries.get(key);
    if (entry === undefined) return null;
    if (entry.expiresAt <= Date.now()) {
      this.#entries.delete(key);
      return null;
    }
    this.#entries.delete(key);
    this.#entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: Value, ttlMs: number): void {
    this.#entries.delete(key);
    this.#entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.#entries.size > this.#maximumEntries) {
      const oldest = this.#entries.keys().next().value;
      if (oldest === undefined) break;
      this.#entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.#entries.delete(key);
  }

  clear(): void {
    this.#entries.clear();
  }
}

const runParallel = async <Left, Right>(
  callerSignal: AbortSignal,
  left: (signal: AbortSignal) => Promise<Left>,
  right: (signal: AbortSignal) => Promise<Right>,
): Promise<readonly [Left, Right]> => {
  const siblingController = new AbortController();
  const signal = AbortSignal.any([callerSignal, siblingController.signal]);
  try {
    return await Promise.all([left(signal), right(signal)]);
  } catch (error) {
    siblingController.abort('parallel-sibling-failed');
    throw error;
  }
};

const traitsForVoice = (
  voice: Pick<
    ProviderVoice | ProviderSharedVoice,
    'language' | 'gender' | 'age' | 'accent' | 'useCase' | 'descriptive'
  >,
): VoiceTraits => ({
  language: voice.language,
  gender: voice.gender,
  age: voice.age,
  accent: voice.accent,
  useCase: voice.useCase,
  descriptive: voice.descriptive,
});

const removableWorkspaceVoice = (voice: ProviderVoice): boolean =>
  voice.isBookmarked === true && voice.isOwner === false && voice.publicOwnerId !== null;

const summarizeWorkspaceVoice = (voice: ProviderVoice): WorkspaceVoiceSummary => ({
  voiceId: voice.voiceId,
  name: voice.name,
  category: voice.category,
  description: voice.description,
  labels: voice.labels,
  traits: traitsForVoice(voice),
  previewAvailable: voice.previewUrl !== null,
  removable: removableWorkspaceVoice(voice),
});

const sharedLabels = (voice: ProviderSharedVoice): Readonly<Record<string, string>> =>
  Object.fromEntries(
    [
      ['language', voice.language],
      ['gender', voice.gender],
      ['age', voice.age],
      ['accent', voice.accent],
      ['use_case', voice.useCase],
      ['descriptive', voice.descriptive],
    ].filter((entry): entry is [string, string] => entry[1] !== null),
  );

const summarizeSharedVoice = (voice: ProviderSharedVoice, saved: boolean): SharedVoiceSummary => ({
  publicOwnerId: voice.publicOwnerId,
  voiceId: voice.voiceId,
  name: voice.name,
  category: voice.category,
  description: voice.description,
  labels: sharedLabels(voice),
  traits: traitsForVoice(voice),
  previewAvailable: voice.previewUrl !== null,
  saved,
});

const eligibleSharedVoice = (voice: ProviderSharedVoice): boolean =>
  voice.rate === 1 && voice.freeUsersAllowed === true;

const comparable = (value: string): string =>
  value
    .trim()
    .toLocaleLowerCase()
    .replaceAll(/[-_\s]+/gu, ' ');

const matchesAttribute = (candidate: string | null, filter: string): boolean =>
  filter === '' || (candidate !== null && comparable(candidate) === comparable(filter));

const matchesFilters = (voice: ProviderVoice, filters: VoiceFilters): boolean =>
  matchesAttribute(voice.language, filters.language) &&
  matchesAttribute(voice.gender, filters.gender) &&
  matchesAttribute(voice.age, filters.age) &&
  matchesAttribute(voice.accent, filters.accent) &&
  matchesAttribute(voice.useCase, filters.useCase) &&
  matchesAttribute(voice.descriptive, filters.descriptive);

type SavedCursor = Readonly<{
  version: 1;
  providerToken: string | null;
  offset: number;
  criteria: string;
}>;

const filterCriteria = (filters: VoiceFilters): string =>
  createHash('sha256').update(JSON.stringify(filters)).digest('base64url').slice(0, 20);

const encodeSavedCursor = (cursor: SavedCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');

const decodeSavedCursor = (token: string | null, filters: VoiceFilters): SavedCursor => {
  const criteria = filterCriteria(filters);
  if (token === null) return { version: 1, providerToken: null, offset: 0, criteria };
  try {
    const value = JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as unknown;
    if (
      typeof value === 'object' &&
      value !== null &&
      'version' in value &&
      value.version === 1 &&
      'providerToken' in value &&
      (value.providerToken === null ||
        (typeof value.providerToken === 'string' && value.providerToken.length <= 500)) &&
      'offset' in value &&
      Number.isInteger(value.offset) &&
      typeof value.offset === 'number' &&
      value.offset >= 0 &&
      value.offset <= 20 &&
      'criteria' in value &&
      value.criteria === criteria
    ) {
      return value as SavedCursor;
    }
  } catch {
    // Invalid or stale application cursors are handled as an app-owned validation failure.
  }
  throw new VoiceServiceError('invalid-page-token');
};

type WorkspaceListInput = VoiceFilters &
  Readonly<{
    pageSize: number;
    nextPageToken: string | null;
    refresh: boolean;
    signal: AbortSignal;
  }>;

type SharedListInput = VoiceFilters &
  Readonly<{
    pageSize: number;
    page: number;
    sort: SharedVoicesQuery['sort'];
    refresh: boolean;
    signal: AbortSignal;
  }>;

export class VoiceService {
  readonly #provider: ElevenLabsProvider;
  readonly #modelId: string;
  readonly #enableLogging: boolean;
  readonly #workspacePageCache = new BoundedTtlCache<ProviderWorkspaceVoicePage>(
    WORKSPACE_VOICE_CACHE_LIMIT,
  );
  readonly #sharedPageCache = new BoundedTtlCache<ProviderSharedVoicePage>(
    SHARED_VOICE_CACHE_LIMIT,
  );
  readonly #sharedVoiceCache = new BoundedTtlCache<ProviderSharedVoice>(SHARED_VOICE_CACHE_LIMIT);
  readonly #membershipCache = new BoundedTtlCache<boolean>(WORKSPACE_VOICE_CACHE_LIMIT);
  readonly #workspacePageOperations = new Map<
    string,
    SharedOperation<ProviderWorkspaceVoicePage>
  >();
  readonly #sharedPageOperations = new Map<string, SharedOperation<ProviderSharedVoicePage>>();
  readonly #membershipOperations = new Map<string, SharedOperation<readonly ProviderVoice[]>>();
  readonly #sharedVoiceOperations = new Map<string, SharedOperation<ProviderSharedVoice | null>>();
  readonly #addOperations = new Map<string, SharedOperation<VoiceLibraryMutationResponse>>();
  readonly #removeOperations = new Map<string, SharedOperation<VoiceLibraryMutationResponse>>();
  #cachedConversionModel: { readonly model: ElevenLabsModel; readonly expiresAt: number } | null =
    null;
  #activeConversionModel: SharedOperation<ElevenLabsModel> | null = null;

  constructor(provider: ElevenLabsProvider, modelId: string, enableLogging: boolean) {
    this.#provider = provider;
    this.#modelId = modelId;
    this.#enableLogging = enableLogging;
  }

  async #conversionModel(signal: AbortSignal): Promise<ElevenLabsModel> {
    const cached = this.#cachedConversionModel;
    if (cached && cached.expiresAt > Date.now()) return cached.model;
    const active = this.#activeConversionModel;
    if (active?.acceptingSubscribers) {
      return active.subscribe(signal, () => new ProviderError('models', 'aborted'));
    }

    const operation = createSharedOperation(async (operationSignal) => {
      const models = await this.#provider.listModels(operationSignal);
      const model = models.find((candidate) => candidate.modelId === this.#modelId);
      if (model === undefined) throw new VoiceServiceError('configured-model-unavailable');
      if (!model.canDoVoiceConversion) {
        throw new VoiceServiceError('configured-model-incompatible');
      }
      return model;
    });
    this.#activeConversionModel = operation;
    const release = (): void => {
      if (this.#activeConversionModel === operation) this.#activeConversionModel = null;
    };
    void operation.result.then((model) => {
      this.#cachedConversionModel = {
        model,
        expiresAt: Date.now() + VOICE_MODEL_CACHE_TTL_MS,
      };
      release();
    }, release);
    return operation.subscribe(signal, () => new ProviderError('models', 'aborted'));
  }

  #requireLibraryVoice(voice: ProviderVoice | null): ProviderVoice {
    if (voice === null) throw new VoiceServiceError('library-voice-not-found');
    return voice;
  }

  async #workspacePage(
    filters: VoiceFilters,
    providerToken: string | null,
    refresh: boolean,
    signal: AbortSignal,
  ): Promise<ProviderWorkspaceVoicePage> {
    const key = JSON.stringify({ search: filters.search, providerToken });
    if (!refresh) {
      const cached = this.#workspacePageCache.get(key);
      if (cached !== null) return cached;
    }
    const active = this.#workspacePageOperations.get(key);
    if (active?.acceptingSubscribers) {
      return active.subscribe(signal, () => new ProviderError('workspace-voices', 'aborted'));
    }
    const operation = createSharedOperation((operationSignal) =>
      this.#provider.listWorkspaceVoices({
        ...filters,
        pageSize: 20,
        nextPageToken: providerToken,
        signal: operationSignal,
      }),
    );
    this.#workspacePageOperations.set(key, operation);
    const release = (): void => {
      if (this.#workspacePageOperations.get(key) === operation) {
        this.#workspacePageOperations.delete(key);
      }
    };
    void operation.result.then((page) => {
      this.#workspacePageCache.set(key, page, WORKSPACE_VOICE_CACHE_TTL_MS);
      release();
    }, release);
    return operation.subscribe(signal, () => new ProviderError('workspace-voices', 'aborted'));
  }

  async listWorkspaceVoices(input: WorkspaceListInput): Promise<WorkspaceVoicesResponse> {
    if (input.refresh) this.#workspacePageCache.clear();
    const filters: VoiceFilters = {
      search: input.search,
      language: input.language,
      gender: input.gender,
      age: input.age,
      accent: input.accent,
      useCase: input.useCase,
      descriptive: input.descriptive,
    };
    const cursor = decodeSavedCursor(input.nextPageToken, filters);
    let providerToken = cursor.providerToken;
    let offset = cursor.offset;
    const voices: WorkspaceVoiceSummary[] = [];
    let nextPageToken: string | null = null;
    let hasMore = false;

    for (let scanned = 0; scanned < MAX_SAVED_PROVIDER_PAGES_PER_REQUEST; scanned += 1) {
      const page = await this.#workspacePage(filters, providerToken, input.refresh, input.signal);
      for (let index = offset; index < page.voices.length; index += 1) {
        const voice = page.voices[index];
        if (voice === undefined || !matchesFilters(voice, filters)) continue;
        voices.push(summarizeWorkspaceVoice(voice));
        if (voices.length === input.pageSize) {
          if (index + 1 < page.voices.length) {
            nextPageToken = encodeSavedCursor({
              version: 1,
              providerToken,
              offset: index + 1,
              criteria: cursor.criteria,
            });
            hasMore = true;
          } else if (page.hasMore && page.nextPageToken !== null) {
            nextPageToken = encodeSavedCursor({
              version: 1,
              providerToken: page.nextPageToken,
              offset: 0,
              criteria: cursor.criteria,
            });
            hasMore = true;
          }
          return { voices, hasMore, nextPageToken, total: null };
        }
      }

      offset = 0;
      if (!page.hasMore || page.nextPageToken === null) {
        return { voices, hasMore: false, nextPageToken: null, total: null };
      }
      providerToken = page.nextPageToken;
    }

    nextPageToken = encodeSavedCursor({
      version: 1,
      providerToken,
      offset: 0,
      criteria: cursor.criteria,
    });
    return { voices, hasMore: true, nextPageToken, total: null };
  }

  async #sharedPage(input: SharedListInput): Promise<ProviderSharedVoicePage> {
    const key = JSON.stringify({
      search: input.search,
      language: input.language,
      gender: input.gender,
      age: input.age,
      accent: input.accent,
      useCase: input.useCase,
      descriptive: input.descriptive,
      pageSize: input.pageSize,
      page: input.page,
      sort: input.sort,
    });
    if (!input.refresh) {
      const cached = this.#sharedPageCache.get(key);
      if (cached !== null) return cached;
    }
    const active = this.#sharedPageOperations.get(key);
    if (active?.acceptingSubscribers) {
      return active.subscribe(input.signal, () => new ProviderError('shared-voices', 'aborted'));
    }
    const operation = createSharedOperation((signal) =>
      this.#provider.listSharedVoices({
        search: input.search,
        language: input.language,
        gender: input.gender,
        age: input.age,
        accent: input.accent,
        useCase: input.useCase,
        descriptive: input.descriptive,
        pageSize: input.pageSize,
        page: input.page,
        sort: input.sort,
        signal,
      }),
    );
    this.#sharedPageOperations.set(key, operation);
    const release = (): void => {
      if (this.#sharedPageOperations.get(key) === operation) {
        this.#sharedPageOperations.delete(key);
      }
    };
    void operation.result.then((page) => {
      this.#sharedPageCache.set(key, page, SHARED_VOICE_CACHE_TTL_MS);
      release();
    }, release);
    return operation.subscribe(input.signal, () => new ProviderError('shared-voices', 'aborted'));
  }

  async #savedVoiceIds(
    voiceIds: readonly string[],
    refresh: boolean,
    signal: AbortSignal,
  ): Promise<ReadonlySet<string>> {
    const saved = new Set<string>();
    const missing: string[] = [];
    for (const voiceId of voiceIds) {
      const cached = refresh ? null : this.#membershipCache.get(voiceId);
      if (cached === true) saved.add(voiceId);
      if (cached === null) missing.push(voiceId);
    }
    if (missing.length === 0) return saved;

    const key = [...missing].sort().join('|');
    let operation = this.#membershipOperations.get(key);
    if (!operation?.acceptingSubscribers) {
      operation = createSharedOperation((operationSignal) =>
        this.#provider.getWorkspaceVoicesByIds(missing, operationSignal),
      );
      this.#membershipOperations.set(key, operation);
      const current = operation;
      const release = (): void => {
        if (this.#membershipOperations.get(key) === current) {
          this.#membershipOperations.delete(key);
        }
      };
      void current.result.then((workspaceVoices) => {
        const found = new Set(workspaceVoices.map((voice) => voice.voiceId));
        for (const voiceId of missing) {
          this.#membershipCache.set(voiceId, found.has(voiceId), WORKSPACE_VOICE_CACHE_TTL_MS);
        }
        release();
      }, release);
    }
    const workspaceVoices = await operation.subscribe(
      signal,
      () => new ProviderError('workspace-voices', 'aborted'),
    );
    for (const voice of workspaceVoices) saved.add(voice.voiceId);
    return saved;
  }

  async listSharedVoices(input: SharedListInput): Promise<SharedVoicesResponse> {
    const page = await this.#sharedPage(input);
    const eligible = page.voices.filter(eligibleSharedVoice).slice(0, input.pageSize);
    const savedIds = await this.#savedVoiceIds(
      eligible.map((voice) => voice.voiceId),
      input.refresh,
      input.signal,
    );
    return {
      voices: eligible.map((voice) => summarizeSharedVoice(voice, savedIds.has(voice.voiceId))),
      hasMore: page.hasMore,
      page: input.page,
      total: eligible.length === page.voices.length ? page.total : null,
    };
  }

  async #sharedVoice(
    publicOwnerId: string,
    voiceId: string,
    refresh: boolean,
    signal: AbortSignal,
  ): Promise<ProviderSharedVoice | null> {
    const key = `${publicOwnerId}:${voiceId}`;
    if (!refresh) {
      const cached = this.#sharedVoiceCache.get(key);
      if (cached !== null) return cached;
    }
    const active = this.#sharedVoiceOperations.get(key);
    if (active?.acceptingSubscribers) {
      return active.subscribe(signal, () => new ProviderError('shared-voice', 'aborted'));
    }
    const operation = createSharedOperation((operationSignal) =>
      this.#provider.getSharedVoice(publicOwnerId, voiceId, operationSignal),
    );
    this.#sharedVoiceOperations.set(key, operation);
    const release = (): void => {
      if (this.#sharedVoiceOperations.get(key) === operation) {
        this.#sharedVoiceOperations.delete(key);
      }
    };
    void operation.result.then((voice) => {
      if (voice !== null) this.#sharedVoiceCache.set(key, voice, SHARED_VOICE_CACHE_TTL_MS);
      release();
    }, release);
    return operation.subscribe(signal, () => new ProviderError('shared-voice', 'aborted'));
  }

  async workspacePreview(voiceId: string, signal: AbortSignal): Promise<AudioStream> {
    const voice = this.#requireLibraryVoice(
      await this.#provider.getWorkspaceVoice(voiceId, signal),
    );
    if (voice.previewUrl === null) throw new VoiceServiceError('preview-unavailable');
    return this.#provider.fetchPreview(voice.previewUrl, signal);
  }

  async sharedPreview(
    publicOwnerId: string,
    voiceId: string,
    signal: AbortSignal,
  ): Promise<AudioStream> {
    const voice = await this.#sharedVoice(publicOwnerId, voiceId, false, signal);
    if (voice === null) throw new VoiceServiceError('shared-voice-not-found');
    if (!eligibleSharedVoice(voice)) throw new VoiceServiceError('shared-voice-ineligible');
    if (voice.previewUrl === null) throw new VoiceServiceError('preview-unavailable');
    return this.#provider.fetchPreview(voice.previewUrl, signal);
  }

  #invalidateWorkspaceMembership(voiceId: string, saved: boolean): void {
    this.#workspacePageCache.clear();
    this.#membershipCache.set(voiceId, saved, WORKSPACE_VOICE_CACHE_TTL_MS);
  }

  async saveSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    signal: AbortSignal,
  ): Promise<VoiceLibraryMutationResponse> {
    const key = `${publicOwnerId}:${voiceId}`;
    const active = this.#addOperations.get(key);
    if (active?.acceptingSubscribers) {
      return active.subscribe(signal, () => new ProviderError('add-shared-voice', 'aborted'));
    }
    const operation = createSharedOperation(async (operationSignal) => {
      const existing = await this.#provider.getWorkspaceVoice(voiceId, operationSignal);
      if (existing !== null) {
        this.#invalidateWorkspaceMembership(voiceId, true);
        return { status: 'already-saved' as const, voiceId };
      }
      const voice = await this.#sharedVoice(publicOwnerId, voiceId, true, operationSignal);
      if (voice === null) throw new VoiceServiceError('shared-voice-not-found');
      if (!eligibleSharedVoice(voice)) throw new VoiceServiceError('shared-voice-ineligible');
      try {
        const savedVoiceId = await this.#provider.addSharedVoice(
          publicOwnerId,
          voiceId,
          voice.name,
          operationSignal,
        );
        this.#invalidateWorkspaceMembership(savedVoiceId, true);
        return { status: 'saved' as const, voiceId: savedVoiceId };
      } catch (error) {
        if (error instanceof ProviderError && error.upstreamStatus === 409) {
          const nowSaved = await this.#provider.getWorkspaceVoice(voiceId, operationSignal);
          if (nowSaved !== null) {
            this.#invalidateWorkspaceMembership(voiceId, true);
            return { status: 'already-saved' as const, voiceId };
          }
        }
        throw error;
      }
    });
    this.#addOperations.set(key, operation);
    const release = (): void => {
      if (this.#addOperations.get(key) === operation) this.#addOperations.delete(key);
    };
    void operation.result.then(release, release);
    return operation.subscribe(signal, () => new ProviderError('add-shared-voice', 'aborted'));
  }

  async removeWorkspaceVoice(
    voiceId: string,
    signal: AbortSignal,
  ): Promise<VoiceLibraryMutationResponse> {
    const active = this.#removeOperations.get(voiceId);
    if (active?.acceptingSubscribers) {
      return active.subscribe(signal, () => new ProviderError('delete-workspace-voice', 'aborted'));
    }
    const operation = createSharedOperation(async (operationSignal) => {
      const voice = await this.#provider.getWorkspaceVoice(voiceId, operationSignal);
      if (voice === null) {
        this.#invalidateWorkspaceMembership(voiceId, false);
        return { status: 'already-removed' as const, voiceId };
      }
      if (!removableWorkspaceVoice(voice)) {
        throw new VoiceServiceError('voice-removal-not-allowed');
      }
      await this.#provider.deleteWorkspaceVoice(voiceId, operationSignal);
      this.#invalidateWorkspaceMembership(voiceId, false);
      return { status: 'removed' as const, voiceId };
    });
    this.#removeOperations.set(voiceId, operation);
    const release = (): void => {
      if (this.#removeOperations.get(voiceId) === operation) {
        this.#removeOperations.delete(voiceId);
      }
    };
    void operation.result.then(release, release);
    return operation.subscribe(
      signal,
      () => new ProviderError('delete-workspace-voice', 'aborted'),
    );
  }

  async convertRecording(input: {
    readonly voiceId: string;
    readonly audio: VoiceConversionAudio;
    readonly mimeType: VoiceConversionContentType;
    readonly signal: AbortSignal;
  }): Promise<AudioStream> {
    const [candidate, model] = await runParallel(
      input.signal,
      (signal) => this.#provider.getWorkspaceVoice(input.voiceId, signal),
      (signal) => this.#conversionModel(signal),
    );
    this.#requireLibraryVoice(candidate);
    try {
      return await this.#provider.convertRecording(
        input.voiceId,
        model.modelId,
        input.audio,
        input.mimeType,
        this.#enableLogging,
        input.signal,
      );
    } catch (error) {
      if (
        !this.#enableLogging &&
        error instanceof ProviderError &&
        error.operation === 'conversion' &&
        error.reason === 'zero-retention-unavailable'
      ) {
        throw new VoiceServiceError('zero-retention-required', error.upstreamStatus);
      }
      throw error;
    }
  }
}
