import {
  importSharedVoiceRequestSchema,
  importSharedVoiceResponseSchema,
  sharedVoicePreviewParamsSchema,
  sharedVoicesQuerySchema,
  sharedVoicesResponseSchema,
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
import { AppError } from '../../http/errors.js';
import { requireTrustedOrigin } from '../../http/security.js';
import { createRequestLifetime, sendAudioStream } from '../../http/streaming.js';
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
  app.get('/api/elevenlabs/voices', async (request, reply) => {
    const parsed = workspaceVoicesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw validationError('Use a search up to 100 characters and a page size from 1 to 10.');
    }

    const lifetime = createRequestLifetime(request, reply);
    try {
      return workspaceVoicesResponseSchema.parse(
        await requireVoiceService(service).listWorkspaceVoices({
          search: parsed.data.search,
          pageSize: parsed.data.pageSize,
          nextPageToken: parsed.data.pageToken ?? null,
          signal: lifetime.signal,
        }),
      );
    } finally {
      lifetime.release();
    }
  });

  app.get('/api/elevenlabs/voices/:voiceId/preview', async (request, reply) => {
    const parsed = workspaceVoiceParamsSchema.safeParse(request.params);
    if (!parsed.success) throw validationError('Choose a valid workspace voice.');
    return streamProviderAudio(request, reply, (signal) =>
      requireVoiceService(service).workspacePreview(parsed.data.voiceId, signal),
    );
  });

  app.get('/api/elevenlabs/shared-voices', async (request, reply) => {
    const parsed = sharedVoicesQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      throw validationError(
        'Use a search up to 100 characters, a zero-based page, and a page size from 1 to 10.',
      );
    }

    const lifetime = createRequestLifetime(request, reply);
    try {
      return sharedVoicesResponseSchema.parse(
        await requireVoiceService(service).listSharedVoices({
          search: parsed.data.search,
          pageSize: parsed.data.pageSize,
          page: parsed.data.page,
          signal: lifetime.signal,
        }),
      );
    } finally {
      lifetime.release();
    }
  });

  app.get(
    '/api/elevenlabs/shared-voices/:publicOwnerId/:voiceId/preview',
    async (request, reply) => {
      const parsed = sharedVoicePreviewParamsSchema.safeParse(request.params);
      if (!parsed.success) throw validationError('Choose a valid public voice.');
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
    '/api/elevenlabs/shared-voices/import',
    { bodyLimit: 16 * 1024, onRequest: verifyProviderOrigin },
    async (request, reply) => {
      requireTrustedOrigin(request);
      const parsed = importSharedVoiceRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw validationError('Provide a name, public owner id, and public voice id.');
      }

      const lifetime = createRequestLifetime(request, reply);
      try {
        return importSharedVoiceResponseSchema.parse(
          await requireVoiceService(service).importSharedVoice(
            parsed.data.publicOwnerId,
            parsed.data.voiceId,
            parsed.data.name,
            lifetime.signal,
          ),
        );
      } finally {
        lifetime.release();
      }
    },
  );

  app.post(
    '/api/elevenlabs/voice-changer/recording',
    { bodyLimit: MAX_RECORDING_AUDIO_BYTES, onRequest: verifyProviderOrigin },
    async (request, reply) => {
      requireTrustedOrigin(request);
      const query = voiceChangerQuerySchema.safeParse(request.query);
      if (!query.success) throw validationError('Choose a valid workspace voice.');

      const mimeType = contentTypeEssence(request);
      const parsedContentType = voiceConversionContentTypeSchema.safeParse(mimeType);
      if (!parsedContentType.success) {
        throw new AppError(
          400,
          'unsupported_media_type',
          'Use WebM, MP4, Ogg, WAV, MPEG, or AAC audio.',
        );
      }
      if (!Buffer.isBuffer(request.body) || request.body.byteLength === 0) {
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

      return streamProviderAudio(request, reply, (signal) =>
        requireVoiceService(service).convertRecording({
          voiceId: query.data.voiceId,
          audio: request.body as Buffer,
          mimeType,
          signal,
        }),
      );
    },
  );
};
