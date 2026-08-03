import {
  capabilitiesResponseSchema,
  healthResponseSchema,
  REFERENCE_IMAGE_SIZES,
  SUPPORTED_MODEL_IDS,
} from '@studio/contracts';
import type { FastifyInstance } from 'fastify';
import type { ExistingVideoOperationBinding } from '../../providers/video-jobs/video-job-provider.js';

export interface CapabilityAvailability {
  readonly decartAvailable: boolean;
  readonly videoProcessing: {
    readonly characterSwap: ExistingVideoOperationBinding | null;
    readonly virtualTryOn: ExistingVideoOperationBinding | null;
  };
  readonly elevenLabsAvailable: boolean;
  readonly elevenLabsModelId: string;
  readonly referenceImagesAvailable: boolean;
  readonly referenceImageEditAvailable: boolean;
  readonly referenceImageProviderId: 'openai' | 'bfl' | 'wiro';
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
      videoProcessing: {
        characterSwap: {
          available: availability.videoProcessing.characterSwap !== null,
          inputPreparation: availability.videoProcessing.characterSwap?.inputPreparation ?? 'none',
          referencePolicy:
            availability.videoProcessing.characterSwap?.referencePolicy ?? 'optional',
          promptEnhancement: availability.videoProcessing.characterSwap?.promptEnhancement ?? false,
          terminalFailureRelease:
            availability.videoProcessing.characterSwap?.terminalFailureRelease ?? 'automatic',
        },
        virtualTryOn: {
          available: availability.videoProcessing.virtualTryOn !== null,
          inputPreparation: availability.videoProcessing.virtualTryOn?.inputPreparation ?? 'none',
          referencePolicy: availability.videoProcessing.virtualTryOn?.referencePolicy ?? 'optional',
          promptEnhancement: availability.videoProcessing.virtualTryOn?.promptEnhancement ?? false,
          terminalFailureRelease:
            availability.videoProcessing.virtualTryOn?.terminalFailureRelease ?? 'automatic',
        },
      },
      elevenLabs: {
        available: availability.elevenLabsAvailable,
        modelId: availability.elevenLabsAvailable ? availability.elevenLabsModelId : null,
      },
      referenceImages: {
        available: availability.referenceImagesAvailable,
        editAvailable: availability.referenceImageEditAvailable,
        providerId: availability.referenceImageProviderId,
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
