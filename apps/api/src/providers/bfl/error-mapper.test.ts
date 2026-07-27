import { describe, expect, it } from 'vitest';
import { ReferenceImageProviderError } from '../reference-images/reference-image-provider.js';
import { translateBflError } from './error-mapper.js';

describe('translateBflError', () => {
  it('maps BFL errors without exposing provider payloads and retains safe diagnostics', () => {
    const translated = translateBflError(
      new ReferenceImageProviderError('credits', {
        providerId: 'bfl',
        upstreamStatus: 402,
        providerRequestId: 'task-safe-id',
        providerStage: 'polling',
        cause: new Error('private response payload'),
      }),
    );

    expect(translated).toMatchObject({
      appError: {
        statusCode: 502,
        code: 'provider_failure',
        upstreamStatus: 402,
      },
      diagnostic: {
        errorClass: 'ReferenceImageProviderError',
        reason: 'credits',
        providerId: 'bfl',
        providerRequestId: 'task-safe-id',
        providerStage: 'polling',
      },
    });
    expect(translated?.appError.message).not.toContain('private response payload');
  });

  it('does not claim OpenAI image or optimizer failures', () => {
    expect(
      translateBflError(new ReferenceImageProviderError('failure', { providerId: 'openai' })),
    ).toBeUndefined();
  });
});
