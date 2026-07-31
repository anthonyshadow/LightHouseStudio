import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { VIDEO_PROVIDER_INTENT_HEADER, type VideoTransformModelId } from '@studio/contracts';

export type FakeVideoJobRequest = {
  method: string;
  modelId: VideoTransformModelId | null;
  providerIntent: string | null;
  exposedOriginalFilename: boolean;
};

export const loadH264VideoFixture = async (): Promise<Buffer> => {
  const source = await readFile(
    new URL('../../apps/api/src/features/video-jobs/video-job-service.test.ts', import.meta.url),
    'utf8',
  );
  const match = /const VIDEO_FIXTURE_BASE64 =\s*'([^']+)'/u.exec(source);
  if (!match?.[1]) throw new Error('The deterministic H.264 fixture is unavailable.');
  return Buffer.from(match[1], 'base64');
};

export const installFakeVideoJobRoutes = async (
  page: Page,
  resultBytes: Buffer,
  options: {
    readonly failSecond?: boolean;
    readonly originalFilename?: string;
    readonly processingReadsBeforeReady?: number;
  } = {},
): Promise<FakeVideoJobRequest[]> => {
  const calls: FakeVideoJobRequest[] = [];
  const jobs = new Map<string, VideoTransformModelId>();
  const statusReads = new Map<string, number>();
  await page.route(
    (url) => url.pathname.startsWith('/api/video-jobs/'),
    async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const parts = url.pathname.split('/');
      const jobId = parts[3] ?? '';
      const providerIntent = request.headers()[VIDEO_PROVIDER_INTENT_HEADER] ?? null;
      if (request.method() === 'PUT') {
        const body = request.postDataBuffer()?.toString('latin1') ?? '';
        const modelId: VideoTransformModelId = body.includes('lucy-vton-latest')
          ? 'lucy-vton-latest'
          : 'lucy-latest';
        jobs.set(jobId, modelId);
        calls.push({
          method: 'PUT',
          modelId,
          providerIntent,
          exposedOriginalFilename: options.originalFilename
            ? body.includes(options.originalFilename)
            : false,
        });
        await route.fulfill({
          status: 202,
          contentType: 'application/json',
          body: JSON.stringify({
            jobId,
            modelId,
            status: 'queued',
            createdAt: '2030-01-01T00:00:00.000Z',
            updatedAt: '2030-01-01T00:00:00.000Z',
            expiresAt: '2030-01-01T01:00:00.000Z',
            result: null,
            error: null,
          }),
        });
        return;
      }

      const modelId = jobs.get(jobId) ?? 'lucy-latest';
      calls.push({
        method: request.method(),
        modelId,
        providerIntent,
        exposedOriginalFilename: false,
      });
      if (request.method() === 'DELETE') {
        await route.fulfill({ status: 204 });
        return;
      }
      if (parts[4] === 'content') {
        await route.fulfill({
          status: 200,
          contentType: 'video/mp4',
          headers: { 'Content-Length': String(resultBytes.byteLength) },
          body: resultBytes,
        });
        return;
      }

      const shouldFail =
        options.failSecond === true && jobs.size === 2 && jobId === [...jobs.keys()][1];
      const readCount = (statusReads.get(jobId) ?? 0) + 1;
      statusReads.set(jobId, readCount);
      const stillProcessing = readCount <= (options.processingReadsBeforeReady ?? 0);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jobId,
          modelId,
          status: shouldFail ? 'failed' : stillProcessing ? 'processing' : 'ready',
          createdAt: '2030-01-01T00:00:00.000Z',
          updatedAt: '2030-01-01T00:00:01.000Z',
          expiresAt: '2030-01-01T01:00:00.000Z',
          result:
            shouldFail || stillProcessing
              ? null
              : {
                  mimeType: 'video/mp4',
                  container: 'mp4',
                  videoCodec: 'avc',
                  audioCodec: null,
                  durationMs: 1_000,
                  width: 1_280,
                  height: 720,
                  sizeBytes: resultBytes.byteLength,
                  hasAudio: false,
                },
          error: shouldFail
            ? {
                code: 'provider_rejected',
                message: 'The visual provider could not complete this request.',
              }
            : null,
        }),
      });
    },
  );
  return calls;
};
