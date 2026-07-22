import { describe, expect, it } from 'vitest';
import { toSafeMediaError } from './errors';

describe('toSafeMediaError', () => {
  it.each([
    ['NotAllowedError', 'camera-denied'],
    ['SecurityError', 'permission-denied'],
    ['NotFoundError', 'device-missing'],
    ['DevicesNotFoundError', 'device-missing'],
    ['NotReadableError', 'device-busy'],
    ['TrackStartError', 'device-busy'],
    ['OverconstrainedError', 'media-unavailable'],
    ['AbortError', 'aborted'],
  ] as const)('uses the domain classification for %s', (name, code) => {
    expect(
      toSafeMediaError({ name, message: 'private browser detail' }, 'Safe fallback'),
    ).toMatchObject({ code });
  });

  it('uses feature copy without forwarding an arbitrary message', () => {
    const result = toSafeMediaError(new Error('api-key=secret'), 'Camera could not be started.');

    expect(result).toEqual({ code: 'unknown', message: 'Camera could not be started.' });
    expect(JSON.stringify(result)).not.toContain('secret');
  });
});
