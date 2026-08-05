import { describe, expect, it } from 'vitest';
import { videoJobFailureReasonForHttpStatus } from './video-job-provider.js';

describe('videoJobFailureReasonForHttpStatus', () => {
  it.each([
    [400, 'rejected'],
    [401, 'authentication'],
    [402, 'billing'],
    [403, 'policy'],
    [409, 'rejected'],
    [415, 'rejected'],
    [422, 'rejected'],
    [429, 'quota'],
    [500, 'upstream'],
  ] as const)('maps HTTP %i to %s', (status, expected) => {
    expect(videoJobFailureReasonForHttpStatus(status)).toBe(expected);
  });
});
