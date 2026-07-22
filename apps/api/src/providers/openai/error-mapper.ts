import { AppError } from '../../http/app-error.js';
import type { ErrorTranslation, ErrorTranslator } from '../../http/errors.js';
import {
  CharacterPromptOptimizerError,
  type CharacterPromptOptimizerFailureReason,
} from './character-prompt-optimizer.js';
import {
  ReferenceImageProviderError,
  type ReferenceImageProviderFailureReason,
} from './reference-image-provider.js';

const upstreamOptions = (
  upstreamStatus: number | undefined,
): { readonly upstreamStatus: number } | undefined =>
  upstreamStatus === undefined ? undefined : { upstreamStatus };

const translation = (errorClass: string, reason: string, appError: AppError): ErrorTranslation => ({
  appError,
  diagnostic: { errorClass, reason },
});

const mapReferenceImageError = (
  error: ReferenceImageProviderError,
  reason: ReferenceImageProviderFailureReason,
): ErrorTranslation => {
  const options = upstreamOptions(error.upstreamStatus);
  const appError = (() => {
    switch (reason) {
      case 'aborted':
        return new AppError(499, 'request_aborted', 'The reference image request was cancelled.');
      case 'moderation':
        return new AppError(
          400,
          'moderation_blocked',
          'OpenAI could not generate this reference under its safety checks. Revise the character description and try again.',
          options,
        );
      case 'rate-limit':
        return new AppError(
          429,
          'rate_limited',
          'OpenAI is temporarily rate limiting image generation. Wait a moment, then generate again with a new request.',
          options,
        );
      case 'authentication':
        return new AppError(
          502,
          'provider_authentication',
          'OpenAI rejected the configured server credential. Check OPENAI_API_KEY.',
          options,
        );
      case 'configuration':
        return new AppError(
          503,
          'provider_configuration',
          'Reference generation is unavailable until OpenAI is configured on the server.',
          options,
        );
      case 'connection':
        return new AppError(
          502,
          'provider_failure',
          'The API server lost its connection to OpenAI during reference image generation. Check the Recent Shelf, then verify server network, DNS, TLS, and proxy access before deliberately trying again.',
          options,
        );
      case 'timeout':
        return new AppError(
          504,
          'request_timeout',
          'OpenAI image generation took too long. Check the Recent Shelf before deliberately trying again.',
          options,
        );
      case 'invalid-response':
        return new AppError(
          502,
          'invalid_provider_image',
          'OpenAI returned no usable image. Generate again when the provider is available.',
          options,
        );
      case 'failure':
        return new AppError(
          502,
          'provider_failure',
          'OpenAI could not complete reference image generation. Try again with a new request when ready.',
          options,
        );
    }
  })();
  return translation('ReferenceImageProviderError', reason, appError);
};

const mapPromptOptimizerError = (
  error: CharacterPromptOptimizerError,
  reason: CharacterPromptOptimizerFailureReason,
): ErrorTranslation => {
  const options = upstreamOptions(error.upstreamStatus);
  const appError = (() => {
    switch (reason) {
      case 'aborted':
        return new AppError(
          499,
          'request_aborted',
          'The prompt optimization request was cancelled.',
        );
      case 'refusal':
        return new AppError(
          400,
          'moderation_blocked',
          'OpenAI could not optimize this character description under its safety checks. Revise it and retry.',
          options,
        );
      case 'rate-limit':
        return new AppError(
          429,
          'rate_limited',
          'OpenAI is temporarily rate limiting prompt optimization. Wait a moment, then retry.',
          options,
        );
      case 'authentication':
        return new AppError(
          502,
          'provider_authentication',
          'OpenAI rejected the configured server credential. Check OPENAI_API_KEY.',
          options,
        );
      case 'connection':
        return new AppError(
          502,
          'provider_failure',
          'The API server could not reach OpenAI for prompt optimization. Verify server network, DNS, TLS, and proxy access, then retry the optimization.',
          options,
        );
      case 'timeout':
        return new AppError(
          504,
          'request_timeout',
          'OpenAI prompt optimization took too long. Retry before generating the image.',
          options,
        );
      case 'invalid-response':
        return new AppError(
          502,
          'provider_failure',
          'OpenAI returned an invalid structured prompt optimization. Retry the optimization.',
          options,
        );
      case 'failure':
        return new AppError(
          502,
          'provider_failure',
          'OpenAI could not optimize the character prompt. Retry when the provider is available.',
          options,
        );
    }
  })();
  return translation('CharacterPromptOptimizerError', reason, appError);
};

export const translateOpenAIError: ErrorTranslator = (error) => {
  if (error instanceof ReferenceImageProviderError) {
    return mapReferenceImageError(error, error.reason);
  }
  if (error instanceof CharacterPromptOptimizerError) {
    return mapPromptOptimizerError(error, error.reason);
  }
  return undefined;
};
