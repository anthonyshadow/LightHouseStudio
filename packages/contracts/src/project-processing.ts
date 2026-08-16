import { z } from 'zod';
import { inspectedVideoSchema } from './video-jobs';

export const PROJECT_PROCESSING_CAPABILITIES = [
  'character-swap',
  'virtual-try-on',
  'voice',
] as const;
export const projectProcessingCapabilitySchema = z.enum(PROJECT_PROCESSING_CAPABILITIES);

export const PROJECT_PROCESSING_PHASES = [
  'submitting',
  'accepted',
  'processing',
  'retrieving',
  'saving-result',
  'complete',
  'needs-attention',
  'cancelled',
] as const;
export const projectProcessingPhaseSchema = z.enum(PROJECT_PROCESSING_PHASES);

export const PROJECT_PROCESSING_SAFE_ERROR_CODES = [
  'submission_ambiguous',
  'input_unavailable',
  'intent_changed',
  'provider_unavailable',
  'provider_billing',
  'provider_rejected',
  'provider_timeout',
  'result_invalid',
  'result_too_large',
  'result_retention_failed',
  'job_expired',
  'cancellation_unsupported',
  'processing_failed',
] as const;
export const projectProcessingSafeErrorCodeSchema = z.enum(PROJECT_PROCESSING_SAFE_ERROR_CODES);

export const projectProcessingSafeErrorSchema = z
  .object({
    code: projectProcessingSafeErrorCodeSchema,
    message: z.string().trim().min(1).max(300),
  })
  .strict();

export const projectProcessingCancellationSchema = z.enum([
  'unsupported',
  'available',
  'requested',
  'cancelled',
]);

export const projectProcessingRetryPolicySchema = z.enum([
  'not-allowed',
  'explicit',
  'explicit-cost-confirmation',
]);

export const projectProcessingResultSchema = z
  .object({
    assetId: z.uuid(),
    retainedAt: z.iso.datetime(),
    historical: z.boolean(),
    media: inspectedVideoSchema,
    contentUrl: z.string().startsWith('/api/projects/').max(500),
  })
  .strict();

export const projectProcessingAttemptSchema = z
  .object({
    operationId: z.uuid(),
    projectId: z.uuid(),
    capability: projectProcessingCapabilitySchema,
    attemptNumber: z.number().int().positive(),
    retryOfOperationId: z.uuid().nullable(),
    initiatingRevisionId: z.uuid(),
    initiatingRevisionNumber: z.number().int().positive(),
    phase: projectProcessingPhaseSchema,
    isCurrent: z.boolean(),
    ambiguous: z.boolean(),
    cancellation: projectProcessingCancellationSchema,
    retryPolicy: projectProcessingRetryPolicySchema,
    blocksArchive: z.boolean(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    acceptedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    expiresAt: z.iso.datetime(),
    nextPollAfterMs: z.number().int().min(0).max(10_000).nullable(),
    result: projectProcessingResultSchema.nullable(),
    error: projectProcessingSafeErrorSchema.nullable(),
  })
  .strict()
  .superRefine((attempt, context) => {
    if (attempt.ambiguous !== (attempt.error?.code === 'submission_ambiguous')) {
      context.addIssue({
        code: 'custom',
        path: ['ambiguous'],
        message: 'Ambiguous processing must use the finite ambiguity error.',
      });
    }
    if (attempt.phase === 'complete' && attempt.result === null) {
      context.addIssue({
        code: 'custom',
        path: ['result'],
        message: 'Completed Project processing needs a retained result.',
      });
    }
    if (attempt.phase !== 'complete' && attempt.result !== null && !attempt.result.historical) {
      context.addIssue({
        code: 'custom',
        path: ['result'],
        message: 'A current retained result is complete.',
      });
    }
  });

export const submitProjectProcessingRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRevisionNumber: z.number().int().positive(),
    capability: projectProcessingCapabilitySchema,
  })
  .strict();

export const reconcileProjectProcessingRequestSchema = z.object({ operationId: z.uuid() }).strict();

export const retryProjectProcessingRequestSchema = z
  .object({
    previousOperationId: z.uuid(),
    expectedVersion: z.number().int().positive(),
    expectedRevisionNumber: z.number().int().positive(),
    capability: projectProcessingCapabilitySchema,
    acknowledgePossibleDuplicateCost: z.boolean().default(false),
  })
  .strict();

export const cancelProjectProcessingRequestSchema = z.object({ operationId: z.uuid() }).strict();

export const projectProcessingOperationParamsSchema = z
  .object({ projectId: z.uuid(), operationId: z.uuid() })
  .strict();

export const projectProcessingCurrentResponseSchema = z
  .object({
    projectId: z.uuid(),
    currentProjectVersion: z.number().int().positive(),
    currentRevisionId: z.uuid(),
    currentRevisionNumber: z.number().int().positive(),
    attempt: projectProcessingAttemptSchema.nullable(),
  })
  .strict();

export const projectProcessingMutationResponseSchema = z
  .object({
    replayed: z.boolean(),
    attempt: projectProcessingAttemptSchema,
  })
  .strict();

export const projectProcessingHistoryQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(1_000).optional(),
    pageSize: z.coerce.number().int().min(1).max(40).default(20),
  })
  .strict();

export const projectProcessingHistoryResponseSchema = z
  .object({
    attempts: z.array(projectProcessingAttemptSchema).max(40),
    nextCursor: z.string().max(1_000).nullable(),
  })
  .strict();

export type ProjectProcessingCapability = z.infer<typeof projectProcessingCapabilitySchema>;
export type ProjectProcessingPhase = z.infer<typeof projectProcessingPhaseSchema>;
export type ProjectProcessingSafeErrorCode = z.infer<typeof projectProcessingSafeErrorCodeSchema>;
export type ProjectProcessingAttempt = z.infer<typeof projectProcessingAttemptSchema>;
export type SubmitProjectProcessingRequest = z.infer<typeof submitProjectProcessingRequestSchema>;
export type RetryProjectProcessingRequest = z.infer<typeof retryProjectProcessingRequestSchema>;
export type ProjectProcessingCurrentResponse = z.infer<
  typeof projectProcessingCurrentResponseSchema
>;
export type ProjectProcessingMutationResponse = z.infer<
  typeof projectProcessingMutationResponseSchema
>;
export type ProjectProcessingHistoryQuery = z.infer<typeof projectProcessingHistoryQuerySchema>;
export type ProjectProcessingHistoryResponse = z.infer<
  typeof projectProcessingHistoryResponseSchema
>;
