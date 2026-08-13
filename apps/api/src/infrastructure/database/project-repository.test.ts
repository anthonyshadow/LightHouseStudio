import { createEmptyProjectSnapshot, createProject, type ProjectAssetLink } from '@studio/domain';
import { describe, expect, it } from 'vitest';
import {
  DrizzleProjectRepository,
  mapProjectAggregate,
  ProjectPersistenceError,
} from './project-repository.js';
import { scriptedDatabase } from './scripted-database.test-support.js';
import { projectAssets, projectOperationReceipts, projectRevisions, projects } from './schema.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const campaignId = '20ce94fa-15d1-42c6-abd3-77ff61516b48';
const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const revisionId = '3ac244b9-ec36-4a1e-b95e-7bcf37eb0b2d';
const secondRevisionId = '4159225b-60f4-4f94-a3d5-08feee91a91d';
const assetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const jobId = '4ad4594c-acde-4cba-acde-584509d9db91';
const videoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const versionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
const secondVideoId = '4a3e43b7-c237-4f07-9ff7-eb5ab6a14d12';
const secondVersionId = 'cc6b6098-c83b-42cd-b435-d3542e584f9c';
const workingMediaOperationKey = '0264e60f-2dc5-4d4b-a9f6-25c91a66285c';
const now = '2026-08-11T12:00:00.000Z';
const postgresNow = '2026-08-11 12:00:00+00';

const sourceAggregate = () => {
  const snapshot = {
    ...createEmptyProjectSnapshot(now),
    sourceAssetId: assetId,
    workingMedia: { kind: 'asset' as const, assetId },
    presentedMedia: { kind: 'asset' as const, assetId },
  };
  const aggregate = createProject(
    {
      id: projectId,
      ownerUserId,
      title: 'Summer Campaign',
      snapshot,
      author: { kind: 'user', authorId: ownerUserId },
      facts: {
        sourceStatus: 'ready',
        currentAttempt: { status: 'none' },
        validatedLastSuccessfulOutput: null,
      },
    },
    { now, createId: () => revisionId },
  );
  const assetLinks: ProjectAssetLink[] = ['source', 'working', 'presented'].map((role) => ({
    projectId,
    ownerUserId,
    assetId,
    role: role as ProjectAssetLink['role'],
    revisionId,
    revisionNumber: 1,
    createdAt: now,
  }));
  return { ...aggregate, assetLinks };
};

const workingMediaReadRow = () => {
  const aggregate = sourceAggregate();
  return {
    project: {
      ...aggregate.project,
      archivedAt: null,
      deletedAt: null,
      createdAt: postgresNow,
      updatedAt: postgresNow,
    },
    revision: {
      ...aggregate.revisions[0]!,
      snapshotSchemaVersion: 2,
      snapshot: aggregate.revisions[0]!.snapshot,
      authorKind: 'user' as const,
      authorId: ownerUserId,
      createdAt: postgresNow,
    },
    media: {
      projectId,
      ownerUserId,
      kind: 'media-asset',
      assetId,
      savedVideoId: null,
      videoVersionId: null,
      adoptedRevisionId: revisionId,
      adoptedRevisionNumber: 1,
      operationKey: workingMediaOperationKey,
      requestFingerprint: 'a'.repeat(64),
      mimeType: 'video/mp4',
      filename: 'working-media.mp4',
      sizeBytes: 1_024,
      checksumSha256: 'b'.repeat(64),
      container: 'mp4',
      videoCodec: 'avc',
      audioCodec: 'aac',
      durationMs: 12_000,
      width: 1_280,
      height: 720,
      hasAudio: true,
      adoptedAt: postgresNow,
    },
  };
};

describe('Project persistence mapping and transactions', () => {
  it('maps validated snapshots and any number of normalized output links', () => {
    const aggregate = sourceAggregate();
    const projectRow = {
      ...aggregate.project,
      archivedAt: null,
      deletedAt: null,
      createdAt: postgresNow,
      updatedAt: postgresNow,
    };
    const revisionRow = {
      id: revisionId,
      projectId,
      ownerUserId,
      revisionNumber: 1,
      parentRevisionId: null,
      parentRevisionNumber: null,
      snapshotSchemaVersion: 2,
      snapshot: aggregate.revisions[0]!.snapshot,
      authorKind: 'user' as const,
      authorId: ownerUserId,
      source: 'create' as const,
      createdAt: postgresNow,
    };
    const outputRows = [0, 1, 2].map((offset) => ({
      projectId,
      ownerUserId,
      savedVideoId: `${videoId.slice(0, -1)}${offset}`,
      videoVersionId: `${versionId.slice(0, -1)}${offset}`,
      producingRevisionId: revisionId,
      producingRevisionNumber: 1,
      createdAt: postgresNow,
    }));

    const mapped = mapProjectAggregate(projectRow, [revisionRow], [], [], outputRows);
    expect(mapped).toMatchObject({
      project: { id: projectId, currentRevisionNumber: 1 },
      revisions: [{ id: revisionId, snapshot: { sourceAssetId: assetId } }],
    });
    expect(mapped.outputLinks.map(({ savedVideoId }) => savedVideoId)).toEqual(
      outputRows.map(({ savedVideoId }) => savedVideoId),
    );
    expect(() =>
      mapProjectAggregate(
        projectRow,
        [{ ...revisionRow, snapshot: { ...revisionRow.snapshot, objectUrl: 'blob:unsafe' } }],
        [],
        [],
        [],
      ),
    ).toThrow();
  });

  it('loads the current Project and revision in one query', async () => {
    const aggregate = sourceAggregate();
    const scripted = scriptedDatabase([
      {
        project: {
          ...aggregate.project,
          archivedAt: null,
          deletedAt: null,
          createdAt: postgresNow,
          updatedAt: postgresNow,
        },
        revision: {
          ...aggregate.revisions[0]!,
          snapshotSchemaVersion: 2,
          snapshot: aggregate.revisions[0]!.snapshot,
          authorKind: 'user',
          authorId: ownerUserId,
          createdAt: postgresNow,
        },
      },
    ]);
    const repository = new DrizzleProjectRepository(scripted.db);

    await expect(repository.getCurrent(ownerUserId, projectId)).resolves.toMatchObject({
      project: { id: projectId, currentRevisionNumber: 1 },
      revision: { id: revisionId, revisionNumber: 1 },
    });
    expect(scripted.calls.filter(({ operation }) => operation === 'select')).toHaveLength(1);
    expect(scripted.remaining()).toBe(0);
  });

  it('loads the current Project, revision, and source in one query', async () => {
    const aggregate = sourceAggregate();
    const scripted = scriptedDatabase([
      {
        project: {
          ...aggregate.project,
          archivedAt: null,
          deletedAt: null,
          createdAt: postgresNow,
          updatedAt: postgresNow,
        },
        revision: {
          ...aggregate.revisions[0]!,
          snapshotSchemaVersion: 2,
          snapshot: aggregate.revisions[0]!.snapshot,
          authorKind: 'user',
          authorId: ownerUserId,
          createdAt: postgresNow,
        },
        source: {
          projectId,
          ownerUserId,
          assetId,
          kind: 'uploaded',
          savedVideoId: null,
          videoVersionId: null,
          acceptedRevisionId: revisionId,
          acceptedRevisionNumber: 1,
          operationKey: '0264e60f-2dc5-4d4b-a9f6-25c91a66285c',
          requestFingerprint: 'a'.repeat(64),
          mimeType: 'video/mp4',
          filename: 'source.mp4',
          sizeBytes: 1_024,
          checksumSha256: 'b'.repeat(64),
          container: 'mp4',
          videoCodec: 'avc',
          audioCodec: 'aac',
          durationMs: 12_000,
          width: 1_280,
          height: 720,
          hasAudio: true,
          acceptedAt: postgresNow,
        },
      },
    ]);
    const repository = new DrizzleProjectRepository(scripted.db);

    await expect(repository.getCurrentWithSource(ownerUserId, projectId)).resolves.toMatchObject({
      current: {
        project: { id: projectId, currentRevisionNumber: 1 },
        revision: { id: revisionId, revisionNumber: 1 },
      },
      source: { projectId, assetId, kind: 'uploaded' },
    });
    expect(scripted.calls.filter(({ operation }) => operation === 'select')).toHaveLength(1);
    expect(scripted.remaining()).toBe(0);
  });

  it.each([
    [
      'current snapshot pointer',
      (repository: DrizzleProjectRepository) => repository.getWorkingMedia(ownerUserId, projectId),
    ],
    [
      'adoption revision',
      (repository: DrizzleProjectRepository) =>
        repository.getWorkingMedia(ownerUserId, projectId, revisionId),
    ],
    [
      'operation key',
      (repository: DrizzleProjectRepository) =>
        repository.getWorkingMediaByOperationKey(ownerUserId, workingMediaOperationKey),
    ],
  ])('loads Project working media by %s in one query', async (_label, load) => {
    const scripted = scriptedDatabase([workingMediaReadRow()]);
    const repository = new DrizzleProjectRepository(scripted.db);

    await expect(load(repository)).resolves.toMatchObject({
      project: { id: projectId, currentRevisionNumber: 1 },
      revision: { id: revisionId, revisionNumber: 1 },
      media: {
        assetId,
        operationKey: workingMediaOperationKey,
        mediaReference: { kind: 'asset', assetId },
      },
    });
    expect(scripted.calls.filter(({ operation }) => operation === 'select')).toHaveLength(1);
    expect(scripted.remaining()).toBe(0);
  });

  it('creates the parent, revision, ready asset links, and current pointer in one transaction', async () => {
    const scripted = scriptedDatabase([], [], [{ id: assetId, status: 'ready' }], [], []);
    const repository = new DrizzleProjectRepository(scripted.db);

    await expect(repository.create(sourceAggregate())).resolves.toBeUndefined();

    const insertedTables = scripted.calls
      .filter(({ operation }) => operation === 'insert')
      .map(({ arguments: [table] }) => table);
    expect(insertedTables).toEqual([projects, projectRevisions, projectAssets]);
    expect(scripted.calls.filter(({ operation }) => operation === 'insert')).toHaveLength(3);
    expect(scripted.calls.some(({ operation }) => operation === 'update')).toBe(true);
    expect(scripted.remaining()).toBe(0);
  });

  it('commits the create receipt with an empty Project and replays the stored result', async () => {
    const aggregate = createProject(
      {
        id: projectId,
        ownerUserId,
        title: 'Idempotent empty Project',
        campaignId,
        author: { kind: 'user', authorId: ownerUserId },
        facts: {
          sourceStatus: 'none',
          currentAttempt: { status: 'none' },
          validatedLastSuccessfulOutput: null,
        },
      },
      { now, createId: () => revisionId },
    );
    const receipt = {
      operationKey: '0264e60f-2dc5-4d4b-a9f6-25c91a66285c',
      requestFingerprint: 'a'.repeat(64),
      projectId,
      createdAt: now,
    };
    const createdDatabase = scriptedDatabase(
      [{ operationKey: receipt.operationKey }],
      [{ id: campaignId }],
      [],
      [],
      [],
    );
    const repository = new DrizzleProjectRepository(createdDatabase.db);
    await expect(repository.createIdempotent({ aggregate, receipt })).resolves.toMatchObject({
      kind: 'created',
      current: { project: { id: projectId }, revision: { id: revisionId } },
    });
    expect(
      createdDatabase.calls
        .filter(({ operation }) => operation === 'insert')
        .map(({ arguments: [table] }) => table),
    ).toEqual([projectOperationReceipts, projects, projectRevisions]);
    expect(createdDatabase.calls.filter(({ operation }) => operation === 'select')).toHaveLength(1);
    expect(createdDatabase.remaining()).toBe(0);

    const replayDatabase = scriptedDatabase(
      [],
      [
        {
          receipt: { ...receipt, ownerUserId, operation: 'create' },
          project: {
            ...aggregate.project,
            archivedAt: null,
            deletedAt: null,
            createdAt: postgresNow,
            updatedAt: postgresNow,
          },
          revision: {
            ...aggregate.revisions[0]!,
            snapshotSchemaVersion: 2,
            snapshot: aggregate.revisions[0]!.snapshot,
            authorKind: 'user',
            authorId: ownerUserId,
            createdAt: postgresNow,
          },
        },
      ],
    );
    await expect(
      new DrizzleProjectRepository(replayDatabase.db).createIdempotent({ aggregate, receipt }),
    ).resolves.toMatchObject({ kind: 'replayed', current: { project: { id: projectId } } });
    expect(replayDatabase.calls.filter(({ operation }) => operation === 'select')).toHaveLength(1);
    expect(replayDatabase.remaining()).toBe(0);
  });

  it('returns bounded lifecycle summaries in stable recent order', async () => {
    const aggregate = sourceAggregate();
    const scripted = scriptedDatabase([
      {
        ...aggregate.project,
        archivedAt: null,
        deletedAt: null,
        createdAt: postgresNow,
        updatedAt: postgresNow,
      },
    ]);
    await expect(
      new DrizzleProjectRepository(scripted.db).list(ownerUserId, {
        lifecycle: 'active',
        pageSize: 20,
      }),
    ).resolves.toMatchObject({ projects: [{ id: projectId }], nextCursor: null });
    expect(scripted.calls.filter(({ operation }) => operation === 'select')).toHaveLength(1);
    expect(scripted.remaining()).toBe(0);
  });

  it('rejects a source relationship unless the same-owner asset is ready', async () => {
    const scripted = scriptedDatabase([], [], [{ id: assetId, status: 'missing' }]);
    const repository = new DrizzleProjectRepository(scripted.db);

    await expect(repository.create(sourceAggregate())).rejects.toBeInstanceOf(
      ProjectPersistenceError,
    );
    expect(scripted.remaining()).toBe(0);
  });

  it('checks the locked project and revision CAS tokens before inserting a revision', async () => {
    const aggregate = sourceAggregate();
    const scripted = scriptedDatabase([
      {
        ...aggregate.project,
        version: 2,
        currentRevisionNumber: 1,
        archivedAt: null,
        deletedAt: null,
        createdAt: postgresNow,
        updatedAt: postgresNow,
      },
    ]);
    const repository = new DrizzleProjectRepository(scripted.db);

    await expect(
      repository.appendRevision({
        ownerUserId,
        projectId,
        expectedVersion: 1,
        expectedRevisionNumber: 1,
        nextProject: { ...aggregate.project, version: 2 },
        revision: aggregate.revisions[0]!,
        assetLinks: aggregate.assetLinks,
      }),
    ).resolves.toMatchObject({
      kind: 'conflict',
      conflict: { kind: 'project-version', expectedVersion: 1, actualVersion: 2 },
    });
    expect(scripted.calls.some(({ operation }) => operation === 'for')).toBe(true);
    expect(scripted.calls.filter(({ operation }) => operation === 'insert')).toHaveLength(0);
    expect(scripted.remaining()).toBe(0);
  });

  it('persists the same asset and role again for a later revision', async () => {
    const aggregate = sourceAggregate();
    const revision = {
      ...aggregate.revisions[0]!,
      id: secondRevisionId,
      revisionNumber: 2,
      parentRevisionId: revisionId,
      parentRevisionNumber: 1,
      source: 'user-edit' as const,
      snapshot: { ...aggregate.revisions[0]!.snapshot, updatedAt: now },
    };
    const nextProject = {
      ...aggregate.project,
      version: 2,
      currentRevisionId: secondRevisionId,
      currentRevisionNumber: 2,
    };
    const assetLinks = aggregate.assetLinks.map((link) => ({
      ...link,
      revisionId: secondRevisionId,
      revisionNumber: 2,
    }));
    const scripted = scriptedDatabase(
      [{ ...aggregate.project, archivedAt: null, deletedAt: null }],
      [{ id: assetId, status: 'ready' }],
      [],
      [],
      [],
    );
    const repository = new DrizzleProjectRepository(scripted.db);

    await expect(
      repository.appendRevision({
        ownerUserId,
        projectId,
        expectedVersion: 1,
        expectedRevisionNumber: 1,
        nextProject,
        revision,
        assetLinks,
      }),
    ).resolves.toEqual({ kind: 'updated' });

    const insertedTables = scripted.calls
      .filter(({ operation }) => operation === 'insert')
      .map(({ arguments: [table] }) => table);
    expect(insertedTables).toEqual([projectRevisions, projectAssets]);
    expect(scripted.calls.some(({ operation }) => operation === 'onConflictDoNothing')).toBe(false);
    expect(scripted.remaining()).toBe(0);
  });

  it('rejects missing, deleted, wrong-owner, or wrong-video snapshot Version references', async () => {
    const snapshot = {
      ...createEmptyProjectSnapshot(now),
      workingMedia: {
        kind: 'saved-video-version' as const,
        savedVideoId: videoId,
        videoVersionId: versionId,
      },
    };
    const aggregate = createProject(
      {
        id: projectId,
        ownerUserId,
        title: 'Imported working media',
        snapshot,
        author: { kind: 'user', authorId: ownerUserId },
        facts: {
          sourceStatus: 'none',
          currentAttempt: { status: 'none' },
          validatedLastSuccessfulOutput: null,
        },
      },
      { now, createId: () => revisionId },
    );
    const scripted = scriptedDatabase([], [], []);
    const repository = new DrizzleProjectRepository(scripted.db);

    await expect(repository.create(aggregate)).rejects.toMatchObject({
      code: 'version-not-ready',
    });
    expect(scripted.remaining()).toBe(0);
  });

  it('validates every snapshot Version reference in one batch query', async () => {
    const snapshot = {
      ...createEmptyProjectSnapshot(now),
      workingMedia: {
        kind: 'saved-video-version' as const,
        savedVideoId: videoId,
        videoVersionId: versionId,
      },
      presentedMedia: {
        kind: 'saved-video-version' as const,
        savedVideoId: secondVideoId,
        videoVersionId: secondVersionId,
      },
    };
    const aggregate = createProject(
      {
        id: projectId,
        ownerUserId,
        title: 'Version references',
        snapshot,
        author: { kind: 'user', authorId: ownerUserId },
        facts: {
          sourceStatus: 'none',
          currentAttempt: { status: 'none' },
          validatedLastSuccessfulOutput: null,
        },
      },
      { now, createId: () => revisionId },
    );
    const scripted = scriptedDatabase(
      [],
      [],
      [
        { savedVideoId: videoId, videoVersionId: versionId },
        { savedVideoId: secondVideoId, videoVersionId: secondVersionId },
      ],
      [],
      [],
    );
    const repository = new DrizzleProjectRepository(scripted.db);

    await expect(repository.create(aggregate)).resolves.toBeUndefined();
    expect(scripted.calls.filter(({ operation }) => operation === 'select')).toHaveLength(1);
    expect(scripted.remaining()).toBe(0);
  });

  it('treats an exact job replay as idempotent and a revision mismatch as a no-op conflict', async () => {
    const link = {
      projectId,
      ownerUserId,
      jobId,
      initiatingRevisionId: revisionId,
      initiatingRevisionNumber: 1,
      createdAt: now,
    };
    const exactScript = scriptedDatabase(
      [{ id: projectId }],
      [{ id: revisionId }],
      [{ id: jobId }],
      [{ ...link, createdAt: postgresNow }],
    );
    await expect(new DrizzleProjectRepository(exactScript.db).linkJob(link)).resolves.toEqual({
      kind: 'linked',
      replayed: true,
    });
    expect(exactScript.calls.some(({ operation }) => operation === 'insert')).toBe(false);

    const mismatchScript = scriptedDatabase(
      [{ id: projectId }],
      [{ id: revisionId }],
      [{ id: jobId }],
      [
        {
          ...link,
          initiatingRevisionId: secondRevisionId,
          initiatingRevisionNumber: 2,
          createdAt: postgresNow,
        },
      ],
    );
    await expect(new DrizzleProjectRepository(mismatchScript.db).linkJob(link)).resolves.toEqual({
      kind: 'conflict',
      conflict: { kind: 'relation-mismatch', projectId, relation: 'job' },
    });
    expect(mismatchScript.calls.some(({ operation }) => operation === 'insert')).toBe(false);
  });
});
