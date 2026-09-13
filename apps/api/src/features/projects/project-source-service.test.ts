import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { projectUploadAssetId } from './project-byte-acceptance.js';
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

  // `createId` is the only axis that varies: tests appending more than one revision need distinct
  // ids, the rest pin the revision id so they can assert on it.
  const sourceService = (
    createId: () => string = () => sourceRevisionId,
    now: string = acceptedAt,
  ) =>
    new ProjectSourceService(projects, savedVideos, bytes, {
      now: () => new Date(now),
      createId,
      inspect: () => Promise.resolve(inspected),
      projectRetention: projects,
    });

  const uniqueRevisionSourceService = () => sourceService(randomUUID);

  it('durably accepts, hydrates, replays, and refuses to overwrite an attached source', async () => {
    const current = await createProject();
    const operationKey = randomUUID();
    const assetId = projectUploadAssetId(ownerUserId, operationKey);
    const input = {
      ownerUserId,
      projectId: current.project.id,
      operationKey,
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      kind: 'uploaded' as const,
      refuseWhenOccupied: true,
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
            sourceAssetId: assetId,
            workingMedia: {
              kind: 'asset',
              assetId: assetId,
            },
            presentedMedia: {
              kind: 'asset',
              assetId: assetId,
            },
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
    expect(await bytes.exists(ownerUserId, assetId)).toBe(true);

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

  // Covers the temporary legacy fallback in `acceptIdempotentUpload`. Delete this with it, once no
  // deployment holds a Project asset stored under a raw operation key.
  it('replays bytes stored under the pre-derivation asset id instead of storing a second copy', async () => {
    const current = await createProject('Legacy source');
    const operationKey = randomUUID();
    // Exactly what an upload accepted before ids were owner-derived left behind: the bytes sitting
    // under the raw operation key, with nothing at the derived id.
    await bytes.storeFile({
      assetId: operationKey,
      ownerUserId,
      sourcePath,
      checksumSha256,
      mimeType: 'video/mp4',
      filename: 'legacy-source.mp4',
      createdAt: acceptedAt,
    });

    const accepted = await sourceService().upload({
      refuseWhenOccupied: true,
      ownerUserId,
      projectId: current.project.id,
      operationKey,
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      kind: 'uploaded' as const,
      sourcePath,
      checksumSha256,
      filename: 'legacy-source.mp4',
    });

    expect(accepted).toMatchObject({
      ok: true,
      response: { revision: { snapshot: { sourceAssetId: operationKey } } },
    });
    // The legacy bytes were adopted, not duplicated: nothing was written at the derived id.
    expect(await bytes.exists(ownerUserId, projectUploadAssetId(ownerUserId, operationKey))).toBe(
      false,
    );
  });

  it('removes an accepted source, retains its bytes, and accepts a different original after', async () => {
    const current = await createProject('Wrong source');
    const operationKey = randomUUID();
    const assetId = projectUploadAssetId(ownerUserId, operationKey);
    const input = {
      ownerUserId,
      projectId: current.project.id,
      operationKey,
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      kind: 'uploaded' as const,
      refuseWhenOccupied: true,
      sourcePath,
      checksumSha256,
      filename: 'wrong.mp4',
    };
    const accepted = await uniqueRevisionSourceService().upload(input);
    if (!accepted.ok) throw new Error('Expected Project source acceptance.');

    const removed = await uniqueRevisionSourceService().remove({
      ownerUserId,
      projectId: current.project.id,
      expectedVersion: 2,
      expectedRevisionNumber: 2,
    });

    expect(removed).toMatchObject({
      ok: true,
      current: {
        project: { status: 'draft', version: 3 },
        revision: {
          revisionNumber: 3,
          snapshot: {
            sourceAssetId: null,
            workingMedia: null,
            presentedMedia: null,
            workflowPhase: 'source',
          },
        },
      },
    });
    await expect(
      uniqueRevisionSourceService().get(ownerUserId, current.project.id),
    ).rejects.toMatchObject({
      statusCode: 404,
    });
    // The removed original stays retained: an output Version could already reference those bytes.
    expect(await projects.retainsAsset(ownerUserId, assetId)).toBe(true);
    expect(await bytes.exists(ownerUserId, assetId)).toBe(true);

    const replacementKey = randomUUID();
    const reaccepted = await uniqueRevisionSourceService().upload({
      ...input,
      operationKey: replacementKey,
      expectedVersion: 3,
      expectedRevisionNumber: 3,
      filename: 'right.mp4',
    });
    expect(reaccepted).toMatchObject({
      ok: true,
      response: {
        project: { status: 'ready', version: 4 },
        source: { filename: 'right.mp4' },
        revision: {
          snapshot: { sourceAssetId: projectUploadAssetId(ownerUserId, replacementKey) },
        },
      },
    });
  });

  it('converges when there is no source, and refuses a stale or foreign removal', async () => {
    const current = await createProject('Nothing to remove');
    // Already in the requested end state: converge on current authority instead of conflicting.
    await expect(
      sourceService().remove({
        ownerUserId,
        projectId: current.project.id,
        expectedVersion: 1,
        expectedRevisionNumber: 1,
      }),
    ).resolves.toMatchObject({
      ok: true,
      current: { project: { version: 1 }, revision: { snapshot: { sourceAssetId: null } } },
    });

    const accepted = await sourceService().upload({
      refuseWhenOccupied: true,
      ownerUserId,
      projectId: current.project.id,
      operationKey: randomUUID(),
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      kind: 'uploaded' as const,
      sourcePath,
      checksumSha256,
      filename: 'stale.mp4',
    });
    if (!accepted.ok) throw new Error('Expected Project source acceptance.');

    await expect(
      sourceService().remove({
        ownerUserId,
        projectId: current.project.id,
        expectedVersion: 1,
        expectedRevisionNumber: 1,
      }),
    ).resolves.toMatchObject({
      ok: false,
      conflict: { kind: 'project-version', expectedVersion: 1, actualVersion: 2 },
    });
    await expect(
      sourceService().remove({
        ownerUserId: otherOwnerUserId,
        projectId: current.project.id,
        expectedVersion: 2,
        expectedRevisionNumber: 2,
      }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('recovers a prepared source journal and reconciles the original operation after restart', async () => {
    const current = await createProject('Interrupted source');
    const operationKey = randomUUID();
    const assetId = projectUploadAssetId(ownerUserId, operationKey);
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
      refuseWhenOccupied: true,
      sourcePath,
      checksumSha256,
      filename: 'finalized-recording.mp4',
    };

    await expect(interrupted.upload(input)).rejects.toThrow('simulated source interruption');
    expect(await bytes.exists(ownerUserId, assetId)).toBe(true);

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
      revision: { snapshot: { sourceAssetId: assetId } },
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
        refuseWhenOccupied: true,
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
    expect(
      await bytes.exists(otherOwnerUserId, projectUploadAssetId(otherOwnerUserId, operationKey)),
    ).toBe(false);
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
      refuseWhenOccupied: true,
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

    // Borrowing the same Version again is the one way the same media can arrive twice: its asset is
    // the Version's, not one derived per request. A fresh key makes it a different request rather
    // than a replay, so it is refused by name instead of colliding with the key the collection is
    // built on.
    await expect(
      sourceService().reuseSavedVideo({
        refuseWhenOccupied: false,
        ownerUserId,
        projectId: project.project.id,
        operationKey: randomUUID(),
        expectedVersion: 2,
        expectedRevisionNumber: 2,
        savedVideoId: saved.id,
        videoVersionId: saved.currentVersion.id,
      }),
    ).resolves.toMatchObject({ ok: false, conflict: { kind: 'source-already-held' } });

    const unavailableProject = await createProject('Unavailable Version Project');
    await savedVideos.markMissing(ownerUserId, saved.id, acceptedAt);
    await expect(
      sourceService().reuseSavedVideo({
        refuseWhenOccupied: true,
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

  it('holds several sources, names one of them the original, and lets go of them one at a time', async () => {
    const current = await createProject('Several sources');
    const service = uniqueRevisionSourceService();
    // Accepted a minute apart, so "oldest acceptance first" is an ordering and not a tie broken by
    // whichever asset id sorts lower.
    const laterService = sourceService(randomUUID, '2026-08-12T12:01:00.000Z');
    const firstKey = randomUUID();
    const firstAssetId = projectUploadAssetId(ownerUserId, firstKey);
    const accepted = await service.upload({
      refuseWhenOccupied: true,
      ownerUserId,
      projectId: current.project.id,
      operationKey: firstKey,
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      kind: 'uploaded',
      sourcePath,
      checksumSha256,
      filename: 'first.mp4',
    });
    if (!accepted.ok) throw new Error('Expected the first source to be accepted.');

    const secondKey = randomUUID();
    const secondAssetId = projectUploadAssetId(ownerUserId, secondKey);
    const additional = {
      refuseWhenOccupied: false,
      ownerUserId,
      projectId: current.project.id,
      operationKey: secondKey,
      expectedVersion: 2,
      expectedRevisionNumber: 2,
      kind: 'uploaded' as const,
      sourcePath,
      checksumSha256,
      filename: 'second.mp4',
    };
    const added = await laterService.upload(additional);
    expect(added).toMatchObject({ ok: true, replayed: false });

    // Taking on more material is an inventory act: what the Project is showing does not move.
    if (!added.ok) throw new Error('Expected the second source to be accepted.');
    expect(added.response.revision.snapshot).toMatchObject({
      sourceAssetId: firstAssetId,
      workingMedia: { kind: 'asset', assetId: firstAssetId },
      presentedMedia: { kind: 'asset', assetId: firstAssetId },
    });

    await expect(service.list(ownerUserId, current.project.id)).resolves.toMatchObject({
      sources: [
        { assetId: firstAssetId, filename: 'first.mp4' },
        { assetId: secondAssetId, filename: 'second.mp4' },
      ],
    });

    // A retried second acceptance replays rather than colliding with the source the snapshot names.
    await expect(laterService.upload(additional)).resolves.toMatchObject({
      ok: true,
      replayed: true,
    });

    // The legacy endpoints keep describing the one the snapshot names, and still refuse another.
    await expect(service.get(ownerUserId, current.project.id)).resolves.toMatchObject({
      source: { filename: 'first.mp4' },
    });
    await expect(
      service.upload({ ...additional, refuseWhenOccupied: true, operationKey: randomUUID() }),
    ).resolves.toMatchObject({ ok: false, conflict: { kind: 'immutable-source' } });

    // Both sets of bytes are reachable, each under its own address.
    await expect(
      service.contentById(ownerUserId, current.project.id, secondAssetId),
    ).resolves.toMatchObject({ source: { filename: 'second.mp4' } });

    // Nothing links the held source to a revision — taking material on names nothing new — so the
    // only thing that can be keeping its bytes is the Project holding it.
    await expect(projects.retainsAsset(ownerUserId, secondAssetId)).resolves.toBe(true);

    // "Remove original video" answers the same way the per-source removal does, so a control named
    // for one video cannot quietly discard the rest.
    await expect(
      service.remove({
        ownerUserId,
        projectId: current.project.id,
        expectedVersion: 3,
        expectedRevisionNumber: 3,
      }),
    ).resolves.toMatchObject({ ok: false, conflict: { kind: 'primary-source' } });

    // Letting go of the original while others are held needs someone to choose a new one.
    await expect(
      service.removeById({
        ownerUserId,
        projectId: current.project.id,
        assetId: firstAssetId,
        expectedVersion: 3,
        expectedRevisionNumber: 3,
      }),
    ).resolves.toMatchObject({ ok: false, conflict: { kind: 'primary-source' } });

    await expect(
      service.removeById({
        ownerUserId,
        projectId: current.project.id,
        assetId: secondAssetId,
        expectedVersion: 3,
        expectedRevisionNumber: 3,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(service.list(ownerUserId, current.project.id)).resolves.toMatchObject({
      sources: [{ assetId: firstAssetId }],
    });

    // Removing what the Project no longer holds converges instead of conflicting, which is what
    // lets the command carry no operation key.
    await expect(
      service.removeById({
        ownerUserId,
        projectId: current.project.id,
        assetId: secondAssetId,
        expectedVersion: 1,
        expectedRevisionNumber: 1,
      }),
    ).resolves.toMatchObject({ ok: true });

    // The last one goes the way the legacy removal does, so a surface never has to choose a verb.
    await expect(
      service.removeById({
        ownerUserId,
        projectId: current.project.id,
        assetId: firstAssetId,
        expectedVersion: 4,
        expectedRevisionNumber: 4,
      }),
    ).resolves.toMatchObject({
      ok: true,
      current: { revision: { snapshot: { sourceAssetId: null, workingMedia: null } } },
    });
    await expect(service.list(ownerUserId, current.project.id)).resolves.toMatchObject({
      sources: [],
    });
  });
});
