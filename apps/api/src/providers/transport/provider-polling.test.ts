import { describe, expect, it } from 'vitest';
import { nextProviderPollDelayMs, parseRetryAfterMs } from './provider-polling.js';

describe('provider polling helpers', () => {
  it('parses delta seconds and HTTP dates without exceeding the cap', () => {
    expect(parseRetryAfterMs('3', 5_000)).toBe(3_000);
    expect(parseRetryAfterMs('30', 5_000)).toBe(5_000);
    expect(
      parseRetryAfterMs('Wed, 05 Aug 2026 12:00:04 GMT', 5_000, Date.UTC(2026, 7, 5, 12)),
    ).toBe(4_000);
  });

  it('ignores malformed values and applies capped exponential delay', () => {
    expect(parseRetryAfterMs('3 seconds', 5_000)).toBe(0);
    expect(nextProviderPollDelayMs(2_000, 5_000, '4')).toBe(4_000);
    expect(nextProviderPollDelayMs(4_000, 5_000)).toBe(5_000);
  });
});
