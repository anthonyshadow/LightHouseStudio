import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { KeyedLock } from '../../application/keyed-lock.js';
import { LocalAssetByteStore } from '../../storage/asset-byte-store.js';
import { FileSavedVideoRepository } from '../saved-videos/saved-video-repository.js';
import { FileProjectRepository } from './file-project-repository.js';
import { ProjectRenditionService } from './project-rendition-service.js';
import { ProjectService } from './project-service.js';
import { ProjectSourceService } from './project-source-service.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const bytesValue = Buffer.from('synthetic-reframed-video');
const checksumSha256 = createHash('sha256').update(bytesValue).digest('hex');
const inspected = {
  mimeType: 'video/mp4' as const,
  container: 'mp4' as const,
  videoCodec: 'avc' as const,
  audioCodec: 'aac' as const,
  durationMs: 12_000,
  width: 1_080,
  height: 1_920,
  sizeBytes: bytesValue.byteLength,
  hasAudio: true,
};
const phonePlacement = {
  container: 'video/mp4' as const,
  aspect: '9:16' as const,
  resolution: { width: 1_080, height: 1_920 },
  includeAudio: true,
};

describe('ProjectRenditionService', () => {
  let directory: string;
  let sourcePath: string;
  let projects: FileProjectRepository;
  let bytes: LocalAssetByteStore;
  let projectId: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-project-rendition-'));
    sourcePath = path.join(directory, 'rendition.mp4');
    await writeFile(sourcePath, bytesValue);
    const ownerLock = new KeyedLock();
    const savedVideos = new FileSavedVideoRepository(directory, { ownerLock });
    projects = new FileProjectRepository(directory, { ownerLock, savedVideos });
    bytes = new LocalAssetByteStore(directory);
    const created = await new ProjectService(projects).create(
      ownerUserId,
      randomUUID(),
      'Placement project',
    );
    if (!created.ok) throw new Error('Expected Project creation.');
    projectId = created.current.project.id;
    const accepted = await new ProjectSourceService(projects, savedVideos, bytes, {
      inspect: () => Promise.resolve({ ...inspected, width: 1_280, height: 720 }),
      projectRetention: projects,
    }).upload({
      ownerUserId,
      projectId,
      operationKey: randomUUID(),
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      kind: 'uploaded',
      sourcePath,
      checksumSha256,
      filename: 'source.mp4',
    });
    if (!accepted.ok) throw new Error('Expected Project source acceptance.');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  const service = () =>
    new ProjectRenditionService(projects, bytes, {
      now: () => new Date('2026-08-13T12:05:00.000Z'),
      inspect: () => Promise.resolve(inspected),
      projectRetention: projects,
    });

  const upload = (operationKey: string) =>
    service().upload({
      ownerUserId,
      projectId,
      operationKey,
      sourcePath,
      checksumSha256,
      filename: 'reframed.mp4',
      specification: phonePlacement,
    });

  it('stores re-framed bytes without touching the Project revision', async () => {
    const before = await projects.getCurrent(ownerUserId, projectId);
    const response = await upload(randomUUID());

    expect(response).toMatchObject({
      media: { kind: 'asset' },
      specification: phonePlacement,
      width: 1_080,
      height: 1_920,
      checksumSha256,
    });
    const after = await projects.getCurrent(ownerUserId, projectId);
    expect(after?.project.version).toBe(before?.project.version);
    expect(after?.revision.revisionNumber).toBe(before?.revision.revisionNumber);
    expect(after?.revision.snapshot.workingMedia).toEqual(before?.revision.snapshot.workingMedia);
  });

  it('replays one upload rather than storing a second copy', async () => {
    const operationKey = randomUUID();
    const first = await upload(operationKey);
    const replay = await upload(operationKey);

    expect(replay).toEqual(first);
    expect(replay.assetId).toBe(operationKey);
  });

  it('refuses bytes that are not the shape the placement asked for', async () => {
    await expect(
      service().upload({
        ownerUserId,
        projectId,
        operationKey: randomUUID(),
        sourcePath,
        checksumSha256,
        filename: 'reframed.mp4',
        specification: { ...phonePlacement, resolution: { width: 1_920, height: 1_080 } },
      }),
    ).rejects.toThrow(/does not match the placement/u);
  });

  it('refuses a rendition for a Project the caller does not own', async () => {
    await expect(
      service().upload({
        ownerUserId: '458c4aca-a9fa-4c25-a2c8-d218768216a1',
        projectId,
        operationKey: randomUUID(),
        sourcePath,
        checksumSha256,
        filename: 'reframed.mp4',
        specification: phonePlacement,
      }),
    ).rejects.toThrow(/unavailable/u);
  });
});
