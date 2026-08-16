import { apiErrorResponseSchema } from '@studio/contracts';

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

export type ApiErrorPayloadParser = (payload: unknown, status: number) => ApiClientError | null;

const readError = async (
  response: Response,
  parsePayload?: ApiErrorPayloadParser,
): Promise<ApiClientError> => {
  try {
    const value: unknown = await response.json();
    const specialized = parsePayload?.(value, response.status);
    if (specialized) return specialized;
    const payload = apiErrorResponseSchema.safeParse(value);
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

const fetchSameOrigin = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const response = await fetch(input, { credentials: 'same-origin', ...init });
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const pathname = new URL(url, window.location.origin).pathname;
  if (response.status === 401 && pathname !== '/api/auth/login') {
    window.dispatchEvent(new Event('lightframe:authentication-required'));
  }
  return response;
};

export const apiFetchAllowingStatuses = async (
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  allowedStatuses: readonly number[],
  parseErrorPayload?: ApiErrorPayloadParser,
): Promise<Response> => {
  const response = await fetchSameOrigin(input, init);
  if (!response.ok && !allowedStatuses.includes(response.status)) {
    throw await readError(response, parseErrorPayload);
  }
  return response;
};

export const apiFetch = async (
  input: RequestInfo | URL,
  init?: RequestInit,
  parseErrorPayload?: ApiErrorPayloadParser,
): Promise<Response> => apiFetchAllowingStatuses(input, init, [], parseErrorPayload);

export const invalidApiResponse = (message: string, code: string) => () =>
  new ApiClientError(message, 502, code);

/**
 * The safe, owner-facing message for a failed request. Only an `ApiClientError` carries a message
 * the transport has already vetted; anything else falls back to the caller's own copy.
 */
export const apiErrorMessage = (error: unknown, fallback: string): string =>
  error instanceof ApiClientError ? error.message : fallback;

/** Same-origin JSON transport with one error and runtime-validation contract. */
export const requestJson = async <T>(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  schema: JsonSchema<T>,
  invalidResponse: () => Error,
  parseErrorPayload?: ApiErrorPayloadParser,
): Promise<T> => {
  const response = await apiFetch(input, init, parseErrorPayload);
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
