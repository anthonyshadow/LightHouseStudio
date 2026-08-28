import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDefaultVideoEditSpec } from '@studio/domain';
import { KeyedLock } from '../../application/keyed-lock.js';
import { LocalAssetByteStore } from '../../storage/asset-byte-store.js';
import { FileSavedVideoRepository } from '../saved-videos/saved-video-repository.js';
import { SavedVideoService } from '../saved-videos/saved-video-service.js';
import { FileProjectRepository } from './file-project-repository.js';
import { ProjectOutputService } from './project-output-service.js';
import { ProjectRenditionService } from './project-rendition-service.js';
import { ProjectService } from './project-service.js';
import { ProjectSourceService } from './project-source-service.js';
import { ProjectWorkingMediaService } from './project-working-media-service.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const otherOwnerUserId = '458c4aca-a9fa-4c25-a2c8-d218768216a1';
const bytesValue = Buffer.from('synthetic-project-output-video');
const checksumSha256 = createHash('sha256').update(bytesValue).digest('hex');
const inspected = {
  mimeType: 'video/mp4' as const,
  container: 'mp4' as const,
  videoCodec: 'avc' as const,
  audioCodec: 'aac' as const,
  durationMs: 12_000,
  width: 1_280,
  height: 720,
  sizeBytes: bytesValue.byteLength,
  hasAudio: true,
};

const renditionBytes = Buffer.from('synthetic-reframed-phone-video');
const renditionChecksum = createHash('sha256').update(renditionBytes).digest('hex');
const phonePlacement = {
  container: 'video/mp4' as const,
  aspect: '9:16' as const,
  resolution: { width: 1_080, height: 1_920 },
  includeAudio: true,
};

describe('ProjectOutputService local composite authority', () => {
  let currentProjectId: string;
  let directory: string;
  let sourcePath: string;
  let ownerLock: KeyedLock;
  let savedVideos: FileSavedVideoRepository;
  let projects: FileProjectRepository;
  let bytes: LocalAssetByteStore;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-project-output-'));
    sourcePath = path.join(directory, 'source.mp4');
    await writeFile(sourcePath, bytesValue);
    ownerLock = new KeyedLock();
    savedVideos = new FileSavedVideoRepository(directory, { ownerLock });
    projects = new FileProjectRepository(directory, { ownerLock, savedVideos });
    bytes = new LocalAssetByteStore(directory);
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const createReadyProject = async () => {
    const created = await new ProjectService(projects, {
      now: () => new Date('2026-08-13T12:00:00.000Z'),
    }).create(ownerUserId, randomUUID(), 'Atomic output');
    if (!created.ok) throw new Error('Expected Project creation.');
    const operationKey = randomUUID();
    const accepted = await new ProjectSourceService(projects, savedVideos, bytes, {
      now: () => new Date('2026-08-13T12:01:00.000Z'),
      inspect: () => Promise.resolve(inspected),
      projectRetention: projects,
    }).upload({
      ownerUserId,
      projectId: created.current.project.id,
      operationKey,
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      kind: 'uploaded',
      sourcePath,
      checksumSha256,
      filename: 'source.mp4',
    });
    if (!accepted.ok) throw new Error('Expected Project source acceptance.');
    currentProjectId = created.current.project.id;
    return { current: accepted.response, assetId: operationKey };
  };

  const outputService = (projectRepository = projects, savedVideoRepository = savedVideos) =>
    new ProjectOutputService(projectRepository, projectRepository, savedVideoRepository, bytes, {
      now: () => new Date('2026-08-13T12:02:00.000Z'),
      inspect: () => Promise.resolve(inspected),
    });

  /** Distinguishes the two assets by their bytes, because both are inspected through a temp copy. */
  const inspectByContent = async (filePath: string) =>
    (await readFile(filePath)).equals(renditionBytes)
      ? { ...inspected, sizeBytes: renditionBytes.byteLength, width: 1_080, height: 1_920 }
      : inspected;

  const outputServiceWithRenditions = () =>
    new ProjectOutputService(projects, projects, savedVideos, bytes, {
      now: () => new Date('2026-08-13T12:02:00.000Z'),
      inspect: inspectByContent,
    });

  const choosePhonePlacement = async (
    current: Awaited<ReturnType<typeof createReadyProject>>['current'],
  ) => {
    const checkpoint = await new ProjectService(projects, {
      now: () => new Date('2026-08-13T12:01:20.000Z'),
    }).checkpoint(ownerUserId, current.project.id, {
      expectedVersion: current.project.version,
      expectedRevisionNumber: current.revision.revisionNumber,
      proposal: {
        ...current.revision.snapshot,
        exportSpecification: phonePlacement,
      },
    });
    if (!checkpoint.ok) throw new Error('Expected the placement checkpoint to be accepted.');
    return checkpoint.current;
  };

  const storeRendition = async () => {
    const renditionPath = path.join(directory, 'rendition.mp4');
    await writeFile(renditionPath, renditionBytes);
    return new ProjectRenditionService(projects, bytes, {
      now: () => new Date('2026-08-13T12:01:30.000Z'),
      inspect: inspectByContent,
      projectRetention: projects,
    }).upload({
      ownerUserId,
      projectId: (await projects.getCurrent(ownerUserId, currentProjectId))!.project.id,
      operationKey: randomUUID(),
      sourcePath: renditionPath,
      checksumSha256: renditionChecksum,
      filename: 'reframed.mp4',
      specification: phonePlacement,
    });
  };

  it('stores the re-framed bytes and records the placement they were produced for', async () => {
    const created = await createReadyProject();
    const current = await choosePhonePlacement(created.current);
    const rendition = await storeRendition();

    const saved = await outputServiceWithRenditions().save(
      ownerUserId,
      current.project.id,
      randomUUID(),
      {
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.revision.revisionNumber,
        media: current.revision.snapshot.workingMedia!,
        target: { kind: 'new', title: 'Phone master' },
        renditions: [{ media: rendition.media, specification: phonePlacement }],
      },
    );

    if (!saved.ok) throw new Error('Expected the save to succeed.');
    expect(saved.response.savedVideo.currentVersion).toMatchObject({
      width: 1_080,
      height: 1_920,
      sizeBytes: renditionBytes.byteLength,
      exportSpecification: phonePlacement,
    });
  });

  it('keeps presenting the cut a placement was produced from, so a second save re-frames the original', async () => {
    const created = await createReadyProject();
    const current = await choosePhonePlacement(created.current);
    const before = current.revision.snapshot.workingMedia;
    const rendition = await storeRendition();

    const saved = await outputServiceWithRenditions().save(
      ownerUserId,
      current.project.id,
      randomUUID(),
      {
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.revision.revisionNumber,
        media: before!,
        target: { kind: 'new', title: 'Phone master' },
        renditions: [{ media: rendition.media, specification: phonePlacement }],
      },
    );

    if (!saved.ok) throw new Error('Expected the save to succeed.');
    // The deliverable is 1080x1920, and the Project still works from the 1280x720 cut.
    expect(saved.response.savedVideo.currentVersion).toMatchObject({ width: 1_080, height: 1_920 });
    expect(saved.response.revision.snapshot).toMatchObject({
      workingMedia: before,
      presentedMedia: before,
      lastSuccessfulOutput: {
        savedVideoId: saved.response.savedVideo.id,
        videoVersionId: saved.response.savedVideo.currentVersion.id,
      },
      workflowPhase: 'complete',
    });
    expect(saved.response.project.status).toBe('completed');

    // The record hydrating that revision describes the cut, not the re-framed file, so the next
    // save resolves the original bytes rather than failing on changed metadata.
    const hydrated = await new ProjectWorkingMediaService(projects, savedVideos, bytes, {
      inspect: inspectByContent,
    }).get(ownerUserId, current.project.id);
    expect(hydrated).toMatchObject({
      isCurrent: true,
      media: {
        reference: before,
        adoptedRevisionId: saved.response.revision.id,
        width: inspected.width,
        height: inspected.height,
      },
    });
  });

  it('still presents the Version when the stored bytes are the cut itself', async () => {
    const { current } = await createReadyProject();

    const saved = await outputServiceWithRenditions().save(
      ownerUserId,
      current.project.id,
      randomUUID(),
      {
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.revision.revisionNumber,
        media: current.revision.snapshot.workingMedia!,
        target: { kind: 'new', title: 'As it is' },
        renditions: [],
      },
    );

    if (!saved.ok) throw new Error('Expected the save to succeed.');
    const reference = {
      kind: 'saved-video-version',
      savedVideoId: saved.response.savedVideo.id,
      videoVersionId: saved.response.savedVideo.currentVersion.id,
    };
    expect(saved.response.revision.snapshot).toMatchObject({
      workingMedia: reference,
      presentedMedia: reference,
    });
  });

  it('stores the cut unchanged, and records no placement, when none was produced', async () => {
    const { current } = await createReadyProject();

    const saved = await outputServiceWithRenditions().save(
      ownerUserId,
      current.project.id,
      randomUUID(),
      {
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.revision.revisionNumber,
        media: current.revision.snapshot.workingMedia!,
        target: { kind: 'new', title: 'As it is' },
        renditions: [],
      },
    );

    if (!saved.ok) throw new Error('Expected the save to succeed.');
    expect(saved.response.savedVideo.currentVersion).toMatchObject({
      width: inspected.width,
      height: inspected.height,
      sizeBytes: inspected.sizeBytes,
      exportSpecification: null,
    });
  });

  it('replays a save that already stored a rendition without producing a second Version', async () => {
    const created = await createReadyProject();
    const current = await choosePhonePlacement(created.current);
    const rendition = await storeRendition();
    const operationId = randomUUID();
    const request = {
      expectedVersion: current.project.version,
      expectedRevisionNumber: current.revision.revisionNumber,
      media: current.revision.snapshot.workingMedia!,
      target: { kind: 'new' as const, title: 'Phone master' },
      renditions: [{ media: rendition.media, specification: phonePlacement }],
    };

    const first = await outputServiceWithRenditions().save(
      ownerUserId,
      current.project.id,
      operationId,
      request,
    );
    const replay = await outputServiceWithRenditions().save(
      ownerUserId,
      current.project.id,
      operationId,
      request,
    );

    if (!first.ok || !replay.ok) throw new Error('Expected both saves to succeed.');
    expect(replay.response).toEqual({ ...first.response, replayed: true });
    expect(replay.response.savedVideo.versionCount).toBe(1);
    expect(replay.response.savedVideo.currentVersion.id).toBe(
      first.response.savedVideo.currentVersion.id,
    );
  });

  it('refuses a rendition made for a placement the Project has not chosen', async () => {
    const created = await createReadyProject();
    const current = await choosePhonePlacement(created.current);
    const rendition = await storeRendition();

    await expect(
      outputServiceWithRenditions().save(ownerUserId, current.project.id, randomUUID(), {
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.revision.revisionNumber,
        media: current.revision.snapshot.workingMedia!,
        target: { kind: 'new', title: 'Mismatched' },
        renditions: [
          {
            media: rendition.media,
            specification: { ...phonePlacement, resolution: { width: 1_920, height: 1_080 } },
          },
        ],
      }),
    ).rejects.toThrow(/made for a different placement/u);
  });

  it('saves new and appended immutable Versions with distinct producer and post-save revisions', async () => {
    const { current, assetId } = await createReadyProject();
    const projectId = current.project.id;
    const firstOperation = randomUUID();
    const firstRequest = {
      expectedVersion: current.project.version,
      expectedRevisionNumber: current.revision.revisionNumber,
      media: current.revision.snapshot.workingMedia!,
      target: { kind: 'new' as const, title: 'Launch master' },
      renditions: [],
    };
    const first = await outputService().save(ownerUserId, projectId, firstOperation, firstRequest);
    expect(first).toMatchObject({
      ok: true,
      response: {
        replayed: false,
        project: { status: 'completed', version: 3, currentRevisionNumber: 3 },
        revision: {
          revisionNumber: 3,
          parentRevisionNumber: 2,
          source: 'output-save',
          snapshot: { workflowPhase: 'complete' },
        },
        output: { producingRevisionNumber: 2 },
        savedVideo: { title: 'Launch master', versionCount: 1 },
      },
    });
    if (!first.ok) throw new Error('Expected first output save.');
    expect(first.response.revision.snapshot.lastSuccessfulOutput).toEqual({
      savedVideoId: first.response.savedVideo.id,
      videoVersionId: first.response.savedVideo.currentVersion.id,
    });
    expect(
      (await savedVideos.get(ownerUserId, first.response.savedVideo.id))?.versions[0]?.assetId,
    ).toBe(assetId);
    const hydratedOutput = await new ProjectWorkingMediaService(projects, savedVideos, bytes).get(
      ownerUserId,
      projectId,
    );
    expect(hydratedOutput).toMatchObject({
      isCurrent: true,
      project: { status: 'completed' },
      media: {
        kind: 'saved-video-version',
        reference: first.response.revision.snapshot.workingMedia,
        assetId,
        adoptedRevisionId: first.response.revision.id,
      },
    });

    projects = new FileProjectRepository(directory, { ownerLock, savedVideos });
    const replay = await outputService().save(ownerUserId, projectId, firstOperation, firstRequest);
    expect(replay).toEqual({
      ok: true,
      response: { ...first.response, replayed: true },
    });
    await expect(
      outputService().save(ownerUserId, projectId, firstOperation, {
        ...firstRequest,
        target: { kind: 'new', title: 'Changed title' },
        renditions: [],
      }),
    ).resolves.toEqual({
      ok: false,
      conflict: { kind: 'operation-key', operation: 'output-save' },
    });

    const secondOperation = randomUUID();
    const second = await outputService().save(ownerUserId, projectId, secondOperation, {
      expectedVersion: first.response.project.version,
      expectedRevisionNumber: first.response.revision.revisionNumber,
      media: first.response.revision.snapshot.workingMedia!,
      target: {
        kind: 'version',
        savedVideoId: first.response.savedVideo.id,
        expectedVersionId: first.response.savedVideo.currentVersion.id,
      },
      renditions: [],
    });
    expect(second).toMatchObject({
      ok: true,
      response: {
        project: { version: 4, currentRevisionNumber: 4 },
        revision: { parentRevisionNumber: 3, revisionNumber: 4 },
        output: { producingRevisionNumber: 3 },
        savedVideo: {
          id: first.response.savedVideo.id,
          versionCount: 2,
          currentVersion: {
            ordinal: 2,
            sourceVersionId: first.response.savedVideo.currentVersion.id,
          },
        },
      },
    });
    if (!second.ok) throw new Error('Expected appended output save.');
    expect(second.response.savedVideo.versions[0]).toEqual(
      first.response.savedVideo.currentVersion,
    );
    expect(second.response.savedVideo.currentVersion.id).not.toBe(
      first.response.savedVideo.currentVersion.id,
    );

    await new SavedVideoService(savedVideos, bytes, {
      deleteStoredAssetsOnManualDelete: true,
      projectRetention: projects,
    }).delete(ownerUserId, first.response.savedVideo.id);
    await expect(savedVideos.get(ownerUserId, first.response.savedVideo.id)).resolves.toBeNull();
    await expect(
      outputService().content(ownerUserId, projectId, second.response.savedVideo.currentVersion.id),
    ).resolves.toMatchObject({
      version: { id: second.response.savedVideo.currentVersion.id },
      asset: { manifest: { assetId } },
    });
    await expect(
      outputService().content(
        otherOwnerUserId,
        projectId,
        second.response.savedVideo.currentVersion.id,
      ),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it.each(['afterJournalPrepared', 'afterSavedVideoCommitted', 'afterProjectCommitted'] as const)(
    'recovers one exact output after interruption at %s',
    async (hook) => {
      const { current } = await createReadyProject();
      const operationId = randomUUID();
      const request = {
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.revision.revisionNumber,
        media: current.revision.snapshot.workingMedia!,
        target: { kind: 'new' as const, title: `Recovered ${hook}` },
        renditions: [],
      };
      const interruptedSavedVideos = new FileSavedVideoRepository(directory, { ownerLock });
      const interruptedProjects = new FileProjectRepository(directory, {
        ownerLock,
        savedVideos: interruptedSavedVideos,
        [hook]: () => {
          throw new Error(`interrupted:${hook}`);
        },
      });
      await expect(
        outputService(interruptedProjects, interruptedSavedVideos).save(
          ownerUserId,
          current.project.id,
          operationId,
          request,
        ),
      ).rejects.toThrow(`interrupted:${hook}`);

      const recoveredLock = new KeyedLock();
      const recoveredSavedVideos = new FileSavedVideoRepository(directory, {
        ownerLock: recoveredLock,
      });
      const recoveredProjects = new FileProjectRepository(directory, {
        ownerLock: recoveredLock,
        savedVideos: recoveredSavedVideos,
      });
      const recovered = await outputService(recoveredProjects, recoveredSavedVideos).save(
        ownerUserId,
        current.project.id,
        operationId,
        request,
      );
      expect(recovered).toMatchObject({
        ok: true,
        response: {
          replayed: true,
          project: { version: 3, currentRevisionNumber: 3 },
          output: { producingRevisionNumber: 2 },
          savedVideo: { versionCount: 1 },
        },
      });
      expect(await recoveredSavedVideos.list(ownerUserId)).toHaveLength(1);
      await expect(
        new ProjectWorkingMediaService(recoveredProjects, recoveredSavedVideos, bytes).get(
          ownerUserId,
          current.project.id,
        ),
      ).resolves.toMatchObject({
        isCurrent: true,
        media: { kind: 'saved-video-version' },
      });
    },
  );

  it('saves an adopted render whose adoption revision is no longer current', async () => {
    const { current } = await createReadyProject();
    const projectId = current.project.id;
    const renderKey = randomUUID();
    const adopted = await new ProjectWorkingMediaService(projects, savedVideos, bytes, {
      now: () => new Date('2026-08-13T12:01:30.000Z'),
      inspect: () => Promise.resolve(inspected),
      projectRetention: projects,
    }).uploadLocalRender({
      ownerUserId,
      projectId,
      operationKey: renderKey,
      expectedVersion: current.project.version,
      expectedRevisionNumber: current.revision.revisionNumber,
      sourcePath,
      checksumSha256,
      filename: 'render.mp4',
      localEdit: createDefaultVideoEditSpec(inspected.durationMs),
    });
    if (!adopted.ok) throw new Error('Expected working-media adoption.');
    const adoptedSnapshot = adopted.response.revision.snapshot;
    const checkpointed = await new ProjectService(projects, {
      now: () => new Date('2026-08-13T12:01:45.000Z'),
    }).checkpoint(ownerUserId, projectId, {
      expectedVersion: adopted.response.project.version,
      expectedRevisionNumber: adopted.response.revision.revisionNumber,
      proposal: {
        workflowPhase: 'creative',
        liveMode: adoptedSnapshot.liveMode,
        selectedCharacter: adoptedSnapshot.selectedCharacter,
        selectedOutfit: adoptedSnapshot.selectedOutfit,
        selectedVoice: adoptedSnapshot.selectedVoice,
        visualTreatment: adoptedSnapshot.visualTreatment,
        creativeIntent: adoptedSnapshot.creativeIntent,
        localEdit: adoptedSnapshot.localEdit,
        exportSpecification: adoptedSnapshot.exportSpecification,
      },
    });
    if (!checkpointed.ok) throw new Error('Expected Project checkpoint.');
    const saved = await outputService().save(ownerUserId, projectId, randomUUID(), {
      expectedVersion: checkpointed.current.project.version,
      expectedRevisionNumber: checkpointed.current.revision.revisionNumber,
      media: checkpointed.current.revision.snapshot.workingMedia!,
      target: { kind: 'new', title: 'Rendered cut' },
      renditions: [],
    });
    expect(saved).toMatchObject({
      ok: true,
      response: {
        savedVideo: { title: 'Rendered cut', currentVersion: { filename: 'render.mp4' } },
        revision: { snapshot: { workflowPhase: 'complete' } },
      },
    });
  });
});
