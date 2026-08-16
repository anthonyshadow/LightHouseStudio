import {
  VIDEO_PROVIDER_INTENT_HEADER,
  VIDEO_PROVIDER_INTENT_VALUE,
  VIDEO_RESULT_MAX_BYTES,
  videoJobQueueResponseSchema,
  videoJobStatusResponseSchema,
  type VideoJobQueueResponse,
  type VideoJobStatusResponse,
  type VideoTransformRecipe,
} from '@studio/contracts';
import { ApiClientError, apiFetch, requestJson } from './apiClient';
import { readBoundedBlob } from './readBoundedBlob';

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
    const extension =
      referenceImage.type === 'image/png'
        ? 'png'
        : referenceImage.type === 'image/webp'
          ? 'webp'
          : 'jpg';
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
  return readBoundedBlob(response, {
    maximumBytes: VIDEO_RESULT_MAX_BYTES,
    signal,
    acceptsContentType: (contentType) => contentType.startsWith('video/'),
    createError: (failure) =>
      new ApiClientError(
        failure === 'too-large'
          ? 'The visual result exceeded the app-owned 300 MB safety limit.'
          : 'The visual result was empty or invalid.',
        502,
        failure === 'too-large' ? 'result_too_large' : 'result_invalid',
      ),
    abortMessage: 'Visual result download was cancelled.',
  });
};

export const releaseVideoJob = async (jobId: string, signal?: AbortSignal): Promise<void> => {
  await apiFetch(jobUrl(jobId), {
    method: 'DELETE',
    headers: intentHeaders,
    ...(signal ? { signal } : {}),
  });
};

export const listActiveVideoJobs = (signal?: AbortSignal): Promise<VideoJobQueueResponse> =>
  requestJson(
    '/api/video-jobs',
    {
      headers: intentHeaders,
      cache: 'no-store',
      ...(signal ? { signal } : {}),
    },
    videoJobQueueResponseSchema,
    () =>
      new ApiClientError(
        'The video processing queue response was invalid.',
        502,
        'invalid-response',
      ),
  );

export const abandonVideoJob = async (jobId: string, signal?: AbortSignal): Promise<void> => {
  await apiFetch(`${jobUrl(jobId)}/abandon`, {
    method: 'POST',
    headers: { ...intentHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ acknowledgeProviderMayContinue: true }),
    ...(signal ? { signal } : {}),
  });
};
