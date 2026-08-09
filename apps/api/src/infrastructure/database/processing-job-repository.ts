import { VIDEO_JOB_TTL_MS } from '@studio/contracts';
import { and, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { toIsoTimestamp } from '../../application/timestamps.js';
import type {
  DurableProcessingJobRepository,
  ProcessingJobAdmissionResult,
  ProcessingJobTraceWriter,
  ResumableVideoProcessingJob,
  VideoProcessingJobTrace,
} from '../../features/processing-jobs/file-processing-job-repository.js';
import type { LightframeDatabase } from './client.js';
import { processingJobs } from './schema.js';

const valuesForTrace = (trace: VideoProcessingJobTrace) => ({
  id: trace.jobId,
  ownerUserId: trace.ownerUserId,
  operation: trace.operation,
  provider: trace.provider,
  providerJobId: trace.providerJobId,
  requestFingerprint: trace.requestFingerprint,
  outputResolution: trace.outputResolution,
  providerOutputLocation: trace.providerOutputLocation,
  sourceDurationMs: trace.sourceDurationMs,
  sourceOrientation: trace.sourceOrientation,
  status: trace.status,
  safeErrorCode: trace.safeErrorCode,
  inputAssetId: null,
  outputAssetId: null,
  leaseOwner: null,
  leaseExpiresAt: null,
  attempt: 0,
  acceptedAt: trace.providerJobId === null ? null : trace.updatedAt,
  completedAt: trace.completedAt,
  expiresAt: new Date(Date.parse(trace.createdAt) + VIDEO_JOB_TTL_MS).toISOString(),
  createdAt: trace.createdAt,
  updatedAt: trace.updatedAt,
});

export class DrizzleProcessingJobTraceWriter
  implements ProcessingJobTraceWriter, DurableProcessingJobRepository
{
  constructor(private readonly db: LightframeDatabase) {}

  async admit(trace: VideoProcessingJobTrace): Promise<ProcessingJobAdmissionResult> {
    const inserted = await this.db
      .insert(processingJobs)
      .values(valuesForTrace(trace))
      .onConflictDoNothing()
      .returning({ id: processingJobs.id });
    if (inserted.length === 1) return 'admitted';

    const [existing] = await this.db
      .select({
        ownerUserId: processingJobs.ownerUserId,
        operation: processingJobs.operation,
        provider: processingJobs.provider,
        requestFingerprint: processingJobs.requestFingerprint,
        outputResolution: processingJobs.outputResolution,
      })
      .from(processingJobs)
      .where(eq(processingJobs.id, trace.jobId))
      .limit(1);
    if (existing === undefined) return 'owner-conflict';
    if (existing.ownerUserId !== trace.ownerUserId) return 'owner-mismatch';
    if (
      existing.operation !== trace.operation ||
      existing.provider !== trace.provider ||
      existing.requestFingerprint !== trace.requestFingerprint ||
      existing.outputResolution !== trace.outputResolution
    ) {
      return 'request-conflict';
    }
    return 'duplicate';
  }

  async upsert(trace: VideoProcessingJobTrace): Promise<void> {
    await this.db
      .insert(processingJobs)
      .values(valuesForTrace(trace))
      .onConflictDoUpdate({
        target: processingJobs.id,
        set: {
          providerJobId: trace.providerJobId,
          requestFingerprint: trace.requestFingerprint,
          outputResolution: trace.outputResolution,
          providerOutputLocation: trace.providerOutputLocation,
          sourceDurationMs: trace.sourceDurationMs,
          sourceOrientation: trace.sourceOrientation,
          status: trace.status,
          safeErrorCode: trace.safeErrorCode,
          acceptedAt:
            trace.providerJobId === null
              ? processingJobs.acceptedAt
              : sql`coalesce(${processingJobs.acceptedAt}, ${trace.updatedAt})`,
          completedAt: trace.completedAt,
          updatedAt: trace.updatedAt,
        },
      });
  }

  async listResumable(now: string): Promise<readonly ResumableVideoProcessingJob[]> {
    await this.db
      .update(processingJobs)
      .set({
        status: 'expired',
        safeErrorCode: 'job_expired',
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          inArray(processingJobs.status, [
            'pending',
            'validating',
            'submitting',
            'accepted',
            'queued',
            'processing',
            'retrieving',
          ]),
          lte(processingJobs.expiresAt, now),
        ),
      );
    await this.db
      .update(processingJobs)
      .set({
        status: 'ambiguous',
        safeErrorCode: 'provider_rejected',
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          inArray(processingJobs.status, ['submitting', 'accepted']),
          gt(processingJobs.expiresAt, now),
        ),
      );
    await this.db
      .update(processingJobs)
      .set({
        status: 'failed',
        safeErrorCode: 'provider_rejected',
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          inArray(processingJobs.status, ['pending', 'validating']),
          gt(processingJobs.expiresAt, now),
        ),
      );
    const rows = await this.db
      .select()
      .from(processingJobs)
      .where(
        and(
          inArray(processingJobs.status, ['queued', 'processing', 'retrieving']),
          gt(processingJobs.expiresAt, now),
        ),
      );
    const resumable: ResumableVideoProcessingJob[] = [];
    for (const row of rows) {
      if (
        row.providerJobId === null ||
        row.requestFingerprint === null ||
        (row.outputResolution !== '720p' && row.outputResolution !== '1080p') ||
        row.sourceDurationMs === null ||
        (row.sourceOrientation !== 'landscape' && row.sourceOrientation !== 'portrait') ||
        (row.operation !== 'character-swap' && row.operation !== 'virtual-try-on') ||
        (row.status !== 'queued' && row.status !== 'processing' && row.status !== 'retrieving')
      ) {
        continue;
      }
      resumable.push({
        jobId: row.id,
        ownerUserId: row.ownerUserId,
        operation: row.operation,
        provider: row.provider,
        providerJobId: row.providerJobId,
        requestFingerprint: row.requestFingerprint,
        status: row.status,
        outputResolution: row.outputResolution,
        providerOutputLocation: row.providerOutputLocation,
        sourceDurationMs: row.sourceDurationMs,
        sourceOrientation: row.sourceOrientation,
        createdAt: toIsoTimestamp(row.createdAt),
        updatedAt: toIsoTimestamp(row.updatedAt),
        expiresAt: toIsoTimestamp(row.expiresAt),
      });
    }
    return resumable;
  }
}
