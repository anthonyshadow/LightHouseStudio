import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VIDEO_JOB_TTL_MS } from '@studio/contracts';
import { VideoJobService } from './video-job-service.js';
import type {
  ExistingVideoJobProvider,
  ExistingVideoProviderRegistry,
  VideoJobProviderFailureReason,
  VideoJobProviderStatus,
} from '../../providers/video-jobs/video-job-provider.js';

const VIDEO_FIXTURE_BASE64 =
  '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';

class FakeVideoProvider implements ExistingVideoJobProvider {
  readonly submissions: Array<{
    operation: string;
    videoMimeType: string;
    outputResolution: string;
  }> = [];
  nextStatus: VideoJobProviderStatus = 'pending';
  nextFailureReason: VideoJobProviderFailureReason | undefined;
  statusCalls = 0;

  submit(
    input: Parameters<ExistingVideoJobProvider['submit']>[0],
  ): Promise<{ providerJobId: string; status: VideoJobProviderStatus }> {
    this.submissions.push({
      operation: input.operation,
      videoMimeType: input.videoMimeType,
      outputResolution: input.outputResolution,
    });
    return Promise.resolve({
      providerJobId: `provider-${this.submissions.length}`,
      status: this.nextStatus,
    });
  }

  status(): Promise<{
    status: VideoJobProviderStatus;
    failureReason?: VideoJobProviderFailureReason;
  }> {
    this.statusCalls += 1;
    return Promise.resolve({
      status: this.nextStatus,
      ...(this.nextFailureReason === undefined ? {} : { failureReason: this.nextFailureReason }),
    });
  }

  async download(
    _providerJobId: string,
    destinationPath: string,
    _signal: AbortSignal,
  ): Promise<void> {
    await writeFile(destinationPath, Buffer.from(VIDEO_FIXTURE_BASE64, 'base64'), {
      flag: 'wx',
      mode: 0o600,
    });
  }
}

class ManualDeadlineScheduler {
  nowMs = Date.parse('2026-08-02T12:00:00.000Z');
  unrefCalls = 0;
  readonly #tasks: Array<{
    readonly at: number;
    readonly callback: () => Promise<void>;
    canceled: boolean;
  }> = [];

  readonly now = (): number => this.nowMs;

  readonly scheduleDeadline = (callback: () => Promise<void>, delayMs: number) => {
    const task = {
      at: this.nowMs + delayMs,
      callback,
      canceled: false,
    };
    this.#tasks.push(task);
    return {
      cancel: () => {
        task.canceled = true;
      },
      unref: () => {
        this.unrefCalls += 1;
      },
    };
  };

  async advanceTo(timestamp: number): Promise<void> {
    this.nowMs = timestamp;
    while (true) {
      const next = this.#tasks
        .filter((task) => !task.canceled && task.at <= this.nowMs)
        .sort((left, right) => left.at - right.at)[0];
      if (!next) return;
      next.canceled = true;
      await next.callback();
    }
  }
}

const deferred = <Value>() => {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
};

const pathExists = async (filePath: string): Promise<boolean> => {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
};

const startJob = async (
  service: VideoJobService,
  jobId: string,
  ownerId: string,
  outputResolution?: '720p' | '1080p',
) => {
  const paths = await service.prepareJobDirectory(jobId);
  await writeFile(paths.inputPath, Buffer.from(VIDEO_FIXTURE_BASE64, 'base64'), {
    flag: 'wx',
    mode: 0o600,
  });
  const status = await service.start({
    jobId,
    ownerId,
    recipe: {
      operation: 'character-swap',
      prompt: 'Change the lighting',
      enhancePrompt: false,
      hasReferenceImage: false,
      ...(outputResolution ? { outputResolution } : {}),
    },
    directory: paths.directory,
    inputPath: paths.inputPath,
    referencePath: null,
    referenceMimeType: null,
  });
  return { paths, status };
};

const makeReady = async (
  service: VideoJobService,
  provider: FakeVideoProvider,
  jobId: string,
  ownerId: string,
) => {
  await waitFor(service, jobId, ownerId, 'queued');
  provider.nextStatus = 'completed';
  await service.status(jobId, ownerId);
  return waitFor(service, jobId, ownerId, 'ready');
};

const waitFor = async (
  service: VideoJobService,
  jobId: string,
  ownerId: string,
  expected: string,
) => {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const status = await service.status(jobId, ownerId);
    if (status.status === expected) return status;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Job did not reach ${expected}.`);
};

const providerRegistry = (
  providers: ExistingVideoProviderRegistry | ExistingVideoJobProvider | null,
): ExistingVideoProviderRegistry => {
  if (providers === null) return { 'character-swap': null, 'virtual-try-on': null };
  if (!('submit' in providers)) return providers;
  const binding = {
    provider: providers,
    outputResolutions: ['720p'] as const,
    defaultOutputResolution: '720p' as const,
    outputSizing: 'exact-canonical' as const,
    inputPreparation: 'none' as const,
    referencePolicy: 'optional' as const,
    promptEnhancement: true,
  };
  return { 'character-swap': binding, 'virtual-try-on': binding };
};

const createService = (
  providers: ExistingVideoProviderRegistry | ExistingVideoJobProvider | null,
  root: string,
  options: ConstructorParameters<typeof VideoJobService>[2] = {},
): VideoJobService =>
  new VideoJobService(providerRegistry(providers), root, {
    ...options,
    providerPollBackoffMs: [0, 0, 0, 0, 0],
  });

describe('VideoJobService', () => {
  const services: VideoJobService[] = [];
  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.close()));
  });

  it('owns capped provider polling cadence and serves cached status under rapid reads', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-poll-cadence-'));
    const provider = new FakeVideoProvider();
    const scheduler = new ManualDeadlineScheduler();
    const service = new VideoJobService(providerRegistry(provider), root, {
      now: scheduler.now,
      scheduleDeadline: scheduler.scheduleDeadline,
    });
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-poll-cadence';

    await startJob(service, jobId, ownerId);
    await vi.waitFor(() => expect(provider.submissions).toHaveLength(1));
    expect((await service.existing(jobId, ownerId))?.nextPollAfterMs).toBe(2_000);

    expect((await service.status(jobId, ownerId)).nextPollAfterMs).toBe(3_000);
    expect(provider.statusCalls).toBe(1);
    expect((await service.status(jobId, ownerId)).nextPollAfterMs).toBe(3_000);
    expect(provider.statusCalls).toBe(1);

    provider.nextStatus = 'processing';
    await scheduler.advanceTo(scheduler.nowMs + 3_000);
    expect((await service.status(jobId, ownerId)).nextPollAfterMs).toBe(2_000);

    const expectedUnchangedBackoff = [3_000, 5_000, 8_000, 10_000, 10_000];
    for (const expected of expectedUnchangedBackoff) {
      const current = await service.existing(jobId, ownerId);
      await scheduler.advanceTo(scheduler.nowMs + (current?.nextPollAfterMs ?? 0));
      expect((await service.status(jobId, ownerId)).nextPollAfterMs).toBe(expected);
    }
    expect(provider.statusCalls).toBe(7);
  });

  it('retries transient temporary-job cleanup before deleting bookkeeping', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-cleanup-retry-'));
    const provider = new FakeVideoProvider();
    let recursiveAttempts = 0;
    const service = createService(provider, root, {
      removePath: async (target, options) => {
        if (options.recursive) {
          recursiveAttempts += 1;
          if (recursiveAttempts < 3) throw new Error('transient removal failure');
        }
        await rm(target, options);
      },
    });
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-cleanup-retry';

    await startJob(service, jobId, ownerId);
    await makeReady(service, provider, jobId, ownerId);
    const content = await service.content(jobId, ownerId);
    await content.settle(true);

    expect(recursiveAttempts).toBe(3);
    expect(await service.existing(jobId, ownerId)).toBeNull();
  });

  it('coalesces same-owner recipe replays and rejects a conflicting recipe for the same job ID', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-idempotency-'));
    const provider = new FakeVideoProvider();
    const service = createService(provider, root);
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-idempotency';
    const accepted = await startJob(service, jobId, ownerId);

    const replayPaths = await service.prepareJobDirectory(jobId);
    await writeFile(replayPaths.inputPath, Buffer.from(VIDEO_FIXTURE_BASE64, 'base64'));
    const replay = await service.start({
      jobId,
      ownerId,
      recipe: {
        operation: 'character-swap',
        prompt: 'Change the lighting',
        enhancePrompt: false,
        hasReferenceImage: false,
      },
      directory: replayPaths.directory,
      inputPath: replayPaths.inputPath,
      referencePath: null,
      referenceMimeType: null,
    });
    expect(replay.createdAt).toBe(accepted.status.createdAt);
    expect(await pathExists(replayPaths.directory)).toBe(false);

    const conflictPaths = await service.prepareJobDirectory(jobId);
    await writeFile(conflictPaths.inputPath, Buffer.from(VIDEO_FIXTURE_BASE64, 'base64'));
    await expect(
      service.start({
        jobId,
        ownerId,
        recipe: {
          operation: 'character-swap',
          prompt: 'Use conflicting settings',
          enhancePrompt: false,
          hasReferenceImage: false,
        },
        directory: conflictPaths.directory,
        inputPath: conflictPaths.inputPath,
        referencePath: null,
        referenceMimeType: null,
      }),
    ).rejects.toMatchObject({ code: 'request_id_conflict' });
    expect(await pathExists(conflictPaths.directory)).toBe(false);
    await vi.waitFor(() => expect(provider.submissions).toHaveLength(1));
  });

  it('retains pending cleanup and reports one safe diagnostic after permanent failure', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-cleanup-pending-'));
    const provider = new FakeVideoProvider();
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const service = createService(provider, root, {
      removePath: async (target, options) => {
        if (options.recursive) throw new Error('private filesystem detail');
        await rm(target, options);
      },
    });
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-cleanup-pending';

    await startJob(service, jobId, ownerId);
    await makeReady(service, provider, jobId, ownerId);
    await service.release(jobId, ownerId);
    await service.release(jobId, ownerId);

    expect(await service.existing(jobId, ownerId)).not.toBeNull();
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining('cleanup could not be completed'),
      { jobId },
    );
    expect(JSON.stringify(warning.mock.calls)).not.toContain('private filesystem detail');
    warning.mockRestore();
  });

  it('passes the request-selected output resolution to the provider', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-resolution-'));
    const provider = new FakeVideoProvider();
    const service = createService(
      {
        'character-swap': {
          provider,
          outputResolutions: ['720p', '1080p'],
          defaultOutputResolution: '720p',
          outputSizing: 'megapixel-budget',
          inputPreparation: 'none',
          referencePolicy: 'optional',
          promptEnhancement: false,
        },
        'virtual-try-on': null,
      },
      root,
    );
    services.push(service);
    const jobId = crypto.randomUUID();

    await startJob(service, jobId, 'owner-resolution', '1080p');
    await waitFor(service, jobId, 'owner-resolution', 'queued');

    expect(provider.submissions[0]?.outputResolution).toBe('1080p');
  });

  it('rejects an output resolution not supported by the active operation', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-resolution-reject-'));
    const provider = new FakeVideoProvider();
    const service = createService(provider, root);
    services.push(service);
    const jobId = crypto.randomUUID();
    const paths = await service.prepareJobDirectory(jobId);
    await writeFile(paths.inputPath, Buffer.from(VIDEO_FIXTURE_BASE64, 'base64'), {
      flag: 'wx',
      mode: 0o600,
    });

    await expect(
      service.start({
        jobId,
        ownerId: 'owner-unsupported-resolution',
        recipe: {
          operation: 'character-swap',
          prompt: 'Change the lighting',
          enhancePrompt: false,
          hasReferenceImage: false,
          outputResolution: '1080p',
        },
        directory: paths.directory,
        inputPath: paths.inputPath,
        referencePath: null,
        referenceMimeType: null,
      }),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: 'validation_error',
      message: 'Choose a supported output resolution for this visual processing operation.',
    });
    expect(provider.submissions).toHaveLength(0);
  });

  it('enforces operation-specific reference requirements before provider submission', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-reference-'));
    const provider = new FakeVideoProvider();
    const service = createService(
      {
        'character-swap': {
          provider,
          outputResolutions: ['720p', '1080p'],
          defaultOutputResolution: '1080p',
          outputSizing: 'exact-canonical',
          inputPreparation: 'h264-mp4',
          referencePolicy: 'required',
          promptEnhancement: false,
        },
        'virtual-try-on': null,
      },
      root,
    );
    services.push(service);
    const jobId = crypto.randomUUID();
    const paths = await service.prepareJobDirectory(jobId);
    await writeFile(paths.inputPath, Buffer.from(VIDEO_FIXTURE_BASE64, 'base64'), {
      flag: 'wx',
      mode: 0o600,
    });

    await expect(
      service.start({
        jobId,
        ownerId: 'owner-reference',
        recipe: {
          operation: 'character-swap',
          prompt: 'Replace the person',
          enhancePrompt: false,
          hasReferenceImage: false,
        },
        directory: paths.directory,
        inputPath: paths.inputPath,
        referencePath: null,
        referenceMimeType: null,
      }),
    ).rejects.toMatchObject({
      code: 'validation_error',
      message: 'Character Swap requires a reference image in this configuration.',
    });
    expect(provider.submissions).toEqual([]);
  });

  it('inspects, pins, and submits a client job exactly once before safe retrieval', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-'));
    const provider = new FakeVideoProvider();
    const service = createService(provider, root);
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-one';
    const paths = await service.prepareJobDirectory(jobId);
    await writeFile(paths.inputPath, Buffer.from(VIDEO_FIXTURE_BASE64, 'base64'), {
      flag: 'wx',
      mode: 0o600,
    });

    await service.start({
      jobId,
      ownerId,
      recipe: {
        operation: 'character-swap',
        prompt: 'Change the lighting',
        enhancePrompt: false,
        hasReferenceImage: false,
      },
      directory: paths.directory,
      inputPath: paths.inputPath,
      referencePath: null,
      referenceMimeType: null,
    });

    await waitFor(service, jobId, ownerId, 'queued');
    expect(provider.submissions).toEqual([
      {
        operation: 'character-swap',
        videoMimeType: 'video/mp4',
        outputResolution: '720p',
      },
    ]);
    expect((await service.existing(jobId, ownerId))?.jobId).toBe(jobId);

    provider.nextStatus = 'completed';
    await service.status(jobId, ownerId);
    const ready = await waitFor(service, jobId, ownerId, 'ready');
    expect(ready.result).toMatchObject({
      width: 1_280,
      height: 720,
      videoCodec: 'avc',
    });
    const content = await service.content(jobId, ownerId);
    expect(await readdir(path.dirname(content.path))).toContain('result.video');
    expect((await readFile(content.path)).byteLength).toBeGreaterThan(0);
    await content.settle(true);
    expect(provider.submissions).toHaveLength(1);
  });

  it('allows more than four sequential explicit submissions for one owner', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-repeat-'));
    const provider = new FakeVideoProvider();
    const service = createService(provider, root);
    services.push(service);
    const ownerId = 'owner-repeat';

    for (let submissionNumber = 1; submissionNumber <= 5; submissionNumber += 1) {
      provider.nextStatus = 'pending';
      const jobId = crypto.randomUUID();
      await startJob(service, jobId, ownerId);
      await waitFor(service, jobId, ownerId, 'queued');

      provider.nextStatus = 'completed';
      await service.status(jobId, ownerId);
      await waitFor(service, jobId, ownerId, 'ready');
      const content = await service.content(jobId, ownerId);
      await content.settle(true);
    }

    expect(provider.submissions).toHaveLength(5);
  });

  it('reports provider-output dimensions without blaming a valid source aspect ratio', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-dimensions-'));
    const provider = new FakeVideoProvider();
    const service = createService(
      {
        'character-swap': {
          provider,
          outputResolutions: ['720p', '1080p'],
          defaultOutputResolution: '1080p',
          outputSizing: 'exact-canonical',
          inputPreparation: 'h264-mp4',
          referencePolicy: 'optional',
          promptEnhancement: false,
        },
        'virtual-try-on': null,
      },
      root,
    );
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-output-dimensions';
    const { paths } = await startJob(service, jobId, ownerId);

    await waitFor(service, jobId, ownerId, 'queued');
    provider.nextStatus = 'completed';
    await service.status(jobId, ownerId);
    const failed = await waitFor(service, jobId, ownerId, 'failed');

    expect(failed.error).toEqual({
      code: 'result_invalid',
      message:
        'The visual result dimensions were 1280 × 720; expected 1920 × 1080 for the source orientation.',
    });
    expect(failed.error?.message).not.toContain('Use a 16:9 landscape or 9:16 portrait video.');
    await vi.waitFor(async () => expect(await pathExists(paths.directory)).toBe(false));
    expect(provider.submissions).toHaveLength(1);
  });

  it('reports and publishes a non-canonical megapixel-budget result', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-megapixel-'));
    const provider = new FakeVideoProvider();
    const service = createService(
      {
        'character-swap': {
          provider,
          outputResolutions: ['720p', '1080p'],
          defaultOutputResolution: '1080p',
          outputSizing: 'megapixel-budget',
          inputPreparation: 'h264-mp4',
          referencePolicy: 'optional',
          promptEnhancement: false,
          terminalFailureRelease: 'explicit-user',
        },
        'virtual-try-on': null,
      },
      root,
    );
    services.push(service);
    const report = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-megapixel-result';

    await startJob(service, jobId, ownerId);
    await waitFor(service, jobId, ownerId, 'queued');
    provider.nextStatus = 'completed';
    await service.status(jobId, ownerId);
    const ready = await waitFor(service, jobId, ownerId, 'ready');

    expect(ready.result).toMatchObject({ width: 1_280, height: 720 });
    expect(report).toHaveBeenCalledWith(
      expect.stringContaining('Accepted provider-selected dimensions'),
      expect.objectContaining({
        actualWidth: 1_280,
        actualHeight: 720,
        resolution: '1080p',
      }),
    );
    report.mockRestore();
  });

  it('returns only a classified safe error when an accepted provider job fails', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-provider-failure-'));
    const provider = new FakeVideoProvider();
    const service = createService(provider, root);
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-provider-failure';
    const { paths } = await startJob(service, jobId, ownerId);

    await waitFor(service, jobId, ownerId, 'queued');
    provider.nextFailureReason = 'policy';
    provider.nextStatus = 'failed';
    const failed = await waitFor(service, jobId, ownerId, 'failed');

    expect(failed.error).toEqual({
      code: 'provider_rejected',
      message:
        'Visual processing could not complete because content safeguards rejected the request.',
    });
    expect(await pathExists(paths.directory)).toBe(false);
    expect(provider.submissions).toHaveLength(1);
  });

  it('never retries an ambiguous or rejected billable submission automatically', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-failure-'));
    const provider = new FakeVideoProvider();
    provider.submit = vi.fn().mockRejectedValue(new TypeError('private upstream failure'));
    const service = createService(provider, root);
    services.push(service);
    const jobId = crypto.randomUUID();
    const paths = await service.prepareJobDirectory(jobId);
    await writeFile(paths.inputPath, Buffer.from(VIDEO_FIXTURE_BASE64, 'base64'), {
      flag: 'wx',
      mode: 0o600,
    });

    await service.start({
      jobId,
      ownerId: 'owner-two',
      recipe: {
        operation: 'virtual-try-on',
        inputKind: 'prompt',
        prompt: 'Apply the garment',
        enhancePrompt: false,
        hasReferenceImage: false,
      },
      directory: paths.directory,
      inputPath: paths.inputPath,
      referencePath: null,
      referenceMimeType: null,
    });

    const failed = await waitFor(service, jobId, 'owner-two', 'failed');
    expect(failed.error).toEqual({
      code: 'provider_rejected',
      message: 'Visual processing could not complete this request.',
    });
    expect(provider.submit).toHaveBeenCalledOnce();
  });

  it('distinguishes a terminal provider generation failure from an HTTP request failure', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-terminal-failure-'));
    const provider = new FakeVideoProvider();
    const service = createService(provider, root);
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-terminal-generation-failure';

    await startJob(service, jobId, ownerId);
    await waitFor(service, jobId, ownerId, 'queued');
    provider.nextFailureReason = 'generation-failed';
    provider.nextStatus = 'failed';

    const failed = await service.status(jobId, ownerId);

    expect(failed).toMatchObject({
      status: 'failed',
      error: {
        code: 'provider_rejected',
        message: 'The visual provider reported that generation failed before producing a result.',
      },
    });
  });

  it('expires abandoned ready output at the immutable accepted-at deadline without resubmitting', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-expiry-'));
    const provider = new FakeVideoProvider();
    const clock = new ManualDeadlineScheduler();
    const service = createService(provider, root, {
      now: clock.now,
      scheduleDeadline: clock.scheduleDeadline,
    });
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-expiry';
    const { paths, status: accepted } = await startJob(service, jobId, ownerId);
    const deadline = clock.nowMs + VIDEO_JOB_TTL_MS;

    expect(accepted.createdAt).toBe(new Date(clock.nowMs).toISOString());
    expect(accepted.expiresAt).toBe(new Date(deadline).toISOString());
    await makeReady(service, provider, jobId, ownerId);
    await clock.advanceTo(deadline - 1);
    expect((await service.status(jobId, ownerId)).status).toBe('ready');

    await clock.advanceTo(deadline);

    const expired = await service.status(jobId, ownerId);
    expect(expired).toMatchObject({
      status: 'expired',
      expiresAt: new Date(deadline).toISOString(),
      result: null,
      error: { code: 'job_expired' },
    });
    expect(await pathExists(paths.directory)).toBe(false);
    expect((await service.existing(jobId, ownerId))?.status).toBe('expired');
    await expect(service.content(jobId, ownerId)).rejects.toMatchObject({
      code: 'job_expired',
    });

    const duplicate = await service.start({
      jobId,
      ownerId,
      recipe: {
        operation: 'character-swap',
        prompt: 'A changed retry draft',
        enhancePrompt: false,
        hasReferenceImage: false,
      },
      directory: paths.directory,
      inputPath: paths.inputPath,
      referencePath: null,
      referenceMimeType: null,
    });
    expect(duplicate.status).toBe('expired');
    expect(provider.submissions).toHaveLength(1);
    expect(clock.unrefCalls).toBeGreaterThan(0);
  });

  it('leases pre-deadline content through expiry and cleans it when the delivery closes', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-lease-'));
    const provider = new FakeVideoProvider();
    const clock = new ManualDeadlineScheduler();
    const service = createService(provider, root, {
      now: clock.now,
      scheduleDeadline: clock.scheduleDeadline,
    });
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-lease';
    const { paths } = await startJob(service, jobId, ownerId);
    await makeReady(service, provider, jobId, ownerId);
    const lease = await service.content(jobId, ownerId);

    await clock.advanceTo(clock.nowMs + VIDEO_JOB_TTL_MS);

    expect((await service.status(jobId, ownerId)).status).toBe('expired');
    expect(await pathExists(lease.path)).toBe(true);
    await expect(service.content(jobId, ownerId)).rejects.toMatchObject({
      code: 'job_expired',
    });

    await lease.settle(false);
    await lease.settle(false);

    expect(await pathExists(paths.directory)).toBe(false);
    expect((await service.existing(jobId, ownerId))?.status).toBe('expired');
  });

  it('keeps an interrupted pre-deadline delivery retryable and removes a delivered result once', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-retry-'));
    const provider = new FakeVideoProvider();
    const service = createService(provider, root);
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-retry';
    const { paths } = await startJob(service, jobId, ownerId);
    await makeReady(service, provider, jobId, ownerId);

    const interrupted = await service.content(jobId, ownerId);
    await interrupted.settle(false);
    expect(await pathExists(interrupted.path)).toBe(true);

    const retry = await service.content(jobId, ownerId);
    await retry.settle(true);
    await retry.settle(true);

    expect(await pathExists(paths.directory)).toBe(false);
    expect(await service.existing(jobId, ownerId)).toBeNull();
  });

  it('owner-scopes and explicitly releases ready output before its deadline', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-release-'));
    const provider = new FakeVideoProvider();
    const service = createService(provider, root);
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-release';
    const { paths } = await startJob(service, jobId, ownerId);
    await makeReady(service, provider, jobId, ownerId);

    await expect(service.status(jobId, 'different-owner')).rejects.toMatchObject({
      statusCode: 404,
      code: 'not_found',
    });
    await expect(service.content(jobId, 'different-owner')).rejects.toMatchObject({
      statusCode: 404,
      code: 'not_found',
    });
    await expect(service.release(jobId, 'different-owner')).rejects.toMatchObject({
      statusCode: 404,
      code: 'not_found',
    });
    expect(await pathExists(paths.directory)).toBe(true);

    await service.release(jobId, ownerId);

    expect(await pathExists(paths.directory)).toBe(false);
    expect(await service.existing(jobId, ownerId)).toBeNull();
  });

  it('does not let a late provider download resurrect an expired job', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-late-'));
    const provider = new FakeVideoProvider();
    const clock = new ManualDeadlineScheduler();
    const downloadGate = deferred<void>();
    provider.download = vi.fn(async (_providerJobId: string, destinationPath: string) => {
      await downloadGate.promise;
      await mkdir(path.dirname(destinationPath), { recursive: true });
      await writeFile(destinationPath, Buffer.from(VIDEO_FIXTURE_BASE64, 'base64'), {
        flag: 'wx',
        mode: 0o600,
      });
    });
    const service = createService(provider, root, {
      now: clock.now,
      scheduleDeadline: clock.scheduleDeadline,
    });
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-late';
    const { paths } = await startJob(service, jobId, ownerId);
    await waitFor(service, jobId, ownerId, 'queued');
    provider.nextStatus = 'completed';
    await service.status(jobId, ownerId);
    await vi.waitFor(() => expect(provider.download).toHaveBeenCalledOnce());

    await clock.advanceTo(clock.nowMs + VIDEO_JOB_TTL_MS);
    downloadGate.resolve();

    await vi.waitFor(async () => {
      expect((await service.status(jobId, ownerId)).status).toBe('expired');
      expect(await pathExists(paths.directory)).toBe(false);
    });
  });

  it('rejects a provider completion that resolves at the deadline before the timer callback', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-deadline-race-'));
    const provider = new FakeVideoProvider();
    const clock = new ManualDeadlineScheduler();
    const service = createService(provider, root, {
      now: clock.now,
      scheduleDeadline: clock.scheduleDeadline,
    });
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-deadline-race';
    const { paths, status: accepted } = await startJob(service, jobId, ownerId);
    await waitFor(service, jobId, ownerId, 'queued');

    const statusGate = deferred<{ status: VideoJobProviderStatus }>();
    provider.status = vi.fn(() => statusGate.promise);
    provider.download = vi.fn(
      (_providerJobId: string, _destinationPath: string, _signal: AbortSignal): Promise<void> =>
        Promise.resolve(),
    );
    const polling = service.status(jobId, ownerId);
    await vi.waitFor(() => expect(provider.status).toHaveBeenCalledOnce());

    clock.nowMs = Date.parse(accepted.expiresAt);
    statusGate.resolve({ status: 'completed' });

    await expect(polling).resolves.toMatchObject({
      status: 'expired',
      result: null,
      error: { code: 'job_expired' },
    });
    expect(provider.download).not.toHaveBeenCalled();
    expect(await pathExists(paths.directory)).toBe(false);
  });

  it('purges the temp root without a provider and waits out late work during idempotent close', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-close-'));
    const tempRoot = path.join(root, '.tmp', 'video-jobs');
    const stalePath = path.join(tempRoot, 'stale', 'result.video');
    await mkdir(path.dirname(stalePath), { recursive: true });
    await writeFile(stalePath, 'stale');

    const unavailable = createService(null, root);
    services.push(unavailable);
    await vi.waitFor(async () => expect(await pathExists(stalePath)).toBe(false));
    await mkdir(tempRoot, { recursive: true });
    await writeFile(path.join(tempRoot, 'shutdown-stale'), 'stale');
    await Promise.all([unavailable.close(), unavailable.close()]);
    expect(await pathExists(tempRoot)).toBe(false);

    const provider = new FakeVideoProvider();
    const submitGate = deferred<void>();
    provider.submit = vi.fn(async () => {
      await submitGate.promise;
      return { providerJobId: 'late-provider-job', status: 'pending' as const };
    });
    const closing = createService(provider, root);
    services.push(closing);
    const jobId = crypto.randomUUID();
    await startJob(closing, jobId, 'owner-close');
    await vi.waitFor(() => expect(provider.submit).toHaveBeenCalledOnce());
    const closePromise = closing.close();
    submitGate.resolve();
    await closePromise;

    expect(await closing.existing(jobId, 'owner-close')).toBeNull();
    expect(await pathExists(tempRoot)).toBe(false);
  });
});
