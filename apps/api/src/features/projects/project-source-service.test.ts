import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalAssetByteStore } from '../../storage/asset-byte-store.js';
import { FileSavedVideoRepository } from '../saved-videos/saved-video-repository.js';
import { SavedVideoService } from '../saved-videos/saved-video-service.js';
import { FileProjectRepository } from './file-project-repository.js';
import { ProjectService } from './project-service.js';
import { ProjectSourceService } from './project-source-service.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const otherOwnerUserId = '458c4aca-a9fa-4c25-a2c8-d218768216a1';
const acceptedAt = '2026-08-12T12:00:00.000Z';
const sourceRevisionId = '4159225b-60f4-4f94-a3d5-08feee91a91d';
const sourceBytes = Buffer.from('video-bytes');
const checksumSha256 = createHash('sha256').update(sourceBytes).digest('hex');
const inspected = {
  mimeType: 'video/mp4' as const,
  container: 'mp4' as const,
  videoCodec: 'avc' as const,
  audioCodec: 'aac' as const,
  durationMs: 12_000,
  width: 1_280,
  height: 720,
  sizeBytes: sourceBytes.byteLength,
  hasAudio: true,
};

describe('ProjectSourceService local authority', () => {
  let directory: string;
  let sourcePath: string;
  let projects: FileProjectRepository;
  let savedVideos: FileSavedVideoRepository;
  let bytes: LocalAssetByteStore;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-project-source-'));
    sourcePath = path.join(directory, 'source.mp4');
    await writeFile(sourcePath, sourceBytes);
    projects = new FileProjectRepository(directory);
    savedVideos = new FileSavedVideoRepository(directory);
    bytes = new LocalAssetByteStore(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const createProject = async (title = 'Source Project') => {
    const created = await new ProjectService(projects, {
      now: () => new Date('2026-08-12T11:00:00.000Z'),
    }).create(ownerUserId, randomUUID(), title);
    if (!created.ok) throw new Error('Expected Project creation.');
    return created.current;
  };

  const sourceService = () =>
    new ProjectSourceService(projects, savedVideos, bytes, {
      now: () => new Date(acceptedAt),
      createId: () => sourceRevisionId,
      inspect: () => Promise.resolve(inspected),
      projectRetention: projects,
    });

  it('durably accepts, hydrates, replays, and keeps the first uploaded original immutable', async () => {
    const current = await createProject();
    const operationKey = randomUUID();
    const input = {
      ownerUserId,
      projectId: current.project.id,
      operationKey,
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      kind: 'uploaded' as const,
      sourcePath,
      checksumSha256,
      filename: '../launch source?.mp4',
    };

    const accepted = await sourceService().upload(input);
    expect(accepted).toMatchObject({
      ok: true,
      replayed: false,
      response: {
        project: { id: current.project.id, status: 'ready', version: 2 },
        revision: {
          id: sourceRevisionId,
          revisionNumber: 2,
          snapshot: {
            sourceAssetId: operationKey,
            workingMedia: { kind: 'asset', assetId: operationKey },
            presentedMedia: { kind: 'asset', assetId: operationKey },
            lastSuccessfulOutput: null,
          },
        },
        source: {
          kind: 'uploaded',
          filename: 'launch-source.mp4',
          contentUrl: `/api/projects/${current.project.id}/source/content`,
        },
      },
    });
    expect(await bytes.exists(ownerUserId, operationKey)).toBe(true);

    projects = new FileProjectRepository(directory);
    const replayed = await sourceService().upload(input);
    expect(replayed).toMatchObject({ ok: true, replayed: true });
    await expect(sourceService().get(ownerUserId, current.project.id)).resolves.toMatchObject({
      source: { kind: 'uploaded', sizeBytes: sourceBytes.byteLength },
    });
    await expect(sourceService().get(otherOwnerUserId, current.project.id)).rejects.toMatchObject({
      statusCode: 404,
    });

    const losingOperationKey = randomUUID();
    await expect(
      sourceService().upload({ ...input, operationKey: losingOperationKey }),
    ).resolves.toMatchObject({
      ok: false,
      conflict: { kind: 'immutable-source' },
    });
    expect(await bytes.exists(ownerUserId, losingOperationKey)).toBe(false);
  });

  it('recovers a prepared source journal and reconciles the original operation after restart', async () => {
    const current = await createProject('Interrupted source');
    const operationKey = randomUUID();
    const interruptedProjects = new FileProjectRepository(directory, {
      afterJournalPrepared: () => {
        throw new Error('simulated source interruption');
      },
    });
    const interrupted = new ProjectSourceService(interruptedProjects, savedVideos, bytes, {
      now: () => new Date(acceptedAt),
      createId: () => sourceRevisionId,
      inspect: () => Promise.resolve(inspected),
      projectRetention: interruptedProjects,
    });
    const input = {
      ownerUserId,
      projectId: current.project.id,
      operationKey,
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      kind: 'recorded' as const,
      sourcePath,
      checksumSha256,
      filename: 'finalized-recording.mp4',
    };

    await expect(interrupted.upload(input)).rejects.toThrow('simulated source interruption');
    expect(await bytes.exists(ownerUserId, operationKey)).toBe(true);

    projects = new FileProjectRepository(directory);
    await expect(sourceService().upload(input)).resolves.toMatchObject({
      ok: true,
      replayed: true,
      response: { source: { kind: 'recorded' } },
    });
    await expect(
      new ProjectService(projects).get(ownerUserId, current.project.id),
    ).resolves.toMatchObject({
      project: { version: 2, currentRevisionNumber: 2 },
      revision: { snapshot: { sourceAssetId: operationKey } },
    });
  });

  it('checks Project ownership before inspecting or storing uploaded bytes', async () => {
    const current = await createProject('Owner-bound source');
    let inspectionStarted = false;
    const service = new ProjectSourceService(projects, savedVideos, bytes, {
      inspect: () => {
        inspectionStarted = true;
        return Promise.resolve(inspected);
      },
      projectRetention: projects,
    });
    const operationKey = randomUUID();

    await expect(
      service.upload({
        ownerUserId: otherOwnerUserId,
        projectId: current.project.id,
        operationKey,
        expectedVersion: 1,
        expectedRevisionNumber: 1,
        kind: 'uploaded',
        sourcePath,
        checksumSha256,
        filename: 'private.mp4',
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(inspectionStarted).toBe(false);
    expect(await bytes.exists(otherOwnerUserId, operationKey)).toBe(false);
  });

  it('references an exact active Saved Video Version without copying bytes or inferring output', async () => {
    const savedVideoService = new SavedVideoService(savedVideos, bytes, {
      now: () => new Date(acceptedAt),
      inspect: () => Promise.resolve(inspected),
      deleteStoredAssetsOnManualDelete: true,
      projectRetention: projects,
    });
    const saved = await savedVideoService.saveNew(ownerUserId, randomUUID(), sourcePath, {
      title: 'Reusable source',
      origin: 'uploaded',
      characterName: null,
      characterVariantName: null,
      filename: 'reusable.mp4',
      sourceVideoId: null,
      sourceVersionId: null,
    });
    const aggregate = await savedVideos.get(ownerUserId, saved.id);
    const assetId = aggregate!.versions[0]!.assetId;
    const project = await createProject('Exact Version Project');
    const countBefore = (await readdir(path.join(directory, 'media', 'v1', 'assets'))).length;

    const accepted = await sourceService().reuseSavedVideo({
      ownerUserId,
      projectId: project.project.id,
      operationKey: randomUUID(),
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      savedVideoId: saved.id,
      videoVersionId: saved.currentVersion.id,
    });

    expect(accepted).toMatchObject({
      ok: true,
      response: {
        revision: {
          snapshot: {
            sourceAssetId: assetId,
            workingMedia: {
              kind: 'saved-video-version',
              savedVideoId: saved.id,
              videoVersionId: saved.currentVersion.id,
            },
            lastSuccessfulOutput: null,
          },
        },
        source: {
          kind: 'saved-video-version',
          savedVideoId: saved.id,
          videoVersionId: saved.currentVersion.id,
        },
      },
    });
    expect((await readdir(path.join(directory, 'media', 'v1', 'assets'))).length).toBe(countBefore);

    const unavailableProject = await createProject('Unavailable Version Project');
    await savedVideos.markMissing(ownerUserId, saved.id, acceptedAt);
    await expect(
      sourceService().reuseSavedVideo({
        ownerUserId,
        projectId: unavailableProject.project.id,
        operationKey: randomUUID(),
        expectedVersion: 1,
        expectedRevisionNumber: 1,
        savedVideoId: saved.id,
        videoVersionId: saved.currentVersion.id,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    await savedVideoService.delete(ownerUserId, saved.id);
    expect(await bytes.exists(ownerUserId, assetId)).toBe(true);
  });
});
