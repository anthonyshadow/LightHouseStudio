import { VIDEO_JOB_TTL_MS } from '@studio/contracts';
import { and, desc, eq, gt, inArray, isNotNull, isNull, lte, notExists, sql } from 'drizzle-orm';
import { toIsoTimestamp } from '../../application/timestamps.js';
import type {
  DurableProcessingJobRepository,
  ProcessingJobAdmissionResult,
  ProcessingJobTraceWriter,
  ResumableVideoProcessingJob,
  VideoProcessingJobTrace,
} from '../../features/processing-jobs/file-processing-job-repository.js';
import type { LightframeDatabase } from './client.js';
import { processingJobs, projectJobs } from './schema.js';

interface DrizzleProcessingJobTraceWriterOptions {
  readonly excludeProjectLinkedJobs?: boolean;
}

const persistedDurationMs = (durationMs: number | null): number | null =>
  durationMs === null ? null : Math.round(durationMs);

const activeStatuses = [
  'pending',
  'validating',
  'submitting',
  'accepted',
  'queued',
  'processing',
  'retrieving',
] as const;

const isOwnerActiveConflict = (error: unknown): boolean =>
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  error.code === '23505' &&
  'constraint' in error &&
  error.constraint === 'processing_jobs_owner_active_unique';

const valuesForTrace = (trace: VideoProcessingJobTrace) => ({
  id: trace.jobId,
  ownerUserId: trace.ownerUserId,
  operation: trace.operation,
  provider: trace.provider,
  providerJobId: trace.providerJobId,
  requestFingerprint: trace.requestFingerprint,
  outputResolution: trace.outputResolution,
  providerOutputLocation: trace.providerOutputLocation,
  sourceDurationMs: persistedDurationMs(trace.sourceDurationMs),
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
  constructor(
    private readonly db: LightframeDatabase,
    private readonly options: DrizzleProcessingJobTraceWriterOptions = {},
  ) {}

  #standaloneScope() {
    if (this.options.excludeProjectLinkedJobs !== true) return undefined;
    return notExists(
      this.db
        .select({ jobId: projectJobs.jobId })
        .from(projectJobs)
        .where(
          and(
            eq(projectJobs.jobId, processingJobs.id),
            eq(projectJobs.ownerUserId, processingJobs.ownerUserId),
          ),
        ),
    );
  }

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
          sourceDurationMs: persistedDurationMs(trace.sourceDurationMs),
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
    const standaloneScope = this.#standaloneScope();
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
            'ready',
          ]),
          isNull(processingJobs.outputAssetId),
          lte(processingJobs.expiresAt, now),
          standaloneScope,
        ),
      );
    await this.db
      .update(processingJobs)
      .set({
        status: 'ambiguous',
        safeErrorCode: 'submission_ambiguous',
        completedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          inArray(processingJobs.status, ['submitting', 'accepted']),
          isNull(processingJobs.providerJobId),
          gt(processingJobs.expiresAt, now),
          standaloneScope,
        ),
      );
    // `ready` is terminal for admission, so an owner may have several undelivered rows. Restart
    // recovery makes one row active again as `retrieving`; promote only the newest idle-owner row.
    const readyCandidates = await this.db
      .select({ id: processingJobs.id, ownerUserId: processingJobs.ownerUserId })
      .from(processingJobs)
      .where(
        and(
          eq(processingJobs.status, 'ready'),
          isNull(processingJobs.outputAssetId),
          isNotNull(processingJobs.providerJobId),
          gt(processingJobs.expiresAt, now),
          standaloneScope,
        ),
      )
      .orderBy(processingJobs.ownerUserId, desc(processingJobs.updatedAt), desc(processingJobs.id));
    const activeOwners = new Set(
      (
        await this.db
          .select({ ownerUserId: processingJobs.ownerUserId })
          .from(processingJobs)
          .where(inArray(processingJobs.status, activeStatuses))
      ).map(({ ownerUserId }) => ownerUserId),
    );
    for (const candidate of readyCandidates) {
      if (activeOwners.has(candidate.ownerUserId)) continue;
      activeOwners.add(candidate.ownerUserId);
      try {
        await this.db
          .update(processingJobs)
          .set({ status: 'retrieving', safeErrorCode: null, completedAt: null, updatedAt: now })
          .where(and(eq(processingJobs.id, candidate.id), eq(processingJobs.status, 'ready')));
      } catch (error) {
        // Another server may have admitted owner work after the read above. The database remains
        // authoritative; leave this ready result terminal and let the winning active job resume.
        if (!isOwnerActiveConflict(error)) throw error;
      }
    }
    await this.db
      .update(processingJobs)
      .set({ status: 'queued', safeErrorCode: null, completedAt: null, updatedAt: now })
      .where(
        and(
          eq(processingJobs.status, 'submitting'),
          isNotNull(processingJobs.providerJobId),
          gt(processingJobs.expiresAt, now),
          standaloneScope,
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
          standaloneScope,
        ),
      );
    const rows = await this.db
      .select()
      .from(processingJobs)
      .where(
        and(
          inArray(processingJobs.status, ['accepted', 'queued', 'processing', 'retrieving']),
          isNotNull(processingJobs.providerJobId),
          gt(processingJobs.expiresAt, now),
          standaloneScope,
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
        (row.status !== 'accepted' &&
          row.status !== 'queued' &&
          row.status !== 'processing' &&
          row.status !== 'retrieving')
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
        status: row.status === 'accepted' ? 'queued' : row.status,
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
