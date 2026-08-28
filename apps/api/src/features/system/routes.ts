import {
  capabilitiesResponseSchema,
  healthResponseSchema,
  REFERENCE_IMAGE_SIZES,
  type MediaPersistence,
  type VideoCharacterSwapProviderId,
} from '@studio/contracts';
import type { ApplicationRuntime } from '../../application/application-runtime.js';
import type { ExistingVideoOperationBinding } from '../../providers/video-jobs/video-job-provider.js';

export interface CapabilityAvailability {
  readonly decartAvailable: boolean;
  readonly realtimeVideoBetaEnabled: boolean;
  readonly videoProcessing: {
    readonly characterSwap: Readonly<
      Partial<Record<VideoCharacterSwapProviderId, ExistingVideoOperationBinding>>
    >;
    readonly defaultCharacterSwapProvider: VideoCharacterSwapProviderId;
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
  readonly directSavedVideoUploadAvailable: boolean;
  readonly creativeLibraryCloudMirrorAvailable: boolean;
  readonly mediaPersistence: MediaPersistence;
}

export const registerSystemRoutes = (
  app: ApplicationRuntime,
  availability: CapabilityAvailability,
): void => {
  const characterSwapProviders = Object.entries(availability.videoProcessing.characterSwap).map(
    ([providerId, binding]) => ({
      providerId: providerId as VideoCharacterSwapProviderId,
      inputPreparation: binding.inputPreparation,
      referencePolicy: binding.referencePolicy,
      promptInput: binding.promptInput,
      promptEnhancement: binding.promptEnhancement,
      terminalFailureRelease: binding.terminalFailureRelease ?? 'automatic',
      outputResolutions: [...binding.outputResolutions],
    }),
  );
  const defaultCharacterSwapProvider =
    characterSwapProviders.find(
      ({ providerId }) => providerId === availability.videoProcessing.defaultCharacterSwapProvider,
    )?.providerId ?? characterSwapProviders[0]?.providerId;
  const defaultCharacterSwap = defaultCharacterSwapProvider
    ? availability.videoProcessing.characterSwap[defaultCharacterSwapProvider]
    : undefined;

  app.get('/api/health', () => healthResponseSchema.parse({ ok: true }));

  app.get('/api/capabilities', () =>
    capabilitiesResponseSchema.parse({
      realtimeVideo: {
        available: availability.decartAvailable,
        betaEnabled: availability.realtimeVideoBetaEnabled,
      },
      videoProcessing: {
        characterSwap: {
          available: characterSwapProviders.length > 0,
          inputPreparation: defaultCharacterSwap?.inputPreparation ?? 'none',
          referencePolicy: defaultCharacterSwap?.referencePolicy ?? 'optional',
          promptInput: defaultCharacterSwap?.promptInput ?? 'editable',
          promptEnhancement: defaultCharacterSwap?.promptEnhancement ?? false,
          terminalFailureRelease: defaultCharacterSwap?.terminalFailureRelease ?? 'automatic',
          outputResolutions: defaultCharacterSwap?.outputResolutions ?? ['720p'],
          defaultProvider: defaultCharacterSwapProvider ?? null,
          providers: characterSwapProviders,
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
      savedVideos: {
        directMultipartUpload: availability.directSavedVideoUploadAvailable,
      },
      creativeLibrary: {
        cloudMirror: availability.creativeLibraryCloudMirrorAvailable,
      },
      mediaPersistence: availability.mediaPersistence,
    }),
  );
};
