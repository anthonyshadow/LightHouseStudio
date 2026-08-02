import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VIDEO_JOB_TTL_MS } from '@studio/contracts';
import type {
  DecartVideoJobProvider,
  DecartQueueStatus,
} from '../../providers/decart/video-job-provider.js';
import { VideoJobService } from './video-job-service.js';

const VIDEO_FIXTURE_BASE64 =
  'AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAARnbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAA5J0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAABQAAAALQAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAEAAABAAAAAAMKbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAyAAAAMgBVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAACtW1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAnVzdGJsAAAAwXN0c2QAAAAAAAAAAQAAALFhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAABQAC0ABIAAAASAAAAAAAAAABFUxhdmM2Mi4xMS4xMDAgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAAN2F2Y0MBZAAf/+EAGmdkAB+s2UBQBbsBEAAAAwAQAAADAyDxgxlgAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAADnYAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAZAAACAAAAABRzdHNzAAAAAAAAAAEAAAABAAAA2GN0dHMAAAAAAAAAGQAAAAEAAAQAAAAAAQAACgAAAAABAAAEAAAAAAEAAAAAAAAAAQAAAgAAAAABAAAKAAAAAAEAAAQAAAAAAQAAAAAAAAABAAACAAAAAAEAAAoAAAAAAQAABAAAAAABAAAAAAAAAAEAAAIAAAAAAQAACgAAAAABAAAEAAAAAAEAAAAAAAAAAQAAAgAAAAABAAAKAAAAAAEAAAQAAAAAAQAAAAAAAAABAAACAAAAAAEAAAoAAAAAAQAABAAAAAABAAAAAAAAAAEAAAIAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAZAAAAAQAAAHhzdHN6AAAAAAAAAAAAAAAZAAADigAAACgAAAAlAAAAJQAAACUAAAAuAAAAJwAAACUAAAAlAAAALgAAACcAAAAlAAAAJQAAAC4AAAAnAAAAJQAAACUAAAAuAAAAJwAAACUAAAAlAAAALQAAACcAAAAlAAAAJQAAABRzdGNvAAAAAAAAAAEAAASXAAAAYXVkdGEAAABZbWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAsaWxzdAAAACSpdG9vAAAAHGRhdGEAAAABAAAAAExhdmY2Mi4zLjEwMAAAAAhmcmVlAAAHQ21kYXQAAAKvBgX//6vcRem95tlIt5Ys2CDZI+7veDI2NCAtIGNvcmUgMTY1IHIzMjIyIGIzNTYwNWEgLSBILjI2NC9NUEVHLTQgQVZDIGNvZGVjIC0gQ29weWxlZnQgMjAwMy0yMDI1IC0gaHR0cDovL3d3dy52aWRlb2xhbi5vcmcveDI2NC5odG1sIC0gb3B0aW9uczogY2FiYWM9MSByZWY9MyBkZWJsb2NrPTE6MDowIGFuYWx5c2U9MHgzOjB4MTEzIG1lPWhleCBzdWJtZT03IHBzeT0xIHBzeV9yZD0xLjAwOjAuMDAgbWl4ZWRfcmVmPTEgbWVfcmFuZ2U9MTYgY2hyb21hX21lPTEgdHJlbGxpcz0xIDh4OGRjdD0xIGNxbT0wIGRlYWR6b25lPTIxLDExIGZhc3RfcHNraXA9MSBjaHJvbWFfcXBfb2Zmc2V0PS0yIHRocmVhZHM9MTUgbG9va2FoZWFkX3RocmVhZHM9MiBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTI1IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAA02WIhAA7//73Tr8Cm1TCKgOSVwr2yqQmWblSawHypgAAAwAAAwAAAwAAAwAKW2oohWn0yb00AAADAAADAXUAAVUAAiYABNQADUAAMkAA4gAD+AATIACGgAPsABigAOsAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAA2cAAAAkQZokbEO//qmWAAADAAADAAADAAADAAADAAADAAADAAADABgwAAAAIUGeQniF/wAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAccQAAACEBnmF0Qr8AAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAJuAAAAAhAZ5jakK/AAADAAADAAADAAADAAADAAADAAADAAADACbhAAAAKkGaaEmoQWiZTAh3//6plgAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAYMQAAACNBnoZFESwv/wAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAccQAAACEBnqV0Qr8AAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAJuEAAAAhAZ6nakK/AAADAAADAAADAAADAAADAAADAAADAAADACbgAAAAKkGarEmoQWyZTAh3//6plgAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAYMAAAACNBnspFFSwv/wAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAccQAAACEBnul0Qr8AAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAJuAAAAAhAZ7rakK/AAADAAADAAADAAADAAADAAADAAADAAADACbgAAAAKkGa8EmoQWyZTAhv//6nhAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAwIQAAACNBnw5FFSwv/wAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAccQAAACEBny10Qr8AAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAJuEAAAAhAZ8vakK/AAADAAADAAADAAADAAADAAADAAADAAADACbgAAAAKkGbNEmoQWyZTAhn//6eEAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwC7gAAAACNBn1JFFSwv/wAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAccQAAACEBn3F0Qr8AAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAJuAAAAAhAZ9zakK/AAADAAADAAADAAADAAADAAADAAADAAADACbgAAAAKUGbeEmoQWyZTAhX//44QAAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwLbAAAAI0GflkUVLC//AAADAAADAAADAAADAAADAAADAAADAAADABxwAAAAIQGftXRCvwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAAAwAm4QAAACEBn7dqQr8AAAMAAAMAAAMAAAMAAAMAAAMAAAMAAAMAJuE=';

class FakeVideoProvider implements DecartVideoJobProvider {
  readonly submissions: Array<{ modelId: string; videoMimeType: string }> = [];
  nextStatus: DecartQueueStatus = 'pending';

  submit(
    input: Parameters<DecartVideoJobProvider['submit']>[0],
  ): Promise<{ providerJobId: string; status: DecartQueueStatus }> {
    this.submissions.push({ modelId: input.modelId, videoMimeType: input.videoMimeType });
    return Promise.resolve({
      providerJobId: `provider-${this.submissions.length}`,
      status: this.nextStatus,
    });
  }

  status(): Promise<{ status: DecartQueueStatus }> {
    return Promise.resolve({ status: this.nextStatus });
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

const startJob = async (service: VideoJobService, jobId: string, ownerId: string) => {
  const paths = await service.prepareJobDirectory(jobId);
  await writeFile(paths.inputPath, Buffer.from(VIDEO_FIXTURE_BASE64, 'base64'), {
    flag: 'wx',
    mode: 0o600,
  });
  const status = await service.start({
    jobId,
    ownerId,
    recipe: {
      modelId: 'lucy-latest',
      prompt: 'Change the lighting',
      enhancePrompt: false,
      hasReferenceImage: false,
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

describe('VideoJobService', () => {
  const services: VideoJobService[] = [];
  afterEach(async () => {
    await Promise.all(services.splice(0).map((service) => service.close()));
  });

  it('inspects, pins, and submits a client job exactly once before safe retrieval', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-'));
    const provider = new FakeVideoProvider();
    const service = new VideoJobService(provider, root);
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
        modelId: 'lucy-latest',
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
    expect(provider.submissions).toEqual([{ modelId: 'lucy-latest', videoMimeType: 'video/mp4' }]);
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

  it('never retries an ambiguous or rejected billable submission automatically', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-failure-'));
    const provider = new FakeVideoProvider();
    provider.submit = vi.fn().mockRejectedValue(new TypeError('private upstream failure'));
    const service = new VideoJobService(provider, root);
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
        modelId: 'lucy-vton-latest',
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
      message: 'Decart could not complete this visual processing request.',
    });
    expect(provider.submit).toHaveBeenCalledOnce();
  });

  it('expires abandoned ready output at the immutable accepted-at deadline without resubmitting', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'lightframe-video-job-expiry-'));
    const provider = new FakeVideoProvider();
    const clock = new ManualDeadlineScheduler();
    const service = new VideoJobService(provider, root, true, {
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
        modelId: 'lucy-latest',
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
    const service = new VideoJobService(provider, root, true, {
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
    const service = new VideoJobService(provider, root);
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
    const service = new VideoJobService(provider, root);
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
    const service = new VideoJobService(provider, root, true, {
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
    const service = new VideoJobService(provider, root, true, {
      now: clock.now,
      scheduleDeadline: clock.scheduleDeadline,
    });
    services.push(service);
    const jobId = crypto.randomUUID();
    const ownerId = 'owner-deadline-race';
    const { paths, status: accepted } = await startJob(service, jobId, ownerId);
    await waitFor(service, jobId, ownerId, 'queued');

    const statusGate = deferred<{ status: DecartQueueStatus }>();
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

    const unavailable = new VideoJobService(null, root);
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
    const closing = new VideoJobService(provider, root);
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
