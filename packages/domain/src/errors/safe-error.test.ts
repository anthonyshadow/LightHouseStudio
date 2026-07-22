import { describe, expect, it } from 'vitest';
import { classifyBrowserError, createSafeError } from './safe-error';

describe('safe errors', () => {
  it('maps known browser names to actionable errors', () => {
    expect(
      classifyBrowserError(
        { name: 'NotAllowedError', message: 'raw device detail' },
        createSafeError('unknown', 'Safe fallback'),
      ),
    ).toMatchObject({
      code: 'camera-denied',
      retryable: true,
      recovery: 'Allow access in browser settings, then try again.',
    });
  });

  it('never forwards arbitrary error messages', () => {
    const fallback = createSafeError('unknown', 'Something went wrong.');
    expect(classifyBrowserError(new Error('api-key=secret'), fallback)).toBe(fallback);
    expect(
      JSON.stringify(classifyBrowserError(new Error('api-key=secret'), fallback)),
    ).not.toContain('secret');
  });
});
