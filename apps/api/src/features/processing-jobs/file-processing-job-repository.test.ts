import { mkdtempSync } from 'node:fs';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FileProcessingJobRepository,
  type VideoProcessingJobTrace,
} from './file-processing-job-repository.js';

const roots: string[] = [];

// Created up front rather than named and left to the repository: `mkdtemp` takes the directory in
// one step, owner-only, so no other user of the machine can be sitting on the path first.
const temporaryRoot = (): string => {
  const root = mkdtempSync(path.join(tmpdir(), 'lightframe-processing-'));
  roots.push(root);
  return root;
};
const trace = (status: VideoProcessingJobTrace['status']): VideoProcessingJobTrace => ({
  schemaVersion: 1,
  jobId: '720620f6-446b-4987-828e-bc23470e613d',
  ownerUserId: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
  operation: 'character-swap',
  provider: 'decart',
  providerJobId: null,
  requestFingerprint: null,
  outputResolution: null,
  providerOutputLocation: null,
  sourceDurationMs: null,
  sourceOrientation: null,
  status,
  safeErrorCode: null,
  createdAt: '2026-08-05T12:00:00.000Z',
  updatedAt: status === 'ready' ? '2026-08-05T12:01:00.000Z' : '2026-08-05T12:00:00.000Z',
  completedAt: status === 'ready' ? '2026-08-05T12:01:00.000Z' : null,
});

describe('FileProcessingJobRepository', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('atomically serializes concurrent updates to one safe trace file', async () => {
    const root = temporaryRoot();
    const repository = new FileProcessingJobRepository(root);

    await Promise.all([repository.upsert(trace('processing')), repository.upsert(trace('ready'))]);

    const stored = JSON.parse(
      await readFile(
        path.join(root, 'metadata', 'v1', 'processing-jobs', `${trace('ready').jobId}.json`),
        'utf8',
      ),
    ) as VideoProcessingJobTrace;
    expect(stored).toEqual(trace('ready'));
  });

  it('rejects unsafe trace data before creating storage', async () => {
    const root = temporaryRoot();
    const repository = new FileProcessingJobRepository(root);
    await expect(
      repository.upsert({ ...trace('failed'), safeErrorCode: 'x'.repeat(81) }),
    ).rejects.toThrow();
  });

  it('re-downloads an unretained ready result from durable provider identity after restart', async () => {
    const root = temporaryRoot();
    const repository = new FileProcessingJobRepository(root);
    await repository.upsert({
      ...trace('ready'),
      providerJobId: 'provider-job',
      requestFingerprint: 'a'.repeat(64),
      outputResolution: '720p',
      sourceDurationMs: 1_000,
      sourceOrientation: 'landscape',
    });

    await expect(repository.listResumable('2026-08-05T12:02:00.000Z')).resolves.toEqual([
      expect.objectContaining({
        jobId: trace('ready').jobId,
        projectId: null,
        providerJobId: 'provider-job',
        status: 'retrieving',
      }),
    ]);
  });

  it('answers for the jobs it was asked about, and for no other job or owner', async () => {
    const root = temporaryRoot();
    const repository = new FileProcessingJobRepository(root);
    const settled: VideoProcessingJobTrace = {
      ...trace('failed'),
      jobId: '11111111-1111-4111-8111-111111111111',
      safeErrorCode: 'provider_rejected',
      updatedAt: '2026-08-05T12:03:00.000Z',
      completedAt: '2026-08-05T12:03:00.000Z',
    };
    const running: VideoProcessingJobTrace = {
      ...trace('processing'),
      jobId: '22222222-2222-4222-8222-222222222222',
    };
    const otherOwner: VideoProcessingJobTrace = {
      ...trace('failed'),
      jobId: '33333333-3333-4333-8333-333333333333',
      ownerUserId: '99999999-9999-4999-8999-999999999999',
    };
    const unasked: VideoProcessingJobTrace = {
      ...trace('failed'),
      jobId: '44444444-4444-4444-8444-444444444444',
    };
    for (const stored of [settled, running, otherOwner, unasked]) await repository.upsert(stored);

    const outcomes = await repository.findOutcomes(settled.ownerUserId, [
      settled.jobId,
      running.jobId,
      otherOwner.jobId,
      '55555555-5555-4555-8555-555555555555',
    ]);

    expect([...outcomes.keys()]).toEqual([settled.jobId, running.jobId]);
    expect(outcomes.get(settled.jobId)).toEqual({
      status: 'failed',
      completedAt: '2026-08-05T12:03:00.000Z',
      updatedAt: '2026-08-05T12:03:00.000Z',
    });
    expect(outcomes.get(running.jobId)).toEqual({
      status: 'processing',
      completedAt: null,
      updatedAt: '2026-08-05T12:00:00.000Z',
    });
  });

  it('answers about no jobs without reading any trace', async () => {
    const root = temporaryRoot();
    const repository = new FileProcessingJobRepository(root);
    await repository.upsert(trace('failed'));

    await expect(repository.findOutcomes(trace('failed').ownerUserId, [])).resolves.toEqual(
      new Map(),
    );
  });

  it('keeps a submission with no provider identity ambiguous until an explicit decision', async () => {
    const root = temporaryRoot();
    const repository = new FileProcessingJobRepository(root);
    await repository.upsert({
      ...trace('submitting'),
      requestFingerprint: 'a'.repeat(64),
      outputResolution: '720p',
      sourceDurationMs: 1_000,
      sourceOrientation: 'landscape',
    });

    await expect(repository.listResumable('2026-08-05T12:02:00.000Z')).resolves.toEqual([]);
    await expect(repository.listResumable('2026-08-05T14:00:00.000Z')).resolves.toEqual([]);
    const stored = JSON.parse(
      await readFile(
        path.join(root, 'metadata', 'v1', 'processing-jobs', `${trace('ready').jobId}.json`),
        'utf8',
      ),
    ) as VideoProcessingJobTrace;
    expect(stored).toMatchObject({
      status: 'ambiguous',
      safeErrorCode: 'submission_ambiguous',
    });
  });
});
