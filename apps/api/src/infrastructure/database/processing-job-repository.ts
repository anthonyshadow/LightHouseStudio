import { VIDEO_JOB_TTL_MS } from '@studio/contracts';
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';
import type {
  DurableProcessingJobRepository,
  ProcessingJobTraceWriter,
  ResumableVideoProcessingJob,
  VideoProcessingJobTrace,
} from '../../features/processing-jobs/file-processing-job-repository.js';
import type { LightframeDatabase } from './client.js';
import { processingJobs } from './schema.js';

export class DrizzleProcessingJobTraceWriter
  implements ProcessingJobTraceWriter, DurableProcessingJobRepository
{
  constructor(private readonly db: LightframeDatabase) {}

  async upsert(trace: VideoProcessingJobTrace): Promise<void> {
    const expiresAt = new Date(Date.parse(trace.createdAt) + VIDEO_JOB_TTL_MS).toISOString();
    await this.db
      .insert(processingJobs)
      .values({
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
        expiresAt,
        createdAt: trace.createdAt,
        updatedAt: trace.updatedAt,
      })
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
        status: 'ambiguous',
        safeErrorCode: 'provider_rejected',
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(processingJobs.status, 'submitting'),
          isNull(processingJobs.providerJobId),
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
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        expiresAt: row.expiresAt,
      });
    }
    return resumable;
  }
}
