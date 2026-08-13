import { capabilitiesResponseSchema } from '@studio/contracts';
import type { ProviderAvailability } from '../../application/types';
import { invalidApiResponse, requestJson } from './transport';

export const fetchProviderAvailability = async (
  signal?: AbortSignal,
): Promise<ProviderAvailability> => {
  const payload = await requestJson(
    '/api/capabilities',
    {
      ...(signal ? { signal } : {}),
      headers: { Accept: 'application/json' },
    },
    capabilitiesResponseSchema,
    invalidApiResponse('The capability response was invalid.', 'invalid-response'),
  );
  return {
    decart: payload.realtimeVideo.available,
    videoProcessing: payload.videoProcessing,
    elevenLabs: payload.elevenLabs.available,
    elevenLabsModel: payload.elevenLabs.modelId ?? null,
    referenceImages: payload.referenceImages.available,
    referenceImageEditAvailable: payload.referenceImages.editAvailable,
    referenceImageProvider: payload.referenceImages.providerId,
    referenceImageModel: payload.referenceImages.modelId,
    referenceImageSizes: payload.referenceImages.sizes,
    referenceImageOptimizerAvailable: payload.referenceImages.optimizer.available,
    referenceImageOptimizerModel: payload.referenceImages.optimizer.model,
    referenceImageOptimizerVersion: payload.referenceImages.optimizer.version,
    wardrobeAddOutfitAvailable: payload.wardrobe.addOutfitAvailable,
    directSavedVideoUploadAvailable: payload.savedVideos.directMultipartUpload,
  };
};
