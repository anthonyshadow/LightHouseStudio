import {
  apiErrorResponseSchema,
  type ApiErrorCode,
  type ApiErrorResponse,
} from '@studio/contracts';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { VoiceServiceError } from '../features/voices/voice-service-error.js';
import {
  InvalidReferenceImageError,
  ReferenceImageGenerationStateError,
  ReferenceImageStorageError,
} from '../features/reference-images/reference-image-service.js';
import { ReferenceImageProviderError } from '../providers/openai/reference-image-provider.js';
import { CharacterPromptOptimizerError } from '../providers/openai/character-prompt-optimizer.js';
import { ProviderError } from '../providers/provider-error.js';

export type ApiErrorBody = ApiErrorResponse;

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly upstreamStatus?: number;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    options?: { readonly upstreamStatus?: number; readonly cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    if (options?.upstreamStatus !== undefined) this.upstreamStatus = options.upstreamStatus;
  }
}

const errorBody = (code: ApiErrorCode, message: string, upstreamStatus?: number): ApiErrorBody =>
  apiErrorResponseSchema.parse({
    error: { code, message, ...(upstreamStatus === undefined ? {} : { upstreamStatus }) },
  });

const mapProviderError = (error: ProviderError): AppError => {
  if (error.reason === 'aborted') {
    return new AppError(499, 'request_aborted', 'The request was cancelled.');
  }

  if (error.reason === 'timeout') {
    return new AppError(
      504,
      'request_timeout',
      error.operation === 'token'
        ? 'The realtime provider took too long to issue a temporary credential. Try again.'
        : 'The voice provider took too long to respond. Try again.',
    );
  }

  if (error.reason === 'quota') {
    return new AppError(
      429,
      'provider_quota',
      'ElevenLabs has no remaining workspace quota or credits for this action. Review usage, then retry.',
      error.upstreamStatus === undefined ? undefined : { upstreamStatus: error.upstreamStatus },
    );
  }

  if (error.reason === 'rate-limit') {
    return new AppError(
      429,
      'rate_limited',
      'ElevenLabs is temporarily rate limiting requests. Wait a moment and try again.',
      error.upstreamStatus === undefined ? undefined : { upstreamStatus: error.upstreamStatus },
    );
  }

  if (error.operation === 'conversion' && error.reason === 'invalid-audio') {
    return new AppError(
      400,
      'invalid_audio',
      'ElevenLabs could not read this audio. Record a new take or choose another supported format.',
      error.upstreamStatus === undefined ? undefined : { upstreamStatus: error.upstreamStatus },
    );
  }

  if (error.reason === 'feature-unavailable' || error.reason === 'zero-retention-unavailable') {
    return new AppError(
      502,
      'provider_policy',
      'ElevenLabs does not make this provider feature available to the configured workspace.',
      error.upstreamStatus === undefined ? undefined : { upstreamStatus: error.upstreamStatus },
    );
  }

  const status =
    error.upstreamStatus !== undefined && error.upstreamStatus >= 400 && error.upstreamStatus <= 599
      ? error.upstreamStatus
      : undefined;
  const withUpstreamStatus = status === undefined ? {} : { upstreamStatus: status };

  if (error.operation === 'token') {
    return new AppError(
      502,
      'provider_failure',
      'A temporary realtime credential could not be issued. Check the Decart configuration and try again.',
      withUpstreamStatus,
    );
  }

  if (status === 401) {
    return new AppError(
      502,
      'provider_authentication',
      'ElevenLabs rejected the configured server credential. Check the integration key.',
      withUpstreamStatus,
    );
  }
  if (status === 402) {
    return new AppError(
      402,
      'provider_billing',
      'ElevenLabs could not complete this action because the workspace plan or credits need attention.',
      withUpstreamStatus,
    );
  }
  if (status === 403) {
    return new AppError(
      502,
      'provider_policy',
      'ElevenLabs did not permit this action for the configured workspace or voice.',
      withUpstreamStatus,
    );
  }
  if (status === 404) {
    return new AppError(
      404,
      'not_found',
      'That voice is no longer available. Refresh the voice list and choose another.',
      withUpstreamStatus,
    );
  }
  if (status === 409) {
    return new AppError(
      409,
      'incompatible_voice',
      'That voice is already present or cannot be imported in its current state.',
      withUpstreamStatus,
    );
  }
  if (status === 429) {
    return new AppError(
      429,
      'rate_limited',
      'ElevenLabs is temporarily rate limiting requests. Wait a moment and try again.',
      withUpstreamStatus,
    );
  }
  if (error.operation === 'conversion' && (status === 400 || status === 415 || status === 422)) {
    return new AppError(
      400,
      'invalid_audio',
      'ElevenLabs could not read this audio. Record a new take or choose another supported format.',
      withUpstreamStatus,
    );
  }

  return new AppError(
    502,
    'provider_failure',
    'ElevenLabs could not complete the request. Try again shortly.',
    withUpstreamStatus,
  );
};

const mapVoiceServiceError = (error: VoiceServiceError): AppError => {
  const options =
    error.upstreamStatus === undefined ? undefined : { upstreamStatus: error.upstreamStatus };
  switch (error.reason) {
    case 'configured-model-unavailable':
      return new AppError(
        503,
        'feature_unavailable',
        'The configured ElevenLabs speech-to-speech model is not available to this workspace.',
      );
    case 'configured-model-incompatible':
      return new AppError(
        503,
        'feature_unavailable',
        'The configured ElevenLabs model does not support speech-to-speech conversion.',
      );
    case 'voice-incompatible':
      return new AppError(
        409,
        'incompatible_voice',
        'This professional voice cannot be used by the configured speech-to-speech model.',
      );
    case 'shared-voice-ineligible':
      return new AppError(
        403,
        'provider_policy',
        'This public voice is not eligible for use by this Studio workflow.',
      );
    case 'shared-voice-not-found':
      return new AppError(
        404,
        'not_found',
        'That public voice is no longer available. Refresh the library and choose another.',
      );
    case 'preview-unavailable':
      return new AppError(404, 'not_found', 'This voice has no preview audio.');
    case 'zero-retention-required':
      return new AppError(
        502,
        'provider_policy',
        'ElevenLabs rejected the zero-retention conversion request. Verify enterprise eligibility, or deliberately enable provider logging after reviewing retention terms.',
        options,
      );
  }
};

const providerStatusOptions = (
  upstreamStatus: number | undefined,
): { readonly upstreamStatus: number } | undefined =>
  upstreamStatus === undefined ? undefined : { upstreamStatus };

const mapReferenceImageProviderError = (error: ReferenceImageProviderError): AppError => {
  const options = providerStatusOptions(error.upstreamStatus);
  switch (error.reason) {
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
};

const mapCharacterPromptOptimizerError = (error: CharacterPromptOptimizerError): AppError => {
  const options = providerStatusOptions(error.upstreamStatus);
  switch (error.reason) {
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
};

const mapReferenceImageGenerationStateError = (
  error: ReferenceImageGenerationStateError,
): AppError => {
  switch (error.reason) {
    case 'generation-in-progress':
      return new AppError(
        409,
        'generation_in_progress',
        'Another reference image is still being created. Wait for it to finish before regenerating.',
      );
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
};

const isFastifyError = (error: unknown): error is FastifyError =>
  error instanceof Error && 'code' in error && typeof error.code === 'string';

const normalizeFastifyError = (error: FastifyError): AppError | undefined => {
  if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
    return new AppError(413, 'payload_too_large', 'The request body exceeds the allowed size.');
  }
  if (error.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
    return new AppError(
      400,
      'unsupported_media_type',
      'Use a supported audio recording format such as WebM, MP4, Ogg, WAV, MPEG, or AAC.',
    );
  }
  if (error.code.startsWith('FST_ERR_CTP_') || error.statusCode === 400) {
    return new AppError(400, 'bad_request', 'The request body is not valid.');
  }
  return undefined;
};

export const installErrorHandling = (
  app: FastifyInstance,
  options: { readonly serveSpa?: boolean } = {},
): void => {
  app.setNotFoundHandler(async (request, reply) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (
      options.serveSpa === true &&
      request.method === 'GET' &&
      pathname !== '/api' &&
      !pathname.startsWith('/api/') &&
      request.headers.accept?.includes('text/html') === true
    ) {
      await reply.sendFile('index.html');
      return;
    }
    await reply.status(404).send(errorBody('not_found', 'No API route matches this request.'));
  });

  app.setErrorHandler(
    async (error: Error, _request: FastifyRequest, reply: FastifyReply): Promise<void> => {
      const normalized =
        error instanceof AppError
          ? error
          : error instanceof VoiceServiceError
            ? mapVoiceServiceError(error)
            : error instanceof ReferenceImageGenerationStateError
              ? mapReferenceImageGenerationStateError(error)
              : error instanceof CharacterPromptOptimizerError
                ? mapCharacterPromptOptimizerError(error)
                : error instanceof ReferenceImageProviderError
                  ? mapReferenceImageProviderError(error)
                  : error instanceof InvalidReferenceImageError
                    ? new AppError(
                        502,
                        'invalid_provider_image',
                        'OpenAI returned an image that does not match the requested dimensions or supported JPEG, PNG, and WebP limits.',
                      )
                    : error instanceof ReferenceImageStorageError
                      ? new AppError(
                          500,
                          'storage_failure',
                          'The generated image could not be saved to local storage. Check LIGHTFRAME_DATA_DIR and disk permissions.',
                        )
                      : error instanceof ProviderError
                        ? mapProviderError(error)
                        : isFastifyError(error)
                          ? normalizeFastifyError(error)
                          : undefined;

      const safeError =
        normalized ??
        new AppError(500, 'provider_failure', 'The server could not complete the request.');

      await reply
        .status(safeError.statusCode)
        .send(errorBody(safeError.code, safeError.message, safeError.upstreamStatus));
    },
  );
};
