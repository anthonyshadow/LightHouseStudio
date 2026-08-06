import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  FileProcessingJobRepository,
  type VideoProcessingJobTrace,
} from './file-processing-job-repository.js';

const roots: string[] = [];
const trace = (status: VideoProcessingJobTrace['status']): VideoProcessingJobTrace => ({
  schemaVersion: 1,
  jobId: '720620f6-446b-4987-828e-bc23470e613d',
  ownerUserId: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
  operation: 'character-swap',
  provider: 'decart',
  providerJobId: null,
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
    const root = path.join(tmpdir(), `lightframe-processing-${crypto.randomUUID()}`);
    roots.push(root);
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
    const root = path.join(tmpdir(), `lightframe-processing-${crypto.randomUUID()}`);
    roots.push(root);
    const repository = new FileProcessingJobRepository(root);
    await expect(
      repository.upsert({ ...trace('failed'), safeErrorCode: 'x'.repeat(81) }),
    ).rejects.toThrow();
  });
});
