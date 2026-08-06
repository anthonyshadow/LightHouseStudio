import {
  savedVideoDetailSchema,
  savedVideosResponseSchema,
  type SavedVideoDetail,
  type SavedVideoOrigin,
  type SavedVideosResponse,
} from '@studio/contracts';
import { ApiClientError, apiFetch, requestJson } from './apiClient';

const invalidResponse = () =>
  new ApiClientError('The saved video response was invalid.', 502, 'invalid-response');

export type SaveVideoInput = Readonly<{
  blob: Blob;
  title: string;
  filename: string;
  origin: SavedVideoOrigin;
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

export const listSavedVideos = (
  cursor?: string,
  signal?: AbortSignal,
): Promise<SavedVideosResponse> => {
  const query = new URLSearchParams({ pageSize: '20' });
  if (cursor) query.set('cursor', cursor);
  return requestJson(
    `/api/videos?${query.toString()}`,
    { cache: 'no-store', headers: { Accept: 'application/json' }, ...(signal ? { signal } : {}) },
    savedVideosResponseSchema,
    invalidResponse,
  );
};

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
  });
};

export const savedVideoContentUrl = (videoId: string, versionId?: string): string =>
  versionId
    ? `/api/videos/${encodeURIComponent(videoId)}/versions/${encodeURIComponent(versionId)}/content`
    : `/api/videos/${encodeURIComponent(videoId)}/content`;

export const downloadSavedVideoUrl = (videoId: string): string =>
  `${savedVideoContentUrl(videoId)}?download=true`;

export const savedVideoThumbnailUrl = (videoId: string): string =>
  `/api/videos/${encodeURIComponent(videoId)}/thumbnail`;
