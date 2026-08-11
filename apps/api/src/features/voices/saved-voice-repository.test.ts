import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileSavedVoiceRepository, MemorySavedVoiceRepository } from './saved-voice-repository.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const savedAt = '2026-08-05T12:00:00.000Z';
const roots: string[] = [];

describe('saved voice repositories', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('keeps memory relationships idempotent and migration-aware', async () => {
    const repository = new MemorySavedVoiceRepository();
    await expect(repository.migrated(ownerUserId)).resolves.toBe(false);
    await expect(repository.save(ownerUserId, 'voice-a', 'owner-a', savedAt)).resolves.toBe(
      'saved',
    );
    await expect(repository.save(ownerUserId, 'voice-a', 'owner-a', savedAt)).resolves.toBe(
      'already-saved',
    );
    await expect(repository.has(ownerUserId, 'voice-a')).resolves.toBe(true);
    await expect(repository.list(ownerUserId)).resolves.toHaveLength(1);
    await expect(repository.remove(ownerUserId, 'voice-a')).resolves.toBe('removed');
    await expect(repository.remove(ownerUserId, 'voice-a')).resolves.toBe('already-removed');

    await repository.completeMigration(
      ownerUserId,
      [
        { voiceId: 'voice-b', publicOwnerId: null },
        { voiceId: 'voice-c', publicOwnerId: 'owner-c' },
      ],
      savedAt,
    );
    await expect(repository.migrated(ownerUserId)).resolves.toBe(true);
    await expect(repository.list(ownerUserId)).resolves.toHaveLength(2);
  });

  it('persists serialized mutations and migration state across repository instances', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-saved-voices-'));
    roots.push(root);
    const repository = new FileSavedVoiceRepository(root);
    await expect(repository.migrated(ownerUserId)).resolves.toBe(false);
    await Promise.all([
      repository.save(ownerUserId, 'voice-a', 'owner-a', savedAt),
      repository.save(ownerUserId, 'voice-b', null, savedAt),
    ]);
    await expect(repository.has(ownerUserId, 'voice-b')).resolves.toBe(true);

    const reloaded = new FileSavedVoiceRepository(root);
    await expect(reloaded.list(ownerUserId)).resolves.toHaveLength(2);
    await reloaded.completeMigration(
      ownerUserId,
      [{ voiceId: 'voice-c', publicOwnerId: 'owner-c' }],
      savedAt,
    );
    await expect(reloaded.remove(ownerUserId, 'voice-a')).resolves.toBe('removed');

    const final = new FileSavedVoiceRepository(root);
    await expect(final.migrated(ownerUserId)).resolves.toBe(true);
    expect((await final.list(ownerUserId)).map((voice) => voice.providerVoiceId).sort()).toEqual([
      'voice-b',
      'voice-c',
    ]);
  });

  it('normalizes legacy timestamps without changing stored record identity', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-saved-voices-'));
    roots.push(root);
    const directory = path.join(root, 'metadata', 'v1', 'saved-voices');
    const file = path.join(
      directory,
      `${createHash('sha256').update(ownerUserId).digest('hex')}.json`,
    );
    const originalRecord = {
      id: 'e08739e1-7eb5-4e5e-9af1-6e3ba8689863',
      ownerUserId,
      provider: 'elevenlabs' as const,
      providerVoiceId: 'voice-original',
      publicOwnerId: 'owner-original',
      savedAt: '2026-08-01 09:00:00+00',
    };
    await mkdir(directory, { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        schemaVersion: 1,
        ownerUserId,
        migratedWorkspace: true,
        records: [originalRecord],
      }),
    );

    const repository = new FileSavedVoiceRepository(root);
    await expect(repository.list(ownerUserId)).resolves.toMatchObject([
      { id: originalRecord.id, savedAt: '2026-08-01T09:00:00.000Z' },
    ]);

    const persisted = JSON.parse(await readFile(file, 'utf8')) as {
      records: Array<typeof originalRecord>;
    };
    expect(persisted.records[0]).toEqual({
      ...originalRecord,
      savedAt: '2026-08-01T09:00:00.000Z',
    });
  });

  it('reloads durable state after a failed write so a retry is not lost', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-saved-voices-'));
    roots.push(root);
    const repository = new FileSavedVoiceRepository(root);
    const libraryPath = path.join(
      root,
      'metadata',
      'v1',
      'saved-voices',
      `${createHash('sha256').update(ownerUserId).digest('hex')}.json`,
    );
    await mkdir(libraryPath, { recursive: true });

    await expect(repository.save(ownerUserId, 'voice-retry', null, savedAt)).rejects.toBeInstanceOf(
      Error,
    );
    await rm(libraryPath, { recursive: true, force: true });

    await expect(repository.save(ownerUserId, 'voice-retry', null, savedAt)).resolves.toBe('saved');
    await expect(repository.list(ownerUserId)).resolves.toMatchObject([
      { providerVoiceId: 'voice-retry' },
    ]);
  });
});
