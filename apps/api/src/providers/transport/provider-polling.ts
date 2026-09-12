export const parseRetryAfterMs = (
  value: string | null,
  maximumDelayMs: number,
  nowMs = Date.now(),
): number => {
  const normalized = value?.trim();
  if (!normalized) return 0;

  let delayMs: number;
  if (/^\d+$/u.test(normalized)) {
    delayMs = Number(normalized) * 1_000;
  } else {
    const retryAt = Date.parse(normalized);
    if (!Number.isFinite(retryAt)) return 0;
    delayMs = Math.max(0, retryAt - nowMs);
  }
  return Number.isSafeInteger(delayMs) || Number.isFinite(delayMs)
    ? Math.min(delayMs, maximumDelayMs)
    : maximumDelayMs;
};

export const nextProviderPollDelayMs = (
  currentDelayMs: number,
  maximumDelayMs: number,
  retryAfter: string | null = null,
  minimumBaseMs = 0,
): number =>
  Math.max(
    Math.min(Math.ceil(Math.max(currentDelayMs, minimumBaseMs) * 1.5), maximumDelayMs),
    parseRetryAfterMs(retryAfter, maximumDelayMs),
  );

/**
 * How many consecutive transient poll failures a provider absorbs before giving up.
 *
 * Shared because the answer is about an accepted submission, not about any one provider: once the
 * work is running upstream it has been paid for, so a 429 or a gateway blip must not be the thing
 * that abandons it.
 */
export const MAX_CONSECUTIVE_POLL_FAILURES = 3;
