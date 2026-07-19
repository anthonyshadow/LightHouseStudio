import { z } from 'zod';
import { supportedModelIdSchema } from './realtime';

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
        modelId: z.literal('gpt-image-2'),
        size: z.literal('1024x1024'),
        quality: z.literal('high'),
      })
      .strict(),
  })
  .strict();

export type CapabilitiesResponse = z.infer<typeof capabilitiesResponseSchema>;
