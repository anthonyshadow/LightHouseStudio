import {
  capabilitiesResponseSchema,
  healthResponseSchema,
  REFERENCE_IMAGE_SIZES,
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
  readonly wardrobeAddOutfitAvailable: boolean;
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
      },
      videoProcessing: {
        characterSwap: {
          available: availability.videoProcessing.characterSwap !== null,
          inputPreparation: availability.videoProcessing.characterSwap?.inputPreparation ?? 'none',
          referencePolicy:
            availability.videoProcessing.characterSwap?.referencePolicy ?? 'optional',
          promptInput: availability.videoProcessing.characterSwap?.promptInput ?? 'editable',
          promptEnhancement: availability.videoProcessing.characterSwap?.promptEnhancement ?? false,
          terminalFailureRelease:
            availability.videoProcessing.characterSwap?.terminalFailureRelease ?? 'automatic',
          outputResolutions: availability.videoProcessing.characterSwap?.outputResolutions ?? [
            '720p',
          ],
        },
        virtualTryOn: {
          available: availability.videoProcessing.virtualTryOn !== null,
          inputPreparation: availability.videoProcessing.virtualTryOn?.inputPreparation ?? 'none',
          referencePolicy: availability.videoProcessing.virtualTryOn?.referencePolicy ?? 'optional',
          promptInput: availability.videoProcessing.virtualTryOn?.promptInput ?? 'editable',
          promptEnhancement: availability.videoProcessing.virtualTryOn?.promptEnhancement ?? false,
          terminalFailureRelease:
            availability.videoProcessing.virtualTryOn?.terminalFailureRelease ?? 'automatic',
          outputResolutions: availability.videoProcessing.virtualTryOn?.outputResolutions ?? [
            '720p',
          ],
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
        optimizer: {
          available: availability.promptOptimizerAvailable,
          model: availability.promptOptimizerModel,
          version: availability.promptOptimizerVersion,
        },
      },
      wardrobe: {
        addOutfitAvailable: availability.wardrobeAddOutfitAvailable,
      },
    }),
  );
};
