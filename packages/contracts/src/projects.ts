import { z } from 'zod';
import { listSearchSchema, listTotalSchema, opaquePageTokenSchema } from './common';
import { projectExportSpecificationValueSchema } from './export-placements';
import {
  savedVideoDetailSchema,
  savedVideoSummarySchema,
  savedVideoTitleSchema,
  savedVideoVersionSchema,
} from './saved-videos';

export const PROJECT_SNAPSHOT_SCHEMA_VERSION = 2 as const;
export const LEGACY_PROJECT_SNAPSHOT_SCHEMA_VERSION = 1 as const;
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
export const PROJECT_ASSET_KINDS = ['video', 'character', 'outfit', 'voice'] as const;
export const PROJECT_REVISION_SOURCES = [
  'create',
  'user-edit',
  'job-result',
  'output-save',
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
export const PROJECT_SOURCE_KINDS = ['uploaded', 'recorded', 'saved-video-version'] as const;
const VIDEO_EDIT_CROP_PRESETS = ['original', 'freeform', '16:9', '9:16', '1:1', '4:5'] as const;
const VIDEO_EDIT_FILTERS = ['original', 'vivid', 'warm', 'cool', 'mono', 'fade'] as const;

export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const projectAssetRoleSchema = z.enum(PROJECT_ASSET_ROLES);
export const projectAssetKindSchema = z.enum(PROJECT_ASSET_KINDS);
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

const projectVoiceTreatmentSchema = z
  .object({
    stability: z.number().finite().min(0).max(1).nullable(),
    similarity: z.number().finite().min(0).max(1).nullable(),
    style: z.number().finite().min(0).max(1).nullable(),
    speakerBoost: z.boolean().nullable(),
  })
  .strict();

const projectVoiceSelectionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('local-effect'),
      effectId: z.enum(['warm-studio', 'clear-presenter', 'robot']),
      effectRevision: z.literal('builtin-v1').nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('saved-voice'),
      voiceId: creativeAssetIdSchema,
      voiceName: z.string().trim().min(1).max(120),
      resourceRevision: z.iso.datetime().nullable(),
      treatment: projectVoiceTreatmentSchema,
    })
    .strict(),
]);

const projectLiveModeMetadataSchema = z
  .object({
    modeId: creativeAssetIdSchema,
    captureFormat: z.enum(['landscape', 'portrait', 'freeform']),
    audioSource: z.enum(['local-microphone', 'model-output', 'none']),
  })
  .strict()
  .nullable();

export const projectVideoEditSpecSchema = z
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

const projectExportSpecificationSchema = projectExportSpecificationValueSchema.nullable();

const projectSnapshotSharedShape = {
  sourceAssetId: z.uuid().nullable(),
  workingMedia: projectMediaReferenceSchema.nullable(),
  presentedMedia: projectMediaReferenceSchema.nullable(),
  liveMode: projectLiveModeMetadataSchema,
  localEdit: projectVideoEditSpecSchema.nullable(),
  exportSpecification: projectExportSpecificationSchema,
  lastSuccessfulOutput: projectOutputReferenceSchema.nullable(),
  workflowPhase: projectWorkflowPhaseSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
} as const;

const projectCharacterSelectionSchema = z
  .object({
    characterId: creativeAssetIdSchema,
    characterLabel: z.string().trim().min(1).max(120).nullable(),
    characterRevision: z.iso.datetime().nullable(),
    variantId: creativeAssetIdSchema.nullable(),
    variantLabel: z.string().trim().min(1).max(120).nullable(),
    variantRevision: z.iso.datetime().nullable(),
    referenceAssetId: z.uuid().nullable(),
  })
  .strict()
  .nullable();

const projectOutfitSelectionSchema = z
  .object({
    outfitId: creativeAssetIdSchema,
    outfitLabel: z.string().trim().min(1).max(120).nullable(),
    outfitRevision: z.iso.datetime().nullable(),
    referenceAssetId: z.uuid().nullable(),
    inputKind: z.enum(['prompt', 'saved-outfit']).nullable(),
  })
  .strict()
  .nullable();

const projectVisualTreatmentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('none') }).strict(),
  z
    .object({
      kind: z.literal('character-swap'),
      providerId: creativeAssetIdSchema.nullable(),
      outputResolution: z.enum(['720p', '1080p']).nullable(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('virtual-try-on'),
      providerId: creativeAssetIdSchema.nullable(),
      outputResolution: z.enum(['720p', '1080p']).nullable(),
      inputKind: z.enum(['prompt', 'saved-outfit', 'reference-image']).nullable(),
      enhancePrompt: z.boolean().nullable(),
    })
    .strict(),
]);

const projectCreativeIntentSchema = z
  .object({
    promptId: creativeAssetIdSchema.nullable(),
    promptLabel: z.string().trim().min(1).max(120).nullable(),
    recipeId: creativeAssetIdSchema.nullable(),
    recipeLabel: z.string().trim().min(1).max(120).nullable(),
    userIntent: z.string().max(4_000),
    appliedPrompt: z.string().max(4_000).nullable(),
    referenceAssetId: z.uuid().nullable(),
    resourceRevision: z.iso.datetime().nullable(),
  })
  .strict();

const projectSnapshotV2Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_SNAPSHOT_SCHEMA_VERSION),
    ...projectSnapshotSharedShape,
    selectedCharacter: projectCharacterSelectionSchema,
    selectedOutfit: projectOutfitSelectionSchema,
    selectedVoice: projectVoiceSelectionSchema.nullable(),
    visualTreatment: projectVisualTreatmentSchema,
    creativeIntent: projectCreativeIntentSchema,
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
    if (
      value.visualTreatment.kind === 'virtual-try-on' &&
      value.visualTreatment.inputKind === 'saved-outfit' &&
      value.selectedOutfit === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['selectedOutfit'],
        message: 'Saved-outfit Virtual Try-On requires a selected outfit.',
      });
    }
    if (
      value.selectedCharacter?.variantId !== null &&
      value.selectedCharacter !== null &&
      (value.selectedCharacter.variantLabel === null) !==
        (value.selectedCharacter.variantRevision === null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['selectedCharacter', 'variantLabel'],
        message: 'A Character Variant label and revision must be recorded together.',
      });
    }
    if (
      value.selectedCharacter?.variantId === null &&
      (value.selectedCharacter.variantLabel !== null ||
        value.selectedCharacter.variantRevision !== null)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['selectedCharacter', 'variantId'],
        message: 'Character Variant applied values require a Variant identifier.',
      });
    }
  })
  .transform((value) => ({
    ...value,
    createdAt: new Date(value.createdAt).toISOString(),
    updatedAt: new Date(value.updatedAt).toISOString(),
  }));

/** Prompt 07 snapshots are accepted only through this explicit provenance-preserving read map. */
export const legacyProjectSnapshotSchema = z
  .object({
    schemaVersion: z.literal(LEGACY_PROJECT_SNAPSHOT_SCHEMA_VERSION),
    ...projectSnapshotSharedShape,
    selectedCharacter: z
      .object({
        characterId: creativeAssetIdSchema,
        variantId: creativeAssetIdSchema.nullable(),
      })
      .strict()
      .nullable(),
    selectedOutfit: z.object({ outfitId: creativeAssetIdSchema }).strict().nullable(),
    selectedVoice: z
      .discriminatedUnion('kind', [
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
            treatment: projectVoiceTreatmentSchema,
          })
          .strict(),
      ])
      .nullable(),
    visualTreatment: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('none') }).strict(),
      z.object({ kind: z.literal('character-swap') }).strict(),
      z.object({ kind: z.literal('virtual-try-on') }).strict(),
    ]),
    creativeIntent: z
      .object({
        promptId: creativeAssetIdSchema.nullable(),
        recipeId: creativeAssetIdSchema.nullable(),
        userIntent: z.string().max(4_000),
      })
      .strict(),
  })
  .strict();

export const migrateLegacyProjectSnapshot = (legacy: z.infer<typeof legacyProjectSnapshotSchema>) =>
  projectSnapshotV2Schema.parse({
    ...legacy,
    schemaVersion: PROJECT_SNAPSHOT_SCHEMA_VERSION,
    selectedCharacter:
      legacy.selectedCharacter === null
        ? null
        : {
            ...legacy.selectedCharacter,
            characterLabel: null,
            characterRevision: null,
            variantLabel: null,
            variantRevision: null,
            referenceAssetId: null,
          },
    selectedOutfit:
      legacy.selectedOutfit === null
        ? null
        : {
            ...legacy.selectedOutfit,
            outfitLabel: null,
            outfitRevision: null,
            referenceAssetId: null,
            inputKind: null,
          },
    selectedVoice:
      legacy.selectedVoice === null
        ? null
        : legacy.selectedVoice.kind === 'local-effect'
          ? { ...legacy.selectedVoice, effectRevision: null }
          : { ...legacy.selectedVoice, resourceRevision: null },
    visualTreatment:
      legacy.visualTreatment.kind === 'none'
        ? legacy.visualTreatment
        : legacy.visualTreatment.kind === 'character-swap'
          ? {
              kind: 'character-swap' as const,
              providerId: null,
              outputResolution: null,
            }
          : {
              kind: 'virtual-try-on' as const,
              providerId: null,
              outputResolution: null,
              inputKind: null,
              enhancePrompt: null,
            },
    creativeIntent: {
      ...legacy.creativeIntent,
      promptLabel: null,
      recipeLabel: null,
      appliedPrompt: null,
      referenceAssetId: null,
      resourceRevision: null,
    },
  });

export const projectSnapshotSchema = z.union([
  projectSnapshotV2Schema,
  legacyProjectSnapshotSchema.transform(migrateLegacyProjectSnapshot),
]);

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

export const projectAssetMembershipSchema = z
  .object({
    id: z.uuid(),
    projectId: projectIdSchema,
    kind: projectAssetKindSchema,
    resourceId: creativeAssetIdSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();

export const projectAssetsQuerySchema = z
  .object({
    kind: projectAssetKindSchema.optional(),
    cursor: opaquePageTokenSchema.optional(),
    pageSize: z.coerce.number().int().min(1).max(50).default(24),
  })
  .strict();

export const projectAssetsResponseSchema = z
  .object({
    assets: z.array(projectAssetMembershipSchema).max(50),
    videoSummaries: z.array(savedVideoSummarySchema).max(50),
    nextCursor: z.string().max(1_000).nullable(),
  })
  .strict();

export const attachProjectAssetRequestSchema = z
  .object({ kind: projectAssetKindSchema, resourceId: creativeAssetIdSchema })
  .strict();

export const attachProjectAssetResponseSchema = z
  .object({ membership: projectAssetMembershipSchema, created: z.boolean() })
  .strict();

export const detachProjectAssetResponseSchema = z.object({ detached: z.literal(true) }).strict();

export const projectAssetMembershipParamsSchema = z
  .object({ projectId: projectIdSchema, membershipId: z.uuid() })
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
  z
    .object({
      kind: z.literal('operation-key'),
      operation: z.enum(['create', 'source-accept', 'working-media-adopt', 'output-save']),
    })
    .strict(),
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
  z.object({ kind: z.literal('immutable-source'), projectId: projectIdSchema }).strict(),
  z
    .object({
      kind: z.literal('saved-video-version'),
      savedVideoId: z.uuid(),
      expectedVersionId: z.uuid(),
      actualVersionId: z.uuid(),
    })
    .strict(),
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
export const tombstoneProjectRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    confirmation: z.literal('permanent-delete'),
  })
  .strict();
export const moveProjectCampaignRequestSchema = z
  .object({ campaignId: z.uuid().nullable(), expectedVersion: z.number().int().positive() })
  .strict();
/**
 * `campaignId` is required rather than defaulted: a duplicate lands where the operator says, and
 * silently detaching a copy of a Campaign Project would be a surprising default.
 */
export const duplicateProjectRequestSchema = z
  .object({
    title: projectTitleSchema,
    campaignId: z.uuid().nullable(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();
export const projectParamsSchema = z.object({ projectId: projectIdSchema }).strict();
export const projectOutputVersionParamsSchema = z
  .object({ projectId: projectIdSchema, videoVersionId: z.uuid() })
  .strict();
export const projectHistoryQuerySchema = z
  .object({
    cursor: opaquePageTokenSchema.optional(),
    pageSize: z.coerce.number().int().min(1).max(40).default(20),
  })
  .strict();
export const projectHistoryRevisionSchema = z
  .object({
    kind: z.literal('project-change'),
    revisionId: projectRevisionIdSchema,
    revisionNumber: z.number().int().positive(),
    parentRevisionId: projectRevisionIdSchema.nullable(),
    parentRevisionNumber: z.number().int().positive().nullable(),
    source: projectRevisionSourceSchema,
    authorKind: z.enum(['user', 'system', 'migration']),
    workflowPhase: projectWorkflowPhaseSchema,
    outputReference: projectOutputReferenceSchema.nullable(),
    exportSpecification: projectExportSpecificationSchema,
    createdAt: z.iso.datetime(),
  })
  .strict();
export const projectHistoryResponseSchema = z
  .object({
    revisions: z.array(projectHistoryRevisionSchema).max(40),
    nextCursor: z.string().max(1_000).nullable(),
  })
  .strict();

const projectOutputReferenceRevisionSchema = z
  .object({
    revisionId: projectRevisionIdSchema,
    revisionNumber: z.number().int().positive(),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const projectOutputHistoryItemSchema = z
  .object({
    kind: z.literal('saved-video-version'),
    output: projectOutputLinkSchema,
    savedVideo: z
      .object({
        id: z.uuid(),
        title: savedVideoTitleSchema,
        libraryStatus: z.enum(['ready', 'missing', 'removed']),
        currentVersionId: z.uuid(),
      })
      .strict(),
    version: savedVideoVersionSchema,
    referenceRevision: projectOutputReferenceRevisionSchema.nullable(),
    isCurrentForProject: z.boolean(),
    contentUrl: z.string().startsWith('/api/projects/').max(500),
  })
  .strict();
export const projectOutputHistoryResponseSchema = z
  .object({
    outputs: z.array(projectOutputHistoryItemSchema).max(40),
    nextCursor: z.string().max(1_000).nullable(),
  })
  .strict();
export const projectWorkingMediaParamsSchema = z
  .object({ projectId: projectIdSchema, revisionId: projectRevisionIdSchema })
  .strict();
export const projectsQuerySchema = z
  .object({
    lifecycle: z.enum(['active', 'archived']).default('active'),
    campaignId: z.union([z.uuid(), z.literal('none')]).optional(),
    search: listSearchSchema,
    cursor: opaquePageTokenSchema.optional(),
    pageSize: z.coerce.number().int().min(1).max(40).default(20),
  })
  .strict();
export const projectCurrentResponseSchema = z
  .object({ project: projectSchema, revision: projectRevisionSchema })
  .strict();
/**
 * The Saved Video Version a Project's own current revision already points at, so a list surface can
 * show the work instead of describing it.
 *
 * It travels beside `projects` rather than inside `projectSchema` because it is a presentation
 * convenience of the *list*, not part of a Project's identity: the detail response carries the
 * revision itself and resolves the same reference from it.
 */
export const projectPreviewSchema = z
  .object({
    projectId: projectIdSchema,
    savedVideoId: z.uuid(),
    videoVersionId: z.uuid(),
  })
  .strict();

export const projectsResponseSchema = z
  .object({
    projects: z.array(projectSchema).max(40),
    /** Only the Projects in this page that resolve to one; absent entries have no preview. */
    previews: z.array(projectPreviewSchema).max(40).default([]),
    nextCursor: z.string().max(500).nullable(),
    /** How many Projects match the query, counted to a ceiling rather than censused. */
    total: listTotalSchema,
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
export const projectSessionProposalSchema = z
  .object({
    workflowPhase: projectWorkflowPhaseSchema,
    liveMode: projectLiveModeMetadataSchema,
    selectedCharacter: projectCharacterSelectionSchema,
    selectedOutfit: projectOutfitSelectionSchema,
    selectedVoice: projectVoiceSelectionSchema.nullable(),
    visualTreatment: projectVisualTreatmentSchema,
    creativeIntent: projectCreativeIntentSchema,
    localEdit: projectVideoEditSpecSchema.nullable(),
    exportSpecification: projectExportSpecificationSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.visualTreatment.kind === 'character-swap' && value.selectedCharacter === null) {
      context.addIssue({
        code: 'custom',
        path: ['selectedCharacter'],
        message: 'Character Swap requires a selected character.',
      });
    }
    if (
      value.visualTreatment.kind === 'virtual-try-on' &&
      value.visualTreatment.inputKind === 'saved-outfit' &&
      value.selectedOutfit === null
    ) {
      context.addIssue({
        code: 'custom',
        path: ['selectedOutfit'],
        message: 'Saved-outfit Virtual Try-On requires a selected outfit.',
      });
    }
  });

export const appendProjectRevisionRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRevisionNumber: z.number().int().positive(),
    proposal: projectSessionProposalSchema,
  })
  .strict();

export const projectSourceKindSchema = z.enum(PROJECT_SOURCE_KINDS);

export const projectSourceUploadMetadataSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRevisionNumber: z.number().int().positive(),
    kind: z.enum(['uploaded', 'recorded']),
    filename: z.string().trim().min(1).max(180),
  })
  .strict();

export const reuseProjectSourceRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRevisionNumber: z.number().int().positive(),
    savedVideoId: z.uuid(),
    videoVersionId: z.uuid(),
  })
  .strict();

export const removeProjectSourceRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRevisionNumber: z.number().int().positive(),
  })
  .strict();

export const projectWorkingMediaUploadMetadataSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRevisionNumber: z.number().int().positive(),
    filename: z.string().trim().min(1).max(180),
    localEdit: projectVideoEditSpecSchema,
  })
  .strict();

export const adoptProjectWorkingMediaRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRevisionNumber: z.number().int().positive(),
    media: projectMediaReferenceSchema,
    localEdit: projectVideoEditSpecSchema.nullable(),
  })
  .strict();

export const projectOutputSaveTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('new'), title: savedVideoTitleSchema }).strict(),
  z
    .object({
      kind: z.literal('version'),
      savedVideoId: z.uuid(),
      expectedVersionId: z.uuid(),
    })
    .strict(),
]);

/**
 * Re-framed bytes already uploaded for this save, and the placement they were produced for.
 *
 * The reference is separate from `media` on purpose: `media` still names the exact cut that was on
 * the stage and is still checked against it, while this names bytes that exist only to be stored.
 */
export const projectOutputRenditionSchema = z
  .object({
    /** Always freshly uploaded bytes; a rendition is never a reference to something retained. */
    media: z.object({ kind: z.literal('asset'), assetId: z.uuid() }).strict(),
    specification: projectExportSpecificationValueSchema,
  })
  .strict();

export const saveProjectOutputRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRevisionNumber: z.number().int().positive(),
    media: projectMediaReferenceSchema,
    target: projectOutputSaveTargetSchema,
    /**
     * A list because a save is one day expected to produce several placements at once. Exactly one
     * is produced today, and an empty list means the cut is stored in the shape it already has.
     * Defaulted so a save receipt written before this field existed still replays.
     */
    renditions: z.array(projectOutputRenditionSchema).max(1).default([]),
  })
  .strict();

/** Metadata for a rendition upload, carried in a header beside the bytes. */
export const projectRenditionUploadMetadataSchema = z
  .object({
    filename: z.string().trim().min(1).max(180),
    specification: projectExportSpecificationValueSchema,
  })
  .strict();

export const projectRenditionUploadResponseSchema = z
  .object({
    media: z.object({ kind: z.literal('asset'), assetId: z.uuid() }).strict(),
    assetId: z.uuid(),
    specification: projectExportSpecificationValueSchema,
    filename: z.string().trim().min(1).max(180),
    sizeBytes: z.number().int().positive().max(300_000_000),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    durationMs: z.number().int().positive().max(300_000),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    hasAudio: z.boolean(),
  })
  .strict();

const projectWorkingMediaSchema = z
  .object({
    kind: z.enum(['local-render', 'media-asset', 'saved-video-version']),
    reference: projectMediaReferenceSchema,
    assetId: z.uuid(),
    savedVideoId: z.uuid().nullable(),
    videoVersionId: z.uuid().nullable(),
    mimeType: z.enum(['video/mp4', 'video/quicktime', 'video/webm']),
    filename: z.string().trim().min(1).max(180),
    sizeBytes: z.number().int().positive().max(300_000_000),
    checksumSha256: z.string().regex(/^[a-f0-9]{64}$/u),
    container: z.enum(['mp4', 'quicktime', 'webm']),
    videoCodec: z.enum(['avc', 'vp8']),
    audioCodec: z.string().trim().min(1).max(32).nullable(),
    durationMs: z.number().int().positive().max(300_000),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    hasAudio: z.boolean(),
    adoptedRevisionId: projectRevisionIdSchema,
    adoptedRevisionNumber: z.number().int().positive(),
    adoptedAt: z.iso.datetime(),
    contentUrl: z
      .string()
      .regex(
        /^\/api\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/working-media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/content$/u,
      ),
  })
  .strict()
  .superRefine((media, context) => {
    const saved = media.kind === 'saved-video-version';
    if (saved !== (media.savedVideoId !== null && media.videoVersionId !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['savedVideoId'],
        message: 'Working-media Saved Video lineage must be exact and complete.',
      });
    }
    if (
      saved !== (media.reference.kind === 'saved-video-version') ||
      (!saved && (media.reference.kind !== 'asset' || media.reference.assetId !== media.assetId)) ||
      (saved &&
        media.reference.kind === 'saved-video-version' &&
        (media.reference.savedVideoId !== media.savedVideoId ||
          media.reference.videoVersionId !== media.videoVersionId))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['reference'],
        message: 'Working-media reference and retained bytes must describe the same media.',
      });
    }
  });

export const projectWorkingMediaResponseSchema = z
  .object({
    project: projectSchema,
    revision: projectRevisionSchema,
    isCurrent: z.boolean(),
    media: projectWorkingMediaSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.revision.projectId !== value.project.id ||
      value.revision.id !== value.project.currentRevisionId ||
      value.revision.revisionNumber !== value.project.currentRevisionNumber ||
      value.media.adoptedRevisionNumber > value.revision.revisionNumber ||
      value.media.contentUrl !==
        `/api/projects/${value.project.id}/working-media/${value.media.adoptedRevisionId}/content`
    ) {
      context.addIssue({
        code: 'custom',
        path: ['revision'],
        message: 'Working-media responses must describe current Project authority and adoption.',
      });
    }
    const current =
      JSON.stringify(value.revision.snapshot.workingMedia) ===
        JSON.stringify(value.media.reference) &&
      JSON.stringify(value.revision.snapshot.presentedMedia) ===
        JSON.stringify(value.media.reference);
    if (current !== value.isCurrent) {
      context.addIssue({
        code: 'custom',
        path: ['isCurrent'],
        message: 'Working-media current status is inconsistent.',
      });
    }
  });

export const projectOutputSaveResultSchema = z
  .object({
    operationId: projectOperationKeySchema,
    project: projectSchema,
    revision: projectRevisionSchema,
    output: projectOutputLinkSchema,
    savedVideo: savedVideoDetailSchema,
    contentUrl: z.string().startsWith('/api/projects/').max(500),
  })
  .strict()
  .superRefine((value, context) => {
    const reference = value.revision.snapshot.lastSuccessfulOutput;
    const working = value.revision.snapshot.workingMedia;
    const presented = value.revision.snapshot.presentedMedia;
    if (
      value.project.id !== value.output.projectId ||
      value.project.currentRevisionId !== value.revision.id ||
      value.project.currentRevisionNumber !== value.revision.revisionNumber ||
      value.project.status !== 'completed' ||
      value.revision.source !== 'output-save' ||
      value.revision.parentRevisionId !== value.output.producingRevisionId ||
      value.revision.parentRevisionNumber !== value.output.producingRevisionNumber ||
      value.savedVideo.id !== value.output.savedVideoId ||
      value.savedVideo.currentVersion.id !== value.output.videoVersionId ||
      reference?.savedVideoId !== value.output.savedVideoId ||
      reference.videoVersionId !== value.output.videoVersionId ||
      working?.kind !== 'saved-video-version' ||
      working.savedVideoId !== value.output.savedVideoId ||
      working.videoVersionId !== value.output.videoVersionId ||
      presented?.kind !== 'saved-video-version' ||
      presented.savedVideoId !== value.output.savedVideoId ||
      presented.videoVersionId !== value.output.videoVersionId
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'A Project output result must preserve producing-revision provenance and name the exact completed post-save Version.',
      });
    }
  });

export const saveProjectOutputResponseSchema = projectOutputSaveResultSchema
  .extend({ replayed: z.boolean() })
  .strict();

export const projectSourceResponseSchema = z
  .object({
    project: projectSchema,
    revision: projectRevisionSchema,
    source: z
      .object({
        kind: projectSourceKindSchema,
        savedVideoId: z.uuid().nullable(),
        videoVersionId: z.uuid().nullable(),
        mimeType: z.enum(['video/mp4', 'video/quicktime', 'video/webm']),
        filename: z.string().trim().min(1).max(180),
        sizeBytes: z.number().int().positive().max(300_000_000),
        container: z.enum(['mp4', 'quicktime', 'webm']),
        videoCodec: z.enum(['avc', 'vp8']),
        audioCodec: z.string().trim().min(1).max(32).nullable(),
        durationMs: z.number().int().positive().max(300_000),
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        hasAudio: z.boolean(),
        acceptedAt: z.iso.datetime(),
        contentUrl: z
          .string()
          .regex(
            /^\/api\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/source\/content$/u,
          ),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, context) => {
    const reused = value.source.kind === 'saved-video-version';
    if (reused !== (value.source.savedVideoId !== null && value.source.videoVersionId !== null)) {
      context.addIssue({
        code: 'custom',
        path: ['source'],
        message: 'Saved Video source lineage must be exact and complete.',
      });
    }
    if (
      value.revision.projectId !== value.project.id ||
      value.revision.id !== value.project.currentRevisionId ||
      value.revision.revisionNumber !== value.project.currentRevisionNumber ||
      value.revision.snapshot.sourceAssetId === null ||
      value.source.contentUrl !== `/api/projects/${value.project.id}/source/content`
    ) {
      context.addIssue({
        code: 'custom',
        path: ['revision'],
        message: 'Project source responses must describe the exact current accepted revision.',
      });
    }
  });

export type ProjectSnapshotContract = z.infer<typeof projectSnapshotSchema>;
export type ProjectSessionProposalContract = z.infer<typeof projectSessionProposalSchema>;
export type AppendProjectRevisionRequest = z.infer<typeof appendProjectRevisionRequestSchema>;
export type ProjectStatusContract = z.infer<typeof projectStatusSchema>;
export type ProjectAssetRoleContract = z.infer<typeof projectAssetRoleSchema>;
export type ProjectAssetKindContract = z.infer<typeof projectAssetKindSchema>;
export type ProjectAssetMembershipContract = z.infer<typeof projectAssetMembershipSchema>;
export type ProjectAssetsQuery = z.infer<typeof projectAssetsQuerySchema>;
export type ProjectAssetsResponse = z.infer<typeof projectAssetsResponseSchema>;
export type AttachProjectAssetRequest = z.infer<typeof attachProjectAssetRequestSchema>;
export type AttachProjectAssetResponse = z.infer<typeof attachProjectAssetResponseSchema>;
export type DetachProjectAssetResponse = z.infer<typeof detachProjectAssetResponseSchema>;
export type ProjectContract = z.infer<typeof projectSchema>;
export type ProjectPreviewContract = z.infer<typeof projectPreviewSchema>;
export type ProjectRevisionContract = z.infer<typeof projectRevisionSchema>;
export type ProjectJobLinkContract = z.infer<typeof projectJobLinkSchema>;
export type ProjectOutputLinkContract = z.infer<typeof projectOutputLinkSchema>;
export type ProjectVersionReferenceLinkContract = z.infer<typeof projectVersionReferenceLinkSchema>;
export type ProjectStatusFactsContract = z.infer<typeof projectStatusFactsSchema>;
export type ProjectConflictContract = z.infer<typeof projectConflictSchema>;
export type ProjectsQuery = z.infer<typeof projectsQuerySchema>;
export type ProjectCurrentResponse = z.infer<typeof projectCurrentResponseSchema>;
export type ProjectHistoryQuery = z.infer<typeof projectHistoryQuerySchema>;
export type ProjectHistoryRevision = z.infer<typeof projectHistoryRevisionSchema>;
export type ProjectHistoryResponse = z.infer<typeof projectHistoryResponseSchema>;
export type ProjectOutputHistoryItem = z.infer<typeof projectOutputHistoryItemSchema>;
export type ProjectOutputHistoryResponse = z.infer<typeof projectOutputHistoryResponseSchema>;
export type ProjectSourceKindContract = z.infer<typeof projectSourceKindSchema>;
export type ProjectSourceUploadMetadata = z.infer<typeof projectSourceUploadMetadataSchema>;
export type ReuseProjectSourceRequest = z.infer<typeof reuseProjectSourceRequestSchema>;
export type RemoveProjectSourceRequest = z.infer<typeof removeProjectSourceRequestSchema>;
export type ProjectSourceResponse = z.infer<typeof projectSourceResponseSchema>;
export type ProjectWorkingMediaUploadMetadata = z.infer<
  typeof projectWorkingMediaUploadMetadataSchema
>;
export type AdoptProjectWorkingMediaRequest = z.infer<typeof adoptProjectWorkingMediaRequestSchema>;
export type ProjectWorkingMediaResponse = z.infer<typeof projectWorkingMediaResponseSchema>;
export type ProjectOutputSaveTarget = z.infer<typeof projectOutputSaveTargetSchema>;
export type DuplicateProjectRequest = z.infer<typeof duplicateProjectRequestSchema>;
export type SaveProjectOutputRequest = z.infer<typeof saveProjectOutputRequestSchema>;
export type ProjectOutputSaveResult = z.infer<typeof projectOutputSaveResultSchema>;
export type SaveProjectOutputResponse = z.infer<typeof saveProjectOutputResponseSchema>;

export type ProjectOutputRendition = z.infer<typeof projectOutputRenditionSchema>;
export type ProjectRenditionUploadMetadata = z.infer<typeof projectRenditionUploadMetadataSchema>;
export type ProjectRenditionUploadResponse = z.infer<typeof projectRenditionUploadResponseSchema>;
