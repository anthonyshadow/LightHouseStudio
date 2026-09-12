import { describe, expect, it } from 'vitest';
import { ReferenceImageProviderError } from '../reference-images/reference-image-provider.js';
import { translatePrunaImageTryOnError } from './image-try-on-error-mapper.js';

describe('translatePrunaImageTryOnError', () => {
  it('retains the upstream id and stage a failed try-on has to be reconciled against', () => {
    const translated = translatePrunaImageTryOnError(
      new ReferenceImageProviderError('failure', {
        providerId: 'pruna',
        upstreamStatus: 502,
        providerRequestId: 'prediction-safe-id',
        providerStage: 'polling',
        cause: new Error('private response payload'),
      }),
    );

    expect(translated).toMatchObject({
      appError: { statusCode: 502, code: 'provider_failure' },
      diagnostic: {
        errorClass: 'ReferenceImageProviderError',
        reason: 'failure',
        providerId: 'pruna',
        providerRequestId: 'prediction-safe-id',
        providerStage: 'polling',
      },
    });
    expect(translated?.appError.message).not.toContain('private response payload');
  });

  /**
   * Pinned because it is deliberate, not incidental: the shared reference-image profile answers
   * 502 `provider_authentication` here. Swapping Pruna onto that profile would change this, so it
   * has to be a decision rather than something a refactor quietly carries away.
   */
  it('answers a Pruna credential failure as a server configuration problem', () => {
    expect(
      translatePrunaImageTryOnError(
        new ReferenceImageProviderError('authentication', { providerId: 'pruna' }),
      ),
    ).toMatchObject({ appError: { statusCode: 503, code: 'provider_configuration' } });
  });

  it('does not claim another provider’s reference-image failure', () => {
    expect(
      translatePrunaImageTryOnError(
        new ReferenceImageProviderError('failure', { providerId: 'bfl' }),
      ),
    ).toBeUndefined();
  });
});
