import { z } from 'zod';

export const DEFAULT_CHARACTER_MODEL_ID = 'lucy-2.5' as const;
export const SUPPORTED_MODEL_IDS = [DEFAULT_CHARACTER_MODEL_ID, 'lucy-vton-3'] as const;
export const supportedModelIdSchema = z.enum(SUPPORTED_MODEL_IDS);

export const realtimeTokenRequestSchema = z
  .object({
    model: supportedModelIdSchema.default(DEFAULT_CHARACTER_MODEL_ID),
  })
  .strict()
  .default({ model: DEFAULT_CHARACTER_MODEL_ID });

export const realtimeTokenConstraintsSchema = z
  .object({
    model: supportedModelIdSchema,
    maxSessionDurationSeconds: z.number().int().positive(),
    applicationOrigin: z.string().url().optional(),
  })
  .strict();

export const realtimeTokenResponseSchema = z
  .object({
    apiKey: z.string().trim().min(1).max(4_096),
    expiresAt: z.string().datetime({ offset: true }),
    permissions: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    constraints: realtimeTokenConstraintsSchema.optional(),
  })
  .strict();

export type SupportedModelId = z.infer<typeof supportedModelIdSchema>;
export type RealtimeTokenRequest = z.infer<typeof realtimeTokenRequestSchema>;
export type RealtimeTokenResponse = z.infer<typeof realtimeTokenResponseSchema>;
export type RealtimeTokenConstraints = z.infer<typeof realtimeTokenConstraintsSchema>;
