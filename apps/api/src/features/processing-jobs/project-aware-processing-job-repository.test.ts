import { describe, expect, it, vi } from 'vitest';
import type { ProjectProcessingRepository } from '../projects/project-processing-repository.js';
import type {
  DurableProcessingJobRepository,
  ProcessingJobTraceWriter,
  ResumableVideoProcessingJob,
  VideoProcessingJobTrace,
} from './file-processing-job-repository.js';
import { ProjectAwareProcessingJobRepository } from './project-aware-processing-job-repository.js';

const trace: VideoProcessingJobTrace = {
  schemaVersion: 1,
  jobId: '2efcc6c3-e82c-419a-8807-c0026170fb75',
  ownerUserId: '3efcc6c3-e82c-419a-8807-c0026170fb75',
  operation: 'character-swap',
  provider: 'decart',
  providerJobId: 'provider-job',
  requestFingerprint: 'a'.repeat(64),
  outputResolution: '720p',
  providerOutputLocation: null,
  sourceDurationMs: 1_000,
  sourceOrientation: 'landscape',
  status: 'queued',
  safeErrorCode: null,
  createdAt: '2026-08-13T12:00:00.000Z',
  updatedAt: '2026-08-13T12:01:00.000Z',
  completedAt: null,
};

const resumable: ResumableVideoProcessingJob = {
  jobId: trace.jobId,
  ownerUserId: trace.ownerUserId,
  operation: trace.operation,
  provider: trace.provider,
  providerJobId: trace.providerJobId!,
  requestFingerprint: trace.requestFingerprint!,
  status: 'queued',
  outputResolution: trace.outputResolution!,
  providerOutputLocation: null,
  sourceDurationMs: trace.sourceDurationMs!,
  sourceOrientation: trace.sourceOrientation!,
  createdAt: trace.createdAt,
  updatedAt: trace.updatedAt,
  expiresAt: '2026-08-13T13:00:00.000Z',
};

describe('ProjectAwareProcessingJobRepository', () => {
  it('keeps the Project repository authoritative when a shadow trace fails', async () => {
    const updateProjectAttemptTrace = vi.fn().mockResolvedValue(true);
    const standalone: DurableProcessingJobRepository = {
      admit: vi.fn().mockResolvedValue('admitted'),
      upsert: vi.fn().mockResolvedValue(undefined),
      listResumable: vi.fn().mockResolvedValue([]),
    };
    const shadow: ProcessingJobTraceWriter = {
      upsert: vi.fn().mockRejectedValue(new Error('shadow unavailable')),
    };
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const repository = new ProjectAwareProcessingJobRepository(
      { updateProjectAttemptTrace } as unknown as ProjectProcessingRepository,
      standalone,
      shadow,
    );

    await expect(repository.upsert(trace)).resolves.toBeUndefined();
    expect(updateProjectAttemptTrace).toHaveBeenCalledWith(trace);
    expect(standalone.upsert).not.toHaveBeenCalled();
    expect(shadow.upsert).toHaveBeenCalledWith(trace);
    expect(warning).toHaveBeenCalledOnce();
    warning.mockRestore();
  });

  it('recovers Project authority first and de-duplicates shared-table standalone rows', async () => {
    const order: string[] = [];
    const projects = {
      listResumableProjectAttempts: vi.fn(() => {
        order.push('project');
        return Promise.resolve([resumable]);
      }),
    } as unknown as ProjectProcessingRepository;
    const standalone: DurableProcessingJobRepository = {
      admit: vi.fn().mockResolvedValue('admitted'),
      upsert: vi.fn().mockResolvedValue(undefined),
      listResumable: vi.fn(() => {
        order.push('standalone');
        return Promise.resolve([
          resumable,
          { ...resumable, jobId: '4efcc6c3-e82c-419a-8807-c0026170fb75' },
        ]);
      }),
    };
    const repository = new ProjectAwareProcessingJobRepository(projects, standalone);

    await expect(repository.listResumable('2026-08-13T12:02:00.000Z')).resolves.toEqual([
      resumable,
      { ...resumable, jobId: '4efcc6c3-e82c-419a-8807-c0026170fb75' },
    ]);
    expect(order).toEqual(['project', 'standalone']);
  });
});
