import path from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { canSubmitPilotBatchJob } from '@studio/domain';
import {
  VIDEO_JOB_TTL_MS,
  videoJobStatusResponseSchema,
  type InspectedVideo,
  type VideoJobErrorCode,
  type VideoJobStatus,
  type VideoJobStatusResponse,
  type VideoTransformRecipe,
} from '@studio/contracts';
import { AppError } from '../../http/app-error.js';
import {
  DecartVideoProviderError,
  type DecartVideoJobProvider,
} from '../../providers/decart/video-job-provider.js';
import { inspectVideoFile } from './media-inspection.js';

type VideoJobRecord = {
  readonly jobId: string;
  readonly ownerId: string;
  readonly modelId: VideoTransformRecipe['modelId'];
  status: VideoJobStatus;
  readonly createdAt: string;
  updatedAt: string;
  readonly expiresAt: string;
  providerJobId: string | null;
  result: InspectedVideo | null;
  error: { code: VideoJobErrorCode; message: string } | null;
  readonly directory: string;
  readonly inputPath: string;
  readonly referencePath: string | null;
  readonly referenceMimeType: 'image/jpeg' | 'image/png' | 'image/webp' | null;
  readonly outputPath: string;
  sourceDurationMs: number | null;
  sourceOrientation: 'landscape' | 'portrait' | null;
  statusReadFailures: number;
  retrievalAttempts: number;
  refreshPromise: Promise<void> | null;
  operationController: AbortController;
};

const terminal = (status: VideoJobStatus): boolean =>
  status === 'ready' || status === 'failed' || status === 'expired';

const safeProviderFailure = (
  error: unknown,
): { readonly code: VideoJobErrorCode; readonly message: string } => {
  if (!(error instanceof DecartVideoProviderError)) {
    return {
      code: 'provider_rejected',
      message: 'Decart could not complete this visual processing request.',
    };
  }
  if (error.reason === 'timeout') {
    return {
      code: 'provider_timeout',
      message: 'Decart took too long to respond. The previous valid video is still available.',
    };
  }
  if (error.reason === 'result-too-large') {
    return {
      code: 'result_too_large',
      message: 'The visual result exceeded the app-owned 300 MB safety limit.',
    };
  }
  if (error.reason === 'authentication') {
    return {
      code: 'provider_unavailable',
      message: 'Decart video processing is unavailable until its server credential is corrected.',
    };
  }
  return {
    code: 'provider_rejected',
    message: 'Decart rejected or could not complete this visual processing request.',
  };
};

export class VideoJobService {
  readonly #provider: DecartVideoJobProvider | null;
  readonly #root: string;
  readonly #jobs = new Map<string, VideoJobRecord>();
  readonly #submittedModelsByOwner = new Map<string, VideoTransformRecipe['modelId'][]>();
  readonly #ready: Promise<void>;
  readonly #enforceParticipantLimit: boolean;

  constructor(
    provider: DecartVideoJobProvider | null,
    lightframeDataDir: string,
    enforceParticipantLimit = true,
  ) {
    this.#provider = provider;
    this.#enforceParticipantLimit = enforceParticipantLimit;
    this.#root = path.resolve(lightframeDataDir, '.tmp', 'video-jobs');
    this.#ready =
      provider === null
        ? Promise.resolve()
        : rm(this.#root, { recursive: true, force: true }).then(async () => {
            await mkdir(this.#root, { recursive: true, mode: 0o700 });
          });
  }

  get available(): boolean {
    return this.#provider !== null;
  }

  existing(jobId: string, ownerId: string): VideoJobStatusResponse | null {
    const job = this.#jobs.get(jobId);
    return job?.ownerId === ownerId ? this.#snapshot(job) : null;
  }

  async prepareJobDirectory(jobId: string): Promise<{
    readonly directory: string;
    readonly inputPath: string;
    readonly referencePath: string;
  }> {
    await this.#ready;
    const directory = path.join(this.#root, jobId);
    await mkdir(directory, { mode: 0o700 });
    return {
      directory,
      inputPath: path.join(directory, 'input.video'),
      referencePath: path.join(directory, 'reference.image'),
    };
  }

  #snapshot(job: VideoJobRecord): VideoJobStatusResponse {
    return videoJobStatusResponseSchema.parse({
      jobId: job.jobId,
      modelId: job.modelId,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      expiresAt: job.expiresAt,
      result: job.result,
      error: job.error,
    });
  }

  #touch(job: VideoJobRecord, status: VideoJobStatus): void {
    job.status = status;
    job.updatedAt = new Date().toISOString();
  }

  async #cleanupFiles(job: VideoJobRecord, keepOutput = false): Promise<void> {
    if (keepOutput) {
      await Promise.all([
        rm(job.inputPath, { force: true }),
        job.referencePath ? rm(job.referencePath, { force: true }) : Promise.resolve(),
      ]).catch(() => undefined);
      return;
    }
    await rm(job.directory, { recursive: true, force: true }).catch(() => undefined);
  }

  async #expireStale(): Promise<void> {
    const now = Date.now();
    await Promise.all(
      [...this.#jobs.values()]
        .filter((job) => !terminal(job.status) && Date.parse(job.expiresAt) <= now)
        .map(async (job) => {
          job.operationController.abort();
          this.#touch(job, 'expired');
          job.error = {
            code: 'job_expired',
            message: 'This temporary video job expired. Submit a new job explicitly to retry.',
          };
          await this.#cleanupFiles(job);
        }),
    );
  }

  async start(input: {
    readonly jobId: string;
    readonly ownerId: string;
    readonly recipe: VideoTransformRecipe;
    readonly directory: string;
    readonly inputPath: string;
    readonly referencePath: string | null;
    readonly referenceMimeType: 'image/jpeg' | 'image/png' | 'image/webp' | null;
  }): Promise<VideoJobStatusResponse> {
    await this.#expireStale();
    const duplicate = this.#jobs.get(input.jobId);
    if (duplicate) {
      if (duplicate.ownerId !== input.ownerId) {
        throw new AppError(404, 'not_found', 'That temporary video job is unavailable.');
      }
      return this.#snapshot(duplicate);
    }
    if (!this.#provider) {
      await rm(input.directory, { recursive: true, force: true }).catch(() => undefined);
      throw new AppError(
        503,
        'provider_unavailable',
        'Decart batch video processing is unavailable until DECART_API_KEY is configured.',
      );
    }
    const active = [...this.#jobs.values()].find(
      (job) => job.ownerId === input.ownerId && !terminal(job.status),
    );
    if (active) {
      await rm(input.directory, { recursive: true, force: true }).catch(() => undefined);
      throw new AppError(
        409,
        'generation_in_progress',
        'Finish the active video job before starting another.',
      );
    }
    const submittedModels = this.#submittedModelsByOwner.get(input.ownerId) ?? [];
    if (
      this.#enforceParticipantLimit &&
      !canSubmitPilotBatchJob(submittedModels, input.recipe.modelId)
    ) {
      await rm(input.directory, { recursive: true, force: true }).catch(() => undefined);
      throw new AppError(
        409,
        'provider_rejected',
        'This moderated participant has reached the temporary batch submission limit.',
      );
    }

    const now = new Date();
    const job: VideoJobRecord = {
      jobId: input.jobId,
      ownerId: input.ownerId,
      modelId: input.recipe.modelId,
      status: 'validating',
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + VIDEO_JOB_TTL_MS).toISOString(),
      providerJobId: null,
      result: null,
      error: null,
      directory: input.directory,
      inputPath: input.inputPath,
      referencePath: input.referencePath,
      referenceMimeType: input.referenceMimeType,
      outputPath: path.join(input.directory, 'result.video'),
      sourceDurationMs: null,
      sourceOrientation: null,
      statusReadFailures: 0,
      retrievalAttempts: 0,
      refreshPromise: null,
      operationController: new AbortController(),
    };
    this.#jobs.set(job.jobId, job);
    void this.#submit(job, input.recipe);
    return this.#snapshot(job);
  }

  async #submit(job: VideoJobRecord, recipe: VideoTransformRecipe): Promise<void> {
    try {
      const inspected = await inspectVideoFile(job.inputPath, job.modelId);
      job.sourceDurationMs = inspected.durationMs;
      job.sourceOrientation = inspected.width > inspected.height ? 'landscape' : 'portrait';
      this.#touch(job, 'submitting');
      const submitted = await this.#provider!.submit({
        modelId: job.modelId,
        recipe,
        videoPath: job.inputPath,
        videoMimeType: inspected.mimeType,
        referenceImagePath: job.referencePath,
        referenceImageMimeType: job.referenceMimeType,
        signal: job.operationController.signal,
      });
      job.providerJobId = submitted.providerJobId;
      const submittedModels = this.#submittedModelsByOwner.get(job.ownerId) ?? [];
      this.#submittedModelsByOwner.set(job.ownerId, [...submittedModels, job.modelId]);
      this.#touch(job, submitted.status === 'processing' ? 'processing' : 'queued');
      await this.#cleanupFiles(job, true);
    } catch (error) {
      if (error instanceof AppError) {
        this.#touch(job, 'failed');
        job.error = {
          code: error.code as VideoJobErrorCode,
          message: error.message,
        };
      } else {
        this.#touch(job, 'failed');
        job.error = safeProviderFailure(error);
      }
      await this.#cleanupFiles(job);
    }
  }

  async #retrieve(job: VideoJobRecord): Promise<void> {
    try {
      job.retrievalAttempts += 1;
      await this.#provider!.download(
        job.providerJobId!,
        job.outputPath,
        job.operationController.signal,
      );
      job.result = await inspectVideoFile(job.outputPath, job.modelId, {
        requireProviderOutputSize: true,
        ...(job.sourceDurationMs === null ? {} : { expectedDurationMs: job.sourceDurationMs }),
        ...(job.sourceOrientation === null ? {} : { expectedOrientation: job.sourceOrientation }),
      });
      this.#touch(job, 'ready');
    } catch (error) {
      if (
        error instanceof DecartVideoProviderError &&
        (error.reason === 'timeout' || error.reason === 'upstream') &&
        job.retrievalAttempts < 3
      ) {
        await rm(job.outputPath, { force: true }).catch(() => undefined);
        this.#touch(job, 'queued');
        return;
      }
      this.#touch(job, 'failed');
      job.error =
        error instanceof AppError
          ? {
              code: error.code as VideoJobErrorCode,
              message: error.message,
            }
          : safeProviderFailure(error);
      await this.#cleanupFiles(job);
    }
  }

  async #refresh(job: VideoJobRecord): Promise<void> {
    if (
      terminal(job.status) ||
      job.status === 'validating' ||
      job.status === 'submitting' ||
      job.status === 'retrieving'
    ) {
      return;
    }
    if (job.refreshPromise) return job.refreshPromise;
    job.refreshPromise = (async () => {
      try {
        const providerStatus = await this.#provider!.status(
          job.providerJobId!,
          job.operationController.signal,
        );
        job.statusReadFailures = 0;
        if (providerStatus.status === 'failed') {
          this.#touch(job, 'failed');
          job.error = {
            code: 'provider_rejected',
            message: 'Decart could not complete this visual processing request.',
          };
          await this.#cleanupFiles(job);
          return;
        }
        if (providerStatus.status === 'completed') {
          this.#touch(job, 'retrieving');
          void this.#retrieve(job);
          return;
        }
        this.#touch(job, providerStatus.status === 'processing' ? 'processing' : 'queued');
      } catch (error) {
        if (
          error instanceof DecartVideoProviderError &&
          (error.reason === 'timeout' || error.reason === 'upstream') &&
          job.statusReadFailures < 2
        ) {
          job.statusReadFailures += 1;
          return;
        }
        this.#touch(job, 'failed');
        job.error = safeProviderFailure(error);
        await this.#cleanupFiles(job);
      }
    })().finally(() => {
      job.refreshPromise = null;
    });
    return job.refreshPromise;
  }

  async status(jobId: string, ownerId: string): Promise<VideoJobStatusResponse> {
    await this.#expireStale();
    const job = this.#jobs.get(jobId);
    if (!job || job.ownerId !== ownerId) {
      throw new AppError(404, 'not_found', 'That temporary video job is unavailable.');
    }
    await this.#refresh(job);
    return this.#snapshot(job);
  }

  content(
    jobId: string,
    ownerId: string,
  ): {
    readonly path: string;
    readonly media: InspectedVideo;
  } {
    const job = this.#jobs.get(jobId);
    if (!job || job.ownerId !== ownerId) {
      throw new AppError(404, 'not_found', 'That temporary video job is unavailable.');
    }
    if (job.status !== 'ready' || !job.result) {
      throw new AppError(409, 'bad_request', 'The visual result is not ready to download.');
    }
    return { path: job.outputPath, media: job.result };
  }

  async release(jobId: string, ownerId: string): Promise<void> {
    const job = this.#jobs.get(jobId);
    if (!job || job.ownerId !== ownerId) {
      throw new AppError(404, 'not_found', 'That temporary video job is unavailable.');
    }
    if (!terminal(job.status)) {
      throw new AppError(
        409,
        'generation_in_progress',
        'An active provider job cannot be cancelled or released.',
      );
    }
    this.#jobs.delete(jobId);
    await this.#cleanupFiles(job);
  }

  async close(): Promise<void> {
    for (const job of this.#jobs.values()) job.operationController.abort();
    this.#jobs.clear();
    this.#submittedModelsByOwner.clear();
    if (this.#provider === null) return;
    await this.#ready.catch(() => undefined);
    await rm(this.#root, { recursive: true, force: true }).catch(() => undefined);
  }
}
