import { APIConnectionError, APIConnectionTimeoutError, APIUserAbortError } from 'openai';

export type OpenAITransportFailureReason =
  'aborted' | 'authentication' | 'connection' | 'rate-limit' | 'timeout';

export interface OpenAITransportFailure {
  readonly reason: OpenAITransportFailureReason;
  readonly upstreamStatus?: number;
  readonly cause: Error;
}

type OpenAIError = Error & { readonly status?: number };

const asOpenAIError = (error: unknown): OpenAIError | undefined =>
  error instanceof Error ? error : undefined;

/**
 * Classifies only transport-level failures shared by OpenAI operations.
 * Moderation, refusal, parsing, and invalid payload semantics stay with the
 * provider adapter that owns the operation.
 */
export const classifyOpenAITransportFailure = (
  error: unknown,
  signal?: AbortSignal,
): OpenAITransportFailure | undefined => {
  const openAIError = asOpenAIError(error);
  if (openAIError === undefined) return undefined;

  const upstreamStatus = typeof openAIError.status === 'number' ? openAIError.status : undefined;
  const failure = (reason: OpenAITransportFailureReason): OpenAITransportFailure => ({
    reason,
    cause: openAIError,
    ...(upstreamStatus === undefined ? {} : { upstreamStatus }),
  });

  if (
    signal?.aborted === true ||
    openAIError instanceof APIUserAbortError ||
    openAIError.name === 'AbortError'
  ) {
    return failure('aborted');
  }
  if (openAIError instanceof APIConnectionTimeoutError) return failure('timeout');
  if (openAIError instanceof APIConnectionError) return failure('connection');
  if (upstreamStatus === 401) return failure('authentication');
  if (upstreamStatus === 429) return failure('rate-limit');
  return undefined;
};

export const openAIUpstreamStatus = (error: unknown): number | undefined => {
  const openAIError = asOpenAIError(error);
  return typeof openAIError?.status === 'number' ? openAIError.status : undefined;
};
