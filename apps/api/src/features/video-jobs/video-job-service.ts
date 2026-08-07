import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rm } from 'node:fs/promises';
import {
  VIDEO_JOB_TTL_MS,
  videoJobStatusResponseSchema,
  type InspectedVideo,
  type VideoJobErrorCode,
  type VideoJobStatus,
  type VideoJobStatusResponse,
  type VideoOutputResolution,
  type VideoTransformOperationId,
  type VideoTransformRecipe,
} from '@studio/contracts';
import type { ImageMimeType } from '@studio/domain';
import { AppError } from '../../http/app-error.js';
import {
  type ExistingVideoOperationBinding,
  type ExistingVideoProviderRegistry,
  VideoJobProviderError,
} from '../../providers/video-jobs/video-job-provider.js';
import { inspectVideoFile } from './media-inspection.js';
import type { ProcessingJobTraceWriter } from '../processing-jobs/file-processing-job-repository.js';

interface ScheduledVideoJobDeadline {
  cancel(): void;
  unref(): void;
}

interface VideoJobServiceOptions {
  readonly now?: () => number;
  readonly providerPollBackoffMs?: readonly [number, number, number, number, number];
  readonly removePath?: (
    target: string,
    options: { readonly force: true; readonly recursive?: true },
  ) => Promise<void>;
  readonly scheduleDeadline?: (
    callback: () => Promise<void>,
    delayMs: number,
  ) => ScheduledVideoJobDeadline;
  readonly traceWriter?: ProcessingJobTraceWriter;
  readonly providerIds?: Readonly<Record<VideoTransformOperationId, string>>;
}

type VideoJobRecord = {
  readonly jobId: string;
  readonly ownerId: string;
  readonly operation: VideoTransformOperationId;
  readonly binding: ExistingVideoOperationBinding;
  readonly outputResolution: VideoOutputResolution;
  readonly requestFingerprint: string;
  status: VideoJobStatus;
  readonly createdAt: string;
  updatedAt: string;
  readonly expiresAt: string;
  readonly expiresAtMs: number;
  readonly deadlineGeneration: number;
  providerJobId: string | null;
  providerOutputLocation: string | null;
  result: InspectedVideo | null;
  error: { code: VideoJobErrorCode; message: string } | null;
  readonly directory: string;
  readonly inputPath: string;
  readonly referencePath: string | null;
  readonly referenceMimeType: ImageMimeType | null;
  readonly outputPath: string;
  sourceDurationMs: number | null;
  sourceOrientation: 'landscape' | 'portrait' | null;
  statusReadFailures: number;
  providerPollAttempt: number;
  nextProviderPollAtMs: number;
  hasPolledProvider: boolean;
  retrievalAttempts: number;
  refreshPromise: Promise<void> | null;
  readonly operationController: AbortController;
  activeDeliveries: number;
  admissionsClosed: boolean;
  cleanupPending: boolean;
  deleteAfterCleanup: boolean;
  cleanupFailureReported: boolean;
};

interface VideoJobContentLease {
  readonly path: string;
  readonly media: InspectedVideo;
  settle(delivered: boolean): Promise<void>;
}

type VideoJobDeadlineEntry = Readonly<{
  jobId: string;
  expiresAtMs: number;
  generation: number;
}>;

const terminal = (status: VideoJobStatus): boolean =>
  status === 'ready' || status === 'failed' || status === 'expired';

const PROVIDER_POLL_BACKOFF_MS = [2_000, 3_000, 5_000, 8_000, 10_000] as const;

const recipeFingerprint = (recipe: VideoTransformRecipe): string =>
  createHash('sha256').update(JSON.stringify(recipe), 'utf8').digest('hex');

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
  if (!(error instanceof VideoJobProviderError)) {
    return {
      code: 'provider_rejected',
      message: 'Visual processing could not complete this request.',
    };
  }
  if (error.reason === 'timeout') {
    return {
      code: 'provider_timeout',
      message:
        'Visual processing took too long to respond. The previous valid video is still available.',
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
      message: 'Visual processing is unavailable until its server configuration is corrected.',
    };
  }
  if (error.reason === 'billing') {
    return {
      code: 'provider_rejected',
      message: 'Visual processing stopped because the configured service account needs attention.',
    };
  }
  if (error.reason === 'quota') {
    return {
      code: 'provider_rejected',
      message: 'Visual processing stopped because the configured service account reached a limit.',
    };
  }
  if (error.reason === 'policy') {
    return {
      code: 'provider_rejected',
      message:
        'Visual processing could not complete because content safeguards rejected the request.',
    };
  }
  if (error.reason === 'rejected') {
    return {
      code: 'provider_rejected',
      message: 'Visual processing rejected the submitted media or replacement instructions.',
    };
  }
  if (error.reason === 'generation-failed') {
    return {
      code: 'provider_rejected',
      message: 'The visual provider reported that generation failed before producing a result.',
    };
  }
  if (error.reason === 'aborted') {
    return {
      code: 'provider_rejected',
      message: 'Visual processing ended before a result was available.',
    };
  }
  return {
    code: 'provider_rejected',
    message: 'Visual processing rejected or could not complete this request.',
  };
};

export class VideoJobService {
  readonly #providers: ExistingVideoProviderRegistry;
  readonly #root: string;
  readonly #jobs = new Map<string, VideoJobRecord>();
  readonly #activeJobByOwner = new Map<string, string>();
  readonly #deadlineHeap: VideoJobDeadlineEntry[] = [];
  readonly #ready: Promise<void>;
  readonly #now: () => number;
  readonly #scheduleDeadline: NonNullable<VideoJobServiceOptions['scheduleDeadline']>;
  readonly #providerPollBackoffMs: readonly [number, number, number, number, number];
  readonly #removePath: NonNullable<VideoJobServiceOptions['removePath']>;
  readonly #traceWriter: ProcessingJobTraceWriter | undefined;
  readonly #providerIds: Readonly<Record<VideoTransformOperationId, string>>;
  readonly #operations = new Set<Promise<void>>();
  #deadlineGeneration = 0;
  #deadline: ScheduledVideoJobDeadline | null = null;
  #closed = false;
  #closePromise: Promise<void> | null = null;

  constructor(
    configuredProviders: ExistingVideoProviderRegistry,
    lightframeDataDir: string,
    options: VideoJobServiceOptions = {},
  ) {
    const providers = configuredProviders;
    this.#providers = providers;
    this.#now = options.now ?? Date.now;
    this.#providerPollBackoffMs = options.providerPollBackoffMs ?? PROVIDER_POLL_BACKOFF_MS;
    this.#removePath = options.removePath ?? rm;
    this.#scheduleDeadline = options.scheduleDeadline ?? scheduleSystemDeadline;
    this.#traceWriter = options.traceWriter;
    this.#providerIds = options.providerIds ?? {
      'character-swap': 'configured-provider',
      'virtual-try-on': 'configured-provider',
    };
    this.#root = path.resolve(lightframeDataDir, '.tmp', 'video-jobs');
    this.#ready = rm(this.#root, { recursive: true, force: true }).then(async () => {
      if (Object.values(providers).some((binding) => binding !== null) && !this.#closed) {
        await mkdir(this.#root, { recursive: true, mode: 0o700 });
      }
    });
  }

  get available(): boolean {
    return Object.values(this.#providers).some((binding) => binding !== null);
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
    const directory = path.join(this.#root, `${jobId}-${randomUUID()}`);
    await mkdir(directory, { mode: 0o700 });
    return {
      directory,
      inputPath: path.join(directory, 'input.video'),
      referencePath: path.join(directory, 'reference.image'),
    };
  }

  #snapshot(job: VideoJobRecord): VideoJobStatusResponse {
    const nextPollAfterMs = terminal(job.status)
      ? null
      : job.status === 'retrieving' || !job.hasPolledProvider
        ? this.#providerPollBackoffMs[0]
        : Math.max(0, job.nextProviderPollAtMs - this.#now());
    return videoJobStatusResponseSchema.parse({
      jobId: job.jobId,
      operation: job.operation,
      status: job.status,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      expiresAt: job.expiresAt,
      nextPollAfterMs,
      result: job.result,
      error: job.error,
    });
  }

  #touch(job: VideoJobRecord, status: VideoJobStatus): void {
    job.status = status;
    job.updatedAt = new Date(this.#now()).toISOString();
    if (terminal(status)) {
      if (this.#activeJobByOwner.get(job.ownerId) === job.jobId) {
        this.#activeJobByOwner.delete(job.ownerId);
      }
    } else {
      this.#activeJobByOwner.set(job.ownerId, job.jobId);
    }
    this.#trace(job);
  }

  #trace(job: VideoJobRecord): void {
    if (this.#traceWriter === undefined) return;
    const trace = this.#traceWriter
      .upsert({
        schemaVersion: 1,
        jobId: job.jobId,
        ownerUserId: job.ownerId,
        operation: job.operation,
        provider: this.#providerIds[job.operation],
        providerJobId: job.providerJobId,
        status: job.status,
        safeErrorCode: job.error?.code ?? null,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        completedAt: terminal(job.status) ? job.updatedAt : null,
      })
      .catch(() => {
        console.warn('[video-jobs] Durable processing trace could not be updated.', {
          jobId: job.jobId,
        });
      });
    this.#track(trace);
  }

  #pushDeadline(entry: VideoJobDeadlineEntry): void {
    const heap = this.#deadlineHeap;
    heap.push(entry);
    let index = heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (heap[parent]!.expiresAtMs <= entry.expiresAtMs) break;
      heap[index] = heap[parent]!;
      index = parent;
    }
    heap[index] = entry;
  }

  #popDeadline(): VideoJobDeadlineEntry | null {
    const heap = this.#deadlineHeap;
    const first = heap[0];
    const last = heap.pop();
    if (!first) return null;
    if (!last || heap.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= heap.length) break;
      const right = left + 1;
      const child =
        right < heap.length && heap[right]!.expiresAtMs < heap[left]!.expiresAtMs ? right : left;
      if (heap[child]!.expiresAtMs >= last.expiresAtMs) break;
      heap[index] = heap[child]!;
      index = child;
    }
    heap[index] = last;
    return first;
  }

  #nextDeadline(): VideoJobDeadlineEntry | null {
    while (this.#deadlineHeap.length > 0) {
      const entry = this.#deadlineHeap[0]!;
      const job = this.#jobs.get(entry.jobId);
      if (
        job &&
        job.deadlineGeneration === entry.generation &&
        job.status !== 'expired' &&
        !job.admissionsClosed
      ) {
        return entry;
      }
      this.#popDeadline();
    }
    return null;
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

  async #cleanupFiles(job: VideoJobRecord, keepOutput = false): Promise<boolean> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        if (keepOutput) {
          await Promise.all([
            this.#removePath(job.inputPath, { force: true }),
            job.referencePath
              ? this.#removePath(job.referencePath, { force: true })
              : Promise.resolve(),
          ]);
        } else {
          await this.#removePath(job.directory, { recursive: true, force: true });
        }
        return true;
      } catch {
        if (attempt === 3) break;
      }
    }
    if (!job.cleanupFailureReported) {
      job.cleanupFailureReported = true;
      console.warn('[video-jobs] Temporary job cleanup could not be completed after retries.', {
        jobId: job.jobId,
      });
    }
    return false;
  }

  async #flushCleanup(job: VideoJobRecord): Promise<void> {
    if (!job.cleanupPending || job.activeDeliveries > 0) return;
    if (!(await this.#cleanupFiles(job))) return;
    job.cleanupPending = false;
    if (!job.deleteAfterCleanup || this.#jobs.get(job.jobId) !== job) return;
    this.#jobs.delete(job.jobId);
    if (this.#activeJobByOwner.get(job.ownerId) === job.jobId) {
      this.#activeJobByOwner.delete(job.ownerId);
    }
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
    this.#trace(job);
    await this.#requestCleanup(job, false);
  }

  async #expireDueJobs(): Promise<void> {
    if (this.#closed) return;
    const now = this.#now();
    while (true) {
      const entry = this.#nextDeadline();
      if (!entry || entry.expiresAtMs > now) break;
      this.#popDeadline();
      const job = this.#jobs.get(entry.jobId);
      if (job && job.deadlineGeneration === entry.generation) await this.#expireJob(job);
    }
    this.#scheduleNextDeadline();
  }

  #scheduleNextDeadline(): void {
    this.#deadline?.cancel();
    this.#deadline = null;
    if (this.#closed) return;
    const next = this.#nextDeadline();
    if (!next) return;
    const scheduled = this.#scheduleDeadline(
      async () => {
        if (this.#deadline !== scheduled) return;
        this.#deadline = null;
        await this.#expireDueJobs();
      },
      Math.max(0, next.expiresAtMs - this.#now()),
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
    readonly referenceMimeType: ImageMimeType | null;
  }): Promise<VideoJobStatusResponse> {
    await this.#expireDueJobs();
    const duplicate = this.#jobs.get(input.jobId);
    if (duplicate) {
      if (duplicate.ownerId !== input.ownerId) {
        throw new AppError(404, 'not_found', 'That temporary video job is unavailable.');
      }
      if (
        duplicate.status !== 'expired' &&
        duplicate.requestFingerprint !== recipeFingerprint(input.recipe)
      ) {
        await rm(input.directory, { recursive: true, force: true }).catch(() => undefined);
        throw new AppError(
          409,
          'request_id_conflict',
          'That temporary video job ID already belongs to different processing settings.',
        );
      }
      if (input.directory !== duplicate.directory) {
        await rm(input.directory, { recursive: true, force: true }).catch(() => undefined);
      }
      return this.#snapshot(duplicate);
    }
    const binding = this.#providers[input.recipe.operation];
    if (this.#closed || !binding) {
      await rm(input.directory, { recursive: true, force: true }).catch(() => undefined);
      throw new AppError(
        503,
        'provider_unavailable',
        'This visual processing operation is unavailable until its server configuration is complete.',
      );
    }
    if (binding.referencePolicy === 'required' && !input.recipe.hasReferenceImage) {
      await rm(input.directory, { recursive: true, force: true }).catch(() => undefined);
      throw new AppError(
        400,
        'validation_error',
        'Character Swap requires a reference image in this configuration.',
      );
    }
    if (binding.promptInput === 'server-default' && input.recipe.prompt) {
      await rm(input.directory, { recursive: true, force: true }).catch(() => undefined);
      throw new AppError(
        400,
        'validation_error',
        'Prompt text is unavailable for Character Swap in this configuration.',
      );
    }
    if (!binding.promptEnhancement && input.recipe.enhancePrompt) {
      await rm(input.directory, { recursive: true, force: true }).catch(() => undefined);
      throw new AppError(
        400,
        'validation_error',
        'Prompt enhancement is unavailable for Character Swap in this configuration.',
      );
    }
    const outputResolution = input.recipe.outputResolution ?? binding.defaultOutputResolution;
    if (!binding.outputResolutions.includes(outputResolution)) {
      await rm(input.directory, { recursive: true, force: true }).catch(() => undefined);
      throw new AppError(
        400,
        'validation_error',
        'Choose a supported output resolution for this visual processing operation.',
      );
    }
    const activeJobId = this.#activeJobByOwner.get(input.ownerId);
    const active = activeJobId ? this.#jobs.get(activeJobId) : undefined;
    if (activeJobId && (!active || terminal(active.status))) {
      this.#activeJobByOwner.delete(input.ownerId);
    }
    if (active) {
      await rm(input.directory, { recursive: true, force: true }).catch(() => undefined);
      throw new AppError(
        409,
        'generation_in_progress',
        'Finish the active video job before starting another.',
      );
    }
    const acceptedAt = this.#now();
    const expiresAtMs = acceptedAt + VIDEO_JOB_TTL_MS;
    const timestamp = new Date(acceptedAt).toISOString();
    const job: VideoJobRecord = {
      jobId: input.jobId,
      ownerId: input.ownerId,
      operation: input.recipe.operation,
      binding,
      outputResolution,
      requestFingerprint: recipeFingerprint(input.recipe),
      status: 'validating',
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: new Date(expiresAtMs).toISOString(),
      expiresAtMs,
      deadlineGeneration: ++this.#deadlineGeneration,
      providerJobId: null,
      providerOutputLocation: null,
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
      providerPollAttempt: 0,
      nextProviderPollAtMs: 0,
      hasPolledProvider: false,
      retrievalAttempts: 0,
      refreshPromise: null,
      operationController: new AbortController(),
      activeDeliveries: 0,
      admissionsClosed: false,
      cleanupPending: false,
      deleteAfterCleanup: false,
      cleanupFailureReported: false,
    };
    this.#jobs.set(job.jobId, job);
    this.#activeJobByOwner.set(job.ownerId, job.jobId);
    this.#pushDeadline({
      jobId: job.jobId,
      expiresAtMs: job.expiresAtMs,
      generation: job.deadlineGeneration,
    });
    this.#scheduleNextDeadline();
    this.#trace(job);
    this.#track(this.#submit(job, input.recipe));
    return this.#snapshot(job);
  }

  async #submit(job: VideoJobRecord, recipe: VideoTransformRecipe): Promise<void> {
    try {
      const inspected = await inspectVideoFile(job.inputPath, job.operation);
      if (job.binding.inputPreparation === 'h264-mp4' && inspected.mimeType !== 'video/mp4') {
        throw new AppError(
          400,
          'unsupported_container',
          'Character Swap requires locally prepared H.264 MP4 input in this configuration.',
        );
      }
      if (!this.#ownsMutableJob(job)) {
        await this.#cleanupFiles(job);
        return;
      }
      job.sourceDurationMs = inspected.durationMs;
      job.sourceOrientation = inspected.width > inspected.height ? 'landscape' : 'portrait';
      this.#touch(job, 'submitting');
      const submitted = await job.binding.provider.submit({
        operation: job.operation,
        recipe,
        videoPath: job.inputPath,
        videoMimeType: inspected.mimeType,
        referenceImagePath: job.referencePath,
        referenceImageMimeType: job.referenceMimeType,
        outputResolution: job.outputResolution,
        signal: job.operationController.signal,
      });
      if (!this.#ownsMutableJob(job)) {
        await this.#cleanupFiles(job);
        return;
      }
      job.providerJobId = submitted.providerJobId;
      job.providerOutputLocation = submitted.outputLocation ?? null;
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
      this.#trace(job);
      await this.#cleanupFiles(job);
    }
  }

  async #retrieve(job: VideoJobRecord): Promise<void> {
    try {
      job.retrievalAttempts += 1;
      await job.binding.provider.download(
        job.providerJobId!,
        job.outputPath,
        job.operationController.signal,
        job.providerOutputLocation,
      );
      if (!this.#ownsMutableJob(job)) {
        await this.#cleanupFiles(job);
        return;
      }
      const result = await inspectVideoFile(job.outputPath, job.operation, {
        requireProviderOutputSize: true,
        expectedResolution: job.outputResolution,
        outputSizing: job.binding.outputSizing,
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
      if (error instanceof VideoJobProviderError && error.retryable && job.retrievalAttempts < 3) {
        await rm(job.outputPath, { force: true }).catch(() => undefined);
        this.#touch(job, 'queued');
        return;
      }
      this.#touch(job, 'failed');
      job.error =
        error instanceof AppError
          ? { code: error.code as VideoJobErrorCode, message: error.message }
          : safeProviderFailure(error);
      this.#trace(job);
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
    if (job.hasPolledProvider && this.#now() < job.nextProviderPollAtMs) return;
    if (job.refreshPromise) return job.refreshPromise;
    job.refreshPromise = (async () => {
      try {
        const previousStatus = job.status;
        const providerStatus = await job.binding.provider.status(
          job.providerJobId!,
          job.operationController.signal,
        );
        if (!this.#ownsMutableJob(job)) return;
        job.hasPolledProvider = true;
        job.statusReadFailures = 0;
        if (providerStatus.outputLocation !== undefined) {
          job.providerOutputLocation = providerStatus.outputLocation;
        }
        if (providerStatus.status === 'failed') {
          this.#touch(job, 'failed');
          job.error = safeProviderFailure(
            new VideoJobProviderError(providerStatus.failureReason ?? 'upstream'),
          );
          this.#trace(job);
          await this.#cleanupFiles(job);
          return;
        }
        if (providerStatus.status === 'completed') {
          this.#touch(job, 'retrieving');
          this.#track(this.#retrieve(job));
          return;
        }
        const nextStatus = providerStatus.status === 'processing' ? 'processing' : 'queued';
        this.#touch(job, nextStatus);
        job.providerPollAttempt =
          nextStatus === previousStatus
            ? Math.min(job.providerPollAttempt + 1, this.#providerPollBackoffMs.length - 1)
            : 0;
        job.nextProviderPollAtMs =
          this.#now() + this.#providerPollBackoffMs[job.providerPollAttempt]!;
      } catch (error) {
        if (!this.#ownsMutableJob(job)) return;
        if (
          error instanceof VideoJobProviderError &&
          error.retryable &&
          job.statusReadFailures < 2
        ) {
          job.hasPolledProvider = true;
          job.statusReadFailures += 1;
          job.providerPollAttempt = Math.min(
            job.providerPollAttempt + 1,
            this.#providerPollBackoffMs.length - 1,
          );
          job.nextProviderPollAtMs =
            this.#now() + this.#providerPollBackoffMs[job.providerPollAttempt]!;
          return;
        }
        this.#touch(job, 'failed');
        job.error = safeProviderFailure(error);
        this.#trace(job);
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
    this.#activeJobByOwner.clear();
    this.#deadlineHeap.length = 0;
    await this.#ready.catch(() => undefined);
    while (this.#operations.size > 0) {
      await Promise.allSettled([...this.#operations]);
    }
    await rm(this.#root, { recursive: true, force: true }).catch(() => undefined);
  }
}
