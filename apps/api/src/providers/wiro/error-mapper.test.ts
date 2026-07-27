import { describe, expect, it } from 'vitest';
import { ReferenceImageProviderError } from '../reference-images/reference-image-provider.js';
import { translateWiroError } from './error-mapper.js';

describe('translateWiroError', () => {
  it('maps Wiro errors without exposing provider payloads and retains safe diagnostics', () => {
    const translated = translateWiroError(
      new ReferenceImageProviderError('authentication', {
        providerId: 'wiro',
        upstreamStatus: 403,
        providerRequestId: 'task-safe-id',
        providerStage: 'polling',
        cause: new Error('private response payload'),
      }),
    );

    expect(translated).toMatchObject({
      appError: {
        statusCode: 502,
        code: 'provider_authentication',
        upstreamStatus: 403,
      },
      diagnostic: {
        errorClass: 'ReferenceImageProviderError',
        reason: 'authentication',
        providerId: 'wiro',
        providerRequestId: 'task-safe-id',
        providerStage: 'polling',
      },
    });
    expect(translated?.appError.message).not.toContain('private response payload');
  });

  it('does not claim another image provider failure', () => {
    expect(
      translateWiroError(new ReferenceImageProviderError('failure', { providerId: 'bfl' })),
    ).toBeUndefined();
  });
});
