import { createHash, randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

const recordSchema = z
  .object({
    id: z.uuid(),
    ownerUserId: z.uuid(),
    provider: z.literal('elevenlabs'),
    providerVoiceId: z.string().trim().min(1).max(200),
    publicOwnerId: z.string().trim().min(1).max(200).nullable(),
    savedAt: z.iso.datetime(),
  })
  .strict();
const librarySchema = z
  .object({
    schemaVersion: z.literal(1),
    ownerUserId: z.uuid(),
    migratedWorkspace: z.boolean(),
    records: z.array(recordSchema),
  })
  .strict();

export type SavedVoiceRecord = z.infer<typeof recordSchema>;

export interface SavedVoiceRepository {
  list(ownerUserId: string): Promise<readonly SavedVoiceRecord[]>;
  has(ownerUserId: string, voiceId: string): Promise<boolean>;
  save(
    ownerUserId: string,
    voiceId: string,
    publicOwnerId: string | null,
    savedAt: string,
  ): Promise<'saved' | 'already-saved'>;
  remove(ownerUserId: string, voiceId: string): Promise<'removed' | 'already-removed'>;
  migrated(ownerUserId: string): Promise<boolean>;
  completeMigration(
    ownerUserId: string,
    voices: readonly { voiceId: string; publicOwnerId: string | null }[],
    savedAt: string,
  ): Promise<void>;
}

const emptyLibrary = (ownerUserId: string) => ({
  schemaVersion: 1 as const,
  ownerUserId,
  migratedWorkspace: false,
  records: [] as SavedVoiceRecord[],
});

export class MemorySavedVoiceRepository implements SavedVoiceRepository {
  readonly #libraries = new Map<string, ReturnType<typeof emptyLibrary>>();
  #library(ownerUserId: string) {
    const current = this.#libraries.get(ownerUserId) ?? emptyLibrary(ownerUserId);
    this.#libraries.set(ownerUserId, current);
    return current;
  }
  list(ownerUserId: string) {
    return Promise.resolve([...this.#library(ownerUserId).records]);
  }
  has(ownerUserId: string, voiceId: string) {
    return Promise.resolve(
      this.#library(ownerUserId).records.some((item) => item.providerVoiceId === voiceId),
    );
  }
  save(ownerUserId: string, voiceId: string, publicOwnerId: string | null, savedAt: string) {
    const library = this.#library(ownerUserId);
    if (library.records.some((item) => item.providerVoiceId === voiceId))
      return Promise.resolve('already-saved' as const);
    library.records.push({
      id: randomUUID(),
      ownerUserId,
      provider: 'elevenlabs',
      providerVoiceId: voiceId,
      publicOwnerId,
      savedAt,
    });
    return Promise.resolve('saved' as const);
  }
  remove(ownerUserId: string, voiceId: string) {
    const library = this.#library(ownerUserId);
    const index = library.records.findIndex((item) => item.providerVoiceId === voiceId);
    if (index < 0) return Promise.resolve('already-removed' as const);
    library.records.splice(index, 1);
    return Promise.resolve('removed' as const);
  }
  migrated(ownerUserId: string) {
    return Promise.resolve(this.#library(ownerUserId).migratedWorkspace);
  }
  async completeMigration(
    ownerUserId: string,
    voices: readonly { voiceId: string; publicOwnerId: string | null }[],
    savedAt: string,
  ) {
    const library = this.#library(ownerUserId);
    for (const voice of voices)
      await this.save(ownerUserId, voice.voiceId, voice.publicOwnerId, savedAt);
    library.migratedWorkspace = true;
  }
}

export class FileSavedVoiceRepository implements SavedVoiceRepository {
  readonly #root: string;
  readonly #memory = new MemorySavedVoiceRepository();
  readonly #loaded = new Set<string>();
  readonly #migrationState = new Map<string, boolean>();
  readonly #locks = new Map<string, Promise<void>>();

  constructor(dataDirectory: string) {
    this.#root = path.resolve(dataDirectory, 'metadata', 'v1', 'saved-voices');
  }
  #file(ownerUserId: string) {
    return path.join(
      this.#root,
      `${createHash('sha256').update(z.uuid().parse(ownerUserId)).digest('hex')}.json`,
    );
  }
  async #load(ownerUserId: string) {
    if (this.#loaded.has(ownerUserId)) return;
    try {
      const value = librarySchema.parse(
        JSON.parse(await readFile(this.#file(ownerUserId), 'utf8')) as unknown,
      );
      await this.#memory.completeMigration(
        ownerUserId,
        value.records.map((item) => ({
          voiceId: item.providerVoiceId,
          publicOwnerId: item.publicOwnerId,
        })),
        value.records[0]?.savedAt ?? new Date(0).toISOString(),
      );
      this.#migrationState.set(ownerUserId, value.migratedWorkspace);
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    this.#loaded.add(ownerUserId);
    if (!this.#migrationState.has(ownerUserId)) this.#migrationState.set(ownerUserId, false);
  }
  async #persist(
    ownerUserId: string,
    migratedWorkspace = this.#migrationState.get(ownerUserId) ?? false,
  ) {
    await mkdir(this.#root, { recursive: true, mode: 0o700 });
    await chmod(this.#root, 0o700);
    const data = librarySchema.parse({
      schemaVersion: 1,
      ownerUserId,
      migratedWorkspace,
      records: await this.#memory.list(ownerUserId),
    });
    const file = this.#file(ownerUserId);
    const temporary = `${file}.tmp-${randomUUID()}`;
    const handle = await open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(data)}\n`, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporary, file).catch(async (error) => {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    });
  }
  async #exclusive<T>(ownerUserId: string, action: () => Promise<T>): Promise<T> {
    const prior = this.#locks.get(ownerUserId) ?? Promise.resolve();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = prior.then(() => barrier);
    this.#locks.set(ownerUserId, chain);
    await prior;
    try {
      await this.#load(ownerUserId);
      return await action();
    } finally {
      release();
      if (this.#locks.get(ownerUserId) === chain) this.#locks.delete(ownerUserId);
    }
  }
  async list(ownerUserId: string) {
    await this.#load(ownerUserId);
    return this.#memory.list(ownerUserId);
  }
  async has(ownerUserId: string, voiceId: string) {
    await this.#load(ownerUserId);
    return this.#memory.has(ownerUserId, voiceId);
  }
  async save(ownerUserId: string, voiceId: string, publicOwnerId: string | null, savedAt: string) {
    return this.#exclusive(ownerUserId, async () => {
      const result = await this.#memory.save(ownerUserId, voiceId, publicOwnerId, savedAt);
      await this.#persist(ownerUserId);
      return result;
    });
  }
  async remove(ownerUserId: string, voiceId: string) {
    return this.#exclusive(ownerUserId, async () => {
      const result = await this.#memory.remove(ownerUserId, voiceId);
      await this.#persist(ownerUserId);
      return result;
    });
  }
  async migrated(ownerUserId: string) {
    await this.#load(ownerUserId);
    return this.#migrationState.get(ownerUserId) ?? false;
  }
  async completeMigration(
    ownerUserId: string,
    voices: readonly { voiceId: string; publicOwnerId: string | null }[],
    savedAt: string,
  ) {
    await this.#exclusive(ownerUserId, async () => {
      await this.#memory.completeMigration(ownerUserId, voices, savedAt);
      this.#migrationState.set(ownerUserId, true);
      await this.#persist(ownerUserId, true);
    });
  }
}
