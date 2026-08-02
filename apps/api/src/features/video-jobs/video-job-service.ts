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

interface ScheduledVideoJobDeadline {
  cancel(): void;
  unref(): void;
}

interface VideoJobServiceOptions {
  readonly now?: () => number;
  readonly scheduleDeadline?: (
    callback: () => Promise<void>,
    delayMs: number,
  ) => ScheduledVideoJobDeadline;
}

type VideoJobRecord = {
  readonly jobId: string;
  readonly ownerId: string;
  readonly modelId: VideoTransformRecipe['modelId'];
  status: VideoJobStatus;
  readonly createdAt: string;
  updatedAt: string;
  readonly expiresAt: string;
  readonly expiresAtMs: number;
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
  readonly operationController: AbortController;
  submissionCounted: boolean;
  activeDeliveries: number;
  admissionsClosed: boolean;
  cleanupPending: boolean;
  deleteAfterCleanup: boolean;
};

interface VideoJobContentLease {
  readonly path: string;
  readonly media: InspectedVideo;
  settle(delivered: boolean): Promise<void>;
}

const terminal = (status: VideoJobStatus): boolean =>
  status === 'ready' || status === 'failed' || status === 'expired';

const scheduleSystemDeadline = (
  callback: () => Promise<void>,
  delayMs: number,
): ScheduledVideoJobDeadline => {
  const timer = setTimeout(() => {
    void callback().catch(() => undefined);
  }, delayMs);
  return {
    cancel: () => clearTimeout(timer),
    unref: () => timer.unref(),
  };
};

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
  readonly #now: () => number;
  readonly #scheduleDeadline: NonNullable<VideoJobServiceOptions['scheduleDeadline']>;
  readonly #operations = new Set<Promise<void>>();
  #deadline: ScheduledVideoJobDeadline | null = null;
  #closed = false;
  #closePromise: Promise<void> | null = null;

  constructor(
    provider: DecartVideoJobProvider | null,
    lightframeDataDir: string,
    enforceParticipantLimit = true,
    options: VideoJobServiceOptions = {},
  ) {
    this.#provider = provider;
    this.#enforceParticipantLimit = enforceParticipantLimit;
    this.#now = options.now ?? Date.now;
    this.#scheduleDeadline = options.scheduleDeadline ?? scheduleSystemDeadline;
    this.#root = path.resolve(lightframeDataDir, '.tmp', 'video-jobs');
    this.#ready = rm(this.#root, { recursive: true, force: true }).then(async () => {
      if (provider !== null && !this.#closed) {
        await mkdir(this.#root, { recursive: true, mode: 0o700 });
      }
    });
  }

  get available(): boolean {
    return this.#provider !== null;
  }

  async existing(jobId: string, ownerId: string): Promise<VideoJobStatusResponse | null> {
    await this.#expireDueJobs();
    const job = this.#jobs.get(jobId);
    return job?.ownerId === ownerId ? this.#snapshot(job) : null;
  }

  async prepareJobDirectory(jobId: string): Promise<{
    readonly directory: string;
    readonly inputPath: string;
    readonly referencePath: string;
  }> {
    await this.#ready;
    if (this.#closed) {
      throw new AppError(503, 'provider_unavailable', 'Temporary video jobs are unavailable.');
    }
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
    job.updatedAt = new Date(this.#now()).toISOString();
  }

  #ownsMutableJob(job: VideoJobRecord): boolean {
    return (
      !this.#closed &&
      this.#jobs.get(job.jobId) === job &&
      job.status !== 'expired' &&
      !job.admissionsClosed &&
      job.expiresAtMs > this.#now()
    );
  }

  #track(operation: Promise<void>): void {
    const tracked = operation.finally(() => {
      this.#operations.delete(tracked);
    });
    this.#operations.add(tracked);
    void tracked.catch(() => undefined);
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

  async #flushCleanup(job: VideoJobRecord): Promise<void> {
    if (!job.cleanupPending || job.activeDeliveries > 0) return;
    job.cleanupPending = false;
    if (job.deleteAfterCleanup && this.#jobs.get(job.jobId) === job) {
      this.#jobs.delete(job.jobId);
    }
    await this.#cleanupFiles(job);
  }

  async #requestCleanup(job: VideoJobRecord, deleteAfterCleanup: boolean): Promise<void> {
    job.admissionsClosed = true;
    job.cleanupPending = true;
    job.deleteAfterCleanup ||= deleteAfterCleanup;
    await this.#flushCleanup(job);
  }

  async #expireJob(job: VideoJobRecord): Promise<void> {
    if (this.#jobs.get(job.jobId) !== job || job.status === 'expired') return;
    job.operationController.abort();
    this.#touch(job, 'expired');
    job.result = null;
    job.error = {
      code: 'job_expired',
      message: 'This temporary video job expired. Submit a new job explicitly to retry.',
    };
    await this.#requestCleanup(job, false);
  }

  async #expireDueJobs(): Promise<void> {
    if (this.#closed) return;
    const now = this.#now();
    await Promise.all(
      [...this.#jobs.values()]
        .filter(
          (job) => job.status !== 'expired' && !job.admissionsClosed && job.expiresAtMs <= now,
        )
        .map((job) => this.#expireJob(job)),
    );
    this.#scheduleNextDeadline();
  }

  #scheduleNextDeadline(): void {
    this.#deadline?.cancel();
    this.#deadline = null;
    if (this.#closed) return;
    const deadlines = [...this.#jobs.values()]
      .filter((job) => job.status !== 'expired' && !job.admissionsClosed)
      .map((job) => job.expiresAtMs);
    if (deadlines.length === 0) return;
    const earliest = Math.min(...deadlines);
    const scheduled = this.#scheduleDeadline(
      async () => {
        if (this.#deadline !== scheduled) return;
        this.#deadline = null;
        await this.#expireDueJobs();
      },
      Math.max(0, earliest - this.#now()),
    );
    scheduled.unref();
    this.#deadline = scheduled;
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
    await this.#expireDueJobs();
    const duplicate = this.#jobs.get(input.jobId);
    if (duplicate) {
      if (duplicate.ownerId !== input.ownerId) {
        throw new AppError(404, 'not_found', 'That temporary video job is unavailable.');
      }
      return this.#snapshot(duplicate);
    }
    if (this.#closed || !this.#provider) {
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

    const acceptedAt = this.#now();
    const expiresAtMs = acceptedAt + VIDEO_JOB_TTL_MS;
    const timestamp = new Date(acceptedAt).toISOString();
    const job: VideoJobRecord = {
      jobId: input.jobId,
      ownerId: input.ownerId,
      modelId: input.recipe.modelId,
      status: 'validating',
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
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
      submissionCounted: false,
      activeDeliveries: 0,
      admissionsClosed: false,
      cleanupPending: false,
      deleteAfterCleanup: false,
    };
    this.#jobs.set(job.jobId, job);
    this.#scheduleNextDeadline();
    this.#track(this.#submit(job, input.recipe));
    return this.#snapshot(job);
  }

  #recordSubmission(job: VideoJobRecord): void {
    if (this.#closed || job.submissionCounted) return;
    job.submissionCounted = true;
    const submittedModels = this.#submittedModelsByOwner.get(job.ownerId) ?? [];
    this.#submittedModelsByOwner.set(job.ownerId, [...submittedModels, job.modelId]);
  }

  async #submit(job: VideoJobRecord, recipe: VideoTransformRecipe): Promise<void> {
    try {
      const inspected = await inspectVideoFile(job.inputPath, job.modelId);
      if (!this.#ownsMutableJob(job)) {
        await this.#cleanupFiles(job);
        return;
      }
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
      this.#recordSubmission(job);
      if (!this.#ownsMutableJob(job)) {
        await this.#cleanupFiles(job);
        return;
      }
      job.providerJobId = submitted.providerJobId;
      this.#touch(job, submitted.status === 'processing' ? 'processing' : 'queued');
      await this.#cleanupFiles(job, true);
    } catch (error) {
      if (!this.#ownsMutableJob(job)) {
        await this.#cleanupFiles(job);
        return;
      }
      this.#touch(job, 'failed');
      job.error =
        error instanceof AppError
          ? { code: error.code as VideoJobErrorCode, message: error.message }
          : safeProviderFailure(error);
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
      if (!this.#ownsMutableJob(job)) {
        await this.#cleanupFiles(job);
        return;
      }
      const result = await inspectVideoFile(job.outputPath, job.modelId, {
        requireProviderOutputSize: true,
        ...(job.sourceDurationMs === null ? {} : { expectedDurationMs: job.sourceDurationMs }),
        ...(job.sourceOrientation === null ? {} : { expectedOrientation: job.sourceOrientation }),
      });
      if (!this.#ownsMutableJob(job)) {
        await this.#cleanupFiles(job);
        return;
      }
      job.result = result;
      this.#touch(job, 'ready');
    } catch (error) {
      if (!this.#ownsMutableJob(job)) {
        await this.#cleanupFiles(job);
        return;
      }
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
          ? { code: error.code as VideoJobErrorCode, message: error.message }
          : safeProviderFailure(error);
      await this.#cleanupFiles(job);
    }
  }

  async #refresh(job: VideoJobRecord): Promise<void> {
    if (
      !this.#ownsMutableJob(job) ||
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
        if (!this.#ownsMutableJob(job)) return;
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
          this.#track(this.#retrieve(job));
          return;
        }
        this.#touch(job, providerStatus.status === 'processing' ? 'processing' : 'queued');
      } catch (error) {
        if (!this.#ownsMutableJob(job)) return;
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
    await this.#expireDueJobs();
    const job = this.#jobs.get(jobId);
    if (!job || job.ownerId !== ownerId) {
      throw new AppError(404, 'not_found', 'That temporary video job is unavailable.');
    }
    await this.#refresh(job);
    await this.#expireDueJobs();
    return this.#snapshot(job);
  }

  async content(jobId: string, ownerId: string): Promise<VideoJobContentLease> {
    await this.#expireDueJobs();
    const job = this.#jobs.get(jobId);
    if (!job || job.ownerId !== ownerId) {
      throw new AppError(404, 'not_found', 'That temporary video job is unavailable.');
    }
    if (job.expiresAtMs <= this.#now()) {
      await this.#expireJob(job);
      throw new AppError(
        410,
        'job_expired',
        job.error?.message ?? 'This temporary video job expired.',
      );
    }
    if (job.status === 'expired') {
      throw new AppError(
        410,
        'job_expired',
        job.error?.message ?? 'This temporary video job expired.',
      );
    }
    if (job.admissionsClosed || job.status !== 'ready' || !job.result) {
      throw new AppError(409, 'bad_request', 'The visual result is not ready to download.');
    }

    job.activeDeliveries += 1;
    const media = job.result;
    let settled = false;
    return {
      path: job.outputPath,
      media,
      settle: async (delivered) => {
        if (settled) return;
        settled = true;
        await this.#settleDelivery(job, delivered);
      },
    };
  }

  async #settleDelivery(job: VideoJobRecord, delivered: boolean): Promise<void> {
    if (job.status !== 'expired' && job.expiresAtMs <= this.#now()) {
      await this.#expireJob(job);
    }
    job.activeDeliveries = Math.max(0, job.activeDeliveries - 1);
    if (delivered && job.status !== 'expired') {
      await this.#requestCleanup(job, true);
    } else {
      await this.#flushCleanup(job);
    }
    this.#scheduleNextDeadline();
  }

  async release(jobId: string, ownerId: string): Promise<void> {
    await this.#expireDueJobs();
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
    await this.#requestCleanup(job, true);
    this.#scheduleNextDeadline();
  }

  close(): Promise<void> {
    this.#closePromise ??= this.#close();
    return this.#closePromise;
  }

  async #close(): Promise<void> {
    this.#closed = true;
    this.#deadline?.cancel();
    this.#deadline = null;
    for (const job of this.#jobs.values()) job.operationController.abort();
    this.#jobs.clear();
    this.#submittedModelsByOwner.clear();
    await this.#ready.catch(() => undefined);
    while (this.#operations.size > 0) {
      await Promise.allSettled([...this.#operations]);
    }
    await rm(this.#root, { recursive: true, force: true }).catch(() => undefined);
  }
}
