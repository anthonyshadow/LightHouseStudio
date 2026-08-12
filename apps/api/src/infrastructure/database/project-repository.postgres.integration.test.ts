import { randomUUID } from 'node:crypto';
import {
  acceptProjectSource,
  appendProjectRevision,
  createEmptyProjectSnapshot,
  createProject,
  type ProjectAssetLink,
} from '@studio/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresDatabase, type DatabaseConnection } from './client.js';
import { DrizzleAssetLifecycleRegistry } from './asset-lifecycle-registry.js';
import { DrizzleProjectRepository } from './project-repository.js';
import { DrizzleProjectRetentionPolicy } from './project-retention-policy.js';
import { ProjectService } from '../../features/projects/project-service.js';
import type { ProjectSourceRecord } from '../../features/projects/project-repository.js';
import {
  mediaAssets,
  processingJobs,
  projectAssets,
  projectJobs,
  projectOperationReceipts,
  projectOutputs,
  projectRevisions,
  projects,
  projectSources,
  projectVersionReferences,
  savedVideos,
  users,
  videoVersions,
} from './schema.js';

const databaseUrl =
  process.env.LIGHTFRAME_PROJECT_TEST_DATABASE_URL ??
  (process.env.CI === 'true' || process.env.LIGHTFRAME_RUN_PROJECT_POSTGRES_TEST === 'true'
    ? process.env.DATABASE_URL
    : undefined);

describe.runIf(databaseUrl !== undefined)('Project repository PostgreSQL invariants', () => {
  let connection: DatabaseConnection;

  beforeAll(() => {
    connection = createPostgresDatabase(databaseUrl!);
  });

  afterAll(async () => {
    await connection.close();
  });

  it('commits exact revision links, rejects replay lies, and retains Project bytes', async () => {
    const ownerUserId = randomUUID();
    const otherOwnerUserId = randomUUID();
    const projectId = randomUUID();
    const otherProjectId = randomUUID();
    const firstRevisionId = randomUUID();
    const secondRevisionId = randomUUID();
    const thirdRevisionId = randomUUID();
    const otherRevisionId = randomUUID();
    const otherSecondRevisionId = randomUUID();
    const sourceAssetId = randomUUID();
    const versionAssetId = randomUUID();
    const savedVideoId = randomUUID();
    const videoVersionId = randomUUID();
    const jobId = randomUUID();
    const now = '2026-08-11T12:00:00.000Z';
    const later = '2026-08-11T12:05:00.000Z';
    const latest = '2026-08-11T12:10:00.000Z';
    const repository = new DrizzleProjectRepository(connection.db);
    const retention = new DrizzleProjectRetentionPolicy(connection.db);
    const lifecycle = new DrizzleAssetLifecycleRegistry(connection.db, retention);

    try {
      await connection.db.insert(users).values({
        id: ownerUserId,
        login: `${ownerUserId}@project.test`,
        normalizedLogin: `${ownerUserId}@project.test`,
        username: `p-${ownerUserId}`,
        email: `${ownerUserId}@project.test`,
        displayName: 'Project Integration',
      });
      await connection.db.insert(users).values({
        id: otherOwnerUserId,
        login: `${otherOwnerUserId}@project.test`,
        normalizedLogin: `${otherOwnerUserId}@project.test`,
        username: `p-${otherOwnerUserId}`,
        email: `${otherOwnerUserId}@project.test`,
        displayName: 'Other Project Integration',
      });
      await connection.db.insert(mediaAssets).values([
        {
          id: sourceAssetId,
          ownerUserId,
          storageProvider: 'local',
          storageKey: sourceAssetId,
          status: 'ready',
          mimeType: 'video/mp4',
          filename: 'source.mp4',
          sizeBytes: 100,
          checksumSha256: 'a'.repeat(64),
        },
        {
          id: versionAssetId,
          ownerUserId,
          storageProvider: 'local',
          storageKey: versionAssetId,
          status: 'ready',
          mimeType: 'video/mp4',
          filename: 'version.mp4',
          sizeBytes: 100,
          checksumSha256: 'b'.repeat(64),
        },
      ]);
      await connection.db.insert(savedVideos).values({
        id: savedVideoId,
        ownerUserId,
        title: 'Exact Version',
        currentVersionId: videoVersionId,
        sourceVideoId: null,
        status: 'ready',
        revision: 1,
      });
      await connection.db.insert(videoVersions).values({
        id: videoVersionId,
        videoId: savedVideoId,
        ownerUserId,
        ordinal: 1,
        origin: 'uploaded',
        characterName: null,
        characterVariantName: null,
        sourceVersionId: null,
        assetId: versionAssetId,
        thumbnailAssetId: null,
        mimeType: 'video/mp4',
        filename: 'version.mp4',
        sizeBytes: 100,
        durationMs: 1_000,
        width: 1_280,
        height: 720,
      });
      await connection.db.insert(processingJobs).values({
        id: jobId,
        ownerUserId,
        operation: 'character-swap',
        provider: 'fake',
        status: 'processing',
        expiresAt: '2026-08-11T13:00:00.000Z',
      });

      const firstSnapshot = {
        ...createEmptyProjectSnapshot(now),
        sourceAssetId,
        workingMedia: { kind: 'asset' as const, assetId: sourceAssetId },
      };
      const created = createProject(
        {
          id: projectId,
          ownerUserId,
          title: 'PostgreSQL Project',
          snapshot: firstSnapshot,
          author: { kind: 'user', authorId: ownerUserId },
          facts: {
            sourceStatus: 'ready',
            currentAttempt: { status: 'none' },
            validatedLastSuccessfulOutput: null,
          },
        },
        { now, createId: () => firstRevisionId },
      );
      const firstLinks: ProjectAssetLink[] = ['source', 'working'].map((role) => ({
        projectId,
        ownerUserId,
        assetId: sourceAssetId,
        role: role as ProjectAssetLink['role'],
        revisionId: firstRevisionId,
        revisionNumber: 1,
        createdAt: now,
      }));
      await repository.create({ ...created, assetLinks: firstLinks });

      const otherCreated = createProject(
        {
          id: otherProjectId,
          ownerUserId: otherOwnerUserId,
          title: 'Cross-owner Project',
          author: { kind: 'user', authorId: otherOwnerUserId },
          facts: {
            sourceStatus: 'none',
            currentAttempt: { status: 'none' },
            validatedLastSuccessfulOutput: null,
          },
        },
        { now, createId: () => otherRevisionId },
      );
      await repository.create(otherCreated);
      const crossOwnerAppend = appendProjectRevision(
        otherCreated,
        {
          expectedProjectVersion: 1,
          expectedRevisionNumber: 1,
          snapshot: {
            ...otherCreated.revisions[0]!.snapshot,
            workingMedia: { kind: 'saved-video-version', savedVideoId, videoVersionId },
            updatedAt: later,
          },
          author: { kind: 'user', authorId: otherOwnerUserId },
          source: 'user-edit',
          facts: {
            sourceStatus: 'none',
            currentAttempt: { status: 'none' },
            validatedLastSuccessfulOutput: null,
          },
        },
        { now: later, createId: () => otherSecondRevisionId },
      );
      if (!crossOwnerAppend.ok) throw new Error('Expected the cross-owner append to be formed.');
      await expect(
        repository.appendRevision({
          ownerUserId: otherOwnerUserId,
          projectId: otherProjectId,
          expectedVersion: 1,
          expectedRevisionNumber: 1,
          nextProject: crossOwnerAppend.value.project,
          revision: crossOwnerAppend.value.revisions.at(-1)!,
          assetLinks: [],
        }),
      ).rejects.toMatchObject({ code: 'version-not-ready' });

      const appended = appendProjectRevision(
        { ...created, assetLinks: firstLinks },
        {
          expectedProjectVersion: 1,
          expectedRevisionNumber: 1,
          snapshot: {
            ...firstSnapshot,
            workingMedia: {
              kind: 'saved-video-version',
              savedVideoId,
              videoVersionId,
            },
            updatedAt: later,
          },
          author: { kind: 'user', authorId: ownerUserId },
          source: 'user-edit',
          facts: {
            sourceStatus: 'ready',
            currentAttempt: { status: 'none' },
            validatedLastSuccessfulOutput: null,
          },
        },
        { now: later, createId: () => secondRevisionId },
      );
      if (!appended.ok) throw new Error('Expected the second revision to append.');
      const secondRevision = appended.value.revisions.at(-1)!;
      const secondLinks: ProjectAssetLink[] = [
        {
          projectId,
          ownerUserId,
          assetId: sourceAssetId,
          role: 'source',
          revisionId: secondRevisionId,
          revisionNumber: 2,
          createdAt: later,
        },
      ];
      await expect(
        repository.appendRevision({
          ownerUserId,
          projectId,
          expectedVersion: 1,
          expectedRevisionNumber: 1,
          nextProject: appended.value.project,
          revision: secondRevision,
          assetLinks: secondLinks,
        }),
      ).resolves.toEqual({ kind: 'updated' });

      await expect(
        connection.db.select().from(projectAssets).where(eq(projectAssets.assetId, sourceAssetId)),
      ).resolves.toHaveLength(3);
      await expect(
        connection.db
          .select()
          .from(projectVersionReferences)
          .where(eq(projectVersionReferences.videoVersionId, videoVersionId)),
      ).resolves.toMatchObject([
        {
          projectId,
          revisionId: secondRevisionId,
          role: 'working',
          savedVideoId,
        },
      ]);

      const jobLink = {
        projectId,
        ownerUserId,
        jobId,
        initiatingRevisionId: secondRevisionId,
        initiatingRevisionNumber: 2,
        createdAt: later,
      };
      await expect(
        Promise.all([repository.linkJob(jobLink), repository.linkJob(jobLink)]),
      ).resolves.toEqual(
        expect.arrayContaining([
          { kind: 'linked', replayed: false },
          { kind: 'linked', replayed: true },
        ]),
      );
      await expect(
        repository.linkJob({
          ...jobLink,
          initiatingRevisionId: firstRevisionId,
          initiatingRevisionNumber: 1,
        }),
      ).resolves.toMatchObject({ kind: 'conflict', conflict: { kind: 'relation-mismatch' } });

      const outputLink = {
        projectId,
        ownerUserId,
        savedVideoId,
        videoVersionId,
        producingRevisionId: secondRevisionId,
        producingRevisionNumber: 2,
        createdAt: later,
      };
      await expect(
        Promise.all([repository.linkOutput(outputLink), repository.linkOutput(outputLink)]),
      ).resolves.toEqual(
        expect.arrayContaining([
          { kind: 'linked', replayed: false },
          { kind: 'linked', replayed: true },
        ]),
      );
      await expect(
        repository.linkOutput({
          ...outputLink,
          producingRevisionId: firstRevisionId,
          producingRevisionNumber: 1,
        }),
      ).resolves.toMatchObject({ kind: 'conflict', conflict: { kind: 'relation-mismatch' } });

      const completed = appendProjectRevision(
        appended.value,
        {
          expectedProjectVersion: 2,
          expectedRevisionNumber: 2,
          snapshot: {
            ...secondRevision.snapshot,
            lastSuccessfulOutput: { savedVideoId, videoVersionId },
            updatedAt: latest,
          },
          author: { kind: 'user', authorId: ownerUserId },
          source: 'job-result',
          facts: {
            sourceStatus: 'ready',
            currentAttempt: { status: 'succeeded', jobId },
            validatedLastSuccessfulOutput: { savedVideoId, videoVersionId },
          },
        },
        { now: latest, createId: () => thirdRevisionId },
      );
      if (!completed.ok) throw new Error('Expected the completed revision to append.');
      const thirdRevision = completed.value.revisions.at(-1)!;
      await expect(
        repository.appendRevision({
          ownerUserId,
          projectId,
          expectedVersion: 2,
          expectedRevisionNumber: 2,
          nextProject: completed.value.project,
          revision: thirdRevision,
          assetLinks: [
            {
              projectId,
              ownerUserId,
              assetId: sourceAssetId,
              role: 'source',
              revisionId: thirdRevisionId,
              revisionNumber: 3,
              createdAt: latest,
            },
          ],
        }),
      ).resolves.toEqual({ kind: 'updated' });

      const unsupportedOutput = appendProjectRevision(
        completed.value,
        {
          expectedProjectVersion: 3,
          expectedRevisionNumber: 3,
          snapshot: {
            ...thirdRevision.snapshot,
            lastSuccessfulOutput: { savedVideoId: randomUUID(), videoVersionId: randomUUID() },
            updatedAt: '2026-08-11T12:15:00.000Z',
          },
          author: { kind: 'user', authorId: ownerUserId },
          source: 'user-edit',
          facts: {
            sourceStatus: 'ready',
            currentAttempt: { status: 'none' },
            validatedLastSuccessfulOutput: null,
          },
        },
        { now: '2026-08-11T12:15:00.000Z', createId: randomUUID },
      );
      if (!unsupportedOutput.ok) throw new Error('Expected the domain append to be formed.');
      await expect(
        repository.appendRevision({
          ownerUserId,
          projectId,
          expectedVersion: 3,
          expectedRevisionNumber: 3,
          nextProject: unsupportedOutput.value.project,
          revision: unsupportedOutput.value.revisions.at(-1)!,
          assetLinks: [
            {
              projectId,
              ownerUserId,
              assetId: sourceAssetId,
              role: 'source',
              revisionId: unsupportedOutput.value.project.currentRevisionId,
              revisionNumber: 4,
              createdAt: '2026-08-11T12:15:00.000Z',
            },
          ],
        }),
      ).rejects.toMatchObject({ code: 'output-not-linked' });

      const current = await repository.getCurrent(ownerUserId, projectId);
      expect(current).toMatchObject({ revision: { id: thirdRevisionId, revisionNumber: 3 } });
      const firstHistoryPage = await repository.listRevisionHistory(ownerUserId, projectId, {
        pageSize: 1,
      });
      expect(firstHistoryPage).toMatchObject({
        revisions: [{ id: thirdRevisionId }],
        nextRevisionNumber: 3,
      });
      await expect(retention.retainsAsset(ownerUserId, sourceAssetId)).resolves.toBe(true);
      await expect(retention.retainsAsset(ownerUserId, versionAssetId)).resolves.toBe(true);
      await expect(
        retention.retainedAssetIds(ownerUserId, [sourceAssetId, versionAssetId, randomUUID()]),
      ).resolves.toEqual(new Set([sourceAssetId, versionAssetId]));
      await expect(
        lifecycle.claimDeletion(ownerUserId, sourceAssetId, 'local'),
      ).resolves.toBeNull();
      await expect(
        lifecycle.claimDeletion(ownerUserId, versionAssetId, 'local'),
      ).resolves.toBeNull();

      const archiveAttempt = {
        ...completed.value.project,
        status: 'archived' as const,
        version: 4,
        archivedAt: later,
      };
      await expect(repository.updateMetadata(ownerUserId, 3, archiveAttempt)).resolves.toEqual({
        kind: 'conflict',
        conflict: { kind: 'active-jobs', projectId },
      });
    } finally {
      await connection.db
        .delete(projectVersionReferences)
        .where(eq(projectVersionReferences.projectId, projectId));
      await connection.db.delete(projectOutputs).where(eq(projectOutputs.projectId, projectId));
      await connection.db.delete(projectJobs).where(eq(projectJobs.projectId, projectId));
      await connection.db.delete(projectAssets).where(eq(projectAssets.projectId, projectId));
      await connection.db
        .update(projects)
        .set({ currentRevisionId: null, currentRevisionNumber: 0 })
        .where(eq(projects.id, projectId));
      await connection.db.delete(projectRevisions).where(eq(projectRevisions.projectId, projectId));
      await connection.db.delete(projects).where(eq(projects.id, projectId));
      await connection.db
        .update(projects)
        .set({ currentRevisionId: null, currentRevisionNumber: 0 })
        .where(eq(projects.id, otherProjectId));
      await connection.db
        .delete(projectRevisions)
        .where(eq(projectRevisions.projectId, otherProjectId));
      await connection.db.delete(projects).where(eq(projects.id, otherProjectId));
      await connection.db.delete(processingJobs).where(eq(processingJobs.id, jobId));
      await connection.db.delete(videoVersions).where(eq(videoVersions.id, videoVersionId));
      await connection.db.delete(savedVideos).where(eq(savedVideos.id, savedVideoId));
      await connection.db.delete(mediaAssets).where(eq(mediaAssets.ownerUserId, ownerUserId));
      await connection.db.delete(users).where(eq(users.id, ownerUserId));
      await connection.db.delete(users).where(eq(users.id, otherOwnerUserId));
    }
  }, 20_000);

  it('keeps lifecycle lists and create idempotency owner-scoped across service restart', async () => {
    const ownerUserId = randomUUID();
    const otherOwnerUserId = randomUUID();
    const operationKey = randomUUID();
    const now = '2026-08-11T14:00:00.000Z';
    let createdProjectId: string | undefined;
    try {
      await connection.db.insert(users).values([
        {
          id: ownerUserId,
          login: `${ownerUserId}@lifecycle.test`,
          normalizedLogin: `${ownerUserId}@lifecycle.test`,
          username: `l-${ownerUserId}`,
          email: `${ownerUserId}@lifecycle.test`,
          displayName: 'Lifecycle owner',
        },
        {
          id: otherOwnerUserId,
          login: `${otherOwnerUserId}@lifecycle.test`,
          normalizedLogin: `${otherOwnerUserId}@lifecycle.test`,
          username: `l-${otherOwnerUserId}`,
          email: `${otherOwnerUserId}@lifecycle.test`,
          displayName: 'Other lifecycle owner',
        },
      ]);
      const service = new ProjectService(new DrizzleProjectRepository(connection.db), {
        now: () => new Date(now),
      });
      const created = await service.create(ownerUserId, operationKey, 'Relational lifecycle');
      if (!created.ok) throw new Error('Expected relational Project create.');
      createdProjectId = created.current.project.id;
      const replay = await new ProjectService(new DrizzleProjectRepository(connection.db), {
        now: () => new Date(now),
      }).create(ownerUserId, operationKey, 'Relational lifecycle');
      expect(replay).toEqual(created);
      await expect(service.create(ownerUserId, operationKey, 'Mismatched create')).resolves.toEqual(
        {
          ok: false,
          conflict: { kind: 'operation-key', operation: 'create' },
        },
      );
      await expect(service.get(otherOwnerUserId, createdProjectId)).rejects.toMatchObject({
        statusCode: 404,
      });
      await expect(
        service.list(ownerUserId, { lifecycle: 'active', pageSize: 20 }),
      ).resolves.toMatchObject({
        projects: [{ id: createdProjectId }],
        nextCursor: null,
      });

      const renamed = await service.rename(ownerUserId, createdProjectId, 1, 'Relational renamed');
      expect(renamed).toMatchObject({ ok: true, current: { project: { version: 2 } } });
      const archived = await service.archive(ownerUserId, createdProjectId, 2);
      expect(archived).toMatchObject({ ok: true, current: { project: { status: 'archived' } } });
      expect(
        (await service.list(ownerUserId, { lifecycle: 'active', pageSize: 20 })).projects,
      ).toEqual([]);
      expect(
        (await service.list(ownerUserId, { lifecycle: 'archived', pageSize: 20 })).projects,
      ).toMatchObject([{ id: createdProjectId }]);
      await expect(service.restore(ownerUserId, createdProjectId, 3)).resolves.toMatchObject({
        ok: true,
        current: { project: { status: 'draft', version: 4 } },
      });
    } finally {
      await connection.db
        .delete(projectOperationReceipts)
        .where(eq(projectOperationReceipts.ownerUserId, ownerUserId));
      if (createdProjectId !== undefined) {
        await connection.db
          .update(projects)
          .set({ currentRevisionId: null, currentRevisionNumber: 0 })
          .where(eq(projects.id, createdProjectId));
        await connection.db
          .delete(projectRevisions)
          .where(eq(projectRevisions.projectId, createdProjectId));
        await connection.db.delete(projects).where(eq(projects.id, createdProjectId));
      }
      await connection.db.delete(users).where(eq(users.id, ownerUserId));
      await connection.db.delete(users).where(eq(users.id, otherOwnerUserId));
    }
  }, 20_000);

  it('atomically accepts and replays one inspected ready Project source', async () => {
    const ownerUserId = randomUUID();
    const projectId = randomUUID();
    const assetId = randomUUID();
    const operationKey = randomUUID();
    const firstRevisionId = randomUUID();
    const sourceRevisionId = randomUUID();
    const createdAt = '2026-08-12T12:00:00.000Z';
    const acceptedAt = '2026-08-12T12:05:00.000Z';
    const repository = new DrizzleProjectRepository(connection.db);

    try {
      await connection.db.insert(users).values({
        id: ownerUserId,
        login: `${ownerUserId}@project-source.test`,
        normalizedLogin: `${ownerUserId}@project-source.test`,
        username: `ps-${ownerUserId}`,
        email: `${ownerUserId}@project-source.test`,
        displayName: 'Project Source Integration',
      });
      await connection.db.insert(mediaAssets).values({
        id: assetId,
        ownerUserId,
        storageProvider: 'local',
        storageKey: assetId,
        status: 'ready',
        mimeType: 'video/mp4',
        filename: 'project-source.mp4',
        sizeBytes: 1_024,
        checksumSha256: 'c'.repeat(64),
      });
      const created = createProject(
        {
          id: projectId,
          ownerUserId,
          title: 'Project source transaction',
          author: { kind: 'user', authorId: ownerUserId },
          facts: {
            sourceStatus: 'none',
            currentAttempt: { status: 'none' },
            validatedLastSuccessfulOutput: null,
          },
        },
        { now: createdAt, createId: () => firstRevisionId },
      );
      await repository.create(created);
      const accepted = acceptProjectSource(
        created,
        {
          expectedProjectVersion: 1,
          expectedRevisionNumber: 1,
          assetId,
          mediaReference: { kind: 'asset', assetId },
          author: { kind: 'user', authorId: ownerUserId },
        },
        { now: acceptedAt, createId: () => sourceRevisionId },
      );
      if (!accepted.ok) throw new Error('Expected source acceptance to be formed.');
      const revision = accepted.value.revisions.at(-1)!;
      const assetLinks: ProjectAssetLink[] = ['source', 'working', 'presented'].map((role) => ({
        projectId,
        ownerUserId,
        assetId,
        role: role as ProjectAssetLink['role'],
        revisionId: sourceRevisionId,
        revisionNumber: 2,
        createdAt: acceptedAt,
      }));
      const source: ProjectSourceRecord = {
        projectId,
        ownerUserId,
        assetId,
        kind: 'uploaded',
        savedVideoId: null,
        videoVersionId: null,
        acceptedRevisionId: sourceRevisionId,
        acceptedRevisionNumber: 2,
        operationKey,
        requestFingerprint: 'd'.repeat(64),
        mimeType: 'video/mp4',
        filename: 'project-source.mp4',
        sizeBytes: 1_024,
        checksumSha256: 'c'.repeat(64),
        container: 'mp4',
        videoCodec: 'avc',
        audioCodec: 'aac',
        durationMs: 12_000,
        width: 1_280,
        height: 720,
        hasAudio: true,
        acceptedAt,
      };
      const input = {
        ownerUserId,
        projectId,
        expectedVersion: 1,
        expectedRevisionNumber: 1,
        nextProject: accepted.value.project,
        revision,
        assetLinks,
        source,
      };

      await expect(repository.acceptSource(input)).resolves.toMatchObject({
        kind: 'accepted',
        current: { project: { version: 2 }, revision: { id: sourceRevisionId } },
        source: { operationKey },
      });
      await expect(repository.acceptSource(input)).resolves.toMatchObject({
        kind: 'replayed',
        source: { operationKey },
      });
      await expect(repository.getSource(ownerUserId, projectId)).resolves.toEqual(source);
      await expect(
        repository.acceptSource({
          ...input,
          source: { ...source, requestFingerprint: 'e'.repeat(64) },
        }),
      ).resolves.toEqual({
        kind: 'conflict',
        conflict: { kind: 'operation-key', operation: 'source-accept' },
      });
    } finally {
      await connection.db.delete(projectSources).where(eq(projectSources.projectId, projectId));
      await connection.db.delete(projectAssets).where(eq(projectAssets.projectId, projectId));
      await connection.db
        .update(projects)
        .set({ currentRevisionId: null, currentRevisionNumber: 0 })
        .where(eq(projects.id, projectId));
      await connection.db.delete(projectRevisions).where(eq(projectRevisions.projectId, projectId));
      await connection.db.delete(projects).where(eq(projects.id, projectId));
      await connection.db.delete(mediaAssets).where(eq(mediaAssets.id, assetId));
      await connection.db.delete(users).where(eq(users.id, ownerUserId));
    }
  }, 20_000);
});
