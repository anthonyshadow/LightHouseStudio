import { capabilitiesResponseSchema, healthResponseSchema } from '@studio/contracts';
import type { FastifyInstance } from 'fastify';
import { SUPPORTED_MODEL_IDS } from '../../providers/decart/token-provider.js';

export interface CapabilityAvailability {
  readonly decartAvailable: boolean;
  readonly elevenLabsAvailable: boolean;
  readonly elevenLabsModelId: string;
  readonly referenceImagesAvailable: boolean;
}

export const registerSystemRoutes = (
  app: FastifyInstance,
  availability: CapabilityAvailability,
): void => {
  app.get('/api/health', () => healthResponseSchema.parse({ ok: true }));

  app.get('/api/capabilities', () =>
    capabilitiesResponseSchema.parse({
      realtimeVideo: {
        available: availability.decartAvailable,
        models: [...SUPPORTED_MODEL_IDS],
      },
      elevenLabs: {
        available: availability.elevenLabsAvailable,
        modelId: availability.elevenLabsAvailable ? availability.elevenLabsModelId : null,
      },
      referenceImages: {
        available: availability.referenceImagesAvailable,
        modelId: 'gpt-image-2',
        size: '1024x1024',
        quality: 'high',
      },
    }),
  );
};
