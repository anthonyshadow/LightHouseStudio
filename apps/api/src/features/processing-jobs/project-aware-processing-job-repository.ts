import type { ProjectProcessingRepository } from '../projects/project-processing-repository.js';
import type {
  DurableProcessingJobOutcome,
  DurableProcessingJobRepository,
  ProcessingJobAdmissionResult,
  ProcessingJobTraceWriter,
  ResumableVideoProcessingJob,
  VideoProcessingJobTrace,
} from './file-processing-job-repository.js';

/**
 * Routes Project-linked traces through the local Project journal authority while preserving the
 * standalone temporary-job repository. An optional shadow writer is best-effort only.
 */
export class ProjectAwareProcessingJobRepository implements DurableProcessingJobRepository {
  constructor(
    private readonly projects: ProjectProcessingRepository,
    private readonly standalone: DurableProcessingJobRepository,
    private readonly shadow?: ProcessingJobTraceWriter,
  ) {}

  admit(trace: VideoProcessingJobTrace): Promise<ProcessingJobAdmissionResult> {
    return this.standalone.admit(trace);
  }

  async upsert(trace: VideoProcessingJobTrace): Promise<void> {
    const linked = await this.projects.updateProjectAttemptTrace(trace);
    if (!linked) {
      await this.standalone.upsert(trace);
    }
    if (this.shadow !== undefined) {
      await this.shadow.upsert(trace).catch(() => {
        console.warn('[project-processing] Shadow processing trace could not be reconciled.', {
          operationId: trace.jobId,
        });
      });
    }
  }

  async findOutcomes(
    ownerUserId: string,
    jobIds: readonly string[],
  ): Promise<ReadonlyMap<string, DurableProcessingJobOutcome>> {
    // Project authority answers first, for the same reason it recovers first: in relational mode
    // both stores read one table, and only the Project read knows an id is a Project attempt.
    const linked = await this.projects.findProjectAttemptOutcomes(ownerUserId, jobIds);
    const unlinked = jobIds.filter((jobId) => !linked.has(jobId));
    if (unlinked.length === 0) return linked;
    return new Map([...linked, ...(await this.standalone.findOutcomes(ownerUserId, unlinked))]);
  }

  async listResumable(now: string): Promise<readonly ResumableVideoProcessingJob[]> {
    // Project authority performs ambiguity/expiry recovery first. In relational mode the
    // standalone repository shares the table, so ordering prevents it from racing that policy.
    const project = await this.projects.listResumableProjectAttempts(now);
    const standalone = await this.standalone.listResumable(now);
    const ids = new Set(project.map(({ jobId }) => jobId));
    return [...project, ...standalone.filter(({ jobId }) => !ids.has(jobId))];
  }
}
