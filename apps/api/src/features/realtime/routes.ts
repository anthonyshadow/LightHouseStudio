import {
  realtimeTokenRequestSchema,
  realtimeTokenResponseSchema,
  SUPPORTED_MODEL_IDS,
} from '@studio/contracts';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from '../../http/errors.js';
import { requireTrustedOrigin } from '../../http/security.js';
import { createRequestLifetime } from '../../http/streaming.js';
import type { DecartTokenProvider } from '../../providers/decart/token-provider.js';

const TOKEN_EXPIRY_SECONDS = 300;
const ADVANCED_MAX_SESSION_DURATION_SECONDS = 300;
const GUIDED_MAX_SESSION_DURATION_SECONDS = 420;

const verifyProviderOrigin = (request: FastifyRequest): Promise<void> => {
  requireTrustedOrigin(request);
  return Promise.resolve();
};

export const registerRealtimeRoutes = (
  app: FastifyInstance,
  provider: DecartTokenProvider | null,
): void => {
  app.post(
    '/api/realtime-token',
    { bodyLimit: 16 * 1024, onRequest: verifyProviderOrigin },
    async (request, reply) => {
      const parsed = realtimeTokenRequestSchema.safeParse(request.body);
      if (!parsed.success) {
        throw new AppError(
          400,
          'validation_error',
          `Choose a supported realtime model: ${SUPPORTED_MODEL_IDS.join(' or ')}.`,
        );
      }
      if (provider === null) {
        throw new AppError(
          503,
          'feature_unavailable',
          'Realtime AI video is unavailable until DECART_API_KEY is configured on the server.',
        );
      }

      const origin = requireTrustedOrigin(request);
      const maxSessionDurationSeconds =
        parsed.data.sessionProfile === 'guided'
          ? GUIDED_MAX_SESSION_DURATION_SECONDS
          : ADVANCED_MAX_SESSION_DURATION_SECONDS;
      const lifetime = createRequestLifetime(request, reply);
      try {
        const token = await provider.createToken({
          model: parsed.data.model,
          origin,
          expiresInSeconds: TOKEN_EXPIRY_SECONDS,
          maxSessionDurationSeconds,
          signal: lifetime.signal,
        });
        return realtimeTokenResponseSchema.parse({
          apiKey: token.apiKey,
          expiresAt: token.expiresAt,
          constraints: {
            model: parsed.data.model,
            maxSessionDurationSeconds,
            applicationOrigin: origin,
          },
        });
      } finally {
        lifetime.release();
      }
    },
  );
};
