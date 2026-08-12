import { Readable } from 'node:stream';
import { createEmptyCreativeAssetStore, createSavedPrompt } from '@studio/domain';
import { describe, expect, it, vi } from 'vitest';
import type { VideoProcessingJobTrace } from '../../features/processing-jobs/file-processing-job-repository.js';
import type { AssetByteStore, StoredAssetManifest } from '../../storage/asset-byte-store.js';
import { DrizzleAssetLifecycleRegistry } from './asset-lifecycle-registry.js';
import { DrizzleSessionRepository, DrizzleUserRepository } from './auth-repositories.js';
import type { LightframeDatabase } from './client.js';
import { DrizzleCreativeLibraryRepository } from './creative-library-repository.js';
import { DrizzleProcessingJobTraceWriter } from './processing-job-repository.js';
import { DrizzleReferenceImageAssetStore } from './reference-image-asset-store.js';
import { DrizzleSavedVideoRepository } from './saved-video-repository.js';
import { DrizzleSavedVoiceRepository } from './saved-voice-repository.js';
import { savedVideos } from './schema.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const assetId = '9826fc75-4759-47cc-b07d-d7325ce0ad14';
const now = '2026-08-07T12:00:00.000Z';
const postgresNow = '2026-08-07 12:00:00+00';

const scriptedDatabase = (...script: readonly unknown[]) => {
  const remaining = [...script];
  const operations: string[] = [];
  const calls: { operation: string; arguments: readonly unknown[] }[] = [];
  const query = (): object => {
    const target = {
      then: (fulfilled?: (value: unknown) => unknown, rejected?: (reason: unknown) => unknown) => {
        if (remaining.length === 0) return Promise.reject(new Error('Database script exhausted.'));
        const value = remaining.shift();
        return (value instanceof Error ? Promise.reject(value) : Promise.resolve(value)).then(
          fulfilled,
          rejected,
        );
      },
    };
    const proxy: object = new Proxy(target, {
      get(current, property, receiver) {
        if (property === 'then') return current.then.bind(receiver);
        return (...arguments_: readonly unknown[]) => {
          const operation = String(property);
          operations.push(operation);
          calls.push({ operation, arguments: arguments_ });
          return proxy;
        };
      },
    });
    return proxy;
  };
  const database: object = new Proxy(
    {},
    {
      get(_target, property) {
        if (property === 'transaction') {
          return (callback: (tx: LightframeDatabase) => unknown) =>
            callback(database as LightframeDatabase);
        }
        return (...arguments_: readonly unknown[]) => {
          const operation = String(property);
          operations.push(operation);
          calls.push({ operation, arguments: arguments_ });
          return query();
        };
      },
    },
  );
  return {
    db: database as LightframeDatabase,
    calls,
    operations,
    remaining: () => remaining.length,
  };
};

const userRow = {
  id: ownerUserId,
  login: 'demo@lightframe.local',
  normalizedLogin: 'demo@lightframe.local',
  username: 'demo',
  email: 'demo@lightframe.local',
  displayName: 'Demo Creator',
  avatarUrl: null,
  planId: 'free' as const,
  role: 'user' as const,
  status: 'active' as const,
  createdAt: postgresNow,
  updatedAt: postgresNow,
  lastLoginAt: null,
};

const manifest: StoredAssetManifest = {
  schemaVersion: 1,
  assetId,
  ownerUserId,
  mimeType: 'image/png',
  filename: 'reference.png',
  sizeBytes: 4,
  checksumSha256: 'a'.repeat(64),
  createdAt: now,
};

describe('Drizzle auth repositories', () => {
  it('seeds credentials transactionally and maps lookups and last-login updates', async () => {
    const scripted = scriptedDatabase(
      [],
      [],
      [{ user: userRow, passwordHash: '$argon2id$hash' }],
      [{ user: userRow, passwordHash: '$argon2id$hash' }],
      [{ id: ownerUserId }],
      [
        {
          user: { ...userRow, lastLoginAt: postgresNow },
          passwordHash: '$argon2id$hash',
        },
      ],
      [],
    );
    const repository = new DrizzleUserRepository(scripted.db);

    await repository.ensureSeededUser({
      id: ownerUserId,
      login: ' Demo@Lightframe.Local ',
      displayName: ' Demo Creator ',
      passwordHash: '$argon2id$hash',
    });
    await expect(repository.findById(ownerUserId)).resolves.toMatchObject({
      id: ownerUserId,
      passwordHash: '$argon2id$hash',
      createdAt: now,
      updatedAt: now,
    });
    await expect(repository.findByLogin(' DEMO@LIGHTFRAME.LOCAL ')).resolves.toMatchObject({
      login: userRow.login,
    });
    await expect(repository.recordLastLogin(ownerUserId, now)).resolves.toMatchObject({
      lastLoginAt: now,
      updatedAt: now,
    });
    await expect(repository.findById('9826fc75-4759-47cc-b07d-d7325ce0ad14')).resolves.toBeNull();
    expect(scripted.remaining()).toBe(0);
  });

  it('creates, reads, expires, and revokes durable sessions', async () => {
    const record = {
      jti: 'session-jti',
      userId: ownerUserId,
      issuedAt: now,
      expiresAt: '2026-08-08T12:00:00.000Z',
      revokedAt: null,
    };
    const scripted = scriptedDatabase(
      [],
      [],
      [
        {
          ...record,
          issuedAt: postgresNow,
          expiresAt: '2026-08-08 12:00:00+00',
        },
      ],
      [],
      [],
    );
    const repository = new DrizzleSessionRepository(scripted.db);

    await repository.create(record);
    await expect(repository.findActive(record.jti, new Date(now))).resolves.toEqual(record);
    await repository.revoke(record.jti, new Date(now));
    await expect(repository.findActive('missing', new Date(now))).resolves.toBeNull();
    expect(scripted.remaining()).toBe(0);
  });
});

describe('DrizzleAssetLifecycleRegistry', () => {
  it('moves an owned asset through pending, ready, deleting, and deleted states', async () => {
    const readyRow = {
      id: assetId,
      ownerUserId,
      storageProvider: 'r2' as const,
      storageKey: `media/v1/${assetId}`,
      status: 'ready' as const,
      mimeType: manifest.mimeType,
      filename: manifest.filename,
      sizeBytes: manifest.sizeBytes,
      checksumSha256: manifest.checksumSha256,
      etag: 'etag',
      deletedAt: null,
      createdAt: postgresNow,
      updatedAt: postgresNow,
    };
    const deletionClaim = {
      provider: readyRow.storageProvider,
      storageKey: readyRow.storageKey,
    };
    const scripted = scriptedDatabase(
      [],
      [],
      [],
      [readyRow],
      [deletionClaim],
      [deletionClaim],
      [],
      [],
      [],
    );
    const repository = new DrizzleAssetLifecycleRegistry(scripted.db);

    await repository.prepare(manifest, { provider: 'r2', storageKey: readyRow.storageKey });
    await repository.markReady(assetId, 'etag');
    await repository.markFailed(assetId);
    await expect(repository.findReady(ownerUserId, assetId)).resolves.toMatchObject({
      manifest,
      provider: 'r2',
      etag: 'etag',
    });
    await expect(repository.claimDeletion(ownerUserId, assetId, 'r2')).resolves.toEqual(
      deletionClaim,
    );
    await repository.markDeleted(ownerUserId, assetId, deletionClaim);
    await expect(repository.findReady(ownerUserId, 'missing')).resolves.toBeNull();
    await expect(repository.claimDeletion(ownerUserId, 'missing', 'r2')).resolves.toBeNull();
    expect(scripted.remaining()).toBe(0);
  });

  it('does not claim bytes retained by any Project lifecycle state', async () => {
    const deletionClaim = { provider: 'r2' as const, storageKey: `media/v1/${assetId}` };
    const scripted = scriptedDatabase([deletionClaim]);
    const projectRetention = { retainsAssetWith: vi.fn().mockResolvedValue(true) };
    const repository = new DrizzleAssetLifecycleRegistry(scripted.db, projectRetention);

    await expect(repository.claimDeletion(ownerUserId, assetId, 'r2')).resolves.toBeNull();
    expect(projectRetention.retainsAssetWith.mock.calls[0]?.slice(1)).toEqual([
      ownerUserId,
      assetId,
    ]);
    expect(scripted.operations).not.toContain('update');
    expect(scripted.remaining()).toBe(0);
  });
});

describe('DrizzleSavedVoiceRepository', () => {
  it('covers list, membership batches, idempotent mutations, and migration receipts', async () => {
    const row = {
      id: assetId,
      ownerUserId,
      provider: 'elevenlabs' as const,
      providerVoiceId: 'voice-one',
      publicOwnerId: 'public-owner',
      savedAt: postgresNow,
    };
    const scripted = scriptedDatabase(
      [row],
      [{ id: assetId }],
      [{ voiceId: 'voice-one' }],
      [{ id: assetId }],
      [],
      [{ id: assetId }],
      [],
      [{ migrationId: 'elevenlabs-workspace-v1' }],
      [],
      [],
    );
    const repository = new DrizzleSavedVoiceRepository(scripted.db);

    await expect(repository.list(ownerUserId)).resolves.toMatchObject([
      { providerVoiceId: 'voice-one', savedAt: now },
    ]);
    await expect(repository.has(ownerUserId, 'voice-one')).resolves.toBe(true);
    await expect(repository.savedIds(ownerUserId, ['voice-one', 'voice-one'])).resolves.toEqual(
      new Set(['voice-one']),
    );
    await expect(repository.savedIds(ownerUserId, [])).resolves.toEqual(new Set());
    await expect(repository.save(ownerUserId, 'voice-one', 'public-owner', now)).resolves.toBe(
      'saved',
    );
    await expect(repository.save(ownerUserId, 'voice-one', 'public-owner', now)).resolves.toBe(
      'already-saved',
    );
    await expect(repository.remove(ownerUserId, 'voice-one')).resolves.toBe('removed');
    await expect(repository.remove(ownerUserId, 'voice-one')).resolves.toBe('already-removed');
    await expect(repository.migrated(ownerUserId)).resolves.toBe(true);
    await repository.completeMigration(
      ownerUserId,
      [{ voiceId: 'voice-two', publicOwnerId: null }],
      now,
    );
    expect(scripted.remaining()).toBe(0);
  });
});

describe('DrizzleSavedVideoRepository', () => {
  const videoId = '3bf65e85-39a8-4e7b-aa17-a1acdaea7088';
  const versionId = '806e431c-cd6b-4a82-bcb7-9aa244b622d8';
  const nextVersionId = '9de948df-10b7-4239-b30e-d3d8bf10a85e';
  const video = {
    id: videoId,
    ownerUserId,
    title: 'Saved take',
    currentVersionId: versionId,
    sourceVideoId: null,
    status: 'ready' as const,
    revision: 1,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const version = {
    id: versionId,
    videoId,
    ownerUserId,
    ordinal: 1,
    origin: 'recorded' as const,
    characterName: 'Mara',
    characterVariantName: 'Evening',
    sourceVersionId: null,
    assetId,
    thumbnailAssetId: null,
    mimeType: 'video/mp4' as const,
    filename: 'take.mp4',
    sizeBytes: 1_024,
    durationMs: 12_000,
    width: 1_280,
    height: 720,
    createdAt: now,
  };
  const nextVersion = {
    ...version,
    id: nextVersionId,
    ordinal: 2,
    origin: 'editor' as const,
    sourceVersionId: versionId,
    createdAt: '2026-08-07T12:01:00.000Z',
  };
  const updatedVideo = {
    ...video,
    currentVersionId: nextVersionId,
    revision: 2,
    updatedAt: nextVersion.createdAt,
  };
  const deletedVideo = {
    ...video,
    status: 'deleted' as const,
    deletedAt: now,
    updatedAt: now,
  };
  const receipt = {
    idempotencyKey: 'f391033c-6efe-4858-80e8-a91da9947dd7',
    videoId,
    versionId,
    createdAt: now,
  };

  it('normalizes Neon/Postgres timestamps at the repository boundary', async () => {
    const scripted = scriptedDatabase(
      [{ ...receipt, createdAt: postgresNow }],
      [{ ...video, createdAt: postgresNow, updatedAt: postgresNow }],
      [{ ...version, createdAt: postgresNow }],
    );
    const repository = new DrizzleSavedVideoRepository(scripted.db);

    await expect(repository.findReceipt(ownerUserId, receipt.idempotencyKey)).resolves.toEqual(
      receipt,
    );
    await expect(repository.get(ownerUserId, videoId)).resolves.toMatchObject({
      video: { createdAt: now, updatedAt: now },
      versions: [{ createdAt: now }],
    });
    expect(scripted.remaining()).toBe(0);
  });

  it('checks active Saved Video asset references in one batch query', async () => {
    const scripted = scriptedDatabase([{ assetId }, { assetId: nextVersionId }]);
    const repository = new DrizzleSavedVideoRepository(scripted.db);

    await expect(
      repository.referencedAssetIds(ownerUserId, [assetId, nextVersionId]),
    ).resolves.toEqual(new Set([assetId, nextVersionId]));
    expect(scripted.remaining()).toBe(0);
  });

  it('loads active idempotency receipts in one batch query', async () => {
    const scripted = scriptedDatabase([{ ...receipt, ownerUserId, createdAt: postgresNow }]);
    const repository = new DrizzleSavedVideoRepository(scripted.db);

    await expect(
      repository.findActiveReceipts([
        { ownerUserId, idempotencyKey: receipt.idempotencyKey },
        { ownerUserId, idempotencyKey: nextVersionId },
      ]),
    ).resolves.toEqual([{ ...receipt, ownerUserId }]);
    expect(scripted.calls.filter(({ operation }) => operation === 'select')).toHaveLength(1);
    expect(scripted.remaining()).toBe(0);
  });

  it('uses transactions for creation/version append and pages the current-version projection in SQL', async () => {
    const scripted = scriptedDatabase(
      [receipt],
      [],
      [],
      [],
      [],
      [],
      [video],
      [],
      [],
      [],
      [updatedVideo],
      [version, nextVersion],
      [updatedVideo],
      [version, nextVersion],
      [{ video: updatedVideo }],
      [{ count: 1 }],
      [{ characterName: 'Mara' }],
      [{ format: 'landscape' }],
      [version, nextVersion],
      [updatedVideo],
      [version, nextVersion],
      [{ id: videoId }],
      [updatedVideo],
      [version, nextVersion],
      [],
      [{ id: versionId }],
      [],
      [updatedVideo],
      [{ ...version, thumbnailAssetId: assetId }, nextVersion],
      [video],
      [version, nextVersion],
      [deletedVideo],
    );
    const repository = new DrizzleSavedVideoRepository(scripted.db);

    await expect(repository.findReceipt(ownerUserId, receipt.idempotencyKey)).resolves.toEqual(
      receipt,
    );
    await expect(
      repository.create(ownerUserId, { video, versions: [version], revision: 1 }, receipt),
    ).resolves.toMatchObject({ video, versions: [version] });
    await expect(
      repository.append(ownerUserId, videoId, versionId, nextVersion, {
        ...receipt,
        idempotencyKey: nextVersionId,
        versionId: nextVersionId,
        createdAt: nextVersion.createdAt,
      }),
    ).resolves.toMatchObject({
      video: { id: videoId, currentVersionId: nextVersionId },
      versions: [version, nextVersion],
    });
    await expect(repository.list(ownerUserId)).resolves.toMatchObject([
      {
        video: { id: videoId, currentVersionId: nextVersionId },
        versions: [version, nextVersion],
      },
    ]);
    await expect(
      repository.listPage(
        ownerUserId,
        {
          pageSize: 20,
          sort: 'shortest',
          characterName: 'Mara',
          format: 'landscape',
        },
        0,
      ),
    ).resolves.toMatchObject({
      total: 1,
      characterNames: ['Mara'],
      formats: ['landscape'],
      videos: [
        {
          video: { id: videoId, currentVersionId: nextVersionId },
          versions: [version, nextVersion],
        },
      ],
    });
    await expect(repository.get(ownerUserId, videoId)).resolves.toMatchObject({
      video: { id: videoId, currentVersionId: nextVersionId },
    });
    await expect(repository.rename(ownerUserId, videoId, 'Renamed', now)).resolves.toMatchObject({
      video: { id: videoId, currentVersionId: nextVersionId },
    });
    await repository.markMissing(ownerUserId, videoId, now);
    await expect(
      repository.setThumbnail(ownerUserId, videoId, versionId, assetId, now),
    ).resolves.toMatchObject({ versions: [{ thumbnailAssetId: assetId }, nextVersion] });
    await expect(repository.delete(ownerUserId, videoId, now)).resolves.toMatchObject({
      video: { id: videoId, status: 'deleted', deletedAt: now },
      versions: [version, nextVersion],
    });
    expect(scripted.remaining()).toBe(0);
  });

  it('serializes version append and deletion before either changes version membership', async () => {
    const appendScripted = scriptedDatabase(
      [],
      [video],
      [],
      [],
      [],
      [updatedVideo],
      [version, nextVersion],
    );
    const appendRepository = new DrizzleSavedVideoRepository(appendScripted.db);

    await expect(
      appendRepository.append(ownerUserId, videoId, versionId, nextVersion, {
        ...receipt,
        idempotencyKey: nextVersionId,
        versionId: nextVersionId,
        createdAt: nextVersion.createdAt,
      }),
    ).resolves.toMatchObject({
      video: { currentVersionId: nextVersionId },
      versions: [version, nextVersion],
    });

    const appendLockIndex = appendScripted.calls.findIndex(
      (call) => call.operation === 'for' && call.arguments[0] === 'update',
    );
    const appendLockedTable = appendScripted.calls
      .slice(0, appendLockIndex)
      .filter((call) => call.operation === 'from')
      .at(-1)?.arguments[0];
    const versionInsertIndex = appendScripted.calls.findIndex(
      (call) => call.operation === 'insert',
    );
    expect(appendLockIndex).toBeGreaterThan(-1);
    expect(appendLockedTable).toBe(savedVideos);
    expect(versionInsertIndex).toBeGreaterThan(appendLockIndex);
    expect(appendScripted.remaining()).toBe(0);

    const deleteScripted = scriptedDatabase(
      [updatedVideo],
      [version, nextVersion],
      [{ ...deletedVideo, currentVersionId: nextVersionId, revision: 2 }],
    );
    const deleteRepository = new DrizzleSavedVideoRepository(deleteScripted.db);

    await expect(deleteRepository.delete(ownerUserId, videoId, now)).resolves.toMatchObject({
      video: { status: 'deleted', currentVersionId: nextVersionId },
      versions: [version, nextVersion],
    });

    const deleteLockIndex = deleteScripted.calls.findIndex(
      (call) => call.operation === 'for' && call.arguments[0] === 'update',
    );
    const deleteLockedTable = deleteScripted.calls
      .slice(0, deleteLockIndex)
      .filter((call) => call.operation === 'from')
      .at(-1)?.arguments[0];
    const versionSnapshotIndex = deleteScripted.calls.findIndex(
      (call, index) => index > deleteLockIndex && call.operation === 'select',
    );
    expect(deleteLockIndex).toBeGreaterThan(-1);
    expect(deleteLockedTable).toBe(savedVideos);
    expect(versionSnapshotIndex).toBeGreaterThan(deleteLockIndex);
    expect(deleteScripted.remaining()).toBe(0);
  });

  it('returns bounded empty and conflict results without loading version history', async () => {
    const scripted = scriptedDatabase(
      [],
      [],
      [],
      [{ count: 0 }],
      [{ characterName: null }],
      [{ format: 'portrait' }],
      [],
      [],
      [],
      [video],
      [],
      [],
    );
    const repository = new DrizzleSavedVideoRepository(scripted.db);

    await expect(repository.findReceipt(ownerUserId, 'missing')).resolves.toBeNull();
    await expect(repository.list(ownerUserId)).resolves.toEqual([]);
    await expect(
      repository.listPage(ownerUserId, { pageSize: 20, sort: 'oldest' }, 0),
    ).resolves.toMatchObject({
      videos: [],
      total: 0,
      characterNames: [],
      formats: ['portrait'],
    });
    await expect(repository.get(ownerUserId, videoId)).resolves.toBeNull();
    await expect(repository.rename(ownerUserId, videoId, 'Missing', now)).resolves.toBeNull();
    await expect(
      repository.append(ownerUserId, videoId, nextVersionId, nextVersion, receipt),
    ).resolves.toBe('conflict');
    await expect(
      repository.setThumbnail(ownerUserId, videoId, versionId, assetId, now),
    ).resolves.toBeNull();
    await expect(repository.delete(ownerUserId, videoId, now)).resolves.toBeNull();
    expect(scripted.remaining()).toBe(0);
  });
});

describe('DrizzleProcessingJobTraceWriter', () => {
  it('upserts safe state and returns only complete resumable provider jobs', async () => {
    const trace: VideoProcessingJobTrace = {
      schemaVersion: 1,
      jobId: assetId,
      ownerUserId,
      operation: 'character-swap',
      provider: 'decart',
      providerJobId: 'provider-job',
      requestFingerprint: 'b'.repeat(64),
      outputResolution: '720p',
      providerOutputLocation: null,
      sourceDurationMs: 1_000.4,
      sourceOrientation: 'landscape',
      status: 'queued',
      safeErrorCode: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    const resumable = {
      id: trace.jobId,
      ownerUserId,
      operation: trace.operation,
      provider: trace.provider,
      providerJobId: trace.providerJobId,
      requestFingerprint: trace.requestFingerprint,
      status: trace.status,
      outputResolution: trace.outputResolution,
      providerOutputLocation: null,
      sourceDurationMs: trace.sourceDurationMs,
      sourceOrientation: trace.sourceOrientation,
      createdAt: postgresNow,
      updatedAt: postgresNow,
      expiresAt: '2026-08-07 13:00:00+00',
    };
    const scripted = scriptedDatabase(
      [],
      [],
      [],
      [],
      [resumable, { ...resumable, providerJobId: null }],
    );
    const repository = new DrizzleProcessingJobTraceWriter(scripted.db);

    await repository.upsert(trace);
    expect(scripted.calls.find((call) => call.operation === 'values')?.arguments[0]).toMatchObject({
      sourceDurationMs: 1_000,
    });
    expect(
      scripted.calls.find((call) => call.operation === 'onConflictDoUpdate')?.arguments[0],
    ).toMatchObject({ set: { sourceDurationMs: 1_000 } });
    await expect(repository.listResumable(now)).resolves.toEqual([
      expect.objectContaining({
        jobId: assetId,
        providerJobId: 'provider-job',
        createdAt: now,
        updatedAt: now,
        expiresAt: '2026-08-07T13:00:00.000Z',
      }),
    ]);
    expect(
      scripted.calls.filter((call) => call.operation === 'set').map((call) => call.arguments[0]),
    ).toEqual([
      expect.objectContaining({ status: 'expired', safeErrorCode: 'job_expired' }),
      expect.objectContaining({ status: 'ambiguous' }),
      expect.objectContaining({ status: 'failed' }),
    ]);
    expect(scripted.remaining()).toBe(0);
  });

  it('atomically classifies durable admission conflicts before provider work', async () => {
    const trace: VideoProcessingJobTrace = {
      schemaVersion: 1,
      jobId: assetId,
      ownerUserId,
      operation: 'character-swap',
      provider: 'decart',
      providerJobId: null,
      requestFingerprint: 'b'.repeat(64),
      outputResolution: '720p',
      providerOutputLocation: null,
      sourceDurationMs: null,
      sourceOrientation: null,
      status: 'validating',
      safeErrorCode: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
    const matching = {
      ownerUserId,
      operation: trace.operation,
      provider: trace.provider,
      requestFingerprint: trace.requestFingerprint,
      outputResolution: trace.outputResolution,
    };

    const admitted = scriptedDatabase([{ id: trace.jobId }]);
    await expect(new DrizzleProcessingJobTraceWriter(admitted.db).admit(trace)).resolves.toBe(
      'admitted',
    );
    expect(admitted.remaining()).toBe(0);

    const duplicate = scriptedDatabase([], [matching]);
    await expect(new DrizzleProcessingJobTraceWriter(duplicate.db).admit(trace)).resolves.toBe(
      'duplicate',
    );
    expect(duplicate.remaining()).toBe(0);

    const requestConflict = scriptedDatabase([], [{ ...matching, provider: 'other-provider' }]);
    await expect(
      new DrizzleProcessingJobTraceWriter(requestConflict.db).admit(trace),
    ).resolves.toBe('request-conflict');
    expect(requestConflict.remaining()).toBe(0);

    const ownerMismatch = scriptedDatabase([], [{ ...matching, ownerUserId: crypto.randomUUID() }]);
    await expect(new DrizzleProcessingJobTraceWriter(ownerMismatch.db).admit(trace)).resolves.toBe(
      'owner-mismatch',
    );
    expect(ownerMismatch.remaining()).toBe(0);

    const ownerConflict = scriptedDatabase([], []);
    await expect(new DrizzleProcessingJobTraceWriter(ownerConflict.db).admit(trace)).resolves.toBe(
      'owner-conflict',
    );
    expect(ownerConflict.remaining()).toBe(0);
  });
});

describe('DrizzleCreativeLibraryRepository', () => {
  it('loads normalized rows and transactionally replaces a matching revision', async () => {
    const store = createSavedPrompt(
      createEmptyCreativeAssetStore(),
      {
        title: 'Studio look',
        prompt: 'Use soft studio lighting.',
        modelModeId: 'lucy-latest',
        source: 'manual',
      },
      { now, createId: () => 'prompt-one' },
    );
    const prompt = store.savedPrompts[0]!;
    const scripted = scriptedDatabase(
      [
        {
          ownerUserId,
          revision: 3,
          schemaVersion: store.schemaVersion,
          createdAt: postgresNow,
          updatedAt: postgresNow,
        },
      ],
      [{ kind: 'saved-prompt', payload: prompt }],
      [
        {
          ownerUserId,
          revision: 3,
          schemaVersion: store.schemaVersion,
          createdAt: now,
          updatedAt: now,
        },
      ],
      [],
      [],
      [],
    );
    const repository = new DrizzleCreativeLibraryRepository(scripted.db);

    await expect(repository.load(ownerUserId)).resolves.toMatchObject({
      revision: 3,
      store: { savedPrompts: [{ id: 'prompt-one' }] },
      updatedAt: now,
    });
    await expect(repository.replace(ownerUserId, 3, store, now)).resolves.toMatchObject({
      revision: 4,
      store,
    });
    expect(scripted.remaining()).toBe(0);
  });

  it('returns an empty snapshot and rejects a stale replacement revision', async () => {
    const emptyStore = createEmptyCreativeAssetStore();
    const scripted = scriptedDatabase(
      [],
      [
        {
          ownerUserId,
          revision: 2,
          schemaVersion: emptyStore.schemaVersion,
          createdAt: now,
          updatedAt: now,
        },
      ],
    );
    const repository = new DrizzleCreativeLibraryRepository(scripted.db);

    await expect(repository.load(ownerUserId)).resolves.toMatchObject({
      revision: 0,
      store: emptyStore,
    });
    await expect(repository.replace(ownerUserId, 1, emptyStore, now)).resolves.toBe('conflict');
    expect(scripted.remaining()).toBe(0);
  });

  it('releases only reference IDs removed by a successful creative-library CAS', async () => {
    const previousStore = createSavedPrompt(
      createEmptyCreativeAssetStore(),
      {
        title: 'Image outfit',
        prompt: '',
        modelModeId: 'lucy-vton-latest',
        source: 'manual',
        referenceImageAssetId: assetId,
        vtonInputKind: 'saved-outfit',
      },
      { now, createId: () => 'image-outfit' },
    );
    const previousLibrary = {
      ownerUserId,
      revision: 1,
      schemaVersion: previousStore.schemaVersion,
      createdAt: now,
      updatedAt: now,
    };
    const scripted = scriptedDatabase(
      [previousLibrary],
      [{ kind: 'outfit', payload: previousStore.savedPrompts[0] }],
      [previousLibrary],
      [],
      [],
    );
    const releaseReferenceImages = vi.fn().mockResolvedValue(undefined);
    const repository = new DrizzleCreativeLibraryRepository(scripted.db, releaseReferenceImages);

    await expect(
      repository.replace(ownerUserId, 1, createEmptyCreativeAssetStore(), now),
    ).resolves.toMatchObject({ revision: 2 });
    expect(releaseReferenceImages).toHaveBeenCalledWith(ownerUserId, [assetId]);
    expect(scripted.remaining()).toBe(0);
  });
});

describe('DrizzleReferenceImageAssetStore', () => {
  const upload = {
    localOwnerId: ownerUserId,
    bytes: Buffer.from('data'),
    mimeType: 'image/png' as const,
    source: 'uploaded' as const,
    width: 1,
    height: 1,
    requestId: '3bf65e85-39a8-4e7b-aa17-a1acdaea7088',
    requestFingerprint: 'c'.repeat(64),
  };

  it('stores, finds, and streams owner-scoped immutable reference content', async () => {
    const bytes = {
      storeBytes: vi
        .fn()
        .mockImplementation(
          (input: Parameters<AssetByteStore['storeBytes']>[0]): Promise<StoredAssetManifest> =>
            Promise.resolve({
              ...manifest,
              assetId: input.assetId,
              ownerUserId: input.ownerUserId,
              mimeType: input.mimeType,
              filename: input.filename,
            }),
        ),
      open: vi.fn(),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as AssetByteStore;
    const createScript = scriptedDatabase([], []);
    const repository = new DrizzleReferenceImageAssetStore(
      createScript.db,
      bytes,
      () => new Date(now),
    );
    const metadata = await repository.store(upload);
    expect(createScript.remaining()).toBe(0);

    const streamManifest = {
      ...manifest,
      assetId: metadata.assetId,
      ownerUserId,
      mimeType: metadata.mimeType,
      sizeBytes: metadata.byteSize,
    };
    vi.mocked(bytes.open).mockResolvedValue({
      manifest: streamManifest,
      createReadStream: () => Readable.from(upload.bytes),
    });
    const readScript = scriptedDatabase(
      [{ metadata }],
      [],
      [{ metadata }],
      [],
      [{ metadata }],
      [],
      [{ metadata }],
      [],
    );
    const reader = new DrizzleReferenceImageAssetStore(readScript.db, bytes);

    await expect(reader.findByRequestId(ownerUserId, upload.requestId)).resolves.toEqual(metadata);
    await expect(reader.getMetadata(ownerUserId, metadata.assetId)).resolves.toEqual(metadata);
    await expect(reader.getContentStream(ownerUserId, metadata.assetId)).resolves.toMatchObject({
      metadata,
    });
    await expect(reader.getContent(ownerUserId, metadata.assetId)).resolves.toMatchObject({
      metadata,
      bytes: upload.bytes,
    });
    expect(readScript.remaining()).toBe(0);
  });

  it('imports existing bytes idempotently and preserves a duplicate after an insert race', async () => {
    const bytes = {
      storeBytes: vi.fn().mockResolvedValue(manifest),
      open: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as AssetByteStore;
    const metadata = {
      schemaVersion: 1 as const,
      assetId,
      localOwnerId: ownerUserId,
      storageKey: `${assetId}.png`,
      mimeType: 'image/png' as const,
      requestId: upload.requestId,
      requestFingerprint: upload.requestFingerprint,
      createdAt: now,
      width: 1,
      height: 1,
      byteSize: 4,
      source: 'uploaded' as const,
    };
    const importScript = scriptedDatabase([], []);
    const repository = new DrizzleReferenceImageAssetStore(importScript.db, bytes);
    await expect(repository.importExisting(metadata, upload.bytes)).resolves.toEqual(metadata);

    const raceScript = scriptedDatabase([], new Error('unique violation'), [{ metadata }], []);
    const racingRepository = new DrizzleReferenceImageAssetStore(raceScript.db, bytes);
    await expect(racingRepository.store(upload)).resolves.toEqual(metadata);
    expect(bytes.delete).toHaveBeenCalled();
  });

  it('deletes only owner assets that no saved creative record references', async () => {
    const bytes = {
      delete: vi.fn().mockResolvedValue(undefined),
    } as unknown as AssetByteStore;
    const savedScript = scriptedDatabase(
      [{ id: assetId }],
      [{ payload: { referenceImageAssetId: assetId } }],
    );
    const savedRepository = new DrizzleReferenceImageAssetStore(savedScript.db, bytes);
    await expect(savedRepository.discardIfUnreferenced(ownerUserId, assetId)).resolves.toBe(false);
    expect(bytes.delete).not.toHaveBeenCalled();
    expect(savedScript.remaining()).toBe(0);

    const temporaryScript = scriptedDatabase([{ id: assetId }], [], []);
    const temporaryRepository = new DrizzleReferenceImageAssetStore(temporaryScript.db, bytes);
    await expect(temporaryRepository.discardIfUnreferenced(ownerUserId, assetId)).resolves.toBe(
      true,
    );
    expect(bytes.delete).toHaveBeenCalledWith(ownerUserId, assetId);
    expect(temporaryScript.remaining()).toBe(0);

    vi.mocked(bytes.delete).mockClear();
    const retainedScript = scriptedDatabase([{ id: assetId }], []);
    const projectRetention = {
      retainsAsset: vi.fn().mockResolvedValue(true),
      retainedAssetIds: vi.fn().mockResolvedValue(new Set([assetId])),
    };
    const retainedRepository = new DrizzleReferenceImageAssetStore(
      retainedScript.db,
      bytes,
      undefined,
      projectRetention,
    );
    await expect(retainedRepository.discardIfUnreferenced(ownerUserId, assetId)).resolves.toBe(
      false,
    );
    expect(projectRetention.retainedAssetIds).toHaveBeenCalledWith(ownerUserId, [assetId]);
    expect(projectRetention.retainsAsset).not.toHaveBeenCalled();
    expect(bytes.delete).not.toHaveBeenCalled();
    expect(retainedScript.remaining()).toBe(0);
  });
});
