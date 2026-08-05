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
