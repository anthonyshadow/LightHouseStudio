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

const phonePlacement = {
  container: 'video/mp4' as const,
  aspect: '9:16' as const,
  resolution: { width: 1_080, height: 1_920 },
  includeAudio: true,
};
const squarePlacement = {
  container: 'video/mp4' as const,
  aspect: '1:1' as const,
  resolution: { width: 1_080, height: 1_080 },
  includeAudio: true,
};
const widePlacement = {
  container: 'video/mp4' as const,
  aspect: '16:9' as const,
  resolution: { width: 1_920, height: 1_080 },
  includeAudio: true,
};

/** One distinguishable file per placement, so the inspection stub can answer each its own shape. */
const renditionFixtures = [phonePlacement, squarePlacement, widePlacement].map((specification) => {
  const bytes = Buffer.from(`synthetic-reframed-${specification.aspect}-video`);
  return {
    specification,
    bytes,
    checksum: createHash('sha256').update(bytes).digest('hex'),
  };
});
const renditionBytes = renditionFixtures[0]!.bytes;

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
  const inspectByContent = async (filePath: string) => {
    const content = await readFile(filePath);
    const fixture = renditionFixtures.find(({ bytes: candidate }) => content.equals(candidate));
    return fixture === undefined
      ? inspected
      : {
          ...inspected,
          sizeBytes: fixture.bytes.byteLength,
          width: fixture.specification.resolution.width,
          height: fixture.specification.resolution.height,
        };
  };

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

  const storeRendition = async (
    specification: (typeof renditionFixtures)[number]['specification'] = phonePlacement,
  ) => {
    const fixture = renditionFixtures.find(
      (candidate) => candidate.specification.aspect === specification.aspect,
    )!;
    const renditionPath = path.join(directory, `rendition-${specification.aspect}.mp4`);
    await writeFile(renditionPath, fixture.bytes);
    return new ProjectRenditionService(projects, bytes, {
      now: () => new Date('2026-08-13T12:01:30.000Z'),
      inspect: inspectByContent,
      projectRetention: projects,
    }).upload({
      ownerUserId,
      projectId: (await projects.getCurrent(ownerUserId, currentProjectId))!.project.id,
      operationKey: randomUUID(),
      sourcePath: renditionPath,
      checksumSha256: fixture.checksum,
      filename: 'reframed.mp4',
      specification,
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

  it('names the rendition for the chosen placement as the output and the rest as siblings', async () => {
    const created = await createReadyProject();
    const current = await choosePhonePlacement(created.current);
    const [phone, square, wide] = await Promise.all([
      storeRendition(phonePlacement),
      storeRendition(squarePlacement),
      storeRendition(widePlacement),
    ]);

    const saved = await outputServiceWithRenditions().save(
      ownerUserId,
      current.project.id,
      randomUUID(),
      {
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.revision.revisionNumber,
        media: current.revision.snapshot.workingMedia!,
        target: { kind: 'new', title: 'Launch set' },
        // Offered out of order on purpose: the answer is canonical, not the order it arrived in.
        renditions: [
          { media: square.media, specification: squarePlacement },
          { media: phone.media, specification: phonePlacement },
          { media: wide.media, specification: widePlacement },
        ],
      },
    );
    if (!saved.ok) throw new Error('Expected the set to be saved.');

    const versions = saved.response.savedVideo.versions;
    expect(versions.map(({ ordinal }) => ordinal)).toEqual([1, 2, 3]);
    // Canonical order for the siblings, and the chosen placement written last so it leads.
    expect(versions.map(({ exportSpecification }) => exportSpecification?.aspect)).toEqual([
      '16:9',
      '1:1',
      '9:16',
    ]);
    expect(saved.response.savedVideo.currentVersion.exportSpecification?.aspect).toBe('9:16');
    expect(saved.response.output.videoVersionId).toBe(saved.response.savedVideo.currentVersion.id);
    // One set, one id, shared by every member — and every Version has its own bytes.
    const setIds = new Set(versions.map(({ variantSetId }) => variantSetId));
    expect(setIds.size).toBe(1);
    expect([...setIds][0]).not.toBeNull();
    expect(new Set(versions.map(({ id }) => id)).size).toBe(3);
    // A re-framed save still presents the cut it came from, so the next save starts where this did.
    expect(saved.response.revision.snapshot.presentedMedia).toEqual(
      current.revision.snapshot.workingMedia,
    );

    const outputs = await projects.listLinkHistory(ownerUserId, current.project.id, {
      kind: 'output',
      pageSize: 10,
    });
    // Three links, all from the one producing revision — provenance per Version, not per save.
    expect(outputs?.links).toHaveLength(3);
    expect(
      new Set(
        outputs?.links.map((link) =>
          'producingRevisionNumber' in link ? link.producingRevisionNumber : null,
        ),
      ),
    ).toEqual(new Set([current.revision.revisionNumber]));
  });

  it('leads with the cut when the Project kept its shape, and adds the placements beside it', async () => {
    const created = await createReadyProject();
    const [square, wide] = await Promise.all([
      storeRendition(squarePlacement),
      storeRendition(widePlacement),
    ]);

    const saved = await outputServiceWithRenditions().save(
      ownerUserId,
      created.current.project.id,
      randomUUID(),
      {
        expectedVersion: created.current.project.version,
        expectedRevisionNumber: created.current.revision.revisionNumber,
        media: created.current.revision.snapshot.workingMedia!,
        target: { kind: 'new', title: 'Original and two' },
        renditions: [
          { media: square.media, specification: squarePlacement },
          { media: wide.media, specification: widePlacement },
        ],
      },
    );
    if (!saved.ok) throw new Error('Expected the set to be saved.');

    const versions = saved.response.savedVideo.versions;
    expect(
      versions.map(({ exportSpecification }) => exportSpecification?.aspect ?? 'source'),
    ).toEqual(['16:9', '1:1', 'source']);
    // The cut leads, so it is what the Project presents — the one member that is not a deliverable.
    expect(saved.response.savedVideo.currentVersion.exportSpecification).toBeNull();
    expect(saved.response.revision.snapshot.presentedMedia).toEqual({
      kind: 'saved-video-version',
      savedVideoId: saved.response.savedVideo.id,
      videoVersionId: saved.response.savedVideo.currentVersion.id,
    });
  });

  it('still leads a set whose chosen placement failed, and presents nothing', async () => {
    const created = await createReadyProject();
    const current = await choosePhonePlacement(created.current);
    const [square, wide] = await Promise.all([
      storeRendition(squarePlacement),
      storeRendition(widePlacement),
    ]);

    const saved = await outputServiceWithRenditions().save(
      ownerUserId,
      current.project.id,
      randomUUID(),
      {
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.revision.revisionNumber,
        media: current.revision.snapshot.workingMedia!,
        target: { kind: 'new', title: 'Phone failed' },
        renditions: [
          { media: square.media, specification: squarePlacement },
          { media: wide.media, specification: widePlacement },
        ],
      },
    );
    if (!saved.ok) throw new Error('Expected the produced subset to be saved.');
    // The chosen placement is absent, so the last canonical member leads and the cut is not stored.
    expect(saved.response.savedVideo.versions).toHaveLength(2);
    expect(saved.response.savedVideo.currentVersion.exportSpecification?.aspect).toBe('1:1');
    expect(saved.response.revision.snapshot.presentedMedia).toEqual(
      current.revision.snapshot.workingMedia,
    );
  });

  it('adds a missing placement to the set a save already made, and refuses one that has moved on', async () => {
    const created = await createReadyProject();
    const current = await choosePhonePlacement(created.current);
    const [phone, square, wide] = await Promise.all([
      storeRendition(phonePlacement),
      storeRendition(squarePlacement),
      storeRendition(widePlacement),
    ]);
    const service = outputServiceWithRenditions();
    const first = await service.save(ownerUserId, current.project.id, randomUUID(), {
      expectedVersion: current.project.version,
      expectedRevisionNumber: current.revision.revisionNumber,
      media: current.revision.snapshot.workingMedia!,
      target: { kind: 'new', title: 'Partial set' },
      renditions: [
        { media: square.media, specification: squarePlacement },
        { media: phone.media, specification: phonePlacement },
      ],
    });
    if (!first.ok) throw new Error('Expected the first set to be saved.');
    const variantSetId = first.response.savedVideo.currentVersion.variantSetId!;
    const afterFirst = (await projects.getCurrent(ownerUserId, current.project.id))!;

    // The retry: only the placement that was missing, joining the set the first save started.
    const joined = await service.save(ownerUserId, current.project.id, randomUUID(), {
      expectedVersion: afterFirst.project.version,
      expectedRevisionNumber: afterFirst.revision.revisionNumber,
      media: afterFirst.revision.snapshot.workingMedia!,
      target: {
        kind: 'version',
        savedVideoId: first.response.savedVideo.id,
        expectedVersionId: first.response.savedVideo.currentVersion.id,
      },
      variantSetId,
      renditions: [{ media: wide.media, specification: widePlacement }],
    });
    if (!joined.ok) throw new Error('Expected the retry to join the set.');

    const versions = joined.response.savedVideo.versions;
    expect(versions).toHaveLength(3);
    // One set, consecutive ordinals, and the retried placement is now the current Version.
    expect(versions.every((version) => version.variantSetId === variantSetId)).toBe(true);
    expect(versions.map(({ ordinal }) => ordinal)).toEqual([1, 2, 3]);
    expect(joined.response.savedVideo.currentVersion.exportSpecification?.aspect).toBe('16:9');
    // The cut is not stored a second time: three Versions, three placements, no source-shaped one.
    expect(versions.filter(({ exportSpecification }) => exportSpecification === null)).toHaveLength(
      0,
    );

    const afterJoin = (await projects.getCurrent(ownerUserId, current.project.id))!;
    const joinRequest = {
      expectedVersion: afterJoin.project.version,
      expectedRevisionNumber: afterJoin.revision.revisionNumber,
      media: afterJoin.revision.snapshot.workingMedia!,
      target: {
        kind: 'version' as const,
        savedVideoId: joined.response.savedVideo.id,
        expectedVersionId: joined.response.savedVideo.currentVersion.id,
      },
      variantSetId,
    };
    // A placement the set already holds is refused before anything is written.
    await expect(
      service.save(ownerUserId, current.project.id, randomUUID(), {
        ...joinRequest,
        renditions: [{ media: square.media, specification: squarePlacement }],
      }),
    ).rejects.toThrow(/already has a Version for the 1:1 placement/u);

    // Move the Project on materially: that clears its output pointer, so the set it made is no
    // longer the set this Project is saving, and a retry has to start a new one.
    const moved = await new ProjectService(projects, {
      now: () => new Date('2026-08-13T12:03:00.000Z'),
    }).checkpoint(ownerUserId, current.project.id, {
      expectedVersion: afterJoin.project.version,
      expectedRevisionNumber: afterJoin.revision.revisionNumber,
      proposal: { ...afterJoin.revision.snapshot, exportSpecification: squarePlacement },
    });
    if (!moved.ok) throw new Error('Expected the placement change to be accepted.');
    await expect(
      service.save(ownerUserId, current.project.id, randomUUID(), {
        ...joinRequest,
        expectedVersion: moved.current.project.version,
        expectedRevisionNumber: moved.current.revision.revisionNumber,
        media: moved.current.revision.snapshot.workingMedia!,
        renditions: [{ media: square.media, specification: squarePlacement }],
      }),
    ).rejects.toThrow(/changed since those placements were saved/u);
  });

  it('replays a multi-placement save without producing a second set', async () => {
    const created = await createReadyProject();
    const current = await choosePhonePlacement(created.current);
    const [phone, square] = await Promise.all([
      storeRendition(phonePlacement),
      storeRendition(squarePlacement),
    ]);
    const operationId = randomUUID();
    const request = {
      expectedVersion: current.project.version,
      expectedRevisionNumber: current.revision.revisionNumber,
      media: current.revision.snapshot.workingMedia!,
      target: { kind: 'new' as const, title: 'Replayed set' },
      renditions: [
        { media: square.media, specification: squarePlacement },
        { media: phone.media, specification: phonePlacement },
      ],
    };
    const service = outputServiceWithRenditions();
    const first = await service.save(ownerUserId, current.project.id, operationId, request);
    const again = await service.save(ownerUserId, current.project.id, operationId, request);
    if (!first.ok || !again.ok) throw new Error('Expected both attempts to be answered.');

    expect(again.response.replayed).toBe(true);
    expect(again.response.savedVideo.versions.map(({ id }) => id)).toEqual(
      first.response.savedVideo.versions.map(({ id }) => id),
    );
    // A different order of the same set is a different request, not the same one replayed.
    await expect(
      service.save(ownerUserId, current.project.id, operationId, {
        ...request,
        renditions: [request.renditions[1]!, request.renditions[0]!],
      }),
    ).resolves.toMatchObject({ ok: false, conflict: { kind: 'operation-key' } });
  });

  it('refuses a malformed set before it opens a single asset', async () => {
    const created = await createReadyProject();
    const current = await choosePhonePlacement(created.current);
    const rendition = await storeRendition();
    const save = (renditions: unknown[]) =>
      outputServiceWithRenditions().save(ownerUserId, current.project.id, randomUUID(), {
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.revision.revisionNumber,
        media: current.revision.snapshot.workingMedia!,
        target: { kind: 'new', title: 'Refused' },
        renditions: renditions as never,
      });

    // A specification that is not the shape it claims: refused as a specification, not as bytes.
    await expect(
      save([
        {
          media: rendition.media,
          specification: { ...phonePlacement, resolution: { width: 1_920, height: 1_080 } },
        },
      ]),
    ).rejects.toThrow(/is not a 9:16 shape/u);
    await expect(
      save([
        { media: rendition.media, specification: phonePlacement },
        { media: rendition.media, specification: phonePlacement },
      ]),
    ).rejects.toThrow(/same placement twice/u);
    // Nothing was written by either refusal.
    const outputs = await projects.listLinkHistory(ownerUserId, current.project.id, {
      kind: 'output',
      pageSize: 10,
    });
    expect(outputs?.links).toHaveLength(0);
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
