import { createEmptyProjectSnapshot, createProject, type ProjectAssetLink } from '@studio/domain';
import { describe, expect, it } from 'vitest';
import type { LightframeDatabase } from './client.js';
import {
  DrizzleProjectRepository,
  mapProjectAggregate,
  ProjectPersistenceError,
} from './project-repository.js';
import { projectAssets, projectRevisions, projects } from './schema.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const revisionId = '3ac244b9-ec36-4a1e-b95e-7bcf37eb0b2d';
const assetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const videoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const versionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
const now = '2026-08-11T12:00:00.000Z';
const postgresNow = '2026-08-11 12:00:00+00';

const scriptedDatabase = (...script: readonly unknown[]) => {
  const remaining = [...script];
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
          calls.push({ operation: String(property), arguments: arguments_ });
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
          calls.push({ operation: String(property), arguments: arguments_ });
          return query();
        };
      },
    },
  );
  return {
    db: database as LightframeDatabase,
    calls,
    remaining: () => remaining.length,
  };
};

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
        activeJobCount: 0,
        failedJobCount: 0,
        successfulOutputCount: 0,
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
      snapshotSchemaVersion: 1,
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
      revisionId,
      revisionNumber: 1,
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
});
