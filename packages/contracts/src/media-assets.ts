import { z } from 'zod';

export const mediaAssetResponseSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['image', 'video', 'audio', 'thumbnail']),
    purpose: z.enum([
      'uploaded-input',
      'recorded-input',
      'generated-output',
      'edited-output',
      'thumbnail',
    ]),
    mimeType: z.string().trim().min(1).max(100),
    sizeBytes: z.number().int().positive(),
    sourceAssetId: z.uuid().nullable(),
    status: z.enum(['pending', 'ready', 'missing', 'deleted']),
    createdAt: z.iso.datetime(),
  })
  .strict();
