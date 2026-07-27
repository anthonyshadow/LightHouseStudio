import { AppError } from '../../http/app-error.js';
import type { ErrorTranslation, ErrorTranslator } from '../../http/errors.js';
import { ReferenceImageProviderError } from '../reference-images/reference-image-provider.js';

const upstreamOptions = (
  upstreamStatus: number | undefined,
): { readonly upstreamStatus: number } | undefined =>
  upstreamStatus === undefined ? undefined : { upstreamStatus };

export const translateBflError: ErrorTranslator = (error) => {
  if (!(error instanceof ReferenceImageProviderError) || error.providerId !== 'bfl') {
    return undefined;
  }
  const options = upstreamOptions(error.upstreamStatus);
  const appError = (() => {
    switch (error.reason) {
      case 'aborted':
        return new AppError(499, 'request_aborted', 'The reference image request was cancelled.');
      case 'moderation':
        return new AppError(
          400,
          'moderation_blocked',
          'Black Forest Labs blocked the prompt, source image, or generated result under its safety checks. Try another source image or revise the character description.',
          options,
        );
      case 'rate-limit':
        return new AppError(
          429,
          'rate_limited',
          'Black Forest Labs is temporarily rate limiting image generation. Wait a moment, then generate again with a new request.',
          options,
        );
      case 'authentication':
        return new AppError(
          502,
          'provider_authentication',
          'Black Forest Labs rejected the configured server credential or model permission. Check BFL_API_KEY.',
          options,
        );
      case 'credits':
        return new AppError(
          502,
          'provider_failure',
          'The Black Forest Labs account has insufficient credits for reference image generation.',
          options,
        );
      case 'configuration':
        return new AppError(
          503,
          'provider_configuration',
          'Reference generation is unavailable until Black Forest Labs is configured on the server.',
          options,
        );
      case 'invalid-request':
        return new AppError(
          400,
          'validation_error',
          'Black Forest Labs rejected the reference image request or source image.',
          options,
        );
      case 'connection':
        return new AppError(
          502,
          'provider_failure',
          'The API server lost its connection to Black Forest Labs during reference image generation. Check the Recent Shelf, then verify server network, DNS, TLS, and proxy access before deliberately trying again.',
          options,
        );
      case 'timeout':
        return new AppError(
          504,
          'request_timeout',
          'Black Forest Labs image generation took too long. Check the Recent Shelf before deliberately trying again.',
          options,
        );
      case 'invalid-response':
        return new AppError(
          502,
          'invalid_provider_image',
          'Black Forest Labs returned no usable image. Generate again when the provider is available.',
          options,
        );
      case 'failure':
        return new AppError(
          502,
          'provider_failure',
          'Black Forest Labs could not complete reference image generation. Try again with a new request when ready.',
          options,
        );
    }
  })();
  return {
    appError,
    diagnostic: {
      errorClass: 'ReferenceImageProviderError',
      reason: error.reason,
      providerId: error.providerId,
      ...(error.providerRequestId === undefined
        ? {}
        : { providerRequestId: error.providerRequestId }),
      ...(error.providerStage === undefined ? {} : { providerStage: error.providerStage }),
    },
  } satisfies ErrorTranslation;
};
