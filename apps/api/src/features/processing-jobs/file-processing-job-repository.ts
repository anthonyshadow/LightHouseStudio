import { randomUUID } from 'node:crypto';
import { chmod, mkdir, open, rename, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { videoJobStatusSchema } from '@studio/contracts';

const traceSchema = z
  .object({
    schemaVersion: z.literal(1),
    jobId: z.uuid(),
    ownerUserId: z.uuid(),
    operation: z.enum(['character-swap', 'virtual-try-on']),
    provider: z.string().trim().min(1).max(80),
    providerJobId: z.string().trim().min(1).max(500).nullable(),
    status: videoJobStatusSchema,
    safeErrorCode: z.string().trim().min(1).max(80).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();

export type VideoProcessingJobTrace = z.infer<typeof traceSchema>;
export interface ProcessingJobTraceWriter {
  upsert(trace: VideoProcessingJobTrace): Promise<void>;
}

export class FileProcessingJobRepository implements ProcessingJobTraceWriter {
  readonly #root: string;
  readonly #locks = new Map<string, Promise<void>>();
  constructor(dataDirectory: string) {
    this.#root = path.resolve(dataDirectory, 'metadata', 'v1', 'processing-jobs');
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
      const file = path.join(this.#root, `${trace.jobId}.json`);
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
}
