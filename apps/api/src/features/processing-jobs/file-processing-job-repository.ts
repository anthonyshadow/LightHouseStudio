import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, readFile, readdir, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  VIDEO_JOB_TTL_MS,
  videoJobStatusSchema,
  videoOutputResolutionSchema,
} from '@studio/contracts';
import { persistedTimestampSchema } from '../../application/timestamps.js';

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

export interface DurableProcessingJobRepository extends ProcessingJobTraceWriter {
  admit(trace: VideoProcessingJobTrace): Promise<ProcessingJobAdmissionResult>;
  listResumable(now: string): Promise<readonly ResumableVideoProcessingJob[]>;
}

const activeStatus = (status: VideoProcessingJobTrace['status']): boolean =>
  ['validating', 'submitting', 'queued', 'processing', 'retrieving'].includes(status);

export class FileProcessingJobRepository implements DurableProcessingJobRepository {
  readonly #root: string;
  readonly #locks = new Map<string, Promise<void>>();
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

  async admit(traceValue: VideoProcessingJobTrace): Promise<ProcessingJobAdmissionResult> {
    const trace = traceSchema.parse(traceValue);
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
    if (
      (await this.#list()).some(
        (candidate) =>
          candidate.ownerUserId === trace.ownerUserId && activeStatus(candidate.status),
      )
    ) {
      return 'owner-conflict';
    }
    await this.upsert(trace);
    return 'admitted';
  }
  async upsert(value: VideoProcessingJobTrace): Promise<void> {
    const trace = traceSchema.parse(value);
    const prior = this.#locks.get(trace.jobId) ?? Promise.resolve();
    let release!: () => void;
    const barrier = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = prior.then(() => barrier);
    this.#locks.set(trace.jobId, chain);
    await prior;
    try {
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
    } finally {
      release();
      if (this.#locks.get(trace.jobId) === chain) this.#locks.delete(trace.jobId);
    }
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
