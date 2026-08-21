import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultVideoEditSpec } from '@studio/domain';
import { LocalAssetByteStore } from '../../storage/asset-byte-store.js';
import { FileSavedVideoRepository } from '../saved-videos/saved-video-repository.js';
import { SavedVideoService } from '../saved-videos/saved-video-service.js';
import { FileProjectRepository } from './file-project-repository.js';
import { ProjectService } from './project-service.js';
import { ProjectSourceService } from './project-source-service.js';
import { ProjectWorkingMediaService } from './project-working-media-service.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const otherOwnerUserId = '458c4aca-a9fa-4c25-a2c8-d218768216a1';
const sourceRevisionId = '4159225b-60f4-4f94-a3d5-08feee91a91d';
const adoptionRevisionId = '80eb98cb-0dd4-4aac-8507-084789045d71';
const creativeRevisionId = '66517242-ccf5-4fa5-bcee-5831039119c9';
const sourceBytes = Buffer.from('source-video-bytes');
const renderBytes = Buffer.from('rendered-video-bytes');
const sourceChecksum = createHash('sha256').update(sourceBytes).digest('hex');
const renderChecksum = createHash('sha256').update(renderBytes).digest('hex');
const sourceInspection = {
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
const renderInspection = {
  ...sourceInspection,
  durationMs: 9_000,
  width: 720,
  height: 720,
  sizeBytes: renderBytes.byteLength,
};

describe('ProjectWorkingMediaService local authority', () => {
  let directory: string;
  let sourcePath: string;
  let renderPath: string;
  let projects: FileProjectRepository;
  let savedVideos: FileSavedVideoRepository;
  let bytes: LocalAssetByteStore;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-project-working-media-'));
    sourcePath = path.join(directory, 'source.mp4');
    renderPath = path.join(directory, 'render.mp4');
    await writeFile(sourcePath, sourceBytes);
    await writeFile(renderPath, renderBytes);
    projects = new FileProjectRepository(directory);
    savedVideos = new FileSavedVideoRepository(directory);
    bytes = new LocalAssetByteStore(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const createProjectWithSource = async () => {
    const created = await new ProjectService(projects, {
      now: () => new Date('2026-08-12T11:00:00.000Z'),
    }).create(ownerUserId, randomUUID(), 'Working-media Project');
    if (!created.ok) throw new Error('Expected Project creation.');
    const source = new ProjectSourceService(projects, savedVideos, bytes, {
      now: () => new Date('2026-08-12T11:30:00.000Z'),
      createId: () => sourceRevisionId,
      inspect: () => Promise.resolve(sourceInspection),
      projectRetention: projects,
    });
    const accepted = await source.upload({
      ownerUserId,
      projectId: created.current.project.id,
      operationKey: randomUUID(),
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      kind: 'uploaded',
      sourcePath,
      checksumSha256: sourceChecksum,
      filename: 'source.mp4',
    });
    if (!accepted.ok) throw new Error('Expected Project source acceptance.');
    return accepted.response;
  };

  const service = (repository = projects) =>
    new ProjectWorkingMediaService(repository, savedVideos, bytes, {
      now: () => new Date('2026-08-12T12:00:00.000Z'),
      createId: () => adoptionRevisionId,
      inspect: (filePath) =>
        Promise.resolve(filePath === renderPath ? renderInspection : renderInspection),
      projectRetention: repository,
    });

  it('stores, inspects, adopts, hydrates, and exactly replays a local render across restart', async () => {
    const current = await createProjectWithSource();
    const getCurrent = vi.spyOn(projects, 'getCurrent');
    const operationKey = randomUUID();
    const localEdit = createDefaultVideoEditSpec(renderInspection.durationMs);
    const input = {
      ownerUserId,
      projectId: current.project.id,
      operationKey,
      expectedVersion: 2,
      expectedRevisionNumber: 2,
      sourcePath: renderPath,
      checksumSha256: renderChecksum,
      filename: '../render preview?.mp4',
      localEdit,
    };

    const adopted = await service().uploadLocalRender(input);
    expect(getCurrent).toHaveBeenCalledTimes(1);
    if (!adopted.ok) throw new Error('Expected working-media adoption.');
    expect(adopted).toMatchObject({
      ok: true,
      replayed: false,
      response: {
        project: { version: 3, status: 'ready', currentRevisionNumber: 3 },
        revision: {
          id: adoptionRevisionId,
          snapshot: {
            sourceAssetId: current.revision.snapshot.sourceAssetId,
            workingMedia: { kind: 'asset', assetId: operationKey },
            presentedMedia: { kind: 'asset', assetId: operationKey },
            localEdit,
            lastSuccessfulOutput: null,
            workflowPhase: 'review',
          },
        },
        isCurrent: true,
        media: {
          kind: 'local-render',
          filename: 'render-preview.mp4',
          checksumSha256: renderChecksum,
          contentUrl: `/api/projects/${current.project.id}/working-media/${adoptionRevisionId}/content`,
        },
      },
    });
    expect(await bytes.exists(ownerUserId, operationKey)).toBe(true);

    projects = new FileProjectRepository(directory);
    const replayed = await service().uploadLocalRender(input);
    expect(replayed).toMatchObject({ ok: true, replayed: true, response: { isCurrent: true } });
    await expect(service().get(ownerUserId, current.project.id)).resolves.toMatchObject({
      media: { kind: 'local-render', assetId: operationKey },
    });
    await expect(service().get(otherOwnerUserId, current.project.id)).rejects.toMatchObject({
      statusCode: 404,
    });

    const snapshot = adopted.response.revision.snapshot;
    const checkpointed = await new ProjectService(projects, {
      now: () => new Date('2026-08-12T12:05:00.000Z'),
      createId: () => creativeRevisionId,
    }).checkpoint(ownerUserId, current.project.id, {
      expectedVersion: 3,
      expectedRevisionNumber: 3,
      proposal: {
        workflowPhase: 'creative',
        liveMode: snapshot.liveMode,
        selectedCharacter: snapshot.selectedCharacter,
        selectedOutfit: snapshot.selectedOutfit,
        selectedVoice: snapshot.selectedVoice,
        visualTreatment: snapshot.visualTreatment,
        creativeIntent: { ...snapshot.creativeIntent, userIntent: 'A later creative checkpoint.' },
        localEdit: snapshot.localEdit,
        exportSpecification: snapshot.exportSpecification,
      },
    });
    expect(checkpointed).toMatchObject({
      ok: true,
      current: { project: { version: 4 }, revision: { id: creativeRevisionId } },
    });
    await expect(service().get(ownerUserId, current.project.id)).resolves.toMatchObject({
      project: { version: 4, currentRevisionId: creativeRevisionId },
      revision: { id: creativeRevisionId },
      isCurrent: true,
      media: {
        adoptedRevisionId: adoptionRevisionId,
        contentUrl: `/api/projects/${current.project.id}/working-media/${adoptionRevisionId}/content`,
      },
    });
    await expect(service().uploadLocalRender(input)).resolves.toMatchObject({
      ok: true,
      replayed: true,
      response: {
        project: { version: 4 },
        revision: { id: creativeRevisionId },
        isCurrent: true,
        media: { adoptedRevisionId: adoptionRevisionId },
      },
    });

    await expect(
      service().uploadLocalRender({ ...input, filename: 'different.mp4' }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('recovers a prepared adoption journal without duplicating its revision or bytes', async () => {
    const current = await createProjectWithSource();
    const operationKey = randomUUID();
    const interruptedProjects = new FileProjectRepository(directory, {
      afterJournalPrepared: () => {
        throw new Error('simulated working-media interruption');
      },
    });
    const interrupted = service(interruptedProjects);
    const input = {
      ownerUserId,
      projectId: current.project.id,
      operationKey,
      expectedVersion: 2,
      expectedRevisionNumber: 2,
      sourcePath: renderPath,
      checksumSha256: renderChecksum,
      filename: 'render.mp4',
      localEdit: createDefaultVideoEditSpec(renderInspection.durationMs),
    };

    await expect(interrupted.uploadLocalRender(input)).rejects.toThrow(
      'simulated working-media interruption',
    );
    projects = new FileProjectRepository(directory);
    await expect(service().uploadLocalRender(input)).resolves.toMatchObject({
      ok: true,
      replayed: true,
      response: { revision: { id: adoptionRevisionId } },
    });
    await expect(
      new ProjectService(projects).get(ownerUserId, current.project.id),
    ).resolves.toMatchObject({
      project: { version: 3, currentRevisionNumber: 3 },
    });
  });

  it('reuses an exact same-owner Saved Video Version without copying bytes or producing output', async () => {
    const savedVideoService = new SavedVideoService(savedVideos, bytes, {
      now: () => new Date('2026-08-12T11:45:00.000Z'),
      inspect: () => Promise.resolve(renderInspection),
      deleteStoredAssetsOnManualDelete: true,
      projectRetention: projects,
    });
    const saved = await savedVideoService.saveNew(ownerUserId, randomUUID(), renderPath, {
      title: 'Reusable working media',
      origin: 'uploaded',
      characterName: null,
      characterVariantName: null,
      filename: 'retained.mp4',
      sourceVideoId: null,
      sourceVersionId: null,
    });
    const current = await createProjectWithSource();
    const countBefore = (await readdir(path.join(directory, 'media', 'v1', 'assets'))).length;

    const adopted = await service().reuse({
      ownerUserId,
      projectId: current.project.id,
      operationKey: randomUUID(),
      expectedVersion: 2,
      expectedRevisionNumber: 2,
      media: {
        kind: 'saved-video-version',
        savedVideoId: saved.id,
        videoVersionId: saved.currentVersion.id,
      },
      localEdit: null,
    });

    expect(adopted).toMatchObject({
      ok: true,
      response: {
        revision: {
          snapshot: {
            sourceAssetId: current.revision.snapshot.sourceAssetId,
            workingMedia: {
              kind: 'saved-video-version',
              savedVideoId: saved.id,
              videoVersionId: saved.currentVersion.id,
            },
            lastSuccessfulOutput: null,
          },
        },
        media: { kind: 'saved-video-version' },
      },
    });
    expect((await readdir(path.join(directory, 'media', 'v1', 'assets'))).length).toBe(countBefore);
    expect(
      (
        await projects.listLinkHistory(ownerUserId, current.project.id, {
          kind: 'output',
          pageSize: 20,
        })
      )?.links,
    ).toEqual([]);
  });
});
