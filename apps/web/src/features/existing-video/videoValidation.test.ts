import { describe, expect, it } from 'vitest';
import { firstExistingVideoValidationIssue } from './videoValidation';

const resultFacts = (overrides: Record<string, unknown> = {}) => ({
  container: 'mp4' as const,
  videoCodec: 'avc',
  durationMs: 1_000,
  width: 1_024,
  height: 1_920,
  sizeBytes: 10_000,
  hasAudio: true,
  ...overrides,
});

describe('firstExistingVideoValidationIssue', () => {
  it('keeps the 16:9/9:16 aspect gate for immutable source files', () => {
    expect(firstExistingVideoValidationIssue(resultFacts(), false, 'source')).toMatchObject({
      code: 'unsupported-aspect-ratio',
    });
  });

  it('defers only result aspect to exact server-approved metadata comparison', () => {
    expect(
      firstExistingVideoValidationIssue(resultFacts(), false, 'server-approved-result'),
    ).toBeUndefined();
    expect(
      firstExistingVideoValidationIssue(
        resultFacts({ videoCodec: 'vp9' }),
        false,
        'server-approved-result',
      ),
    ).toMatchObject({ code: 'unsupported-codec' });
  });
});
