import type { ApiErrorCode } from '@studio/contracts';
import { AppError } from '../../http/app-error.js';
import type { ErrorTranslation, ErrorTranslator } from '../../http/errors.js';
import {
  ReferenceImageProviderError,
  type ReferenceImageProviderFailureReason,
  type ReferenceImageProviderId,
} from './reference-image-provider.js';

type ProfiledFailureReason = Exclude<ReferenceImageProviderFailureReason, 'aborted'>;

export interface ReferenceImageErrorProfile {
  readonly providerId: ReferenceImageProviderId;
  readonly messages: Readonly<Record<ProfiledFailureReason, string>>;
}

const errorDefinition = (
  reason: ReferenceImageProviderFailureReason,
): { readonly status: number; readonly code: ApiErrorCode } => {
  switch (reason) {
    case 'aborted':
      return { status: 499, code: 'request_aborted' };
    case 'moderation':
      return { status: 400, code: 'moderation_blocked' };
    case 'rate-limit':
      return { status: 429, code: 'rate_limited' };
    case 'authentication':
      return { status: 502, code: 'provider_authentication' };
    case 'credits':
    case 'connection':
    case 'failure':
      return { status: 502, code: 'provider_failure' };
    case 'configuration':
      return { status: 503, code: 'provider_configuration' };
    case 'invalid-request':
      return { status: 400, code: 'validation_error' };
    case 'timeout':
      return { status: 504, code: 'request_timeout' };
    case 'invalid-response':
      return { status: 502, code: 'invalid_provider_image' };
  }
};

export const translateReferenceImageProviderError = (
  error: unknown,
  profile: ReferenceImageErrorProfile,
): ErrorTranslation | undefined => {
  if (!(error instanceof ReferenceImageProviderError) || error.providerId !== profile.providerId) {
    return undefined;
  }
  const definition = errorDefinition(error.reason);
  const message =
    error.reason === 'aborted'
      ? 'The reference image request was cancelled.'
      : profile.messages[error.reason];
  const appError = new AppError(definition.status, definition.code, message, {
    ...(error.upstreamStatus === undefined ? {} : { upstreamStatus: error.upstreamStatus }),
  });

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

export const createReferenceImageErrorTranslator =
  (profile: ReferenceImageErrorProfile): ErrorTranslator =>
  (error) =>
    translateReferenceImageProviderError(error, profile);
