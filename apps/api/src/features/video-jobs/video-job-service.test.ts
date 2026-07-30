import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  DecartVideoJobProvider,
  DecartQueueStatus,
} from '../../providers/decart/video-job-provider.js';
import { VideoJobService } from './video-job-service.js';

const VIDEO_FIXTURE_BASE64 =
  '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';

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
        modelId: 'lucy-2.5',
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
    expect(provider.submissions).toEqual([{ modelId: 'lucy-2.5', videoMimeType: 'video/mp4' }]);
    expect(service.existing(jobId, ownerId)?.jobId).toBe(jobId);

    provider.nextStatus = 'completed';
    await service.status(jobId, ownerId);
    const ready = await waitFor(service, jobId, ownerId, 'ready');
    expect(ready.result).toMatchObject({
      width: 1_280,
      height: 720,
      videoCodec: 'avc',
    });
    const content = service.content(jobId, ownerId);
    expect(await readdir(path.dirname(content.path))).toContain('result.video');
    expect((await readFile(content.path)).byteLength).toBeGreaterThan(0);
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
        modelId: 'lucy-vton-3',
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
});
