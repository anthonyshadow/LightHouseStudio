import { z } from 'zod';

export const PROJECT_SNAPSHOT_SCHEMA_VERSION = 1 as const;
export const PROJECT_STATUSES = [
  'draft',
  'ready',
  'processing',
  'needs-attention',
  'completed',
  'archived',
  'deleted',
] as const;
export const PROJECT_ASSET_ROLES = [
  'source',
  'working',
  'presented',
  'reference',
  'job-input',
  'job-output',
  'audio',
  'thumbnail',
] as const;
export const PROJECT_REVISION_SOURCES = [
  'create',
  'user-edit',
  'job-result',
  'restore',
  'migration',
] as const;
export const PROJECT_WORKFLOW_PHASES = [
  'source',
  'creative',
  'processing',
  'review',
  'export',
  'complete',
] as const;
const VIDEO_EDIT_CROP_PRESETS = ['original', 'freeform', '16:9', '9:16', '1:1', '4:5'] as const;
const VIDEO_EDIT_FILTERS = ['original', 'vivid', 'warm', 'cool', 'mono', 'fade'] as const;

export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const projectAssetRoleSchema = z.enum(PROJECT_ASSET_ROLES);
export const projectRevisionSourceSchema = z.enum(PROJECT_REVISION_SOURCES);
export const projectWorkflowPhaseSchema = z.enum(PROJECT_WORKFLOW_PHASES);
export const projectIdSchema = z.uuid();
export const projectRevisionIdSchema = z.uuid();
export const projectTitleSchema = z.string().trim().min(1).max(120);
export const projectOperationKeySchema = z.uuid();

const creativeAssetIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .refine((value) => !/^(?:blob|data|https?):/iu.test(value), {
    message: 'Creative references must use durable app-owned identifiers.',
  });

export const projectMediaReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('asset'), assetId: z.uuid() }).strict(),
  z
    .object({
      kind: z.literal('saved-video-version'),
      savedVideoId: z.uuid(),
      videoVersionId: z.uuid(),
    })
    .strict(),
]);

export const projectOutputReferenceSchema = z
  .object({ savedVideoId: z.uuid(), videoVersionId: z.uuid() })
  .strict();

const projectVoiceSelectionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('local-effect'),
      effectId: z.enum(['warm-studio', 'clear-presenter', 'robot']),
    })
    .strict(),
  z
    .object({
      kind: z.literal('saved-voice'),
      voiceId: creativeAssetIdSchema,
      voiceName: z.string().trim().min(1).max(120),
      treatment: z
        .object({
          stability: z.number().finite().min(0).max(1).nullable(),
          similarity: z.number().finite().min(0).max(1).nullable(),
          style: z.number().finite().min(0).max(1).nullable(),
          speakerBoost: z.boolean().nullable(),
        })
        .strict(),
    })
    .strict(),
]);

const videoEditSpecSchema = z
  .object({
    trim: z
      .object({
        startMs: z.number().finite().nonnegative(),
        endMs: z.number().finite().positive(),
      })
      .strict(),
    crop: z
      .object({
        preset: z.enum(VIDEO_EDIT_CROP_PRESETS),
        rectangle: z
          .object({
            x: z.number().finite().min(0).max(1),
            y: z.number().finite().min(0).max(1),
            width: z.number().finite().positive().max(1),
            height: z.number().finite().positive().max(1),
          })
          .strict(),
      })
      .strict(),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    flipHorizontal: z.boolean(),
    flipVertical: z.boolean(),
    adjustments: z
      .object({
        brightness: z.number().finite().min(-100).max(100),
        contrast: z.number().finite().min(-100).max(100),
        saturation: z.number().finite().min(-100).max(100),
        temperature: z.number().finite().min(-100).max(100),
        highlights: z.number().finite().min(-100).max(100),
        shadows: z.number().finite().min(-100).max(100),
      })
      .strict(),
    filter: z.enum(VIDEO_EDIT_FILTERS),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.trim.endMs <= value.trim.startMs) {
      context.addIssue({
        code: 'custom',
        path: ['trim', 'endMs'],
        message: 'The trim end must follow the trim start.',
      });
    }
    if (
      value.crop.rectangle.x + value.crop.rectangle.width > 1 ||
      value.crop.rectangle.y + value.crop.rectangle.height > 1
    ) {
      context.addIssue({
        code: 'custom',
        path: ['crop', 'rectangle'],
        message: 'The normalized crop must remain inside the source frame.',
      });
    }
  });

export const projectSnapshotSchema = z
  .object({
    schemaVersion: z.literal(PROJECT_SNAPSHOT_SCHEMA_VERSION),
    sourceAssetId: z.uuid().nullable(),
    workingMedia: projectMediaReferenceSchema.nullable(),
    presentedMedia: projectMediaReferenceSchema.nullable(),
    selectedCharacter: z
      .object({
        characterId: creativeAssetIdSchema,
        variantId: creativeAssetIdSchema.nullable(),
      })
      .strict()
      .nullable(),
    selectedOutfit: z.object({ outfitId: creativeAssetIdSchema }).strict().nullable(),
    selectedVoice: projectVoiceSelectionSchema.nullable(),
    visualTreatment: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('none') }).strict(),
      z.object({ kind: z.literal('character-swap') }).strict(),
      z.object({ kind: z.literal('virtual-try-on') }).strict(),
    ]),
    liveMode: z
      .object({
        modeId: creativeAssetIdSchema,
        captureFormat: z.enum(['landscape', 'portrait', 'freeform']),
        audioSource: z.enum(['local-microphone', 'model-output', 'none']),
      })
      .strict()
      .nullable(),
    creativeIntent: z
      .object({
        promptId: creativeAssetIdSchema.nullable(),
        recipeId: creativeAssetIdSchema.nullable(),
        userIntent: z.string().max(4_000),
      })
      .strict(),
    localEdit: videoEditSpecSchema.nullable(),
    exportSpecification: z
      .object({
        container: z.literal('video/mp4'),
        aspect: z.enum(['source', '16:9', '9:16', '1:1', '4:5']),
        resolution: z
          .object({
            width: z.number().int().positive().max(16_384),
            height: z.number().int().positive().max(16_384),
          })
          .strict()
          .nullable(),
        includeAudio: z.boolean(),
      })
      .strict()
      .nullable(),
    lastSuccessfulOutput: projectOutputReferenceSchema.nullable(),
    workflowPhase: projectWorkflowPhaseSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.updatedAt < value.createdAt) {
      context.addIssue({
        code: 'custom',
        path: ['updatedAt'],
        message: 'A snapshot cannot be updated before it was created.',
      });
    }
    if (value.visualTreatment.kind === 'character-swap' && value.selectedCharacter === null) {
      context.addIssue({
        code: 'custom',
        path: ['selectedCharacter'],
        message: 'Character Swap requires a selected character.',
      });
    }
    if (value.visualTreatment.kind === 'virtual-try-on' && value.selectedOutfit === null) {
      context.addIssue({
        code: 'custom',
        path: ['selectedOutfit'],
        message: 'Virtual Try-On requires a selected outfit.',
      });
    }
  })
  .transform((value) => ({
    ...value,
    createdAt: new Date(value.createdAt).toISOString(),
    updatedAt: new Date(value.updatedAt).toISOString(),
  }));

export const projectSchema = z
  .object({
    id: projectIdSchema,
    campaignId: z.uuid().nullable(),
    title: projectTitleSchema,
    status: projectStatusSchema,
    version: z.number().int().positive(),
    currentRevisionId: projectRevisionIdSchema,
    currentRevisionNumber: z.number().int().positive(),
    archivedAt: z.iso.datetime().nullable(),
    deletedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .strict();

export const projectRevisionSchema = z
  .object({
    id: projectRevisionIdSchema,
    projectId: projectIdSchema,
    revisionNumber: z.number().int().positive(),
    parentRevisionId: projectRevisionIdSchema.nullable(),
    parentRevisionNumber: z.number().int().positive().nullable(),
    snapshot: projectSnapshotSchema,
    authorKind: z.enum(['user', 'system', 'migration']),
    source: projectRevisionSourceSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();

export const projectAssetLinkSchema = z
  .object({
    projectId: projectIdSchema,
    assetId: z.uuid(),
    role: projectAssetRoleSchema,
    revisionId: projectRevisionIdSchema,
    revisionNumber: z.number().int().positive(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const projectJobLinkSchema = z
  .object({
    projectId: projectIdSchema,
    jobId: z.uuid(),
    initiatingRevisionId: projectRevisionIdSchema,
    initiatingRevisionNumber: z.number().int().positive(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const projectOutputLinkSchema = z
  .object({
    projectId: projectIdSchema,
    savedVideoId: z.uuid(),
    videoVersionId: z.uuid(),
    producingRevisionId: projectRevisionIdSchema,
    producingRevisionNumber: z.number().int().positive(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const projectVersionReferenceLinkSchema = z
  .object({
    projectId: projectIdSchema,
    savedVideoId: z.uuid(),
    videoVersionId: z.uuid(),
    role: z.enum(['working', 'presented']),
    revisionId: projectRevisionIdSchema,
    revisionNumber: z.number().int().positive(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const projectStatusFactsSchema = z
  .object({
    sourceStatus: z.enum(['none', 'ready', 'unavailable']),
    currentAttempt: z.discriminatedUnion('status', [
      z.object({ status: z.literal('none') }).strict(),
      z.object({ status: z.enum(['active', 'failed', 'succeeded']), jobId: z.uuid() }).strict(),
    ]),
    validatedLastSuccessfulOutput: projectOutputReferenceSchema.nullable(),
  })
  .strict();

export const projectConflictSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('operation-key'), operation: z.literal('create') }).strict(),
  z
    .object({
      kind: z.literal('project-version'),
      projectId: projectIdSchema,
      expectedVersion: z.number().int().positive(),
      actualVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('relation-mismatch'),
      projectId: projectIdSchema,
      relation: z.enum(['job', 'output']),
    })
    .strict(),
  z.object({ kind: z.literal('active-jobs'), projectId: projectIdSchema }).strict(),
  z.object({ kind: z.literal('campaign-membership'), projectId: projectIdSchema }).strict(),
  z
    .object({
      kind: z.literal('revision'),
      projectId: projectIdSchema,
      expectedRevisionNumber: z.number().int().positive(),
      actualRevisionNumber: z.number().int().positive(),
    })
    .strict(),
]);

export const createProjectRequestSchema = z
  .object({ title: projectTitleSchema, campaignId: z.uuid().nullable().optional().default(null) })
  .strict();
export const renameProjectRequestSchema = z
  .object({ title: projectTitleSchema, expectedVersion: z.number().int().positive() })
  .strict();
export const projectLifecycleRequestSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export const moveProjectCampaignRequestSchema = z
  .object({ campaignId: z.uuid().nullable(), expectedVersion: z.number().int().positive() })
  .strict();
export const projectParamsSchema = z.object({ projectId: projectIdSchema }).strict();
export const projectsQuerySchema = z
  .object({
    lifecycle: z.enum(['active', 'archived']).default('active'),
    campaignId: z.union([z.uuid(), z.literal('none')]).optional(),
    cursor: z.string().trim().min(1).max(500).optional(),
    pageSize: z.coerce.number().int().min(1).max(40).default(20),
  })
  .strict();
export const projectCurrentResponseSchema = z
  .object({ project: projectSchema, revision: projectRevisionSchema })
  .strict();
export const projectsResponseSchema = z
  .object({
    projects: z.array(projectSchema).max(40),
    nextCursor: z.string().max(500).nullable(),
  })
  .strict();
export const projectConflictResponseSchema = z
  .object({
    error: z
      .object({ code: z.literal('conflict'), message: z.string().trim().min(1).max(300) })
      .strict(),
    conflict: projectConflictSchema,
  })
  .strict();
export const appendProjectRevisionRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRevisionNumber: z.number().int().positive(),
    snapshot: projectSnapshotSchema,
    source: z.enum(['user-edit', 'job-result', 'restore']),
  })
  .strict();

export type ProjectSnapshotContract = z.infer<typeof projectSnapshotSchema>;
export type ProjectStatusContract = z.infer<typeof projectStatusSchema>;
export type ProjectAssetRoleContract = z.infer<typeof projectAssetRoleSchema>;
export type ProjectContract = z.infer<typeof projectSchema>;
export type ProjectRevisionContract = z.infer<typeof projectRevisionSchema>;
export type ProjectJobLinkContract = z.infer<typeof projectJobLinkSchema>;
export type ProjectOutputLinkContract = z.infer<typeof projectOutputLinkSchema>;
export type ProjectVersionReferenceLinkContract = z.infer<typeof projectVersionReferenceLinkSchema>;
export type ProjectStatusFactsContract = z.infer<typeof projectStatusFactsSchema>;
export type ProjectConflictContract = z.infer<typeof projectConflictSchema>;
export type ProjectsQuery = z.infer<typeof projectsQuerySchema>;
export type ProjectCurrentResponse = z.infer<typeof projectCurrentResponseSchema>;
