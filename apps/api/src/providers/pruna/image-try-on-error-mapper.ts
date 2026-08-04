import { AppError } from '../../http/app-error.js';
import type { ErrorTranslation, ErrorTranslator } from '../../http/errors.js';
import { ReferenceImageProviderError } from '../reference-images/reference-image-provider.js';

const translate = (error: ReferenceImageProviderError): ErrorTranslation => {
  const options =
    error.upstreamStatus === undefined ? undefined : { upstreamStatus: error.upstreamStatus };
  const appError = (() => {
    switch (error.reason) {
      case 'aborted':
        return new AppError(499, 'request_aborted', 'The outfit generation request was cancelled.');
      case 'moderation':
        return new AppError(
          400,
          'moderation_blocked',
          'The outfit could not be generated from these images.',
          options,
        );
      case 'invalid-request':
        return new AppError(
          400,
          'validation_error',
          'The outfit service rejected one of the selected images.',
          options,
        );
      case 'rate-limit':
        return new AppError(
          429,
          'rate_limited',
          'Outfit generation is temporarily busy. Wait before deliberately trying again.',
          options,
        );
      case 'timeout':
        return new AppError(
          504,
          'request_timeout',
          'Outfit generation took too long. Check the wardrobe before deliberately trying again.',
          options,
        );
      case 'authentication':
      case 'configuration':
        return new AppError(
          503,
          'provider_configuration',
          'Add Outfit is unavailable until its server configuration is corrected.',
          options,
        );
      case 'credits':
        return new AppError(
          502,
          'provider_failure',
          'The configured outfit service account is unavailable for billing.',
          options,
        );
      case 'invalid-response':
        return new AppError(
          502,
          'invalid_provider_image',
          'The outfit service returned no usable image.',
          options,
        );
      case 'connection':
      case 'failure':
        return new AppError(
          502,
          'provider_failure',
          'The outfit service could not complete generation. Try again deliberately when it is available.',
          options,
        );
    }
  })();
  return {
    appError,
    diagnostic: { errorClass: 'ReferenceImageProviderError', reason: error.reason },
  };
};

export const translatePrunaImageTryOnError: ErrorTranslator = (error) =>
  error instanceof ReferenceImageProviderError && error.providerId === 'pruna'
    ? translate(error)
    : undefined;
