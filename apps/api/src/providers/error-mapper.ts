import { AppError } from '../http/app-error.js';
import type { ErrorTranslation, ErrorTranslator } from '../http/errors.js';
import { ProviderError } from './provider-error.js';

const translate = (error: ProviderError, appError: AppError): ErrorTranslation => ({
  appError,
  diagnostic: { errorClass: 'ProviderError', reason: error.reason },
});

const upstreamOptions = (
  upstreamStatus: number | undefined,
): { readonly upstreamStatus: number } | undefined =>
  upstreamStatus === undefined ? undefined : { upstreamStatus };

export const translateProviderError: ErrorTranslator = (error) => {
  if (!(error instanceof ProviderError)) return undefined;

  if (error.reason === 'aborted') {
    return translate(error, new AppError(499, 'request_aborted', 'The request was cancelled.'));
  }

  if (error.reason === 'timeout') {
    return translate(
      error,
      new AppError(
        504,
        'request_timeout',
        error.operation === 'token'
          ? 'The realtime provider took too long to issue a temporary credential. Try again.'
          : 'The voice provider took too long to respond. Try again.',
      ),
    );
  }

  if (error.reason === 'quota') {
    return translate(
      error,
      new AppError(
        429,
        'provider_quota',
        'ElevenLabs has no remaining workspace quota or credits for this action. Review usage, then retry.',
        upstreamOptions(error.upstreamStatus),
      ),
    );
  }

  if (error.reason === 'rate-limit') {
    return translate(
      error,
      new AppError(
        429,
        'rate_limited',
        'ElevenLabs is temporarily rate limiting requests. Wait a moment and try again.',
        upstreamOptions(error.upstreamStatus),
      ),
    );
  }

  if (error.operation === 'conversion' && error.reason === 'invalid-audio') {
    return translate(
      error,
      new AppError(
        400,
        'invalid_audio',
        'ElevenLabs could not read this audio. Record a new take or choose another supported format.',
        upstreamOptions(error.upstreamStatus),
      ),
    );
  }

  if (error.reason === 'feature-unavailable' || error.reason === 'zero-retention-unavailable') {
    return translate(
      error,
      new AppError(
        502,
        'provider_policy',
        'ElevenLabs does not make this provider feature available to the configured workspace.',
        upstreamOptions(error.upstreamStatus),
      ),
    );
  }

  const status =
    error.upstreamStatus !== undefined && error.upstreamStatus >= 400 && error.upstreamStatus <= 599
      ? error.upstreamStatus
      : undefined;
  const options = upstreamOptions(status);

  if (error.operation === 'token') {
    return translate(
      error,
      new AppError(
        502,
        'provider_failure',
        'A temporary realtime credential could not be issued. Check the Decart configuration and try again.',
        options,
      ),
    );
  }

  const byStatus = (() => {
    switch (status) {
      case 401:
        return new AppError(
          502,
          'provider_authentication',
          'ElevenLabs rejected the configured server credential. Check the integration key.',
          options,
        );
      case 402:
        return new AppError(
          402,
          'provider_billing',
          'ElevenLabs could not complete this action because the workspace plan or credits need attention.',
          options,
        );
      case 403:
        return new AppError(
          502,
          'provider_policy',
          'ElevenLabs did not permit this action for the configured workspace or voice.',
          options,
        );
      case 404:
        return new AppError(
          404,
          'not_found',
          'That voice is no longer available. Refresh the voice list and choose another.',
          options,
        );
      case 409:
        return new AppError(
          409,
          'incompatible_voice',
          'That voice is already present or cannot be imported in its current state.',
          options,
        );
      case 429:
        return new AppError(
          429,
          'rate_limited',
          'ElevenLabs is temporarily rate limiting requests. Wait a moment and try again.',
          options,
        );
      default:
        return undefined;
    }
  })();
  if (byStatus !== undefined) return translate(error, byStatus);

  if (error.operation === 'conversion' && (status === 400 || status === 415 || status === 422)) {
    return translate(
      error,
      new AppError(
        400,
        'invalid_audio',
        'ElevenLabs could not read this audio. Record a new take or choose another supported format.',
        options,
      ),
    );
  }

  return translate(
    error,
    new AppError(
      502,
      'provider_failure',
      'ElevenLabs could not complete the request. Try again shortly.',
      options,
    ),
  );
};
