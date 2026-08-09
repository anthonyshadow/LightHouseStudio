import { z } from 'zod';
import { REFERENCE_IMAGE_SIZES } from './reference-images';
import { videoCharacterSwapProviderIdSchema, videoOutputResolutionSchema } from './video-jobs';

export const videoInputPreparationSchema = z.enum(['none', 'h264-mp4']);
export const videoReferencePolicySchema = z.enum(['optional', 'required']);
export const videoPromptInputSchema = z.enum(['editable', 'server-default']);
export const videoTerminalFailureReleaseSchema = z.enum(['automatic', 'explicit-user']);
export const videoProcessingOperationCapabilitySchema = z
  .object({
    available: z.boolean(),
    inputPreparation: videoInputPreparationSchema,
    referencePolicy: videoReferencePolicySchema,
    promptInput: videoPromptInputSchema,
    promptEnhancement: z.boolean(),
    terminalFailureRelease: videoTerminalFailureReleaseSchema,
    outputResolutions: z.array(videoOutputResolutionSchema).min(1).max(2),
  })
  .strict();

export const characterSwapProviderCapabilitySchema = videoProcessingOperationCapabilitySchema
  .omit({ available: true })
  .extend({ providerId: videoCharacterSwapProviderIdSchema })
  .strict();

export const characterSwapCapabilitySchema = videoProcessingOperationCapabilitySchema
  .extend({
    defaultProvider: videoCharacterSwapProviderIdSchema.nullable().optional(),
    providers: z.array(characterSwapProviderCapabilitySchema).max(2).optional(),
  })
  .strict();

export const capabilitiesResponseSchema = z
  .object({
    realtimeVideo: z
      .object({
        available: z.boolean(),
      })
      .strict(),
    videoProcessing: z
      .object({
        characterSwap: characterSwapCapabilitySchema,
        virtualTryOn: videoProcessingOperationCapabilitySchema,
      })
      .strict(),
    elevenLabs: z
      .object({
        available: z.boolean(),
        modelId: z.string().trim().min(1).max(200).nullable(),
      })
      .strict(),
    referenceImages: z
      .object({
        available: z.boolean(),
        editAvailable: z.boolean(),
        providerId: z.enum(['openai', 'bfl', 'wiro']),
        modelId: z.string().trim().min(1).max(128),
        sizes: z.array(z.enum(REFERENCE_IMAGE_SIZES)).length(REFERENCE_IMAGE_SIZES.length),
        optimizer: z
          .object({
            available: z.boolean(),
            model: z.string().trim().min(1).max(128),
            version: z.string().trim().min(1).max(128),
          })
          .strict(),
      })
      .strict(),
    wardrobe: z
      .object({
        addOutfitAvailable: z.boolean(),
      })
      .strict(),
    savedVideos: z
      .object({
        directMultipartUpload: z.boolean(),
      })
      .strict(),
  })
  .strict();

export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;
export type VideoInputPreparation = z.infer<typeof videoInputPreparationSchema>;
export type VideoReferencePolicy = z.infer<typeof videoReferencePolicySchema>;
export type VideoPromptInput = z.infer<typeof videoPromptInputSchema>;
export type VideoTerminalFailureRelease = z.infer<typeof videoTerminalFailureReleaseSchema>;
export type VideoProcessingOperationCapability = z.infer<
  typeof videoProcessingOperationCapabilitySchema
>;
