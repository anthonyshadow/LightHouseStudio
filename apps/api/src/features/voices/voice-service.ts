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
import { MemorySavedVoiceRepository, type SavedVoiceRepository } from './saved-voice-repository.js';

export const VOICE_MODEL_CACHE_TTL_MS = 30_000;
export const SHARED_VOICE_CACHE_TTL_MS = 5 * 60_000;
export const WORKSPACE_VOICE_CACHE_TTL_MS = 60_000;
const SHARED_VOICE_CACHE_LIMIT = 60;
const WORKSPACE_VOICE_CACHE_LIMIT = 40;
const MAX_SAVED_PROVIDER_PAGES_PER_REQUEST = 25;
const DEFAULT_TEST_OWNER_USER_ID = '2d7914b2-f912-4b96-b17d-54100a2ffea3';

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

const summarizeWorkspaceVoice = (voice: ProviderVoice): WorkspaceVoiceSummary => ({
  voiceId: voice.voiceId,
  name: voice.name,
  category: voice.category,
  description: voice.description,
  labels: voice.labels,
  traits: traitsForVoice(voice),
  previewAvailable: voice.previewUrl !== null,
  removable: true,
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
    ownerUserId?: string;
  }>;

type SharedListInput = VoiceFilters &
  Readonly<{
    pageSize: number;
    page: number;
    sort: SharedVoicesQuery['sort'];
    refresh: boolean;
    signal: AbortSignal;
    ownerUserId?: string;
  }>;

export class VoiceService {
  readonly #provider: ElevenLabsProvider;
  readonly #modelId: string;
  readonly #enableLogging: boolean;
  readonly #savedVoices: SavedVoiceRepository;
  readonly #workspacePageCache = new BoundedTtlCache<ProviderWorkspaceVoicePage>(
    WORKSPACE_VOICE_CACHE_LIMIT,
  );
  readonly #sharedPageCache = new BoundedTtlCache<ProviderSharedVoicePage>(
    SHARED_VOICE_CACHE_LIMIT,
  );
  readonly #sharedVoiceCache = new BoundedTtlCache<ProviderSharedVoice>(SHARED_VOICE_CACHE_LIMIT);
  readonly #workspacePageOperations = new Map<
    string,
    SharedOperation<ProviderWorkspaceVoicePage>
  >();
  readonly #sharedPageOperations = new Map<string, SharedOperation<ProviderSharedVoicePage>>();
  readonly #sharedVoiceOperations = new Map<string, SharedOperation<ProviderSharedVoice | null>>();
  readonly #migrationOperations = new Map<string, SharedOperation<void>>();
  readonly #addOperations = new Map<string, SharedOperation<VoiceLibraryMutationResponse>>();
  readonly #removeOperations = new Map<string, SharedOperation<VoiceLibraryMutationResponse>>();
  #cachedConversionModel: { readonly model: ElevenLabsModel; readonly expiresAt: number } | null =
    null;
  #activeConversionModel: SharedOperation<ElevenLabsModel> | null = null;

  constructor(
    provider: ElevenLabsProvider,
    modelId: string,
    enableLogging: boolean,
    savedVoices: SavedVoiceRepository = new MemorySavedVoiceRepository(),
  ) {
    this.#provider = provider;
    this.#modelId = modelId;
    this.#enableLogging = enableLogging;
    this.#savedVoices = savedVoices;
  }

  async #ensureSavedVoiceMigration(ownerUserId: string, signal: AbortSignal): Promise<void> {
    if (await this.#savedVoices.migrated(ownerUserId)) return;
    const active = this.#migrationOperations.get(ownerUserId);
    if (active?.acceptingSubscribers) {
      return active.subscribe(signal, () => new ProviderError('workspace-voices', 'aborted'));
    }
    const operation = createSharedOperation(async (operationSignal) => {
      if (await this.#savedVoices.migrated(ownerUserId)) return;
      const voices: ProviderVoice[] = [];
      let nextPageToken: string | null = null;
      for (let pageNumber = 0; pageNumber < MAX_SAVED_PROVIDER_PAGES_PER_REQUEST; pageNumber += 1) {
        const page = await this.#provider.listWorkspaceVoices({
          search: '',
          language: '',
          gender: '',
          age: '',
          accent: '',
          useCase: '',
          descriptive: '',
          pageSize: 20,
          nextPageToken,
          signal: operationSignal,
        });
        voices.push(...page.voices);
        if (!page.hasMore || page.nextPageToken === null) break;
        nextPageToken = page.nextPageToken;
      }
      await this.#savedVoices.completeMigration(
        ownerUserId,
        voices.map((voice) => ({ voiceId: voice.voiceId, publicOwnerId: voice.publicOwnerId })),
        new Date().toISOString(),
      );
    });
    this.#migrationOperations.set(ownerUserId, operation);
    const release = (): void => {
      if (this.#migrationOperations.get(ownerUserId) === operation) {
        this.#migrationOperations.delete(ownerUserId);
      }
    };
    void operation.result.then(release, release);
    return operation.subscribe(signal, () => new ProviderError('workspace-voices', 'aborted'));
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
    const key = JSON.stringify({ filters, providerToken });
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
    const ownerUserId = input.ownerUserId ?? DEFAULT_TEST_OWNER_USER_ID;
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
    await this.#ensureSavedVoiceMigration(ownerUserId, input.signal);
    const savedVoiceIds = new Set(
      (await this.#savedVoices.list(ownerUserId)).map((record) => record.providerVoiceId),
    );
    if (input.refresh) this.#workspacePageCache.clear();
    let providerToken = cursor.providerToken;
    let offset = cursor.offset;
    const voices: WorkspaceVoiceSummary[] = [];
    let nextPageToken: string | null = null;
    let hasMore = false;

    for (let scanned = 0; scanned < MAX_SAVED_PROVIDER_PAGES_PER_REQUEST; scanned += 1) {
      const page = await this.#workspacePage(filters, providerToken, input.refresh, input.signal);
      for (let index = offset; index < page.voices.length; index += 1) {
        const voice = page.voices[index];
        if (
          voice === undefined ||
          !savedVoiceIds.has(voice.voiceId) ||
          !matchesFilters(voice, filters)
        )
          continue;
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
    ownerUserId: string,
    voiceIds: readonly string[],
    refresh: boolean,
    signal: AbortSignal,
  ): Promise<ReadonlySet<string>> {
    void refresh;
    if (signal.aborted) throw new ProviderError('workspace-voices', 'aborted');
    return this.#savedVoices.savedIds(ownerUserId, voiceIds);
  }

  async listSharedVoices(input: SharedListInput): Promise<SharedVoicesResponse> {
    const page = await this.#sharedPage(input);
    const eligible = page.voices.filter(eligibleSharedVoice).slice(0, input.pageSize);
    const savedIds = await this.#savedVoiceIds(
      input.ownerUserId ?? DEFAULT_TEST_OWNER_USER_ID,
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

  async workspacePreview(
    voiceId: string,
    signal: AbortSignal,
    ownerUserId = DEFAULT_TEST_OWNER_USER_ID,
  ): Promise<AudioStream> {
    await this.#ensureSavedVoiceMigration(ownerUserId, signal);
    if (!(await this.#savedVoices.has(ownerUserId, voiceId))) {
      throw new VoiceServiceError('library-voice-not-found');
    }
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

  #invalidateWorkspaceMembership(): void {
    this.#workspacePageCache.clear();
  }

  async saveSharedVoice(
    publicOwnerId: string,
    voiceId: string,
    signal: AbortSignal,
    ownerUserId = DEFAULT_TEST_OWNER_USER_ID,
  ): Promise<VoiceLibraryMutationResponse> {
    const key = `${ownerUserId}:${publicOwnerId}:${voiceId}`;
    const active = this.#addOperations.get(key);
    if (active?.acceptingSubscribers) {
      return active.subscribe(signal, () => new ProviderError('add-shared-voice', 'aborted'));
    }
    const operation = createSharedOperation(async (operationSignal) => {
      if (await this.#savedVoices.has(ownerUserId, voiceId)) {
        return { status: 'already-saved' as const, voiceId };
      }
      const existing = await this.#provider.getWorkspaceVoice(voiceId, operationSignal);
      if (existing !== null) {
        this.#invalidateWorkspaceMembership();
        const status = await this.#savedVoices.save(
          ownerUserId,
          voiceId,
          existing.publicOwnerId,
          new Date().toISOString(),
        );
        return { status, voiceId };
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
        this.#invalidateWorkspaceMembership();
        const status = await this.#savedVoices.save(
          ownerUserId,
          savedVoiceId,
          publicOwnerId,
          new Date().toISOString(),
        );
        return { status, voiceId: savedVoiceId };
      } catch (error) {
        if (error instanceof ProviderError && error.upstreamStatus === 409) {
          const nowSaved = await this.#provider.getWorkspaceVoice(voiceId, operationSignal);
          if (nowSaved !== null) {
            this.#invalidateWorkspaceMembership();
            const status = await this.#savedVoices.save(
              ownerUserId,
              voiceId,
              publicOwnerId,
              new Date().toISOString(),
            );
            return { status, voiceId };
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
    ownerUserId = DEFAULT_TEST_OWNER_USER_ID,
  ): Promise<VoiceLibraryMutationResponse> {
    const key = `${ownerUserId}:${voiceId}`;
    const active = this.#removeOperations.get(key);
    if (active?.acceptingSubscribers) {
      return active.subscribe(signal, () => new ProviderError('delete-workspace-voice', 'aborted'));
    }
    const operation = createSharedOperation(async () => {
      const status = await this.#savedVoices.remove(ownerUserId, voiceId);
      this.#invalidateWorkspaceMembership();
      return { status, voiceId };
    });
    this.#removeOperations.set(key, operation);
    const release = (): void => {
      if (this.#removeOperations.get(key) === operation) {
        this.#removeOperations.delete(key);
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
    readonly ownerUserId?: string;
  }): Promise<AudioStream> {
    await this.#ensureSavedVoiceMigration(
      input.ownerUserId ?? DEFAULT_TEST_OWNER_USER_ID,
      input.signal,
    );
    if (
      !(await this.#savedVoices.has(input.ownerUserId ?? DEFAULT_TEST_OWNER_USER_ID, input.voiceId))
    ) {
      throw new VoiceServiceError('library-voice-not-found');
    }
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
