import {
  directSavedVideoUploadPartsResponseSchema,
  directSavedVideoUploadPartUrlSchema,
  directSavedVideoUploadResponseSchema,
  savedVideoDetailSchema,
  savedVideosResponseSchema,
  type SavedVideoDetail,
  type SavedVideoFormat,
  type SavedVideoOrigin,
  type SavedVideoSort,
  type SavedVideosResponse,
} from '@studio/contracts';
import { ApiClientError, apiFetch, requestJson } from './apiClient';

const invalidResponse = () =>
  new ApiClientError('The saved video response was invalid.', 502, 'invalid-response');

const directTransferFailure = () =>
  new ApiClientError(
    'The video transfer did not complete. Choose Save to try again.',
    503,
    'upload_failed',
  );

export type SaveVideoInput = Readonly<{
  blob: Blob;
  title: string;
  filename: string;
  origin: SavedVideoOrigin;
  characterName?: string | null;
  characterVariantName?: string | null;
  idempotencyKey: string;
  sourceVideoId?: string | null;
  sourceVersionId?: string | null;
  signal?: AbortSignal;
}>;

const uploadHeaders = (input: SaveVideoInput): HeadersInit => ({
  Accept: 'application/json',
  'Content-Type': input.blob.type,
  'Idempotency-Key': input.idempotencyKey,
  'X-Lightframe-Video-Metadata': encodeURIComponent(
    JSON.stringify({
      title: input.title,
      filename: input.filename,
      origin: input.origin,
      characterName: input.characterName ?? null,
      characterVariantName: input.characterVariantName ?? null,
      sourceVideoId: input.sourceVideoId ?? null,
      sourceVersionId: input.sourceVersionId ?? null,
    }),
  ),
});

export const saveVideo = (input: SaveVideoInput): Promise<SavedVideoDetail> =>
  requestJson(
    '/api/videos',
    {
      method: 'POST',
      cache: 'no-store',
      headers: uploadHeaders(input),
      body: input.blob,
      ...(input.signal ? { signal: input.signal } : {}),
    },
    savedVideoDetailSchema,
    invalidResponse,
  );

export const appendSavedVideoVersion = (
  videoId: string,
  expectedVersionId: string,
  input: SaveVideoInput,
): Promise<SavedVideoDetail> =>
  requestJson(
    `/api/videos/${encodeURIComponent(videoId)}/versions`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { ...uploadHeaders(input), 'If-Match': `"${expectedVersionId}"` },
      body: input.blob,
      ...(input.signal ? { signal: input.signal } : {}),
    },
    savedVideoDetailSchema,
    invalidResponse,
  );

const directUploadSignal = (
  outer: AbortSignal | undefined,
  inner: AbortSignal | undefined,
): AbortSignal | undefined => {
  if (outer === undefined) return inner;
  if (inner === undefined) return outer;
  return AbortSignal.any([outer, inner]);
};

const requiredDirectUploadId = (value: string | undefined): string => {
  if (value === undefined) throw invalidResponse();
  return value;
};

const directUpload = async (
  input: SaveVideoInput,
  target:
    | { readonly kind: 'new' }
    | { readonly kind: 'version'; readonly videoId: string; readonly expectedVersionId: string },
): Promise<SavedVideoDetail> => {
  if (input.signal?.aborted) throw new DOMException('The upload was aborted.', 'AbortError');
  const staged = await requestJson(
    '/api/videos/uploads',
    {
      method: 'POST',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey: input.idempotencyKey,
        mimeType: input.blob.type,
        sizeBytes: input.blob.size,
        metadata: {
          title: input.title,
          filename: input.filename,
          origin: input.origin,
          characterName: input.characterName ?? null,
          characterVariantName: input.characterVariantName ?? null,
          sourceVideoId: input.sourceVideoId ?? null,
          sourceVersionId: input.sourceVersionId ?? null,
        },
        target,
      }),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    directSavedVideoUploadResponseSchema,
    invalidResponse,
  );
  if (staged.result !== null) return staged.result;
  const [{ default: Uppy }, { default: AwsS3 }] = await Promise.all([
    import('@uppy/core'),
    import('@uppy/aws-s3'),
  ]);
  let completed: SavedVideoDetail | null = null;
  const failure = { api: null as ApiClientError | null };
  const captureApiFailure = async <Result>(operation: () => Promise<Result>): Promise<Result> => {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ApiClientError) failure.api = error;
      throw error;
    }
  };
  const uppy = new Uppy({
    autoProceed: false,
    restrictions: {
      maxNumberOfFiles: 1,
      maxFileSize: input.blob.size,
      allowedFileTypes: [input.blob.type],
    },
  }).use(AwsS3, {
    shouldUseMultipart: true,
    allowedMetaFields: false,
    limit: 4,
    retryDelays: [0, 1_000, 3_000, 5_000],
    getChunkSize: () => 8 * 1024 * 1024,
    createMultipartUpload: (_file) => ({
      uploadId: staged.uploadId,
      key: staged.uploadId,
    }),
    listParts: async (_file, { uploadId, signal }) => {
      const stagedUploadId = requiredDirectUploadId(uploadId);
      const requestSignal = directUploadSignal(input.signal, signal);
      const response = await captureApiFailure(() =>
        requestJson(
          `/api/videos/uploads/${encodeURIComponent(stagedUploadId)}/parts`,
          {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
            ...(requestSignal ? { signal: requestSignal } : {}),
          },
          directSavedVideoUploadPartsResponseSchema,
          invalidResponse,
        ),
      );
      return response.parts;
    },
    signPart: async (_file, { uploadId, partNumber, signal }) => {
      const stagedUploadId = requiredDirectUploadId(uploadId);
      const requestSignal = directUploadSignal(input.signal, signal);
      const signed = await captureApiFailure(() =>
        requestJson(
          `/api/videos/uploads/${encodeURIComponent(stagedUploadId)}/parts/${partNumber}`,
          {
            method: 'POST',
            cache: 'no-store',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: '{}',
            ...(requestSignal ? { signal: requestSignal } : {}),
          },
          directSavedVideoUploadPartUrlSchema,
          invalidResponse,
        ),
      );
      return { method: 'PUT' as const, url: signed.url };
    },
    abortMultipartUpload: async (_file, { uploadId }) => {
      const stagedUploadId = requiredDirectUploadId(uploadId);
      await apiFetch(`/api/videos/uploads/${encodeURIComponent(stagedUploadId)}`, {
        method: 'DELETE',
        cache: 'no-store',
        keepalive: true,
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: '{}',
      });
    },
    completeMultipartUpload: async (_file, { uploadId, parts, signal }) => {
      const stagedUploadId = requiredDirectUploadId(uploadId);
      const requestSignal = directUploadSignal(input.signal, signal);
      const completedParts = parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag }));
      completed = await captureApiFailure(() =>
        requestJson(
          `/api/videos/uploads/${encodeURIComponent(stagedUploadId)}/complete`,
          {
            method: 'POST',
            cache: 'no-store',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ parts: completedParts }),
            ...(requestSignal ? { signal: requestSignal } : {}),
          },
          savedVideoDetailSchema,
          invalidResponse,
        ),
      );
      return {};
    },
  });
  const abort = (): void => {
    void uppy.cancelAll();
  };
  input.signal?.addEventListener('abort', abort, { once: true });
  try {
    uppy.addFile({
      name: input.filename,
      type: input.blob.type,
      data: input.blob,
      source: 'Lightframe',
    });
    const result = await uppy.upload();
    if (result?.failed?.[0]?.error) throw failure.api ?? directTransferFailure();
    if (completed === null) throw invalidResponse();
    return completed;
  } catch (error) {
    if (failure.api !== null) throw failure.api;
    if (error instanceof ApiClientError) throw error;
    if (input.signal?.aborted) throw new DOMException('The upload was aborted.', 'AbortError');
    throw directTransferFailure();
  } finally {
    input.signal?.removeEventListener('abort', abort);
    uppy.destroy();
  }
};

export const saveVideoDirect = (input: SaveVideoInput): Promise<SavedVideoDetail> =>
  directUpload(input, { kind: 'new' });

export const appendSavedVideoVersionDirect = (
  videoId: string,
  expectedVersionId: string,
  input: SaveVideoInput,
): Promise<SavedVideoDetail> =>
  directUpload(input, { kind: 'version', videoId, expectedVersionId });

export const saveSavedVideoThumbnail = (
  videoId: string,
  versionId: string,
  thumbnail: Blob,
  signal?: AbortSignal,
): Promise<SavedVideoDetail> =>
  requestJson(
    `/api/videos/${encodeURIComponent(videoId)}/versions/${encodeURIComponent(versionId)}/thumbnail`,
    {
      method: 'PUT',
      cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'image/webp' },
      body: thumbnail,
      ...(signal ? { signal } : {}),
    },
    savedVideoDetailSchema,
    invalidResponse,
  );

const DEFAULT_SAVED_VIDEO_PAGE_SIZE = 20;

export type ListSavedVideosInput = Readonly<{
  cursor?: string;
  characterName?: string;
  format?: SavedVideoFormat;
  sort?: SavedVideoSort;
  /** Surfaces that render a short strip should ask for what they show, not a full gallery page. */
  pageSize?: number;
  signal?: AbortSignal;
}>;

export const listSavedVideos = (input: ListSavedVideosInput = {}): Promise<SavedVideosResponse> => {
  const query = new URLSearchParams({
    pageSize: String(input.pageSize ?? DEFAULT_SAVED_VIDEO_PAGE_SIZE),
  });
  if (input.cursor) query.set('cursor', input.cursor);
  if (input.characterName) query.set('characterName', input.characterName);
  if (input.format) query.set('format', input.format);
  if (input.sort) query.set('sort', input.sort);
  return requestJson(
    `/api/videos?${query.toString()}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(input.signal ? { signal: input.signal } : {}),
    },
    savedVideosResponseSchema,
    invalidResponse,
  );
};

export const getSavedVideo = (videoId: string, signal?: AbortSignal): Promise<SavedVideoDetail> =>
  requestJson(
    `/api/videos/${encodeURIComponent(videoId)}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    },
    savedVideoDetailSchema,
    invalidResponse,
  );

export const renameSavedVideo = (videoId: string, title: string): Promise<SavedVideoDetail> =>
  requestJson(
    `/api/videos/${encodeURIComponent(videoId)}`,
    {
      method: 'PATCH',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ title }),
    },
    savedVideoDetailSchema,
    invalidResponse,
  );

export const deleteSavedVideo = async (videoId: string): Promise<void> => {
  await apiFetch(`/api/videos/${encodeURIComponent(videoId)}`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: '{}',
  });
};

export const savedVideoContentUrl = (videoId: string, versionId?: string): string =>
  versionId
    ? `/api/videos/${encodeURIComponent(videoId)}/versions/${encodeURIComponent(versionId)}/content`
    : `/api/videos/${encodeURIComponent(videoId)}/content`;

export const downloadSavedVideoUrl = (videoId: string, versionId?: string): string =>
  `${savedVideoContentUrl(videoId, versionId)}?download=true`;

export const savedVideoThumbnailUrl = (videoId: string): string =>
  `/api/videos/${encodeURIComponent(videoId)}/thumbnail`;
