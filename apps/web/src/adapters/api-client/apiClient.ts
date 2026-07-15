import {
  apiErrorResponseSchema,
  capabilitiesResponseSchema,
  realtimeTokenResponseSchema,
} from '@studio/contracts';
import type { ModelMode, ProviderAvailability } from '../../application/types';

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

export const fetchProviderAvailability = async (
  signal?: AbortSignal,
): Promise<ProviderAvailability> => {
  const response = await fetch('/api/capabilities', {
    ...(signal ? { signal } : {}),
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw await readError(response);
  const parsed = capabilitiesResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiClientError('The capability response was invalid.', 502, 'invalid-response');
  }
  const payload = parsed.data;
  return {
    decart: payload.realtimeVideo.available,
    elevenLabs: payload.elevenLabs.available,
    elevenLabsModel: payload.elevenLabs.modelId ?? null,
  };
};

export const requestRealtimeToken = async (
  model: ModelMode,
  signal: AbortSignal,
): Promise<{ apiKey: string; expiresAt: string }> => {
  const response = await fetch('/api/realtime-token', {
    method: 'POST',
    signal,
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ model }),
  });
  if (!response.ok) throw await readError(response);
  const parsed = realtimeTokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiClientError('The realtime credential response was incomplete.', 502, 'bad-token');
  }
  return { apiKey: parsed.data.apiKey, expiresAt: parsed.data.expiresAt };
};

export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const response = await fetch(input, init);
  if (!response.ok) throw await readError(response);
  return response;
};
