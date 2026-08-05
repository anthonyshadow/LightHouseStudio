import {
  voiceChangerQuerySchema,
  voiceConversionContentTypeSchema,
  VOICE_CONVERSION_CONTENT_TYPES,
  VOICE_CONVERSION_MAX_BYTES,
  workspaceVoiceParamsSchema,
  workspaceVoicesQuerySchema,
  workspaceVoicesResponseSchema,
} from '@studio/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AudioStream } from '../../application/audio-stream.js';
import { isSpooledAudioUpload } from '../../application/spooled-upload.js';
import { AppError } from '../../http/errors.js';
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

const verifyProviderOrigin = (request: FastifyRequest): Promise<void> => {
  requireTrustedOrigin(request);
  requireVoiceProviderIntent(request);
  return Promise.resolve();
};

const verifyProviderIntent = (request: FastifyRequest): Promise<void> => {
  requireVoiceProviderIntent(request);
  return Promise.resolve();
};

const streamProviderAudio = async (
  request: FastifyRequest,
  reply: FastifyReply,
  load: (signal: AbortSignal) => Promise<AudioStream>,
): Promise<FastifyReply> => {
  const lifetime = createRequestLifetime(request, reply);
  try {
    const audio = await load(lifetime.signal);
    audio.body.once('close', () => lifetime.release());
    return sendAudioStream(reply, audio);
  } catch (error) {
    lifetime.release();
    throw error;
  }
};

const contentTypeEssence = (request: FastifyRequest): string =>
  request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase() ?? '';

export const registerVoiceRoutes = (app: FastifyInstance, service: VoiceService | null): void => {
  app.get('/api/elevenlabs/voices', { onRequest: verifyProviderIntent }, async (request, reply) => {
    const parsed = workspaceVoicesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw validationError('Use a search up to 100 characters and a page size from 1 to 10.');
    }

    return withRequestLifetime(request, reply, async (signal) =>
      workspaceVoicesResponseSchema.parse(
        await requireVoiceService(service).listWorkspaceVoices({
          search: parsed.data.search,
          pageSize: parsed.data.pageSize,
          nextPageToken: parsed.data.pageToken ?? null,
          signal,
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
        requireVoiceService(service).workspacePreview(parsed.data.voiceId, signal),
      );
    },
  );

  app.post(
    '/api/elevenlabs/voice-changer/recording',
    { bodyLimit: MAX_RECORDING_AUDIO_BYTES, onRequest: verifyProviderOrigin },
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
          });
        } finally {
          await upload.cleanup().catch(() => undefined);
        }
      });
    },
  );
};
