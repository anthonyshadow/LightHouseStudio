import {
  capabilitiesResponseSchema,
  healthResponseSchema,
  REFERENCE_IMAGE_SIZES,
  SUPPORTED_MODEL_IDS,
} from '@studio/contracts';
import type { FastifyInstance } from 'fastify';

export interface CapabilityAvailability {
  readonly decartAvailable: boolean;
  readonly elevenLabsAvailable: boolean;
  readonly elevenLabsModelId: string;
  readonly referenceImagesAvailable: boolean;
  readonly referenceImageEditAvailable: boolean;
  readonly referenceImageModelId: string;
  readonly referenceImageQuality: 'high' | 'medium';
  readonly promptOptimizerAvailable: boolean;
  readonly promptOptimizerModel: string;
  readonly promptOptimizerVersion: string;
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
        editAvailable: availability.referenceImageEditAvailable,
        modelId: availability.referenceImageModelId,
        sizes: [...REFERENCE_IMAGE_SIZES],
        quality: availability.referenceImageQuality,
        optimizer: {
          available: availability.promptOptimizerAvailable,
          model: availability.promptOptimizerModel,
          version: availability.promptOptimizerVersion,
        },
      },
    }),
  );
};
