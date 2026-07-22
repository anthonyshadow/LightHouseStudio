import { AppError } from '../../http/app-error.js';
import type { ErrorTranslation, ErrorTranslator } from '../../http/errors.js';
import { ReferenceImageStorageError } from './asset-store.js';
import { InvalidReferenceImageError } from './image-validation.js';
import { ReferenceImageGenerationStateError } from './reference-image-error.js';

const translation = (
  errorClass: string,
  appError: AppError,
  reason?: string,
): ErrorTranslation => ({
  appError,
  diagnostic: { errorClass, ...(reason === undefined ? {} : { reason }) },
});

export const translateReferenceImageError: ErrorTranslator = (error) => {
  if (error instanceof InvalidReferenceImageError) {
    return translation(
      'InvalidReferenceImageError',
      new AppError(
        502,
        'invalid_provider_image',
        'OpenAI returned an image that does not match the requested dimensions or supported JPEG, PNG, and WebP limits.',
      ),
    );
  }
  if (error instanceof ReferenceImageStorageError) {
    return translation(
      'ReferenceImageStorageError',
      new AppError(
        500,
        'storage_failure',
        'The generated image could not be saved to local storage. Check LIGHTFRAME_DATA_DIR and disk permissions.',
      ),
    );
  }
  if (!(error instanceof ReferenceImageGenerationStateError)) return undefined;

  const appError = (() => {
    switch (error.reason) {
      case 'edit-not-configured':
        return new AppError(
          503,
          'feature_unavailable',
          'Image-guided reference editing is unavailable from the configured provider.',
        );
      case 'generation-in-progress':
        return new AppError(
          409,
          'generation_in_progress',
          'Another reference image is still being created. Wait for it to finish before regenerating.',
        );
      case 'request-id-conflict':
        return new AppError(
          409,
          'request_id_conflict',
          'That request ID is already bound to different reference-image inputs. Start a new request.',
        );
      case 'source-asset-not-found':
        return new AppError(404, 'not_found', 'That local reference image is unavailable.');
      case 'provider-not-configured':
        return new AppError(
          503,
          'provider_configuration',
          'Reference generation is unavailable until OPENAI_API_KEY is configured on the server.',
        );
      case 'optimizer-not-configured':
        return new AppError(
          503,
          'provider_configuration',
          'Prompt optimization is unavailable until OPENAI_API_KEY is configured on the server.',
        );
      case 'stale-optimization':
        return new AppError(
          409,
          'validation_error',
          'The optimized prompt is stale for the current description, options, model, or optimizer version. Re-optimize before generating.',
        );
      case 'invalid-optimization':
        return new AppError(
          400,
          'validation_error',
          'The optimized prompt settings do not match the selected reference-image options.',
        );
    }
  })();
  return translation('ReferenceImageGenerationStateError', appError, error.reason);
};
