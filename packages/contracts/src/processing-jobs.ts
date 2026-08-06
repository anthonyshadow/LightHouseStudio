import { z } from 'zod';

export const processingJobResponseSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(['character-swap', 'virtual-try-on', 'voice-treatment', 'video-edit', 'export']),
    provider: z.string().trim().min(1).max(80).nullable(),
    status: z.enum([
      'validating',
      'submitting',
      'queued',
      'processing',
      'retrieving',
      'ready',
      'failed',
      'expired',
    ]),
    inputAssetIds: z.array(z.uuid()).max(20),
    outputAssetIds: z.array(z.uuid()).max(20),
    safeErrorCode: z.string().trim().min(1).max(80).nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
  })
  .strict();
