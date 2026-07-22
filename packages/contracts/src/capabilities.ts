import { z } from 'zod';
import { supportedModelIdSchema } from './realtime';
import { REFERENCE_IMAGE_SIZES } from './reference-images';

export const capabilitiesResponseSchema = z
  .object({
    realtimeVideo: z
      .object({
        available: z.boolean(),
        models: z.array(supportedModelIdSchema).max(2),
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
        modelId: z.string().trim().min(1).max(128),
        sizes: z.array(z.enum(REFERENCE_IMAGE_SIZES)).length(REFERENCE_IMAGE_SIZES.length),
        quality: z.enum(['high', 'medium']),
        optimizer: z
          .object({
            available: z.boolean(),
            model: z.string().trim().min(1).max(128),
            version: z.string().trim().min(1).max(128),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;
