import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import {
  acceptProjectSource,
  adoptProjectWorkingMedia,
  appendProjectRevision,
  createDefaultVideoEditSpec,
  createEmptyProjectSnapshot,
  createProject,
  duplicateProject,
  promoteProjectJobResult,
  type ProjectAssetLink,
} from '@studio/domain';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createPostgresDatabase, type DatabaseConnection } from './client.js';
import { DrizzleAssetLifecycleRegistry } from './asset-lifecycle-registry.js';
import { DrizzleProjectRepository } from './project-repository.js';
import { FileProjectRepository } from '../../features/projects/file-project-repository.js';
import { DrizzleProjectRetentionPolicy } from './project-retention-policy.js';
import { ProjectService } from '../../features/projects/project-service.js';
import { ProjectOutputService } from '../../features/projects/project-output-service.js';
import { DrizzleSavedVideoRepository } from './saved-video-repository.js';
import type { AssetByteStore } from '../../storage/asset-byte-store.js';
import type { ProjectProcessingAttemptRecord } from '../../features/projects/project-processing-repository.js';
import type {
  ProjectSourceRecord,
  ProjectWorkingMediaRecord,
} from '../../features/projects/project-repository.js';
import {
  projectAssetLinksForRevision,
  projectVersionReferenceLinksForRevision,
} from '../../features/projects/project-snapshot-relations.js';
import {
  mediaAssets,
  processingJobs,
  projectAssets,
  projectJobs,
  projectOperationReceipts,
  projectOutputOperationReceipts,
  projectOutputs,
  projectRevisions,
  projects,
  projectSources,
  projectWorkingMediaAdoptions,
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

  it('matches a search term identically in the file and Drizzle Project repositories', async () => {
    const ownerUserId = randomUUID();
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-search-parity-'));
    const drizzle = new DrizzleProjectRepository(connection.db);
    const file = new FileProjectRepository(directory);
    /**
     * Titles chosen for where the two implementations could diverge: case folding, a match that is
     * not a prefix, and the three characters `LIKE` reads as syntax. If the SQL side failed to
     * escape them, `50%` and `a_b` would match rows that JavaScript containment never would.
     */
    const titles = [
      'Launch cut',
      'Relaunch teaser',
      'Winter promo',
      'Save 50% now',
      'Save 5000 now',
      'Take a_b final',
      'Take axb final',
      'Path C:\\temp',
    ];
    const projectIds = titles.map(() => randomUUID());

    try {
      await connection.db.insert(users).values({
        id: ownerUserId,
        login: `${ownerUserId}@parity.test`,
        normalizedLogin: `${ownerUserId}@parity.test`,
        username: `s-${ownerUserId}`,
        email: `${ownerUserId}@parity.test`,
        displayName: 'Search Parity',
      });

      for (const [index, title] of titles.entries()) {
        // Distinct timestamps, so ordering is decided by the data rather than by insertion race.
        const now = new Date(Date.parse('2026-08-11T12:00:00.000Z') + index * 1_000).toISOString();
        const projectId = projectIds[index]!;
        const aggregate = createProject(
          {
            id: projectId,
            ownerUserId,
            title,
            snapshot: createEmptyProjectSnapshot(now),
            author: { kind: 'user', authorId: ownerUserId },
            facts: {
              sourceStatus: 'none',
              currentAttempt: { status: 'none' },
              validatedLastSuccessfulOutput: null,
            },
          },
          { now, createId: () => randomUUID() },
        );
        const receipt = {
          operationKey: randomUUID(),
          requestFingerprint: createHash('sha256').update(`parity-${index}`).digest('hex'),
          projectId,
          createdAt: now,
        };
        await drizzle.createIdempotent({ aggregate, receipt });
        await file.createIdempotent({ aggregate, receipt });
      }

      const terms = [undefined, 'launch', 'LAUNCH', 'LaUnCh', '50%', 'a_b', 'C:\\', 'nothing here'];
      for (const search of terms) {
        const input = {
          lifecycle: 'active' as const,
          pageSize: 3,
          ...(search === undefined ? {} : { search }),
        };
        const fromDrizzle = await drizzle.list(ownerUserId, input);
        const fromFile = await file.list(ownerUserId, input);
        expect(fromFile, `term ${String(search)}`).toEqual(fromDrizzle);

        // And the next page, so the two agree on the cursor as well as on the match.
        if (fromDrizzle.nextCursor !== null) {
          const next = { ...input, cursor: fromDrizzle.nextCursor };
          expect(await file.list(ownerUserId, next), `term ${String(search)} page two`).toEqual(
            await drizzle.list(ownerUserId, next),
          );
        }
      }

      // The escaping is load-bearing, not incidental: a literal % must not behave as a wildcard.
      expect(
        (await drizzle.list(ownerUserId, { lifecycle: 'active', pageSize: 20, search: '50%' }))
          .projects,
      ).toHaveLength(1);
      expect(
        (await drizzle.list(ownerUserId, { lifecycle: 'active', pageSize: 20, search: 'a_b' }))
          .projects,
      ).toHaveLength(1);
    } finally {
      await rm(directory, { recursive: true, force: true });
      for (const projectId of projectIds) {
        await connection.db
          .update(projects)
          .set({ currentRevisionId: null, currentRevisionNumber: 0 })
          .where(eq(projects.id, projectId));
        await connection.db
          .delete(projectRevisions)
          .where(eq(projectRevisions.projectId, projectId));
        await connection.db.delete(projects).where(eq(projects.id, projectId));
      }
      await connection.db
        .delete(projectOperationReceipts)
        .where(eq(projectOperationReceipts.ownerUserId, ownerUserId));
      await connection.db.delete(users).where(eq(users.id, ownerUserId));
    }
  });

  it('duplicates identically in both repositories and keeps the shared source retained', async () => {
    const ownerUserId = randomUUID();
    const projectId = randomUUID();
    const duplicateId = randomUUID();
    const originalRevisionId = randomUUID();
    const duplicateRevisionId = randomUUID();
    const sourceAssetId = randomUUID();
    const now = '2026-08-11T12:00:00.000Z';
    const later = '2026-08-11T12:05:00.000Z';
    const directory = await mkdtemp(path.join(tmpdir(), 'lightframe-duplicate-parity-'));
    const drizzle = new DrizzleProjectRepository(connection.db);
    const file = new FileProjectRepository(directory);
    const retention = new DrizzleProjectRetentionPolicy(connection.db);
    const lifecycle = new DrizzleAssetLifecycleRegistry(connection.db, retention);
    const readyFacts = {
      sourceStatus: 'ready' as const,
      currentAttempt: { status: 'none' as const },
      validatedLastSuccessfulOutput: null,
    };

    try {
      await connection.db.insert(users).values({
        id: ownerUserId,
        login: `${ownerUserId}@duplicate.test`,
        normalizedLogin: `${ownerUserId}@duplicate.test`,
        username: `d-${ownerUserId}`,
        email: `${ownerUserId}@duplicate.test`,
        displayName: 'Duplicate Parity',
      });
      await connection.db.insert(mediaAssets).values({
        id: sourceAssetId,
        ownerUserId,
        storageProvider: 'local',
        storageKey: sourceAssetId,
        status: 'ready',
        mimeType: 'video/mp4',
        filename: 'source.mp4',
        sizeBytes: 100,
        checksumSha256: 'c'.repeat(64),
      });

      const originalSnapshot = {
        ...createEmptyProjectSnapshot(now),
        sourceAssetId,
        workingMedia: { kind: 'asset' as const, assetId: sourceAssetId },
        presentedMedia: { kind: 'asset' as const, assetId: sourceAssetId },
        localEdit: createDefaultVideoEditSpec(4_000),
        workflowPhase: 'review' as const,
      };
      const original = createProject(
        {
          id: projectId,
          ownerUserId,
          title: 'Launch cut',
          snapshot: originalSnapshot,
          author: { kind: 'user', authorId: ownerUserId },
          facts: readyFacts,
        },
        { now, createId: () => originalRevisionId },
      );
      const originalAggregate = {
        ...original,
        assetLinks: projectAssetLinksForRevision(original.revisions[0]!),
        versionReferenceLinks: projectVersionReferenceLinksForRevision(original.revisions[0]!),
      };
      const originalReceipt = {
        operationKey: randomUUID(),
        requestFingerprint: createHash('sha256').update('duplicate-original').digest('hex'),
        projectId,
        createdAt: now,
      };
      await drizzle.createIdempotent({ aggregate: originalAggregate, receipt: originalReceipt });
      await file.createIdempotent({ aggregate: originalAggregate, receipt: originalReceipt });

      // Exactly what the service composes: the domain rule, then the shared link derivation.
      const derived = duplicateProject(
        { project: original.project, snapshot: originalSnapshot },
        {
          id: duplicateId,
          title: 'Launch cut (copy)',
          campaignId: null,
          expectedVersion: 1,
          author: { kind: 'user', authorId: ownerUserId },
          facts: readyFacts,
        },
        { now: later, createId: () => duplicateRevisionId },
      );
      expect(derived.ok).toBe(true);
      if (!derived.ok) return;
      const duplicateAggregate = {
        ...derived.value,
        assetLinks: projectAssetLinksForRevision(derived.value.revisions[0]!),
        versionReferenceLinks: projectVersionReferenceLinksForRevision(derived.value.revisions[0]!),
      };
      const duplicateReceipt = {
        operationKey: randomUUID(),
        requestFingerprint: createHash('sha256').update('duplicate-copy').digest('hex'),
        projectId: duplicateId,
        createdAt: later,
      };
      const fromDrizzle = await drizzle.createIdempotent({
        aggregate: duplicateAggregate,
        receipt: duplicateReceipt,
      });
      const fromFile = await file.createIdempotent({
        aggregate: duplicateAggregate,
        receipt: duplicateReceipt,
      });

      // Parity: the two implementations accept the same aggregate and read back the same Project.
      expect(fromFile.kind).toBe(fromDrizzle.kind);
      expect(await file.getCurrent(ownerUserId, duplicateId)).toEqual(
        await drizzle.getCurrent(ownerUserId, duplicateId),
      );
      // And an exact replay converges to the one duplicate in both.
      expect(
        (
          await file.createIdempotent({
            aggregate: duplicateAggregate,
            receipt: duplicateReceipt,
          })
        ).kind,
      ).toBe(
        (
          await drizzle.createIdempotent({
            aggregate: duplicateAggregate,
            receipt: duplicateReceipt,
          })
        ).kind,
      );

      // The duplicate contributes its own retention row for the shared source; no bytes were copied.
      const linkedProjectIds = (
        await connection.db
          .select({ projectId: projectAssets.projectId, assetId: projectAssets.assetId })
          .from(projectAssets)
          .where(eq(projectAssets.assetId, sourceAssetId))
      ).map((row) => row.projectId);
      expect(new Set(linkedProjectIds)).toEqual(new Set([projectId, duplicateId]));
      expect(await file.retainedAssetIds(ownerUserId, [sourceAssetId])).toEqual(
        await retention.retainedAssetIds(ownerUserId, [sourceAssetId]),
      );

      // Archiving the original changes nothing about what the duplicate still needs.
      await connection.db
        .update(projects)
        .set({ status: 'archived', archivedAt: later, version: 2 })
        .where(eq(projects.id, projectId));
      expect(await retention.retainsAsset(ownerUserId, sourceAssetId)).toBe(true);
      expect(await lifecycle.claimDeletion(ownerUserId, sourceAssetId, 'local')).toBeNull();

      // Nor does deleting it.
      await connection.db
        .update(projects)
        .set({ status: 'deleted', archivedAt: later, deletedAt: later, version: 3 })
        .where(eq(projects.id, projectId));
      expect(await retention.retainsAsset(ownerUserId, sourceAssetId)).toBe(true);
      expect(await drizzle.getCurrent(ownerUserId, duplicateId)).not.toBeNull();

      // And even if the original's rows were gone entirely, the duplicate alone keeps the bytes:
      // this is what proves the retention comes from the duplicate rather than from the original.
      await connection.db
        .update(projects)
        .set({ currentRevisionId: null, currentRevisionNumber: 0 })
        .where(eq(projects.id, projectId));
      await connection.db.delete(projectAssets).where(eq(projectAssets.projectId, projectId));
      await connection.db.delete(projectRevisions).where(eq(projectRevisions.projectId, projectId));
      await connection.db.delete(projects).where(eq(projects.id, projectId));

      expect(await retention.retainsAsset(ownerUserId, sourceAssetId)).toBe(true);
      expect(await lifecycle.claimDeletion(ownerUserId, sourceAssetId, 'local')).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
      for (const id of [projectId, duplicateId]) {
        await connection.db
          .update(projects)
          .set({ currentRevisionId: null, currentRevisionNumber: 0 })
          .where(eq(projects.id, id));
        await connection.db.delete(projectAssets).where(eq(projectAssets.projectId, id));
        await connection.db.delete(projectRevisions).where(eq(projectRevisions.projectId, id));
        await connection.db.delete(projects).where(eq(projects.id, id));
      }
      await connection.db
        .delete(projectOperationReceipts)
        .where(eq(projectOperationReceipts.ownerUserId, ownerUserId));
      await connection.db.delete(mediaAssets).where(eq(mediaAssets.id, sourceAssetId));
      await connection.db.delete(users).where(eq(users.id, ownerUserId));
    }
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

  it('atomically saves new/append output metadata and reconciles concurrent exact replay', async () => {
    const ownerUserId = randomUUID();
    const projectId = randomUUID();
    const sourceAssetId = randomUUID();
    const createRevisionId = randomUUID();
    const sourceRevisionId = randomUUID();
    const sourceOperationId = randomUUID();
    const outputOperationId = randomUUID();
    const appendOperationId = randomUUID();
    const staleAppendOperationId = randomUUID();
    const createdAt = '2026-08-13T18:00:00.000Z';
    const acceptedAt = '2026-08-13T18:01:00.000Z';
    const outputAt = '2026-08-13T18:02:00.000Z';
    const media = Buffer.from('postgres-project-output-media');
    const checksumSha256 = createHash('sha256').update(media).digest('hex');
    const inspected = {
      mimeType: 'video/mp4' as const,
      container: 'mp4' as const,
      videoCodec: 'avc' as const,
      audioCodec: 'aac' as const,
      durationMs: 12_000,
      width: 1_280,
      height: 720,
      sizeBytes: media.byteLength,
      hasAudio: true,
    };
    const bytes: AssetByteStore = {
      storeFile: () => Promise.reject(new Error('not used')),
      storeBytes: () => Promise.reject(new Error('not used')),
      open: (readOwnerUserId, assetId) =>
        Promise.resolve(
          readOwnerUserId === ownerUserId && assetId === sourceAssetId
            ? {
                manifest: {
                  schemaVersion: 1,
                  assetId: sourceAssetId,
                  ownerUserId,
                  mimeType: inspected.mimeType,
                  filename: 'project-output.mp4',
                  sizeBytes: media.byteLength,
                  checksumSha256,
                  createdAt: acceptedAt,
                },
                createReadStream: (range) =>
                  Readable.from(
                    range === undefined ? media : media.subarray(range.start, range.end + 1),
                  ),
              }
            : null,
        ),
      exists: (readOwnerUserId, assetId) =>
        Promise.resolve(readOwnerUserId === ownerUserId && assetId === sourceAssetId),
      delete: () => Promise.resolve(),
    };
    const repository = new DrizzleProjectRepository(connection.db);
    const savedVideoRepository = new DrizzleSavedVideoRepository(connection.db);

    try {
      await connection.db.insert(users).values({
        id: ownerUserId,
        login: `${ownerUserId}@project-output.test`,
        normalizedLogin: `${ownerUserId}@project-output.test`,
        username: `po-${ownerUserId}`,
        email: `${ownerUserId}@project-output.test`,
        displayName: 'Project Output Integration',
      });
      await connection.db.insert(mediaAssets).values({
        id: sourceAssetId,
        ownerUserId,
        storageProvider: 'local',
        storageKey: sourceAssetId,
        status: 'ready',
        mimeType: inspected.mimeType,
        filename: 'project-output.mp4',
        sizeBytes: media.byteLength,
        checksumSha256,
      });
      const created = createProject(
        {
          id: projectId,
          ownerUserId,
          title: 'Relational output',
          author: { kind: 'user', authorId: ownerUserId },
          facts: {
            sourceStatus: 'none',
            currentAttempt: { status: 'none' },
            validatedLastSuccessfulOutput: null,
          },
        },
        { now: createdAt, createId: () => createRevisionId },
      );
      await repository.create(created);
      const accepted = acceptProjectSource(
        created,
        {
          expectedProjectVersion: 1,
          expectedRevisionNumber: 1,
          assetId: sourceAssetId,
          mediaReference: { kind: 'asset', assetId: sourceAssetId },
          author: { kind: 'user', authorId: ownerUserId },
        },
        { now: acceptedAt, createId: () => sourceRevisionId },
      );
      if (!accepted.ok) throw new Error('Expected source acceptance.');
      const acceptedRevision = accepted.value.revisions.at(-1)!;
      await expect(
        repository.acceptSource({
          ownerUserId,
          projectId,
          expectedVersion: 1,
          expectedRevisionNumber: 1,
          nextProject: accepted.value.project,
          revision: acceptedRevision,
          assetLinks: projectAssetLinksForRevision(acceptedRevision),
          source: {
            projectId,
            ownerUserId,
            assetId: sourceAssetId,
            kind: 'uploaded',
            savedVideoId: null,
            videoVersionId: null,
            acceptedRevisionId: sourceRevisionId,
            acceptedRevisionNumber: 2,
            operationKey: sourceOperationId,
            requestFingerprint: 'a'.repeat(64),
            mimeType: inspected.mimeType,
            filename: 'project-output.mp4',
            sizeBytes: media.byteLength,
            checksumSha256,
            container: inspected.container,
            videoCodec: inspected.videoCodec,
            audioCodec: inspected.audioCodec,
            durationMs: inspected.durationMs,
            width: inspected.width,
            height: inspected.height,
            hasAudio: inspected.hasAudio,
            acceptedAt,
          },
        }),
      ).resolves.toMatchObject({ kind: 'accepted' });

      const outputService = new ProjectOutputService(
        repository,
        repository,
        savedVideoRepository,
        bytes,
        {
          now: () => new Date(outputAt),
          inspect: () => Promise.resolve(inspected),
        },
      );
      const first = await outputService.save(ownerUserId, projectId, outputOperationId, {
        expectedVersion: 2,
        expectedRevisionNumber: 2,
        media: { kind: 'asset', assetId: sourceAssetId },
        target: { kind: 'new', title: 'Relational master' },
        renditions: [],
      });
      expect(first).toMatchObject({
        ok: true,
        response: {
          replayed: false,
          project: { status: 'completed', version: 3, currentRevisionNumber: 3 },
          output: { producingRevisionNumber: 2 },
          savedVideo: { versionCount: 1 },
        },
      });
      if (!first.ok) throw new Error('Expected new output save.');
      await expect(
        outputService.save(ownerUserId, projectId, outputOperationId, {
          expectedVersion: 2,
          expectedRevisionNumber: 2,
          media: { kind: 'asset', assetId: sourceAssetId },
          target: { kind: 'new', title: 'Relational master' },
          renditions: [],
        }),
      ).resolves.toMatchObject({ ok: true, response: { replayed: true } });

      const appendRequest = {
        expectedVersion: 3,
        expectedRevisionNumber: 3,
        media: first.response.revision.snapshot.workingMedia!,
        target: {
          kind: 'version' as const,
          savedVideoId: first.response.savedVideo.id,
          expectedVersionId: first.response.savedVideo.currentVersion.id,
        },
        renditions: [],
      };
      const concurrent = await Promise.all([
        outputService.save(ownerUserId, projectId, appendOperationId, appendRequest),
        outputService.save(ownerUserId, projectId, appendOperationId, appendRequest),
      ]);
      expect(concurrent.every((result) => result.ok)).toBe(true);
      expect(concurrent.map((result) => (result.ok ? result.response.replayed : null))).toEqual(
        expect.arrayContaining([false, true]),
      );
      const appended = concurrent.find((result) => result.ok && result.response.replayed === false);
      if (appended === undefined || !appended.ok) throw new Error('Expected appended output.');
      expect(appended.response).toMatchObject({
        project: { version: 4, currentRevisionNumber: 4 },
        output: { producingRevisionNumber: 3 },
        savedVideo: { versionCount: 2, currentVersion: { ordinal: 2 } },
      });
      await expect(
        outputService.save(ownerUserId, projectId, staleAppendOperationId, {
          expectedVersion: 4,
          expectedRevisionNumber: 4,
          media: appended.response.revision.snapshot.workingMedia!,
          target: {
            kind: 'version',
            savedVideoId: first.response.savedVideo.id,
            expectedVersionId: first.response.savedVideo.currentVersion.id,
          },
          renditions: [],
        }),
      ).resolves.toMatchObject({
        ok: false,
        conflict: { kind: 'saved-video-version' },
      });
      await expect(
        connection.db.select().from(projectOutputs).where(eq(projectOutputs.projectId, projectId)),
      ).resolves.toHaveLength(2);
      await expect(
        connection.db
          .select()
          .from(videoVersions)
          .where(eq(videoVersions.videoId, first.response.savedVideo.id)),
      ).resolves.toHaveLength(2);
      await expect(
        connection.db
          .select()
          .from(projectOutputOperationReceipts)
          .where(eq(projectOutputOperationReceipts.projectId, projectId)),
      ).resolves.toHaveLength(2);
      await expect(
        connection.db
          .select()
          .from(projectWorkingMediaAdoptions)
          .where(eq(projectWorkingMediaAdoptions.projectId, projectId)),
      ).resolves.toHaveLength(2);
    } finally {
      await connection.db
        .delete(projectOutputOperationReceipts)
        .where(eq(projectOutputOperationReceipts.projectId, projectId));
      await connection.db
        .delete(projectWorkingMediaAdoptions)
        .where(eq(projectWorkingMediaAdoptions.projectId, projectId));
      await connection.db
        .delete(projectVersionReferences)
        .where(eq(projectVersionReferences.projectId, projectId));
      await connection.db.delete(projectOutputs).where(eq(projectOutputs.projectId, projectId));
      await connection.db.delete(projectAssets).where(eq(projectAssets.projectId, projectId));
      await connection.db.delete(projectSources).where(eq(projectSources.projectId, projectId));
      await connection.db
        .update(projects)
        .set({ currentRevisionId: null, currentRevisionNumber: 0 })
        .where(eq(projects.id, projectId));
      await connection.db.delete(projectRevisions).where(eq(projectRevisions.projectId, projectId));
      await connection.db.delete(projects).where(eq(projects.id, projectId));
      await connection.db.delete(videoVersions).where(eq(videoVersions.ownerUserId, ownerUserId));
      await connection.db.delete(savedVideos).where(eq(savedVideos.ownerUserId, ownerUserId));
      await connection.db.delete(mediaAssets).where(eq(mediaAssets.id, sourceAssetId));
      await connection.db.delete(users).where(eq(users.id, ownerUserId));
    }
  }, 30_000);

  it('atomically accepts and replays one inspected ready Project source', async () => {
    const ownerUserId = randomUUID();
    const projectId = randomUUID();
    const assetId = randomUUID();
    const workingAssetId = randomUUID();
    const operationKey = randomUUID();
    const workingOperationKey = randomUUID();
    const firstRevisionId = randomUUID();
    const sourceRevisionId = randomUUID();
    const workingRevisionId = randomUUID();
    const creativeRevisionId = randomUUID();
    const processingOperationId = randomUUID();
    const processingResultAssetId = randomUUID();
    const resultRevisionId = randomUUID();
    const createdAt = '2026-08-12T12:00:00.000Z';
    const acceptedAt = '2026-08-12T12:05:00.000Z';
    const adoptedAt = '2026-08-12T12:10:00.000Z';
    const creativeAt = '2026-08-12T12:15:00.000Z';
    const submittedAt = '2026-08-12T12:20:00.000Z';
    const acceptedJobAt = '2026-08-12T12:21:00.000Z';
    const retainedAt = '2026-08-12T12:25:00.000Z';
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
      await connection.db.insert(mediaAssets).values([
        {
          id: assetId,
          ownerUserId,
          storageProvider: 'local',
          storageKey: assetId,
          status: 'ready',
          mimeType: 'video/mp4',
          filename: 'project-source.mp4',
          sizeBytes: 1_024,
          checksumSha256: 'c'.repeat(64),
        },
        {
          id: workingAssetId,
          ownerUserId,
          storageProvider: 'local',
          storageKey: workingAssetId,
          status: 'ready',
          mimeType: 'video/mp4',
          filename: 'project-working.mp4',
          sizeBytes: 900,
          checksumSha256: 'f'.repeat(64),
        },
      ]);
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

      const localEdit = {
        ...createDefaultVideoEditSpec(12_000),
        filter: 'warm' as const,
      };
      const adopted = adoptProjectWorkingMedia(
        accepted.value,
        {
          expectedProjectVersion: 2,
          expectedRevisionNumber: 2,
          mediaReference: { kind: 'asset', assetId: workingAssetId },
          localEdit,
          author: { kind: 'user', authorId: ownerUserId },
        },
        { now: adoptedAt, createId: () => workingRevisionId },
      );
      if (!adopted.ok) throw new Error('Expected working-media adoption to be formed.');
      const workingRevision = adopted.value.revisions.at(-1)!;
      const workingAssetLinks: ProjectAssetLink[] = [
        { assetId, role: 'source' as const },
        { assetId: workingAssetId, role: 'working' as const },
        { assetId: workingAssetId, role: 'presented' as const },
      ].map((link) => ({
        projectId,
        ownerUserId,
        ...link,
        revisionId: workingRevisionId,
        revisionNumber: 3,
        createdAt: adoptedAt,
      }));
      const workingMedia: ProjectWorkingMediaRecord = {
        projectId,
        ownerUserId,
        kind: 'local-render',
        mediaReference: { kind: 'asset', assetId: workingAssetId },
        assetId: workingAssetId,
        savedVideoId: null,
        videoVersionId: null,
        adoptedRevisionId: workingRevisionId,
        adoptedRevisionNumber: 3,
        operationKey: workingOperationKey,
        requestFingerprint: 'e'.repeat(64),
        mimeType: 'video/mp4',
        filename: 'project-working.mp4',
        sizeBytes: 900,
        checksumSha256: 'f'.repeat(64),
        container: 'mp4',
        videoCodec: 'avc',
        audioCodec: 'aac',
        durationMs: 11_000,
        width: 1_280,
        height: 720,
        hasAudio: true,
        adoptedAt,
      };
      const workingInput = {
        ownerUserId,
        projectId,
        expectedVersion: 2,
        expectedRevisionNumber: 2,
        nextProject: adopted.value.project,
        revision: workingRevision,
        assetLinks: workingAssetLinks,
        media: workingMedia,
      };
      await expect(repository.adoptWorkingMedia(workingInput)).resolves.toMatchObject({
        kind: 'adopted',
        value: {
          project: { version: 3 },
          revision: {
            id: workingRevisionId,
            snapshot: {
              sourceAssetId: assetId,
              workingMedia: { kind: 'asset', assetId: workingAssetId },
              localEdit,
              lastSuccessfulOutput: null,
            },
          },
          media: { operationKey: workingOperationKey },
        },
      });
      await expect(repository.adoptWorkingMedia(workingInput)).resolves.toMatchObject({
        kind: 'replayed',
        value: {
          revision: { id: workingRevisionId },
          media: { operationKey: workingOperationKey },
        },
      });
      await expect(repository.getWorkingMedia(ownerUserId, projectId)).resolves.toMatchObject({
        revision: { id: workingRevisionId },
        media: { assetId: workingAssetId },
      });
      const checkpointed = appendProjectRevision(
        adopted.value,
        {
          expectedProjectVersion: 3,
          expectedRevisionNumber: 3,
          snapshot: {
            ...workingRevision.snapshot,
            creativeIntent: {
              ...workingRevision.snapshot.creativeIntent,
              userIntent: 'A later creative checkpoint.',
            },
            workflowPhase: 'creative',
            updatedAt: creativeAt,
          },
          author: { kind: 'user', authorId: ownerUserId },
          source: 'user-edit',
          facts: {
            sourceStatus: 'ready',
            currentAttempt: { status: 'none' },
            validatedLastSuccessfulOutput: null,
          },
        },
        { now: creativeAt, createId: () => creativeRevisionId },
      );
      if (!checkpointed.ok) throw new Error('Expected later creative checkpoint to be formed.');
      const creativeRevision = checkpointed.value.revisions.at(-1)!;
      const creativeAssetLinks: ProjectAssetLink[] = [
        { assetId, role: 'source' as const },
        { assetId: workingAssetId, role: 'working' as const },
        { assetId: workingAssetId, role: 'presented' as const },
      ].map((link) => ({
        projectId,
        ownerUserId,
        ...link,
        revisionId: creativeRevisionId,
        revisionNumber: 4,
        createdAt: creativeAt,
      }));
      await expect(
        repository.appendRevision({
          ownerUserId,
          projectId,
          expectedVersion: 3,
          expectedRevisionNumber: 3,
          nextProject: checkpointed.value.project,
          revision: creativeRevision,
          assetLinks: creativeAssetLinks,
        }),
      ).resolves.toEqual({ kind: 'updated' });
      await expect(repository.getWorkingMedia(ownerUserId, projectId)).resolves.toMatchObject({
        project: { version: 4, currentRevisionId: creativeRevisionId },
        revision: { id: creativeRevisionId },
        media: { adoptedRevisionId: workingRevisionId, assetId: workingAssetId },
      });
      await expect(repository.adoptWorkingMedia(workingInput)).resolves.toMatchObject({
        kind: 'replayed',
        value: {
          project: { version: 4 },
          revision: { id: creativeRevisionId },
          media: { adoptedRevisionId: workingRevisionId },
        },
      });
      await expect(repository.getSource(ownerUserId, projectId)).resolves.toEqual(source);
      await expect(
        repository.adoptWorkingMedia({
          ...workingInput,
          media: { ...workingMedia, requestFingerprint: '0'.repeat(64) },
        }),
      ).resolves.toEqual({
        kind: 'conflict',
        conflict: { kind: 'operation-key', operation: 'working-media-adopt' },
      });

      const attempt: ProjectProcessingAttemptRecord = {
        operationId: processingOperationId,
        ownerUserId,
        projectId,
        capability: 'character-swap',
        provider: 'decart',
        providerJobId: null,
        requestFingerprint: '1'.repeat(64),
        inputAssetId: workingAssetId,
        resultAssetId: processingResultAssetId,
        outputAssetId: null,
        result: null,
        retryOfOperationId: null,
        attemptNumber: 1,
        initiatingRevisionId: creativeRevisionId,
        initiatingRevisionNumber: 4,
        resultRevisionId: null,
        resultRevisionNumber: null,
        status: 'submitting',
        safeErrorCode: null,
        outputResolution: '720p',
        providerOutputLocation: null,
        sourceDurationMs: 11_000,
        sourceOrientation: 'landscape',
        createdAt: submittedAt,
        updatedAt: submittedAt,
        acceptedAt: null,
        completedAt: null,
        expiresAt: '2026-08-12T13:20:00.000Z',
      };
      const admission = {
        attempt,
        link: {
          projectId,
          ownerUserId,
          jobId: processingOperationId,
          initiatingRevisionId: creativeRevisionId,
          initiatingRevisionNumber: 4,
          createdAt: submittedAt,
        },
        expectedVersion: 4,
        expectedRevisionNumber: 4,
      };
      await expect(repository.admitProjectAttempt(admission)).resolves.toMatchObject({
        kind: 'admitted',
        attempt: { operationId: processingOperationId, status: 'submitting' },
      });
      await expect(
        repository.admitProjectAttempt({
          ...admission,
          attempt: { ...attempt, requestFingerprint: '2'.repeat(64) },
        }),
      ).resolves.toEqual({ kind: 'conflict', conflict: { kind: 'operation-key' } });

      const [replay, blockedArchive] = await Promise.all([
        repository.admitProjectAttempt(admission),
        new ProjectService(repository, { now: () => new Date(acceptedJobAt) }).archive(
          ownerUserId,
          projectId,
          5,
        ),
      ]);
      expect(replay).toMatchObject({
        kind: 'replayed',
        attempt: { operationId: processingOperationId },
      });
      expect(blockedArchive).toEqual({
        ok: false,
        conflict: { kind: 'active-jobs', projectId },
      });
      await expect(
        repository.listProjectAttempts(ownerUserId, projectId, { pageSize: 1 }),
      ).resolves.toMatchObject({
        attempts: [{ operationId: processingOperationId }],
        currentOperationId: processingOperationId,
        supersededOperationIds: [],
        nextCursor: null,
      });

      await expect(
        repository.updateProjectAttemptTrace({
          schemaVersion: 1,
          jobId: processingOperationId,
          ownerUserId,
          operation: 'character-swap',
          provider: 'decart',
          providerJobId: 'durable-provider-job',
          requestFingerprint: attempt.requestFingerprint,
          outputResolution: '720p',
          providerOutputLocation: null,
          sourceDurationMs: 11_000,
          sourceOrientation: 'landscape',
          status: 'queued',
          safeErrorCode: null,
          createdAt: submittedAt,
          updatedAt: acceptedJobAt,
          completedAt: null,
        }),
      ).resolves.toBe(true);
      await expect(
        repository.listResumableProjectAttempts('2026-08-12T12:22:00.000Z'),
      ).resolves.toMatchObject([
        {
          jobId: processingOperationId,
          providerJobId: 'durable-provider-job',
          status: 'queued',
        },
      ]);

      const inspected = {
        mimeType: 'video/mp4' as const,
        container: 'mp4' as const,
        videoCodec: 'avc' as const,
        audioCodec: 'aac',
        durationMs: 11_000,
        width: 1_280,
        height: 720,
        sizeBytes: 880,
        hasAudio: true,
      };
      const resultChecksum = '9'.repeat(64);
      await connection.db.insert(mediaAssets).values({
        id: processingResultAssetId,
        ownerUserId,
        storageProvider: 'local',
        storageKey: processingResultAssetId,
        status: 'ready',
        mimeType: inspected.mimeType,
        filename: 'character-swap-result.mp4',
        sizeBytes: inspected.sizeBytes,
        checksumSha256: resultChecksum,
      });
      const processingCurrent = await repository.getCurrent(ownerUserId, projectId);
      if (processingCurrent === null)
        throw new Error('Expected the admitted Project to remain current.');
      const promoted = promoteProjectJobResult(
        {
          project: processingCurrent.project,
          revisions: [processingCurrent.revision],
          assetLinks: [],
          versionReferenceLinks: [],
          jobLinks: [],
          outputLinks: [],
        },
        {
          expectedProjectVersion: 5,
          expectedRevisionNumber: 4,
          initiatingRevisionId: creativeRevisionId,
          initiatingRevisionNumber: 4,
          operationIsCurrent: true,
          operationId: processingOperationId,
          assetId: processingResultAssetId,
          author: { kind: 'system', authorId: 'project-processing' },
        },
        { now: retainedAt, createId: () => resultRevisionId },
      );
      if (promoted.kind !== 'promoted')
        throw new Error('Expected the current job result to promote.');
      const resultRevision = promoted.value.revisions.at(-1)!;
      const resultMedia: ProjectWorkingMediaRecord = {
        projectId,
        ownerUserId,
        kind: 'media-asset',
        mediaReference: { kind: 'asset', assetId: processingResultAssetId },
        assetId: processingResultAssetId,
        savedVideoId: null,
        videoVersionId: null,
        adoptedRevisionId: resultRevisionId,
        adoptedRevisionNumber: 5,
        operationKey: processingOperationId,
        requestFingerprint: '3'.repeat(64),
        mimeType: inspected.mimeType,
        filename: 'character-swap-result.mp4',
        sizeBytes: inspected.sizeBytes,
        checksumSha256: resultChecksum,
        container: inspected.container,
        videoCodec: inspected.videoCodec,
        audioCodec: inspected.audioCodec,
        durationMs: inspected.durationMs,
        width: inspected.width,
        height: inspected.height,
        hasAudio: inspected.hasAudio,
        adoptedAt: retainedAt,
      };
      const retentionInput = {
        ownerUserId,
        projectId,
        operationId: processingOperationId,
        manifest: {
          schemaVersion: 1 as const,
          assetId: processingResultAssetId,
          ownerUserId,
          mimeType: inspected.mimeType,
          filename: 'character-swap-result.mp4',
          sizeBytes: inspected.sizeBytes,
          checksumSha256: resultChecksum,
          createdAt: retainedAt,
        },
        inspected,
        jobOutputLink: {
          projectId,
          ownerUserId,
          assetId: processingResultAssetId,
          role: 'job-output' as const,
          revisionId: creativeRevisionId,
          revisionNumber: 4,
          createdAt: retainedAt,
        },
        currentPromotion: {
          expectedVersion: 5,
          expectedRevisionNumber: 4,
          expectedCurrentOperationId: processingOperationId,
          revision: {
            ownerUserId,
            projectId,
            expectedVersion: 5,
            expectedRevisionNumber: 4,
            nextProject: promoted.value.project,
            revision: resultRevision,
            assetLinks: projectAssetLinksForRevision(resultRevision),
          },
          media: resultMedia,
        },
        retainedAt,
      };
      await expect(repository.retainProjectResult(retentionInput)).resolves.toMatchObject({
        kind: 'retained-current',
        attempt: {
          operationId: processingOperationId,
          outputAssetId: processingResultAssetId,
          resultRevisionId,
        },
        workingMedia: {
          project: { version: 6, currentRevisionId: resultRevisionId },
          revision: { id: resultRevisionId, source: 'job-result' },
          media: { assetId: processingResultAssetId, operationKey: processingOperationId },
        },
      });
      await expect(repository.retainProjectResult(retentionInput)).resolves.toMatchObject({
        kind: 'replayed-current',
        attempt: { resultRevisionId },
      });
      await expect(
        connection.db
          .select()
          .from(projectAssets)
          .where(eq(projectAssets.assetId, processingResultAssetId)),
      ).resolves.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ role: 'job-output', revisionId: creativeRevisionId }),
          expect.objectContaining({ role: 'working', revisionId: resultRevisionId }),
          expect.objectContaining({ role: 'presented', revisionId: resultRevisionId }),
        ]),
      );
      await expect(
        connection.db.select().from(savedVideos).where(eq(savedVideos.ownerUserId, ownerUserId)),
      ).resolves.toEqual([]);
    } finally {
      await connection.db.delete(projectJobs).where(eq(projectJobs.projectId, projectId));
      await connection.db
        .delete(processingJobs)
        .where(eq(processingJobs.id, processingOperationId));
      await connection.db
        .delete(projectWorkingMediaAdoptions)
        .where(eq(projectWorkingMediaAdoptions.projectId, projectId));
      await connection.db.delete(projectSources).where(eq(projectSources.projectId, projectId));
      await connection.db.delete(projectAssets).where(eq(projectAssets.projectId, projectId));
      await connection.db
        .update(projects)
        .set({ currentRevisionId: null, currentRevisionNumber: 0 })
        .where(eq(projects.id, projectId));
      await connection.db.delete(projectRevisions).where(eq(projectRevisions.projectId, projectId));
      await connection.db.delete(projects).where(eq(projects.id, projectId));
      await connection.db.delete(mediaAssets).where(eq(mediaAssets.id, assetId));
      await connection.db.delete(mediaAssets).where(eq(mediaAssets.id, workingAssetId));
      await connection.db.delete(mediaAssets).where(eq(mediaAssets.id, processingResultAssetId));
      await connection.db.delete(users).where(eq(users.id, ownerUserId));
    }
  }, 20_000);
});
