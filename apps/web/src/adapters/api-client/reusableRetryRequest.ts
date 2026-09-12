import { ApiClientError } from './transport';

export interface ReusableRetryRequest {
  readonly fingerprint: string;
  readonly requestId: string;
}

/**
 * Whether a failed paid request may be retried under the same request id.
 *
 * Reusing the id is what makes a retry safe when the result may already be stored: the server
 * recognises the replay instead of generating — and paying — a second time. It is the wrong move
 * once the server has answered `submission_unresolved`, which says that id already reached the
 * provider and never settled. Repeating it can only be refused, so the next attempt needs a fresh
 * id, and the operator is then knowingly choosing to generate a second image.
 *
 * Both the Character Builder preview and the wardrobe try-on reuse ids this way, so the rule lives
 * here rather than in each hook.
 */
export const reusableRetryRequest = (
  error: unknown,
  fingerprint: string | null,
  requestId: string | null,
): ReusableRetryRequest | null => {
  if (error instanceof ApiClientError && error.code === 'submission_unresolved') return null;
  return fingerprint && requestId ? { fingerprint, requestId } : null;
};
