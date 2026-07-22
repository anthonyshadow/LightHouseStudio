import { AppError } from '../../http/app-error.js';
import type { ErrorTranslation, ErrorTranslator } from '../../http/errors.js';
import { VoiceServiceError } from './voice-service-error.js';

const translate = (error: VoiceServiceError, appError: AppError): ErrorTranslation => ({
  appError,
  diagnostic: { errorClass: 'VoiceServiceError', reason: error.reason },
});

export const translateVoiceServiceError: ErrorTranslator = (error) => {
  if (!(error instanceof VoiceServiceError)) return undefined;
  const options =
    error.upstreamStatus === undefined ? undefined : { upstreamStatus: error.upstreamStatus };
  switch (error.reason) {
    case 'configured-model-unavailable':
      return translate(
        error,
        new AppError(
          503,
          'feature_unavailable',
          'The configured ElevenLabs speech-to-speech model is not available to this workspace.',
        ),
      );
    case 'configured-model-incompatible':
      return translate(
        error,
        new AppError(
          503,
          'feature_unavailable',
          'The configured ElevenLabs model does not support speech-to-speech conversion.',
        ),
      );
    case 'voice-incompatible':
      return translate(
        error,
        new AppError(
          409,
          'incompatible_voice',
          'This professional voice cannot be used by the configured speech-to-speech model.',
        ),
      );
    case 'shared-voice-ineligible':
      return translate(
        error,
        new AppError(
          403,
          'provider_policy',
          'This public voice is not eligible for use by this Studio workflow.',
        ),
      );
    case 'shared-voice-not-found':
      return translate(
        error,
        new AppError(
          404,
          'not_found',
          'That public voice is no longer available. Refresh the library and choose another.',
        ),
      );
    case 'preview-unavailable':
      return translate(error, new AppError(404, 'not_found', 'This voice has no preview audio.'));
    case 'zero-retention-required':
      return translate(
        error,
        new AppError(
          502,
          'provider_policy',
          'ElevenLabs rejected the zero-retention conversion request. Verify enterprise eligibility, or deliberately enable provider logging after reviewing retention terms.',
          options,
        ),
      );
  }
};
