import { z } from 'zod';
import { opaquePageTokenSchema } from './common';

export const CAMPAIGN_STATUSES = ['active', 'archived', 'deleted'] as const;
export const campaignIdSchema = z.uuid();
export const campaignStatusSchema = z.enum(CAMPAIGN_STATUSES);
export const campaignNameSchema = z.string().trim().min(1).max(120);
export const campaignBriefSchema = z.string().trim().max(1_000).nullable();
export const campaignOperationKeySchema = z.uuid();

export const campaignSchema = z
  .object({
    id: campaignIdSchema,
    name: campaignNameSchema,
    brief: campaignBriefSchema,
    status: campaignStatusSchema,
    version: z.number().int().positive(),
    archivedAt: z.iso.datetime().nullable(),
    deletedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const createCampaignRequestSchema = z
  .object({ name: campaignNameSchema, brief: campaignBriefSchema.optional().default(null) })
  .strict();
export const editCampaignRequestSchema = z
  .object({
    name: campaignNameSchema,
    brief: campaignBriefSchema.optional().default(null),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export const campaignLifecycleRequestSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export const tombstoneCampaignRequestSchema = z
  .object({ expectedVersion: z.number().int().positive(), confirmation: z.literal('tombstone') })
  .strict();
export const campaignParamsSchema = z.object({ campaignId: campaignIdSchema }).strict();
export const campaignsQuerySchema = z
  .object({
    lifecycle: z.enum(['active', 'archived']).default('active'),
    cursor: opaquePageTokenSchema.optional(),
    pageSize: z.coerce.number().int().min(1).max(40).default(20),
  })
  .strict();

export const campaignConflictSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('operation-key'), operation: z.literal('campaign-create') }).strict(),
  z
    .object({
      kind: z.literal('campaign-version'),
      campaignId: campaignIdSchema,
      expectedVersion: z.number().int().positive(),
      actualVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('campaign-not-empty'),
      campaignId: campaignIdSchema,
      attachedProjectCount: z.number().int().positive(),
    })
    .strict(),
]);

export const campaignsResponseSchema = z
  .object({
    campaigns: z.array(campaignSchema).max(40),
    nextCursor: z.string().max(500).nullable(),
  })
  .strict();
export const campaignConflictResponseSchema = z
  .object({
    error: z
      .object({ code: z.literal('conflict'), message: z.string().trim().min(1).max(300) })
      .strict(),
    conflict: campaignConflictSchema,
  })
  .strict();

export type CampaignContract = z.infer<typeof campaignSchema>;
export type CampaignConflictContract = z.infer<typeof campaignConflictSchema>;
export type CampaignsQuery = z.infer<typeof campaignsQuerySchema>;
