import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  createEmptyCreativeAssetStore,
  createSavedPrompt,
  type CreativeAssetStore,
} from '@studio/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresDatabase, type DatabaseConnection } from './client.js';
import { DrizzleCreativeLibraryRepository } from './creative-library-repository.js';
import { creativeAssets, creativeLibraries, users } from './schema.js';

const databaseUrl =
  process.env.LIGHTFRAME_PROJECT_TEST_DATABASE_URL ??
  (process.env.CI === 'true' || process.env.LIGHTFRAME_RUN_PROJECT_POSTGRES_TEST === 'true'
    ? process.env.DATABASE_URL
    : undefined);

const now = '2026-08-11T15:00:00.000Z';

const storeWithPrompt = (title: string, id: string): CreativeAssetStore =>
  createSavedPrompt(
    createEmptyCreativeAssetStore(),
    { title, prompt: `Use ${title}.`, modelModeId: 'lucy-latest', source: 'manual' },
    { now, createId: () => id },
  );

describe.runIf(databaseUrl !== undefined)('Creative library PostgreSQL invariants', () => {
  let connection: DatabaseConnection;

  beforeAll(() => {
    connection = createPostgresDatabase(databaseUrl!);
  });

  afterAll(async () => {
    await connection.close();
  });

  /**
   * The scripted fake cannot express this: it replays canned results positionally and runs one
   * caller. The defect was two first writes both passing a `select ... for update` that locks
   * nothing when the row does not exist, so only a real database answers whether the claim holds.
   */
  it('admits one of two first library writes and keeps the loser out of the stored assets', async () => {
    const ownerUserId = randomUUID();
    try {
      await connection.db.insert(users).values({
        id: ownerUserId,
        login: `${ownerUserId}@library.test`,
        normalizedLogin: `${ownerUserId}@library.test`,
        username: `l-${ownerUserId}`,
        email: `${ownerUserId}@library.test`,
        displayName: 'Library owner',
      });
      const repository = new DrizzleCreativeLibraryRepository(connection.db);

      const results = await Promise.all([
        repository.replace(ownerUserId, 0, storeWithPrompt('First', 'prompt-first'), now),
        repository.replace(ownerUserId, 0, storeWithPrompt('Second', 'prompt-second'), now),
      ]);

      const winners = results.filter((result) => result !== 'conflict');
      expect(winners).toHaveLength(1);
      expect(results.filter((result) => result === 'conflict')).toHaveLength(1);

      const libraries = await connection.db
        .select()
        .from(creativeLibraries)
        .where(eq(creativeLibraries.ownerUserId, ownerUserId));
      expect(libraries).toHaveLength(1);
      expect(libraries[0]?.revision).toBe(1);

      // The stored assets are exactly the winner's, never a union of both — which is what the
      // losing writer's unguarded delete-and-insert used to produce.
      const stored = await connection.db
        .select({ id: creativeAssets.id })
        .from(creativeAssets)
        .where(eq(creativeAssets.ownerUserId, ownerUserId));
      const winner = winners[0];
      if (winner === undefined) throw new Error('Expected one winner.');
      expect(stored.map((row) => row.id).sort()).toEqual(
        winner.store.savedPrompts.map((prompt) => prompt.id).sort(),
      );
    } finally {
      await connection.db.delete(creativeAssets).where(eq(creativeAssets.ownerUserId, ownerUserId));
      await connection.db
        .delete(creativeLibraries)
        .where(eq(creativeLibraries.ownerUserId, ownerUserId));
      await connection.db.delete(users).where(eq(users.id, ownerUserId));
    }
  });

  it('refuses a stale revision and leaves the stored library untouched', async () => {
    const ownerUserId = randomUUID();
    try {
      await connection.db.insert(users).values({
        id: ownerUserId,
        login: `${ownerUserId}@library.test`,
        normalizedLogin: `${ownerUserId}@library.test`,
        username: `l-${ownerUserId}`,
        email: `${ownerUserId}@library.test`,
        displayName: 'Library owner',
      });
      const repository = new DrizzleCreativeLibraryRepository(connection.db);
      const created = await repository.replace(
        ownerUserId,
        0,
        storeWithPrompt('Kept', 'prompt-kept'),
        now,
      );
      if (created === 'conflict') throw new Error('Expected the first write to be admitted.');

      await expect(
        repository.replace(ownerUserId, 0, storeWithPrompt('Stale', 'prompt-stale'), now),
      ).resolves.toBe('conflict');

      await expect(repository.load(ownerUserId)).resolves.toMatchObject({
        revision: 1,
        store: { savedPrompts: [{ id: 'prompt-kept' }] },
      });
    } finally {
      await connection.db.delete(creativeAssets).where(eq(creativeAssets.ownerUserId, ownerUserId));
      await connection.db
        .delete(creativeLibraries)
        .where(eq(creativeLibraries.ownerUserId, ownerUserId));
      await connection.db.delete(users).where(eq(users.id, ownerUserId));
    }
  });
});
