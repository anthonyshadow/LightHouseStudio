import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import { KeyedLock } from '../../application/keyed-lock.js';
import path from 'node:path';
import { z } from 'zod';
import {
  VIDEO_JOB_TTL_MS,
  videoJobStatusSchema,
  videoOutputResolutionSchema,
} from '@studio/contracts';
import type { ProjectProcessingJobStatus } from '@studio/domain';
import {
  nullableIsoTimestamp,
  persistedTimestampSchema,
  toIsoTimestamp,
} from '../../application/timestamps.js';

const traceSchema = z
  .object({
    schemaVersion: z.literal(1),
    jobId: z.uuid(),
    ownerUserId: z.uuid(),
    operation: z.enum(['character-swap', 'virtual-try-on']),
    provider: z.string().trim().min(1).max(80),
    providerJobId: z.string().trim().min(1).max(500).nullable(),
    requestFingerprint: z
      .string()
      .regex(/^[a-f0-9]{64}$/u)
      .nullable()
      .default(null),
    outputResolution: videoOutputResolutionSchema.nullable().default(null),
    providerOutputLocation: z.string().trim().min(1).max(2_000).nullable().default(null),
    sourceDurationMs: z.number().finite().positive().max(300_000).nullable().default(null),
    sourceOrientation: z.enum(['landscape', 'portrait']).nullable().default(null),
    status: videoJobStatusSchema,
    safeErrorCode: z.string().trim().min(1).max(80).nullable(),
    createdAt: persistedTimestampSchema,
    updatedAt: persistedTimestampSchema,
    completedAt: persistedTimestampSchema.nullable(),
  })
  .strict();

export type VideoProcessingJobTrace = z.infer<typeof traceSchema>;
export interface ProcessingJobTraceWriter {
  upsert(trace: VideoProcessingJobTrace): Promise<void>;
}

export interface ResumableVideoProcessingJob {
  readonly jobId: string;
  readonly ownerUserId: string;
  /** Null for a standalone job; a Project-linked one carries the id its attempt belongs to. */
  readonly projectId: string | null;
  readonly operation: 'character-swap' | 'virtual-try-on';
  readonly provider: string;
  readonly providerJobId: string;
  readonly requestFingerprint: string;
  readonly status: 'queued' | 'processing' | 'retrieving';
  readonly outputResolution: '720p' | '1080p';
  readonly providerOutputLocation: string | null;
  readonly sourceDurationMs: number;
  readonly sourceOrientation: 'landscape' | 'portrait';
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly expiresAt: string;
}

export type ProcessingJobAdmissionResult =
  'admitted' | 'duplicate' | 'request-conflict' | 'owner-conflict' | 'owner-mismatch';

/**
 * What a durable row says about a job, for a reader that only needs to know how it ended.
 *
 * The status is the persisted lifecycle verbatim, wider than the wire vocabulary a trace speaks:
 * a Project-linked row can also say `pending` or `accepted`. Reporting it untranslated is what
 * makes a thirteenth status a compile error in `aiUsageOutcomeForJobStatus` — the only reader of
 * this field — rather than something a mapping table quietly answers for.
 */
export interface DurableProcessingJobOutcome {
  readonly status: ProjectProcessingJobStatus;
  readonly completedAt: string | null;
  readonly updatedAt: string;
}

/**
 * The outcome map both relational readers return. They select the same four columns and differ
 * only in the join that decides which rows they are allowed to see, so the timestamp conversions
 * live here rather than once per store, two thousand lines apart.
 */
export const durableProcessingJobOutcomes = (
  rows: readonly {
    readonly id: string;
    readonly status: ProjectProcessingJobStatus;
    readonly completedAt: string | Date | null;
    readonly updatedAt: string | Date;
  }[],
): ReadonlyMap<string, DurableProcessingJobOutcome> => {
  const outcomes = new Map<string, DurableProcessingJobOutcome>();
  for (const row of rows) {
    outcomes.set(row.id, {
      status: row.status,
      completedAt: nullableIsoTimestamp(row.completedAt),
      updatedAt: toIsoTimestamp(row.updatedAt),
    });
  }
  return outcomes;
};

export interface DurableProcessingJobRepository extends ProcessingJobTraceWriter {
  admit(trace: VideoProcessingJobTrace): Promise<ProcessingJobAdmissionResult>;
  listResumable(now: string): Promise<readonly ResumableVideoProcessingJob[]>;
  /**
   * The durable state of several jobs at once, keyed by job id and holding only the ids that exist
   * for this owner. Read-only: unlike `listResumable` it transitions nothing, so a caller that is
   * merely observing outcomes cannot disturb restart recovery.
   */
  findOutcomes(
    ownerUserId: string,
    jobIds: readonly string[],
  ): Promise<ReadonlyMap<string, DurableProcessingJobOutcome>>;
}

const activeStatus = (status: VideoProcessingJobTrace['status']): boolean =>
  ['validating', 'submitting', 'queued', 'processing', 'retrieving'].includes(status);

export class FileProcessingJobRepository implements DurableProcessingJobRepository {
  readonly #root: string;
  /**
   * Admission is serialized per owner, a trace write per job. Kept as two locks rather than one
   * with prefixed keys because `KeyedLock` is not reentrant: `admit` takes the owner lock and then
   * calls `upsert`, so a shared key space would turn an id collision into a deadlock.
   */
  readonly #ownerLock = new KeyedLock();
  readonly #writeLock = new KeyedLock();
  /**
   * Owner to that owner's job ids in an active status, or null until something needs it.
   *
   * `admit` asks this store exactly one question — does this owner already have work in flight —
   * and answering it by reading every trace ever written made the common case the worst one:
   * nothing deletes a terminal trace, so an owner with no active job paid a read and two parses
   * per trace they had ever run, on the path that gates a paid provider call.
   *
   * Held as the in-flight promise so concurrent admissions share one scan. `upsert` is the only
   * writer and keeps it current, which makes load-bearing what the per-job write mutex above only
   * assumed: one process owns this directory. It also means a trace corrupted by something else
   * after the scan no longer refuses admission the way re-reading every file did — the owner's own
   * activity is still exact, and a restart reads the directory again.
   */
  #activeJobsByOwner: Promise<Map<string, Set<string>>> | null = null;
  constructor(dataDirectory: string) {
    this.#root = path.resolve(dataDirectory, 'metadata', 'v1', 'processing-jobs');
  }

  #file(jobId: string): string {
    return path.join(this.#root, `${z.uuid().parse(jobId)}.json`);
  }

  async #read(jobId: string): Promise<VideoProcessingJobTrace | null> {
    try {
      return traceSchema.parse(JSON.parse(await readFile(this.#file(jobId), 'utf8')) as unknown);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }

  #recordActivity(index: Map<string, Set<string>>, trace: VideoProcessingJobTrace): void {
    const owned = index.get(trace.ownerUserId);
    if (!activeStatus(trace.status)) {
      if (owned === undefined) return;
      owned.delete(trace.jobId);
      if (owned.size === 0) index.delete(trace.ownerUserId);
      return;
    }
    if (owned === undefined) index.set(trace.ownerUserId, new Set([trace.jobId]));
    else owned.add(trace.jobId);
  }

  #activeJobs(): Promise<Map<string, Set<string>>> {
    this.#activeJobsByOwner ??= (async () => {
      const index = new Map<string, Set<string>>();
      for (const trace of await this.#list()) this.#recordActivity(index, trace);
      return index;
    })().catch((error: unknown) => {
      // A failed scan must not be cached as the answer: an unreadable trace directory has to keep
      // refusing admissions rather than start reporting every owner as idle.
      this.#activeJobsByOwner = null;
      throw error;
    });
    return this.#activeJobsByOwner;
  }

  async #list(): Promise<readonly VideoProcessingJobTrace[]> {
    let entries: readonly string[];
    try {
      entries = await readdir(this.#root);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
    const traces: VideoProcessingJobTrace[] = [];
    for (const entry of entries) {
      if (!/^[0-9a-f-]{36}\.json$/iu.test(entry)) continue;
      const trace = await this.#read(entry.slice(0, -5));
      if (trace !== null) traces.push(trace);
    }
    return traces;
  }

  /**
   * Admits one job per owner, and serializes the decision against that owner's other admissions.
   *
   * Reading the index and recording the job are separate steps with an `fsync` and a rename
   * between them, so without the lock two submissions arriving together both saw an idle owner and
   * both reached a paid provider. The relational store gets this from the
   * `processing_jobs_owner_active_unique` partial index; this one has to arrange it.
   */
  async admit(traceValue: VideoProcessingJobTrace): Promise<ProcessingJobAdmissionResult> {
    const trace = traceSchema.parse(traceValue);
    return this.#ownerLock.run(trace.ownerUserId, async () => {
      const existing = await this.#read(trace.jobId);
      if (existing !== null) {
        if (existing.ownerUserId !== trace.ownerUserId) return 'owner-mismatch';
        return existing.operation === trace.operation &&
          existing.provider === trace.provider &&
          existing.requestFingerprint === trace.requestFingerprint &&
          existing.outputResolution === trace.outputResolution
          ? 'duplicate'
          : 'request-conflict';
      }
      if (((await this.#activeJobs()).get(trace.ownerUserId)?.size ?? 0) > 0) {
        return 'owner-conflict';
      }
      await this.upsert(trace);
      return 'admitted';
    });
  }
  async upsert(value: VideoProcessingJobTrace): Promise<void> {
    const trace = traceSchema.parse(value);
    await this.#writeLock.run(trace.jobId, async () => {
      await mkdir(this.#root, { recursive: true, mode: 0o700 });
      await chmod(this.#root, 0o700);
      const file = this.#file(trace.jobId);
      const temporary = `${file}.tmp-${randomUUID()}`;
      try {
        const handle = await open(temporary, 'wx', 0o600);
        try {
          await handle.writeFile(`${JSON.stringify(trace)}\n`, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, file);
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
      // The trace is durable, so keep the admission index current — but never fail a completed
      // write over a cache, and never reach past the promise this awaited: a scan that failed has
      // already dropped itself, and a replacement started since then read this write from disk. An
      // index nothing has asked for yet is left alone for the same reason.
      await this.#activeJobsByOwner?.then(
        (index) => this.#recordActivity(index, trace),
        () => undefined,
      );
    });
  }

  async findOutcomes(
    ownerUserId: string,
    jobIds: readonly string[],
  ): Promise<ReadonlyMap<string, DurableProcessingJobOutcome>> {
    // One file per id rather than a directory scan: the caller asks about a bounded handful of
    // jobs, while the store holds every trace this process has ever written. The reads answer
    // independently, so they go out together; the results keep the order they were asked in.
    const traces = await Promise.all([...new Set(jobIds)].map((jobId) => this.#read(jobId)));
    const outcomes = new Map<string, DurableProcessingJobOutcome>();
    for (const trace of traces) {
      if (trace === null || trace.ownerUserId !== ownerUserId) continue;
      outcomes.set(trace.jobId, {
        status: trace.status,
        completedAt: trace.completedAt,
        updatedAt: trace.updatedAt,
      });
    }
    return outcomes;
  }

  async listResumable(now: string): Promise<readonly ResumableVideoProcessingJob[]> {
    const nowMs = Date.parse(now);
    const resumable: ResumableVideoProcessingJob[] = [];
    for (const storedTrace of await this.#list()) {
      let trace = storedTrace;
      const expiresAt = new Date(Date.parse(trace.createdAt) + VIDEO_JOB_TTL_MS).toISOString();
      if (
        Date.parse(expiresAt) <= nowMs &&
        (activeStatus(trace.status) || trace.status === 'ready')
      ) {
        await this.upsert({
          ...trace,
          status: 'expired',
          safeErrorCode: 'job_expired',
          updatedAt: now,
          completedAt: now,
        });
        continue;
      }
      if (
        trace.providerJobId !== null &&
        (trace.status === 'ready' || trace.status === 'submitting')
      ) {
        trace = traceSchema.parse({
          ...trace,
          status: trace.status === 'ready' ? 'retrieving' : 'queued',
          safeErrorCode: null,
          updatedAt: now,
          completedAt: null,
        });
        await this.upsert(trace);
      }
      if (trace.status === 'submitting' && trace.providerJobId === null) {
        await this.upsert({
          ...trace,
          status: 'ambiguous',
          safeErrorCode: 'submission_ambiguous',
          updatedAt: now,
          completedAt: now,
        });
        continue;
      }
      if (trace.status === 'validating') {
        await this.upsert({
          ...trace,
          status: 'failed',
          safeErrorCode: 'provider_rejected',
          updatedAt: now,
          completedAt: now,
        });
        continue;
      }
      if (
        trace.providerJobId === null ||
        trace.requestFingerprint === null ||
        trace.outputResolution === null ||
        trace.sourceDurationMs === null ||
        trace.sourceOrientation === null ||
        (trace.status !== 'queued' &&
          trace.status !== 'processing' &&
          trace.status !== 'retrieving')
      ) {
        continue;
      }
      resumable.push({
        jobId: trace.jobId,
        ownerUserId: trace.ownerUserId,
        projectId: null,
        operation: trace.operation,
        provider: trace.provider,
        providerJobId: trace.providerJobId,
        requestFingerprint: trace.requestFingerprint,
        status: trace.status,
        outputResolution: trace.outputResolution,
        providerOutputLocation: trace.providerOutputLocation,
        sourceDurationMs: trace.sourceDurationMs,
        sourceOrientation: trace.sourceOrientation,
        createdAt: trace.createdAt,
        updatedAt: trace.updatedAt,
        expiresAt,
      });
    }
    return resumable;
  }
}
