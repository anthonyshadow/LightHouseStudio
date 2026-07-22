import {
  apiErrorResponseSchema,
  capabilitiesResponseSchema,
  createReferenceImageResponseSchema,
  editReferenceImageResponseSchema,
  optimizeCharacterReferencePromptResponseSchema,
  referenceImageMetadataResponseSchema,
  realtimeTokenResponseSchema,
  REFERENCE_IMAGE_MAX_BYTES,
  type CreateReferenceImageRequest,
  type EditReferenceImageRequest,
  type OptimizeCharacterReferencePromptRequest,
  type OptimizeCharacterReferencePromptResponse,
  type ReferenceImageAsset,
  type RealtimeSessionProfile,
} from '@studio/contracts';
import type { ModelMode, ProviderAvailability } from '../../application/types';
import { validateReferenceImage } from '../../features/media-session/imageValidation';

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
  const response = await fetch(input, init);
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
    elevenLabs: payload.elevenLabs.available,
    elevenLabsModel: payload.elevenLabs.modelId ?? null,
    referenceImages: payload.referenceImages.available,
    referenceImageEditAvailable: payload.referenceImages.editAvailable,
    referenceImageModel: payload.referenceImages.modelId,
    referenceImageSizes: payload.referenceImages.sizes,
    referenceImageOptimizerAvailable: payload.referenceImages.optimizer.available,
    referenceImageOptimizerModel: payload.referenceImages.optimizer.model,
    referenceImageOptimizerVersion: payload.referenceImages.optimizer.version,
  };
};

export const referenceImageContentUrl = (assetId: string): string =>
  `/api/reference-images/${encodeURIComponent(assetId)}/content`;

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

export type PersistedReferenceImage = {
  kind: 'persisted';
  assetId: string;
  file: File;
  contentUrl: string;
};

const extensionForMime = (mimeType: ReferenceImageAsset['mimeType']): string => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
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

  const response = await fetch(contentUrl, {
    cache: 'no-store',
    ...(signal ? { signal } : {}),
    headers: { Accept: metadata.mimeType },
  });
  if (!response.ok) throw await readError(response);
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (contentType !== metadata.mimeType) {
    throw new ApiClientError(
      'The stored reference had an unexpected media type.',
      502,
      'invalid_provider_image',
    );
  }
  const blob = await response.blob();
  if (
    blob.type !== metadata.mimeType ||
    blob.size !== metadata.byteSize ||
    blob.size <= 0 ||
    blob.size >= REFERENCE_IMAGE_MAX_BYTES
  ) {
    throw new ApiClientError(
      'The stored reference failed integrity checks.',
      502,
      'invalid_provider_image',
    );
  }
  const file = new File([blob], `reference-${assetId}.${extensionForMime(metadata.mimeType)}`, {
    type: metadata.mimeType,
    lastModified: Date.parse(metadata.createdAt),
  });
  const validation = await validateReferenceImage(file, 'lucy-2.5');
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
  sessionProfile?: RealtimeSessionProfile,
): Promise<{ apiKey: string; expiresAt: string }> => {
  const payload = await requestJson(
    '/api/realtime-token',
    {
      method: 'POST',
      signal,
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ model, ...(sessionProfile ? { sessionProfile } : {}) }),
    },
    realtimeTokenResponseSchema,
    invalidApiResponse('The realtime credential response was incomplete.', 'bad-token'),
  );
  return { apiKey: payload.apiKey, expiresAt: payload.expiresAt };
};
