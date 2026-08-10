import {
  apiErrorResponseSchema,
  capabilitiesResponseSchema,
  composeReferenceImageResponseSchema,
  createReferenceImageResponseSchema,
  editReferenceImageResponseSchema,
  optimizeCharacterReferencePromptResponseSchema,
  outfitTryOnResponseSchema,
  referenceImageMetadataResponseSchema,
  realtimeTokenResponseSchema,
  REFERENCE_IMAGE_IMPORT_INTENT_HEADER,
  REFERENCE_IMAGE_IMPORT_INTENT_VALUE,
  REFERENCE_IMAGE_MAX_BYTES,
  REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
  uploadReferenceImageResponseSchema,
  WARDROBE_PROVIDER_INTENT_HEADER,
  WARDROBE_PROVIDER_INTENT_VALUE,
  type ComposeReferenceImageRequest,
  type CreateReferenceImageRequest,
  type EditReferenceImageRequest,
  type OptimizeCharacterReferencePromptRequest,
  type OptimizeCharacterReferencePromptResponse,
  type ReferenceImageAsset,
  type DerivedReferenceImageAsset,
} from '@studio/contracts';
import { imageFileExtension, isImageMimeType } from '@studio/domain';
import type { ModelMode, ProviderAvailability } from '../../application/types';
import { validateReferenceImage } from '../browser-media/imageValidation';
import { referenceImageContentUrl } from './referenceImageRoutes';
import { readBoundedBlob } from './readBoundedBlob';

export { referenceImageContentUrl } from './referenceImageRoutes';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code = 'api-error') {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

const readError = async (response: Response): Promise<ApiClientError> => {
  try {
    const payload = apiErrorResponseSchema.safeParse(await response.json());
    return new ApiClientError(
      payload.success ? payload.data.error.message : 'The request could not be completed.',
      response.status,
      payload.success ? payload.data.error.code : 'api-error',
    );
  } catch {
    return new ApiClientError('The request could not be completed.', response.status);
  }
};

type JsonSchema<T> = {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
};

export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const response = await fetch(input, { credentials: 'same-origin', ...init });
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const pathname = new URL(url, window.location.origin).pathname;
  if (response.status === 401 && pathname !== '/api/auth/login') {
    window.dispatchEvent(new Event('lightframe:authentication-required'));
  }
  if (!response.ok) throw await readError(response);
  return response;
};

const invalidApiResponse = (message: string, code: string) => () =>
  new ApiClientError(message, 502, code);

/** Same-origin JSON transport with one error and runtime-validation contract. */
export const requestJson = async <T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  schema: JsonSchema<T>,
  invalidResponse: () => Error,
): Promise<T> => {
  const response = await apiFetch(input, init);
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw invalidResponse();
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw invalidResponse();
  return parsed.data;
};

export const fetchProviderAvailability = async (
  signal?: AbortSignal,
): Promise<ProviderAvailability> => {
  const payload = await requestJson(
    '/api/capabilities',
    {
      ...(signal ? { signal } : {}),
      headers: { Accept: 'application/json' },
    },
    capabilitiesResponseSchema,
    invalidApiResponse('The capability response was invalid.', 'invalid-response'),
  );
  return {
    decart: payload.realtimeVideo.available,
    videoProcessing: payload.videoProcessing,
    elevenLabs: payload.elevenLabs.available,
    elevenLabsModel: payload.elevenLabs.modelId ?? null,
    referenceImages: payload.referenceImages.available,
    referenceImageEditAvailable: payload.referenceImages.editAvailable,
    referenceImageProvider: payload.referenceImages.providerId,
    referenceImageModel: payload.referenceImages.modelId,
    referenceImageSizes: payload.referenceImages.sizes,
    referenceImageOptimizerAvailable: payload.referenceImages.optimizer.available,
    referenceImageOptimizerModel: payload.referenceImages.optimizer.model,
    referenceImageOptimizerVersion: payload.referenceImages.optimizer.version,
    wardrobeAddOutfitAvailable: payload.wardrobe.addOutfitAvailable,
    directSavedVideoUploadAvailable: payload.savedVideos.directMultipartUpload,
  };
};

export const createReferenceImage = async (
  request: CreateReferenceImageRequest,
  signal?: AbortSignal,
): Promise<ReferenceImageAsset> => {
  const payload = await requestJson(
    '/api/reference-images',
    {
      method: 'POST',
      cache: 'no-store',
      ...(signal ? { signal } : {}),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    },
    createReferenceImageResponseSchema,
    invalidApiResponse('The generated reference response was invalid.', 'invalid_provider_image'),
  );
  return payload.asset;
};

export const editReferenceImage = async (
  sourceAssetId: string,
  request: EditReferenceImageRequest,
  signal?: AbortSignal,
): Promise<ReferenceImageAsset> => {
  const payload = await requestJson(
    `/api/reference-images/${encodeURIComponent(sourceAssetId)}/edits`,
    {
      method: 'POST',
      cache: 'no-store',
      ...(signal ? { signal } : {}),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    },
    editReferenceImageResponseSchema,
    invalidApiResponse('The edited reference response was invalid.', 'invalid_provider_image'),
  );
  return payload.asset;
};

export const composeReferenceImage = async (
  sourceAssetId: string,
  request: ComposeReferenceImageRequest,
  signal?: AbortSignal,
): Promise<ReferenceImageAsset> => {
  const payload = await requestJson(
    `/api/reference-images/${encodeURIComponent(sourceAssetId)}/compositions`,
    {
      method: 'POST',
      cache: 'no-store',
      ...(signal ? { signal } : {}),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    },
    composeReferenceImageResponseSchema,
    invalidApiResponse('The composed reference response was invalid.', 'invalid_provider_image'),
  );
  return payload.asset;
};

export const uploadReferenceImage = async (
  file: File,
  requestId: string,
  signal?: AbortSignal,
): Promise<ReferenceImageAsset> => {
  const payload = await requestJson(
    '/api/reference-images/uploads',
    {
      method: 'POST',
      cache: 'no-store',
      ...(signal ? { signal } : {}),
      headers: {
        'Content-Type': file.type,
        Accept: 'application/json',
        'Idempotency-Key': requestId,
      },
      body: file,
    },
    uploadReferenceImageResponseSchema,
    invalidApiResponse('The uploaded reference response was invalid.', 'invalid_image_upload'),
  );
  return payload.asset;
};

export const createOutfitTryOn = async (
  sourceAssetId: string,
  garmentAssetId: string,
  requestId: string,
  signal?: AbortSignal,
): Promise<DerivedReferenceImageAsset> => {
  const payload = await requestJson(
    `/api/reference-images/${encodeURIComponent(sourceAssetId)}/outfit-try-ons`,
    {
      method: 'POST',
      cache: 'no-store',
      ...(signal ? { signal } : {}),
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        [WARDROBE_PROVIDER_INTENT_HEADER]: WARDROBE_PROVIDER_INTENT_VALUE,
      },
      body: JSON.stringify({ requestId, garmentAssetId }),
    },
    outfitTryOnResponseSchema,
    invalidApiResponse('The wardrobe result was invalid.', 'invalid_provider_image'),
  );
  return payload.asset;
};

export const importRemoteReferenceImage = async (
  url: string,
  signal?: AbortSignal,
): Promise<File> => {
  const response = await apiFetch('/api/reference-images/import', {
    method: 'POST',
    cache: 'no-store',
    ...(signal ? { signal } : {}),
    headers: {
      'Content-Type': 'application/json',
      Accept: 'image/jpeg, image/png, image/webp',
      [REFERENCE_IMAGE_IMPORT_INTENT_HEADER]: REFERENCE_IMAGE_IMPORT_INTENT_VALUE,
    },
    body: JSON.stringify({ url }),
  });
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (!contentType || !isImageMimeType(contentType)) {
    void response.body?.cancel().catch(() => undefined);
    throw new ApiClientError(
      'The imported image response was invalid.',
      502,
      'invalid_remote_image',
    );
  }
  const importError = () =>
    new ApiClientError('The imported image response was invalid.', 502, 'invalid_remote_image');
  const blob = await readBoundedBlob(response, {
    maximumBytes: REFERENCE_IMAGE_UPLOAD_MAX_BYTES,
    signal: signal ?? new AbortController().signal,
    acceptsContentType: (candidate) => candidate === contentType,
    createError: importError,
    abortMessage: 'Remote image import was cancelled.',
  });
  const disposition = response.headers.get('content-disposition');
  const responseName = /filename="([a-zA-Z0-9._-]+)"/u.exec(disposition ?? '')?.[1];
  return new File(
    [blob],
    responseName ??
      `imported-reference-${crypto.randomUUID().slice(0, 8)}.${imageFileExtension(contentType)}`,
    { type: contentType },
  );
};

export const optimizeCharacterReferencePrompt = async (
  request: OptimizeCharacterReferencePromptRequest,
  signal: AbortSignal,
): Promise<OptimizeCharacterReferencePromptResponse> => {
  return requestJson(
    '/api/reference-images/optimize',
    {
      method: 'POST',
      cache: 'no-store',
      signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    },
    optimizeCharacterReferencePromptResponseSchema,
    invalidApiResponse(
      'The optimized character prompt response was invalid.',
      'invalid-optimizer-response',
    ),
  );
};

export const fetchReferenceImageMetadata = async (
  assetId: string,
  signal?: AbortSignal,
): Promise<ReferenceImageAsset> => {
  const payload = await requestJson(
    `/api/reference-images/${encodeURIComponent(assetId)}`,
    {
      cache: 'no-store',
      ...(signal ? { signal } : {}),
      headers: { Accept: 'application/json' },
    },
    referenceImageMetadataResponseSchema,
    invalidApiResponse('The reference metadata was invalid.', 'invalid_provider_image'),
  );
  if (payload.assetId !== assetId) {
    throw new ApiClientError('The reference metadata was invalid.', 502, 'invalid_provider_image');
  }
  return payload;
};

export const discardReferenceImage = async (assetId: string): Promise<void> => {
  await apiFetch(`/api/reference-images/${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: '{}',
  });
};

export type PersistedReferenceImage = {
  kind: 'persisted';
  assetId: string;
  file: File;
  contentUrl: string;
};

/** Hydrates and browser-validates an immutable local asset before session state is changed. */
export const hydrateReferenceImage = async (
  assetId: string,
  knownMetadata?: ReferenceImageAsset,
  signal?: AbortSignal,
): Promise<PersistedReferenceImage> => {
  const metadata = knownMetadata ?? (await fetchReferenceImageMetadata(assetId, signal));
  const contentUrl = referenceImageContentUrl(assetId);
  if (metadata.assetId !== assetId || metadata.contentUrl !== contentUrl) {
    throw new ApiClientError(
      'The requested reference did not match the stored asset.',
      409,
      'invalid_provider_image',
    );
  }

  const response = await apiFetch(contentUrl, {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
    headers: { Accept: metadata.mimeType },
  });
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (contentType !== metadata.mimeType) {
    throw new ApiClientError(
      'The stored reference had an unexpected media type.',
      502,
      'invalid_provider_image',
    );
  }
  const maximumBytes =
    metadata.source === 'generated'
      ? REFERENCE_IMAGE_MAX_BYTES - 1
      : REFERENCE_IMAGE_UPLOAD_MAX_BYTES;
  const blob = await readBoundedBlob(response, {
    maximumBytes,
    signal: signal ?? new AbortController().signal,
    acceptsContentType: (candidate) => candidate === metadata.mimeType,
    createError: () =>
      new ApiClientError(
        'The stored reference failed integrity checks.',
        502,
        'invalid_provider_image',
      ),
    abortMessage: 'Reference image hydration was cancelled.',
  });
  if (
    blob.type !== metadata.mimeType ||
    blob.size !== metadata.byteSize ||
    blob.size <= 0 ||
    blob.size > maximumBytes
  ) {
    throw new ApiClientError(
      'The stored reference failed integrity checks.',
      502,
      'invalid_provider_image',
    );
  }
  const file = new File([blob], `reference-${assetId}.${imageFileExtension(metadata.mimeType)}`, {
    type: metadata.mimeType,
    lastModified: Date.parse(metadata.createdAt),
  });
  const validation = await validateReferenceImage(file, 'lucy-latest');
  if (
    validation.blockingError ||
    validation.width !== metadata.width ||
    validation.height !== metadata.height
  ) {
    throw new ApiClientError(
      validation.blockingError ?? 'The stored reference dimensions did not match its metadata.',
      502,
      'invalid_provider_image',
    );
  }
  return { kind: 'persisted', assetId, file, contentUrl };
};

export const requestRealtimeToken = async (
  model: ModelMode,
  signal: AbortSignal,
): Promise<{
  apiKey: string;
  expiresAt: string;
  maxSessionDurationSeconds: number;
}> => {
  const payload = await requestJson(
    '/api/realtime-token',
    {
      method: 'POST',
      signal,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ model }),
    },
    realtimeTokenResponseSchema,
    invalidApiResponse('The realtime credential response was incomplete.', 'bad-token'),
  );
  if (!payload.constraints || payload.constraints.model !== model) {
    throw new ApiClientError('The realtime credential response was incomplete.', 502, 'bad-token');
  }
  return {
    apiKey: payload.apiKey,
    expiresAt: payload.expiresAt,
    maxSessionDurationSeconds: payload.constraints.maxSessionDurationSeconds,
  };
};
