import { z } from 'zod';

export const userPlanIdSchema = z.enum(['free', 'plus', 'pro']);

export const authenticatedUserSchema = z
  .object({
    id: z.uuid(),
    login: z.string().trim().min(1).max(254),
    username: z.string().trim().min(1).max(80),
    email: z.email().max(254),
    displayName: z.string().trim().min(1).max(100),
    avatarUrl: z.url().max(2_048).nullable(),
    planId: userPlanIdSchema,
    role: z.enum(['user', 'admin']),
    status: z.enum(['active', 'disabled']),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    lastLoginAt: z.iso.datetime().nullable(),
  })
  .strict();

const capabilitySchema = z.enum([
  'local-camera',
  'upload-video',
  'character-swap',
  'virtual-try-on',
  'voice-effects',
  'video-editor',
  'saved-characters',
  'saved-outfits',
  'saved-videos',
]);

export const entitlementSnapshotSchema = z
  .object({
    planId: userPlanIdSchema,
    capabilities: z.record(capabilitySchema, z.boolean()),
    limits: z
      .object({
        maximumSavedVideos: z.number().int().nonnegative().nullable(),
        maximumSavedCharacters: z.number().int().nonnegative().nullable(),
        maximumSavedOutfits: z.number().int().nonnegative().nullable(),
        monthlyCredits: z.number().int().nonnegative().nullable(),
      })
      .strict(),
    evaluatedAt: z.iso.datetime(),
  })
  .strict();

export const loginRequestSchema = z
  .object({
    login: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(512),
  })
  .strict();

export const authenticatedSessionResponseSchema = z
  .object({
    user: authenticatedUserSchema,
    entitlements: entitlementSnapshotSchema,
    expiresAt: z.iso.datetime(),
  })
  .strict();

export const demoAuthConfigResponseSchema = z
  .object({
    enabled: z.boolean(),
    prefill: z
      .object({
        login: z.string().max(254),
        password: z.string().max(512),
      })
      .strict()
      .nullable(),
  })
  .strict();

export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;
export type UserPlanId = z.infer<typeof userPlanIdSchema>;
export type EntitlementSnapshot = z.infer<typeof entitlementSnapshotSchema>;
export type LoginRequest = z.infer<typeof loginRequestSchema>;
export type AuthenticatedSessionResponse = z.infer<typeof authenticatedSessionResponseSchema>;
export type DemoAuthConfigResponse = z.infer<typeof demoAuthConfigResponseSchema>;
