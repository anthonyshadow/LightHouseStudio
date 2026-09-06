import { describe, expect, it, vi } from 'vitest';
import type { ProjectProcessingRepository } from '../projects/project-processing-repository.js';
import type {
  DurableProcessingJobOutcome,
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
  projectId: null,
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

const linkedJobId = '5efcc6c3-e82c-419a-8807-c0026170fb75';
const standaloneJobId = '6efcc6c3-e82c-419a-8807-c0026170fb75';
const linkedOutcome: DurableProcessingJobOutcome = {
  status: 'ready',
  completedAt: '2026-08-13T12:05:00.000Z',
  updatedAt: '2026-08-13T12:05:00.000Z',
};
const standaloneOutcome: DurableProcessingJobOutcome = {
  status: 'failed',
  completedAt: '2026-08-13T12:06:00.000Z',
  updatedAt: '2026-08-13T12:06:00.000Z',
};

/** A port stand-in that answers only the methods a test names, so an unexpected call is visible. */
const unstubbed = (method: string) => (): Promise<never> =>
  Promise.reject(new Error(`${method} is not stubbed for this test.`));

const projectRepository = (
  overrides: Partial<ProjectProcessingRepository>,
): ProjectProcessingRepository => ({
  admitProjectAttempt: unstubbed('admitProjectAttempt'),
  getProjectAttempt: unstubbed('getProjectAttempt'),
  findProjectAttemptOutcomes: unstubbed('findProjectAttemptOutcomes'),
  getCurrentProjectAuthority: unstubbed('getCurrentProjectAuthority'),
  isProjectAttemptSuperseded: unstubbed('isProjectAttemptSuperseded'),
  listProjectAttempts: unstubbed('listProjectAttempts'),
  updateProjectAttemptTrace: unstubbed('updateProjectAttemptTrace'),
  listResumableProjectAttempts: unstubbed('listResumableProjectAttempts'),
  retainProjectResult: unstubbed('retainProjectResult'),
  ...overrides,
});

describe('ProjectAwareProcessingJobRepository', () => {
  it('keeps the Project repository authoritative when a shadow trace fails', async () => {
    const updateProjectAttemptTrace = vi.fn().mockResolvedValue(true);
    const standalone: DurableProcessingJobRepository = {
      admit: vi.fn().mockResolvedValue('admitted'),
      upsert: vi.fn().mockResolvedValue(undefined),
      listResumable: vi.fn().mockResolvedValue([]),
      findOutcomes: vi.fn().mockResolvedValue(new Map()),
    };
    const shadow: ProcessingJobTraceWriter = {
      upsert: vi.fn().mockRejectedValue(new Error('shadow unavailable')),
    };
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const repository = new ProjectAwareProcessingJobRepository(
      projectRepository({ updateProjectAttemptTrace }),
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
    const projects = projectRepository({
      listResumableProjectAttempts: vi.fn(() => {
        order.push('project');
        return Promise.resolve([resumable]);
      }),
    });
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
      findOutcomes: vi.fn().mockResolvedValue(new Map()),
    };
    const repository = new ProjectAwareProcessingJobRepository(projects, standalone);

    await expect(repository.listResumable('2026-08-13T12:02:00.000Z')).resolves.toEqual([
      resumable,
      { ...resumable, jobId: '4efcc6c3-e82c-419a-8807-c0026170fb75' },
    ]);
    expect(order).toEqual(['project', 'standalone']);
  });

  it('asks the Project store for every outcome and the standalone store only for the rest', async () => {
    const findProjectAttemptOutcomes = vi
      .fn()
      .mockResolvedValue(new Map([[linkedJobId, linkedOutcome]]));
    const findOutcomes = vi.fn().mockResolvedValue(new Map([[standaloneJobId, standaloneOutcome]]));
    const standalone: DurableProcessingJobRepository = {
      admit: vi.fn().mockResolvedValue('admitted'),
      upsert: vi.fn().mockResolvedValue(undefined),
      listResumable: vi.fn().mockResolvedValue([]),
      findOutcomes,
    };
    const repository = new ProjectAwareProcessingJobRepository(
      projectRepository({ findProjectAttemptOutcomes }),
      standalone,
    );

    const outcomes = await repository.findOutcomes(trace.ownerUserId, [
      linkedJobId,
      standaloneJobId,
    ]);

    expect(findProjectAttemptOutcomes).toHaveBeenCalledExactlyOnceWith(trace.ownerUserId, [
      linkedJobId,
      standaloneJobId,
    ]);
    expect(findOutcomes).toHaveBeenCalledExactlyOnceWith(trace.ownerUserId, [standaloneJobId]);
    expect([...outcomes]).toEqual([
      [linkedJobId, linkedOutcome],
      [standaloneJobId, standaloneOutcome],
    ]);
  });

  it('leaves the standalone store alone when every id is a Project attempt', async () => {
    const findOutcomes = vi.fn();
    const standalone: DurableProcessingJobRepository = {
      admit: vi.fn().mockResolvedValue('admitted'),
      upsert: vi.fn().mockResolvedValue(undefined),
      listResumable: vi.fn().mockResolvedValue([]),
      findOutcomes,
    };
    const repository = new ProjectAwareProcessingJobRepository(
      projectRepository({
        findProjectAttemptOutcomes: vi
          .fn()
          .mockResolvedValue(new Map([[linkedJobId, linkedOutcome]])),
      }),
      standalone,
    );

    await expect(repository.findOutcomes(trace.ownerUserId, [linkedJobId])).resolves.toEqual(
      new Map([[linkedJobId, linkedOutcome]]),
    );
    expect(findOutcomes).not.toHaveBeenCalled();
  });
});
