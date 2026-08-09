import {
  sharedVoiceParamsSchema,
  sharedVoicesQuerySchema,
  sharedVoicesResponseSchema,
  voiceChangerQuerySchema,
  voiceConversionContentTypeSchema,
  voiceLibraryMutationResponseSchema,
  VOICE_CONVERSION_CONTENT_TYPES,
  VOICE_CONVERSION_MAX_BYTES,
  workspaceVoiceParamsSchema,
  workspaceVoicesQuerySchema,
  workspaceVoicesResponseSchema,
} from '@studio/contracts';
import type {
  ApplicationRuntime,
  HttpReply,
  HttpRequest,
} from '../../application/application-runtime.js';
import type { AudioStream } from '../../application/audio-stream.js';
import { isSpooledAudioUpload } from '../../application/spooled-upload.js';
import { AppError } from '../../http/errors.js';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import { requireTrustedOrigin, requireVoiceProviderIntent } from '../../http/security.js';
import {
  createRequestLifetime,
  sendAudioStream,
  withRequestLifetime,
} from '../../http/streaming.js';
import type { VoiceService } from './voice-service.js';

export const MAX_RECORDING_AUDIO_BYTES = VOICE_CONVERSION_MAX_BYTES;
export const SUPPORTED_AUDIO_CONTENT_TYPES = VOICE_CONVERSION_CONTENT_TYPES;

const requireVoiceService = (service: VoiceService | null): VoiceService => {
  if (service === null) {
    throw new AppError(
      503,
      'feature_unavailable',
      'ElevenLabs voice effects are unavailable until ELEVENLABS_API_KEY is configured on the server.',
    );
  }
  return service;
};

const validationError = (message: string): AppError =>
  new AppError(400, 'validation_error', message);

const verifyProviderOrigin = (request: HttpRequest): Promise<void> => {
  requireTrustedOrigin(request);
  requireVoiceProviderIntent(request);
  return Promise.resolve();
};

const verifyProviderIntent = (request: HttpRequest): Promise<void> => {
  requireVoiceProviderIntent(request);
  return Promise.resolve();
};

const streamProviderAudio = async (
  request: HttpRequest,
  reply: HttpReply,
  load: (signal: AbortSignal) => Promise<AudioStream>,
): Promise<HttpReply> => {
  const lifetime = createRequestLifetime(request, reply);
  try {
    const audio = await load(lifetime.signal);
    return sendAudioStream(reply, audio, {
      signal: lifetime.signal,
      onComplete: () => lifetime.release(),
      onCancel: (reason) => {
        lifetime.abort(reason);
        lifetime.release();
      },
      onError: (error) => {
        lifetime.abort(error);
        lifetime.release();
      },
    });
  } catch (error) {
    lifetime.release();
    throw error;
  }
};

const contentTypeEssence = (request: HttpRequest): string =>
  request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() ?? '';

export const registerVoiceRoutes = (
  app: ApplicationRuntime,
  service: VoiceService | null,
): void => {
  app.get('/api/elevenlabs/voices', { onRequest: verifyProviderIntent }, async (request, reply) => {
    const parsed = workspaceVoicesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw validationError('Use valid voice filters and a page size from 1 to 20.');
    }

    return withRequestLifetime(request, reply, async (signal) =>
      workspaceVoicesResponseSchema.parse(
        await requireVoiceService(service).listWorkspaceVoices({
          search: parsed.data.search,
          language: parsed.data.language,
          gender: parsed.data.gender,
          age: parsed.data.age,
          accent: parsed.data.accent,
          useCase: parsed.data.useCase,
          descriptive: parsed.data.descriptive,
          pageSize: parsed.data.pageSize,
          nextPageToken: parsed.data.pageToken ?? null,
          refresh: parsed.data.refresh,
          signal,
          ownerUserId: ownerUserIdForRequest(request),
        }),
      ),
    );
  });

  app.get(
    '/api/elevenlabs/voices/:voiceId/preview',
    { onRequest: verifyProviderIntent },
    async (request, reply) => {
      const parsed = workspaceVoiceParamsSchema.safeParse(request.params);
      if (!parsed.success) throw validationError('Choose a valid saved-library voice.');
      return streamProviderAudio(request, reply, (signal) =>
        requireVoiceService(service).workspacePreview(
          parsed.data.voiceId,
          signal,
          ownerUserIdForRequest(request),
        ),
      );
    },
  );

  app.get(
    '/api/elevenlabs/shared-voices',
    { onRequest: verifyProviderIntent },
    async (request, reply) => {
      const parsed = sharedVoicesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw validationError('Use valid voice filters, sort, page, and a page size from 1 to 20.');
      }

      return withRequestLifetime(request, reply, async (signal) =>
        sharedVoicesResponseSchema.parse(
          await requireVoiceService(service).listSharedVoices({
            ...parsed.data,
            signal,
            ownerUserId: ownerUserIdForRequest(request),
          }),
        ),
      );
    },
  );

  app.get(
    '/api/elevenlabs/shared-voices/:publicOwnerId/:voiceId/preview',
    { onRequest: verifyProviderIntent },
    async (request, reply) => {
      const parsed = sharedVoiceParamsSchema.safeParse(request.params);
      if (!parsed.success) throw validationError('Choose a valid catalog voice.');
      return streamProviderAudio(request, reply, (signal) =>
        requireVoiceService(service).sharedPreview(
          parsed.data.publicOwnerId,
          parsed.data.voiceId,
          signal,
        ),
      );
    },
  );

  app.post(
    '/api/elevenlabs/shared-voices/:publicOwnerId/:voiceId/save',
    { onRequest: verifyProviderOrigin },
    async (request, reply) => {
      const parsed = sharedVoiceParamsSchema.safeParse(request.params);
      if (!parsed.success) throw validationError('Choose a valid catalog voice.');
      return withRequestLifetime(request, reply, async (signal) =>
        voiceLibraryMutationResponseSchema.parse(
          await requireVoiceService(service).saveSharedVoice(
            parsed.data.publicOwnerId,
            parsed.data.voiceId,
            signal,
            ownerUserIdForRequest(request),
          ),
        ),
      );
    },
  );

  app.delete(
    '/api/elevenlabs/voices/:voiceId',
    { onRequest: verifyProviderOrigin },
    async (request, reply) => {
      const parsed = workspaceVoiceParamsSchema.safeParse(request.params);
      if (!parsed.success) throw validationError('Choose a valid saved-library voice.');
      return withRequestLifetime(request, reply, async (signal) =>
        voiceLibraryMutationResponseSchema.parse(
          await requireVoiceService(service).removeWorkspaceVoice(
            parsed.data.voiceId,
            signal,
            ownerUserIdForRequest(request),
          ),
        ),
      );
    },
  );

  app.post(
    '/api/elevenlabs/voice-changer/recording',
    {
      bodyLimit: MAX_RECORDING_AUDIO_BYTES,
      bodyParser: 'spooled',
      acceptedContentTypes: SUPPORTED_AUDIO_CONTENT_TYPES,
      unsupportedMediaType: {
        statusCode: 400,
        message: 'Use WebM, MP4, Ogg, WAV, MPEG, or AAC audio.',
      },
      payloadTooLargeMessage: 'The audio sidecar must be 25 MiB or smaller.',
      onRequest: verifyProviderOrigin,
    },
    async (request, reply) => {
      const query = voiceChangerQuerySchema.safeParse(request.query);
      if (!query.success) throw validationError('Choose a valid saved-library voice.');

      const mimeType = contentTypeEssence(request);
      const parsedContentType = voiceConversionContentTypeSchema.safeParse(mimeType);
      if (!parsedContentType.success) {
        throw new AppError(
          400,
          'unsupported_media_type',
          'Use WebM, MP4, Ogg, WAV, MPEG, or AAC audio.',
        );
      }
      if (!isSpooledAudioUpload(request.body) || request.body.byteLength === 0) {
        throw new AppError(
          400,
          'invalid_audio',
          'The completed recording has no audio to convert.',
        );
      }
      if (request.body.byteLength > MAX_RECORDING_AUDIO_BYTES) {
        throw new AppError(
          413,
          'payload_too_large',
          'The audio sidecar must be 25 MiB or smaller.',
        );
      }

      const upload = request.body;
      return streamProviderAudio(request, reply, async (signal) => {
        try {
          return await requireVoiceService(service).convertRecording({
            voiceId: query.data.voiceId,
            audio: { path: upload.path, byteLength: upload.byteLength },
            mimeType: parsedContentType.data,
            signal,
            ownerUserId: ownerUserIdForRequest(request),
          });
        } finally {
          await upload.cleanup().catch(() => undefined);
        }
      });
    },
  );
};
