import {
  VIDEO_PROVIDER_INTENT_HEADER,
  VIDEO_PROVIDER_INTENT_VALUE,
  VIDEO_RESULT_MAX_BYTES,
  videoJobStatusResponseSchema,
  type VideoJobStatusResponse,
  type VideoTransformRecipe,
} from '@studio/contracts';
import { ApiClientError, apiFetch } from './apiClient';

const jobUrl = (jobId: string): string => `/api/video-jobs/${encodeURIComponent(jobId)}`;
const intentHeaders = {
  [VIDEO_PROVIDER_INTENT_HEADER]: VIDEO_PROVIDER_INTENT_VALUE,
  Accept: 'application/json',
};

const parseStatus = async (response: Response): Promise<VideoJobStatusResponse> => {
  const parsed = videoJobStatusResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiClientError('The video job response was invalid.', 502, 'invalid-response');
  }
  return parsed.data;
};

export const submitVideoJob = async (
  jobId: string,
  recipe: VideoTransformRecipe,
  video: Blob,
  referenceImage: File | null,
  signal: AbortSignal,
): Promise<VideoJobStatusResponse> => {
  const form = new FormData();
  form.append('request', JSON.stringify(recipe));
  form.append('data', video, video.type.includes('webm') ? 'input.webm' : 'input.mp4');
  if (referenceImage) {
    const extension = referenceImage.type === 'image/png' ? 'png' : 'jpg';
    form.append('reference_image', referenceImage, `reference.${extension}`);
  }
  return parseStatus(
    await apiFetch(jobUrl(jobId), {
      method: 'PUT',
      headers: intentHeaders,
      body: form,
      signal,
    }),
  );
};

export const fetchVideoJob = async (
  jobId: string,
  signal: AbortSignal,
): Promise<VideoJobStatusResponse> =>
  parseStatus(
    await apiFetch(jobUrl(jobId), {
      headers: intentHeaders,
      cache: 'no-store',
      signal,
    }),
  );

export const downloadVideoJobResult = async (jobId: string, signal: AbortSignal): Promise<Blob> => {
  const response = await apiFetch(`${jobUrl(jobId)}/content`, {
    headers: { [VIDEO_PROVIDER_INTENT_HEADER]: VIDEO_PROVIDER_INTENT_VALUE },
    cache: 'no-store',
    signal,
  });
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > VIDEO_RESULT_MAX_BYTES) {
    throw new ApiClientError(
      'The visual result exceeded the app-owned 300 MB safety limit.',
      502,
      'result_too_large',
    );
  }
  const blob = await response.blob();
  if (!blob.size || blob.size > VIDEO_RESULT_MAX_BYTES) {
    throw new ApiClientError(
      blob.size ? 'The visual result was too large.' : 'The visual result was empty.',
      502,
      blob.size ? 'result_too_large' : 'result_invalid',
    );
  }
  return blob;
};

export const releaseVideoJob = async (jobId: string, signal?: AbortSignal): Promise<void> => {
  await apiFetch(jobUrl(jobId), {
    method: 'DELETE',
    headers: intentHeaders,
    ...(signal ? { signal } : {}),
  });
};
