import type { SavedVideoDetail } from '@studio/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const uppyState = vi.hoisted(() => ({ failTransfer: false, uploadCalls: 0 }));
const api = vi.hoisted(() => {
  class ApiClientError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code = 'api-error',
    ) {
      super(message);
    }
  }
  return {
    ApiClientError,
    apiFetch: vi.fn(() => Promise.resolve(new Response(null, { status: 204 }))),
    requestJson: vi.fn(),
  };
});

vi.mock('@uppy/core', () => ({
  default: class FakeUppy {
    pluginOptions: Record<string, (...args: unknown[]) => unknown> = {};

    use(_plugin: unknown, options: Record<string, (...args: unknown[]) => unknown>) {
      this.pluginOptions = options;
      return this;
    }

    addFile() {}

    async upload() {
      uppyState.uploadCalls += 1;
      const created = (await this.pluginOptions.createMultipartUpload?.({})) as {
        uploadId: string;
      };
      await this.pluginOptions.signPart?.({}, { uploadId: created.uploadId, partNumber: 1 });
      if (uppyState.failTransfer) {
        return { failed: [{ error: new Error('PUT https://signed.r2.test/private-object') }] };
      }
      await this.pluginOptions.completeMultipartUpload?.(
        {},
        { uploadId: created.uploadId, parts: [{ PartNumber: 1, ETag: '"part-1"' }] },
      );
      return { failed: [] };
    }

    cancelAll() {}
    destroy() {}
  },
}));
vi.mock('@uppy/aws-s3', () => ({ default: class FakeAwsS3 {} }));
vi.mock('./apiClient', () => api);

import { saveVideoDirect } from './savedVideosApi';

const videoId = 'c26b5280-1538-44cd-82db-a6b1356acf62';
const versionId = '2efcc6c3-e82c-419a-8807-c0026170fb75';
const savedVideo: SavedVideoDetail = {
  id: videoId,
  title: 'Direct take',
  status: 'ready',
  currentVersion: {
    id: versionId,
    videoId,
    ordinal: 1,
    origin: 'recorded',
    characterName: null,
    characterVariantName: null,
    sourceVersionId: null,
    mimeType: 'video/mp4',
    filename: 'direct-take.mp4',
    sizeBytes: 5,
    durationMs: 1_000,
    width: 1_280,
    height: 720,
    createdAt: '2026-08-09T14:00:00.000Z',
  },
  sourceVideoId: null,
  versionCount: 1,
  thumbnailAvailable: false,
  createdAt: '2026-08-09T14:00:00.000Z',
  updatedAt: '2026-08-09T14:00:00.000Z',
  versions: [],
};
savedVideo.versions.push(savedVideo.currentVersion);

const input = {
  blob: new Blob(['video'], { type: 'video/mp4' }),
  title: 'Direct take',
  filename: 'direct-take.mp4',
  origin: 'recorded' as const,
  idempotencyKey: '9bb2885e-31d7-4487-b722-c78ef43ed230',
};

describe('direct saved-video API adapter', () => {
  beforeEach(() => {
    uppyState.failTransfer = false;
    uppyState.uploadCalls = 0;
    api.requestJson.mockReset().mockImplementation((url: string) => {
      if (url === '/api/videos/uploads') {
        return Promise.resolve({
          uploadId: '1a0a22d4-00f7-4c64-88fd-196c97589c8f',
          expiresAt: '2026-08-09T15:00:00.000Z',
          result: null,
        });
      }
      if (url.endsWith('/parts/1')) {
        return Promise.resolve({
          url: 'https://signed.r2.test/private-object',
          expiresAt: '2026-08-09T14:05:00.000Z',
        });
      }
      if (url.endsWith('/complete')) return Promise.resolve(savedVideo);
      throw new Error(`Unexpected request: ${url}`);
    });
  });

  it('stages through the API and gives Uppy only the opaque staged ID plus exact part URL', async () => {
    await expect(saveVideoDirect(input)).resolves.toEqual(savedVideo);

    const stageCall = api.requestJson.mock.calls[0];
    expect(JSON.parse((stageCall?.[1] as RequestInit).body as string)).toEqual({
      idempotencyKey: input.idempotencyKey,
      mimeType: 'video/mp4',
      sizeBytes: 5,
      metadata: {
        title: 'Direct take',
        filename: 'direct-take.mp4',
        origin: 'recorded',
        characterName: null,
        characterVariantName: null,
        sourceVideoId: null,
        sourceVersionId: null,
      },
      target: { kind: 'new' },
    });
    expect(api.requestJson.mock.calls.map((call) => String(call[0]))).toEqual([
      '/api/videos/uploads',
      '/api/videos/uploads/1a0a22d4-00f7-4c64-88fd-196c97589c8f/parts/1',
      '/api/videos/uploads/1a0a22d4-00f7-4c64-88fd-196c97589c8f/complete',
    ]);
  });

  it('returns an already-completed idempotent result without starting Uppy', async () => {
    api.requestJson.mockResolvedValueOnce({
      uploadId: '1a0a22d4-00f7-4c64-88fd-196c97589c8f',
      expiresAt: '2026-08-09T15:00:00.000Z',
      result: savedVideo,
    });

    await expect(saveVideoDirect(input)).resolves.toEqual(savedVideo);
    expect(uppyState.uploadCalls).toBe(0);
  });

  it('does not expose a raw signed URL when an R2 part transfer fails', async () => {
    uppyState.failTransfer = true;

    await expect(saveVideoDirect(input)).rejects.toMatchObject({
      message: 'The video transfer did not complete. Choose Save to try again.',
      code: 'upload_failed',
    });
  });
});
