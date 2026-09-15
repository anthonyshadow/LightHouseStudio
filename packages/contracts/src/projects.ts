import { z } from 'zod';
import { listSearchSchema, listTotalSchema, opaquePageTokenSchema } from './common';
import { projectExportSpecificationValueSchema } from './export-placements';
import {
  savedVideoDetailSchema,
  savedVideoSummarySchema,
  savedVideoTitleSchema,
  savedVideoVersionSchema,
} from './saved-videos';

/** Mirror the domain's snapshot versions by hand; the parity suite holds the two together. */
export const PROJECT_SNAPSHOT_SCHEMA_VERSION = 3 as const;
export const PREVIOUS_PROJECT_SNAPSHOT_SCHEMA_VERSION = 2 as const;
export const LEGACY_PROJECT_SNAPSHOT_SCHEMA_VERSION = 1 as const;
/**
 * Every version a stored snapshot may carry and still be read: the write version plus the two
 * explicit read maps below. The relational check constraint admits exactly this set.
 */
export const READABLE_PROJECT_SNAPSHOT_SCHEMA_VERSIONS = [
  LEGACY_PROJECT_SNAPSHOT_SCHEMA_VERSION,
  PREVIOUS_PROJECT_SNAPSHOT_SCHEMA_VERSION,
  PROJECT_SNAPSHOT_SCHEMA_VERSION,
] as const;
/** What a stale bundle is told when its write cannot describe the current model. */
export const PROJECT_STALE_CLIENT_MESSAGE =
  'This tab is out of date and cannot describe this edit. Reload and try again.';

/** The marker the refinements below attach, so the verdict travels as data and not as prose. */
const STALE_CLIENT_ISSUE = { staleProjectClient: true } as const;

/**
 * Whether a refused Project write failed because the client that sent it predates the current
 * model, rather than because it was simply wrong.
 *
 * A caller asking this must not match on the message: the copy is presentation and changes for
 * reasons — tone, translation, splitting one sentence into two — that have nothing to do with the
 * classification. The refinements that raise it tag the issue instead, and this reads the tag.
 */
export const isStaleProjectClientError = (error: z.ZodError): boolean =>
  error.issues.some(
    (issue) =>
      issue.code === 'custom' &&
      (issue.params as typeof STALE_CLIENT_ISSUE | undefined)?.staleProjectClient === true,
  );
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
  'clip',
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
export const VIDEO_EDIT_CROP_PRESETS = [
  'original',
  'freeform',
  '16:9',
  '9:16',
  '1:1',
  '4:5',
] as const;
export const VIDEO_EDIT_FILTERS = ['original', 'vivid', 'warm', 'cool', 'mono', 'fade'] as const;
/** Mirror the domain's subtitle vocabulary by hand; the parity suite holds the two together. */
export const SUBTITLE_CUE_PLACEMENTS = ['top', 'middle', 'bottom'] as const;
export const SUBTITLE_CUE_LIMIT = 200;
export const SUBTITLE_CUE_TEXT_MAX_LENGTH = 200;
export const SUBTITLE_CUE_MINIMUM_DURATION_MS = 100;
/** Mirrors the domain's VIDEO_EDIT_AUDIO_LEVEL_MAX by hand; the parity suite holds the two together. */
export const VIDEO_EDIT_AUDIO_LEVEL_MAX = 100;
/** Mirrors the domain's VIDEO_EDIT_MINIMUM_TRIM_MS by hand; the parity suite holds the two together. */
export const VIDEO_EDIT_MINIMUM_TRIM_MS = 100;
/** Mirrors the domain's COMPOSITION_CLIP_LIMIT by hand; the parity suite holds the two together. */
export const COMPOSITION_CLIP_LIMIT = 100;
/** Mirrors the domain's LOCAL_VOICE_EFFECT_IDS by hand; the parity suite holds the two together. */
export const LOCAL_VOICE_EFFECT_IDS = ['warm-studio', 'clear-presenter', 'robot'] as const;

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
      effectId: z.enum(LOCAL_VOICE_EFFECT_IDS),
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

const subtitleCueSchema = z
  .object({
    id: z.uuid(),
    text: z.string().trim().min(1).max(SUBTITLE_CUE_TEXT_MAX_LENGTH),
    startMs: z.number().finite().nonnegative(),
    endMs: z.number().finite(),
    placement: z.enum(SUBTITLE_CUE_PLACEMENTS),
  })
  .strict();

/**
 * One pass over a cue list for every per-list and per-cue rule. It runs on every snapshot read,
 * for the single clip's list and for a composition's alike.
 */
const refineSubtitleCueList = (
  cues: readonly z.infer<typeof subtitleCueSchema>[],
  context: z.RefinementCtx,
  path: readonly (string | number)[],
): void => {
  const seen = new Set<string>();
  cues.forEach((cue, index) => {
    if (cue.endMs - cue.startMs < SUBTITLE_CUE_MINIMUM_DURATION_MS) {
      context.addIssue({
        code: 'custom',
        path: [...path, index, 'endMs'],
        message: 'A subtitle must last at least a tenth of a second.',
      });
    }
    if (seen.has(cue.id)) {
      context.addIssue({
        code: 'custom',
        path: [...path, index, 'id'],
        message: 'Each subtitle needs its own identifier.',
      });
    }
    seen.add(cue.id);
    const previous = cues[index - 1];
    if (previous !== undefined && previous.startMs > cue.startMs) {
      context.addIssue({
        code: 'custom',
        path: [...path, index, 'startMs'],
        message: 'Subtitles must be listed in start order.',
      });
    }
  });
};

/** One cue list, bounded once: the single clip's and a composition's are the same list. */
const subtitleCueListSchema = z.array(subtitleCueSchema).max(SUBTITLE_CUE_LIMIT).readonly();

/** A whole percentage of the source and a mute; no default here, the edit spec supplies its own. */
const videoEditAudioSchema = z
  .object({
    level: z.number().int().min(0).max(VIDEO_EDIT_AUDIO_LEVEL_MAX),
    muted: z.boolean(),
  })
  .strict();

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
    /**
     * Absent from every snapshot written before subtitles existed, and read back as none. Cues
     * may overlap; they must be listed in start order and each carry its own id.
     */
    subtitles: subtitleCueListSchema.default([]),
    /**
     * Absent from every snapshot written before the audio level existed, and read back as the
     * source as recorded: full level, not muted. Last on purpose — the wire mirrors the domain's
     * key order, and equality elsewhere is a comparison of serialized snapshots.
     */
    audio: videoEditAudioSchema.default({ level: VIDEO_EDIT_AUDIO_LEVEL_MAX, muted: false }),
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
    refineSubtitleCueList(value.subtitles, context, ['subtitles']);
  });

const projectExportSpecificationSchema = projectExportSpecificationValueSchema.nullable();

/** The media pointers every snapshot version shares; the arrangement sits after them in v3. */
const projectSnapshotMediaShape = {
  sourceAssetId: z.uuid().nullable(),
  workingMedia: projectMediaReferenceSchema.nullable(),
  presentedMedia: projectMediaReferenceSchema.nullable(),
} as const;

/** The state every snapshot version shares after its version-specific fields. */
const projectSnapshotStateShape = {
  liveMode: projectLiveModeMetadataSchema,
  localEdit: projectVideoEditSpecSchema.nullable(),
  exportSpecification: projectExportSpecificationSchema,
  lastSuccessfulOutput: projectOutputReferenceSchema.nullable(),
  workflowPhase: projectWorkflowPhaseSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
} as const;

const projectSnapshotSharedShape = {
  ...projectSnapshotMediaShape,
  ...projectSnapshotStateShape,
} as const;

const refineSnapshotTimestamps = (
  value: { readonly createdAt: string; readonly updatedAt: string },
  context: z.RefinementCtx,
): void => {
  if (value.updatedAt < value.createdAt) {
    context.addIssue({
      code: 'custom',
      path: ['updatedAt'],
      message: 'A snapshot cannot be updated before it was created.',
    });
  }
};

const canonicalizeSnapshotTimestamps = <
  Value extends { readonly createdAt: string; readonly updatedAt: string },
>(
  value: Value,
): Value => ({
  ...value,
  createdAt: new Date(value.createdAt).toISOString(),
  updatedAt: new Date(value.updatedAt).toISOString(),
});

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

/**
 * The optional AI attachment, in the domain's key order — load-bearing, because the stored
 * snapshot and an incoming proposal are compared as JSON in both apps.
 */
const projectTransformShape = {
  selectedCharacter: projectCharacterSelectionSchema,
  selectedOutfit: projectOutfitSelectionSchema,
  selectedVoice: projectVoiceSelectionSchema.nullable(),
  visualTreatment: projectVisualTreatmentSchema,
  creativeIntent: projectCreativeIntentSchema,
} as const;

const projectTransformObjectSchema = z.object(projectTransformShape).strict();

type ProjectTransformValue = z.infer<typeof projectTransformObjectSchema>;

/** Mirrors the domain's `projectTransformIsEmpty` by hand; the parity suite holds the two together. */
const projectTransformIsEmpty = (value: ProjectTransformValue): boolean => {
  const intent = value.creativeIntent;
  return (
    value.selectedCharacter === null &&
    value.selectedOutfit === null &&
    value.selectedVoice === null &&
    value.visualTreatment.kind === 'none' &&
    intent.promptId === null &&
    intent.promptLabel === null &&
    intent.recipeId === null &&
    intent.recipeLabel === null &&
    intent.userIntent === '' &&
    intent.appliedPrompt === null &&
    intent.referenceAssetId === null &&
    intent.resourceRevision === null
  );
};

const refineProjectTransform = (value: ProjectTransformValue, context: z.RefinementCtx): void => {
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
};

/**
 * One instance for the snapshot and the proposal, so the stored value and the incoming write are
 * canonical by construction. An all-empty transform folds to `null` rather than being refused: the
 * post-save reset produces the empty object whenever no intent was typed, every persisted revision
 * re-parses through this schema in both persistence modes, and the browser parses each staged
 * proposal synchronously — a refusal would surface as a commit-time throw or a render-time error,
 * never as the 400 it looks like.
 */
export const projectTransformSchema = projectTransformObjectSchema
  .superRefine(refineProjectTransform)
  .transform((value) => (projectTransformIsEmpty(value) ? null : value))
  .nullable();

const compositionClipSchema = z
  .object({
    id: z.uuid(),
    media: projectMediaReferenceSchema,
    trim: z
      .object({
        startMs: z.number().finite().nonnegative(),
        endMs: z.number().finite().positive(),
      })
      .strict(),
    audio: videoEditAudioSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.trim.endMs - value.trim.startMs < VIDEO_EDIT_MINIMUM_TRIM_MS) {
      context.addIssue({
        code: 'custom',
        path: ['trim', 'endMs'],
        message: 'A clip must keep at least a tenth of a second of its media.',
      });
    }
  });

/**
 * An ordered sequence of clips over media the Project holds, with one list of cues in sequence
 * time. Nothing defaults: a writer states the whole arrangement, so a bundle that predates a field
 * can never erase it by omission.
 */
export const compositionSchema = z
  .object({
    clips: z.array(compositionClipSchema).min(1).max(COMPOSITION_CLIP_LIMIT).readonly(),
    subtitles: subtitleCueListSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const seen = new Set<string>();
    value.clips.forEach((clip, index) => {
      if (seen.has(clip.id)) {
        context.addIssue({
          code: 'custom',
          path: ['clips', index, 'id'],
          message: 'Each composition clip needs its own identifier.',
        });
      }
      seen.add(clip.id);
    });
    refineSubtitleCueList(value.subtitles, context, ['subtitles']);
  });

const projectSnapshotV3Schema = z
  .object({
    schemaVersion: z.literal(PROJECT_SNAPSHOT_SCHEMA_VERSION),
    ...projectSnapshotMediaShape,
    composition: compositionSchema.nullable(),
    transform: projectTransformSchema,
    ...projectSnapshotStateShape,
  })
  .strict()
  .superRefine(refineSnapshotTimestamps)
  .transform(canonicalizeSnapshotTimestamps);

/**
 * Snapshot v2 — the write format until 2026-09-12: the five AI fields at the top level and no
 * composition. Read only, and only through the map below.
 *
 * It states the shape and nothing else. Every rule about what those fields may say lives on v3,
 * because the map reshapes and then pipes into it: a reshape cannot fail, so the one schema that
 * owns a rule is the one that reports it, and no version has to mirror the next one's refinements
 * to keep `safeParse` from throwing.
 */
const projectSnapshotV2Schema = z
  .object({
    schemaVersion: z.literal(PREVIOUS_PROJECT_SNAPSHOT_SCHEMA_VERSION),
    ...projectSnapshotSharedShape,
    ...projectTransformShape,
  })
  .strict();

/**
 * v2 → v3, as a pure reshape: the five fields regroup under `transform` and the composition is
 * `null` — nothing is synthesised from the single cut, because an arrangement the operator never
 * made would disagree with the working media, which is the rendered cut. It validates nothing;
 * the pipe below hands the result to v3, which owns every rule including the empty-to-null fold.
 */
const regroupProjectSnapshotV2 = (
  previous: z.infer<typeof projectSnapshotV2Schema>,
): z.input<typeof projectSnapshotV3Schema> => {
  const {
    selectedCharacter,
    selectedOutfit,
    selectedVoice,
    visualTreatment,
    creativeIntent,
    ...rest
  } = previous;
  return {
    ...rest,
    schemaVersion: PROJECT_SNAPSHOT_SCHEMA_VERSION,
    composition: null,
    transform: {
      selectedCharacter,
      selectedOutfit,
      selectedVoice,
      visualTreatment,
      creativeIntent,
    },
  };
};

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
            effectId: z.enum(LOCAL_VOICE_EFFECT_IDS),
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

/** v1 → v2's shape: what v1 never recorded is `null`, never a guess. A reshape, like the step above. */
const toProjectSnapshotV2Body = (
  legacy: z.infer<typeof legacyProjectSnapshotSchema>,
): z.input<typeof projectSnapshotV2Schema> => ({
  ...legacy,
  schemaVersion: PREVIOUS_PROJECT_SNAPSHOT_SCHEMA_VERSION,
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

/**
 * The read maps, as the union uses them: reshape, then pipe into the schema that owns the rules.
 * v1 goes through v2's shape on the way, so there is one map per version step rather than one per
 * version pair, and adding v4 adds one link to the chain.
 */
const projectSnapshotV2ReadSchema = projectSnapshotV2Schema
  .transform(regroupProjectSnapshotV2)
  .pipe(projectSnapshotV3Schema);

const projectSnapshotV1ReadSchema = legacyProjectSnapshotSchema
  .transform(toProjectSnapshotV2Body)
  .pipe(projectSnapshotV2ReadSchema);

/**
 * Every version a stored snapshot may carry, read as v3. Members are strict and the version
 * literal routes the row, so a v2 body carrying a stray v3 key is refused rather than half-read,
 * and the current format is the first member tried.
 *
 * Not a discriminated union, which would route on the version instead of trying members in turn:
 * its option type rejects a piped member, and buying that routing would mean asserting past the
 * types. The cost is one discarded attempt when reading a row older than the write format, which
 * only stored rows pay and which shrinks as they are rewritten.
 */
export const projectSnapshotSchema = z.union([
  projectSnapshotV3Schema,
  projectSnapshotV2ReadSchema,
  projectSnapshotV1ReadSchema,
]);

/** The v2 → v3 step on its own, so the migration property tests can hold the map to the union. */
export const migrateProjectSnapshotV2 = (previous: z.infer<typeof projectSnapshotV2Schema>) =>
  projectSnapshotV3Schema.parse(regroupProjectSnapshotV2(previous));

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
    nextCursor: opaquePageTokenSchema.nullable(),
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
      kind: z.literal('source-limit'),
      projectId: projectIdSchema,
      limit: z.number().int().positive(),
    })
    .strict(),
  z.object({ kind: z.literal('primary-source'), projectId: projectIdSchema }).strict(),
  z.object({ kind: z.literal('source-already-held'), projectId: projectIdSchema }).strict(),
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
    nextCursor: opaquePageTokenSchema.nullable(),
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
    /**
     * Whether *this output's Version* has a stored poster frame — not the Video's current one.
     * A surface that asks for a poster it was never given cannot tell an absence from a failure,
     * and told the operator a load had failed when nothing had ever been stored.
     */
    thumbnailAvailable: z.boolean(),
    contentUrl: z.string().startsWith('/api/projects/').max(500),
  })
  .strict();
export const projectOutputHistoryResponseSchema = z
  .object({
    outputs: z.array(projectOutputHistoryItemSchema).max(40),
    nextCursor: opaquePageTokenSchema.nullable(),
  })
  .strict();
export const projectWorkingMediaParamsSchema = z
  .object({ projectId: projectIdSchema, revisionId: projectRevisionIdSchema })
  .strict();
/** A source is addressed by the media the Project holds; that pair is its key. */
export const projectSourceParamsSchema = z
  .object({ projectId: projectIdSchema, sourceAssetId: z.uuid() })
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
    nextCursor: opaquePageTokenSchema.nullable(),
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
/**
 * The edit specification as a *proposal* rather than as something read back.
 *
 * `subtitles` carries a default so a snapshot written before the field existed still parses. A
 * proposal is a write, and there the same default is lossy: a tab still running a pre-subtitles
 * bundle echoes the whole specification back when it autosaves anything at all, the missing key
 * defaults to an empty list, and the stored cues are overwritten by a client that never knew about
 * them. Requiring the key refuses that write instead, which a reload fixes and data loss does not.
 */
/**
 * Every field a snapshot defaults on read, which a current client therefore always states on a
 * write. A proposal missing one comes from a bundle that predates it, and letting the default fill
 * it in would overwrite what is stored with what that bundle never knew about.
 */
const DEFAULTED_EDIT_FIELDS = ['subtitles', 'audio'] as const;

const statesEveryDefaultedField = (value: unknown, context: z.RefinementCtx): void => {
  if (value === null || typeof value !== 'object') return;
  for (const field of DEFAULTED_EDIT_FIELDS) {
    if (!(field in value)) {
      context.addIssue({
        code: 'custom',
        path: [field],
        params: STALE_CLIENT_ISSUE,
        message: PROJECT_STALE_CLIENT_MESSAGE,
      });
    }
  }
};

/** The same requirement where a specification is mandatory rather than nullable. */
const requiredCueVideoEditSpecSchema = z
  .unknown()
  .superRefine(statesEveryDefaultedField)
  .pipe(projectVideoEditSpecSchema);

const proposedVideoEditSpecSchema = z
  .unknown()
  .superRefine(statesEveryDefaultedField)
  .pipe(projectVideoEditSpecSchema.nullable());

const PRE_V3_PROPOSAL_KEYS = Object.keys(projectTransformShape);

/**
 * A bundle built before snapshot v3 still sends the five AI fields at the top level. The strict
 * object below refuses that anyway; naming the reason lets the 400 say "reload" instead of a
 * validation code.
 *
 * A bundle built before the arrangement is stale the other way: it omits `composition` entirely.
 * That one is refused rather than defaulted, and the difference matters — a default would let a
 * tab left open from yesterday check a creative field in and silently take the operator's whole
 * arrangement out with it, because the proposal replaces the snapshot's creative part wholesale.
 * Refusing costs that tab a reload; defaulting would cost it the composition.
 */
const refusesPreV3Proposal = (value: unknown, context: z.RefinementCtx): void => {
  if (typeof value !== 'object' || value === null) return;
  if (PRE_V3_PROPOSAL_KEYS.some((key) => key in value) || !('composition' in value)) {
    context.addIssue({
      code: 'custom',
      path: ['transform'],
      params: STALE_CLIENT_ISSUE,
      message: PROJECT_STALE_CLIENT_MESSAGE,
    });
  }
};

/**
 * The checkpoint write: the snapshot's mutable creative part, in the snapshot's own shape. Server
 * authority supplies the media pointers and the timestamps.
 */
export const projectSessionProposalSchema = z
  .unknown()
  .superRefine(refusesPreV3Proposal)
  .pipe(
    z
      .object({
        workflowPhase: projectWorkflowPhaseSchema,
        liveMode: projectLiveModeMetadataSchema,
        transform: projectTransformSchema,
        localEdit: proposedVideoEditSpecSchema,
        exportSpecification: projectExportSpecificationSchema,
        /**
         * Last on purpose, like `VideoEditSpec.audio`: every field above it predates it, and the
         * three places that spell this order — here, `sessionProposalMatches` and
         * `proposalFromCurrent` — compare as serialized text, so appending is the one edit that
         * cannot silently re-order one of them against the other two.
         */
        composition: compositionSchema.nullable(),
      })
      .strict(),
  );

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
    localEdit: requiredCueVideoEditSpecSchema,
  })
  .strict();

export const adoptProjectWorkingMediaRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    expectedRevisionNumber: z.number().int().positive(),
    media: projectMediaReferenceSchema,
    localEdit: proposedVideoEditSpecSchema,
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
 * How many placements one save may produce: the number of placement aspects the domain defines.
 * Mirrored by hand because contracts cannot import the domain; `shared-contract-parity` holds the
 * two together.
 */
export const PROJECT_EXPORT_PLACEMENT_COUNT = 4;

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
     * Every placement this save produced, in canonical aspect order. An empty list means the cut is
     * stored in the shape it already has — "Keep as it is", or a browser that could not re-frame.
     * Defaulted so a save receipt written before this field existed still replays.
     *
     * The cap is the number of placements that exist (`PROJECT_EXPORT_PLACEMENT_ASPECTS` in the
     * domain, mirrored here because contracts cannot import it and held by the parity suite), and
     * the members are distinct by aspect: the filename tag is the aspect alone, so two members of
     * one aspect would land as one name and read as one placement on every surface.
     */
    renditions: z
      .array(projectOutputRenditionSchema)
      .max(PROJECT_EXPORT_PLACEMENT_COUNT)
      .default([])
      .superRefine((renditions, context) => {
        const seen = new Set<string>();
        renditions.forEach(({ specification }, index) => {
          if (specification.aspect === 'source') {
            context.addIssue({
              code: 'custom',
              path: [index, 'specification', 'aspect'],
              message: 'Keeping the original shape is not a placement a save produces.',
            });
            return;
          }
          if (seen.has(specification.aspect)) {
            context.addIssue({
              code: 'custom',
              path: [index, 'specification', 'aspect'],
              message: 'One save cannot produce the same placement twice.',
            });
          }
          seen.add(specification.aspect);
        });
      }),
    /**
     * The set these placements join, when this save adds members to one that already exists.
     *
     * Optional with no default, and omitted rather than sent as null on an ordinary save: the
     * replay fingerprint hashes the parsed body, so a defaulted key would turn every receipt
     * written before this field into an operation-key conflict. It is identity from the body and is
     * never trusted on its own — the server accepts it only against the session owner's own target.
     */
    variantSetId: z.uuid().optional(),
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
      /*
       * Whether the revision presents what it produced is decided by whether the bytes were
       * re-framed, and the Version says so itself: a placement is recorded exactly when a rendition
       * was stored. So this asserts the matching rule rather than the weaker one common to both —
       * a stored cut must be presented, and a deliverable must provably not be, which is the point
       * of the distinction. Either way the pair must be present and exact, as the domain requires.
       */
      working === null ||
      presented === null ||
      JSON.stringify(working) !== JSON.stringify(presented) ||
      (value.savedVideo.currentVersion.exportSpecification === null
        ? working.kind !== 'saved-video-version' ||
          working.savedVideoId !== value.output.savedVideoId ||
          working.videoVersionId !== value.output.videoVersionId
        : working.kind === 'saved-video-version' &&
          working.videoVersionId === value.output.videoVersionId)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'A Project output result must preserve producing-revision provenance, name the completed Version, and present the cut it stored — the Version when that Version is the cut, and never a re-framed deliverable.',
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
      .strict()
      // On the source object rather than the response, the way `projectWorkingMediaSchema` states
      // the same rule about the same media — so the collection item inherits it by extension and
      // one kind of lineage cannot be exact on one read and complete on the other.
      .superRefine((source, context) => {
        const reused = source.kind === 'saved-video-version';
        if (reused !== (source.savedVideoId !== null && source.videoVersionId !== null)) {
          context.addIssue({
            code: 'custom',
            message: 'Saved Video source lineage must be exact and complete.',
          });
        }
      }),
  })
  .strict()
  .superRefine((value, context) => {
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

/** Mirrors the domain's PROJECT_SOURCE_LIMIT by hand; the parity suite holds the two together. */
export const PROJECT_SOURCE_LIMIT = 100;

/**
 * One member of a Project's source collection.
 *
 * The byte facts are taken from the single-source response rather than restated, so the two shapes
 * cannot drift; what the collection adds is which media each one is — the key a Project addresses a
 * source by — and a content URL that names it. `assetId` is already public for the primary, through
 * the snapshot's `sourceAssetId`, and working media exposes its own the same way.
 */
export const projectSourceCollectionItemSchema = projectSourceResponseSchema.shape.source
  .safeExtend({
    assetId: z.uuid(),
    acceptedRevisionId: projectRevisionIdSchema,
    acceptedRevisionNumber: z.number().int().positive(),
    contentUrl: z
      .string()
      .regex(
        /^\/api\/projects\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/sources\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/content$/u,
      ),
  })
  .strict();

export const projectSourceListResponseSchema = z
  .object({
    project: projectSchema,
    revision: projectRevisionSchema,
    sources: z.array(projectSourceCollectionItemSchema).max(PROJECT_SOURCE_LIMIT),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.revision.projectId !== value.project.id ||
      value.revision.id !== value.project.currentRevisionId ||
      value.revision.revisionNumber !== value.project.currentRevisionNumber
    ) {
      context.addIssue({
        code: 'custom',
        path: ['revision'],
        message: 'Project source lists must describe the exact current revision.',
      });
    }
    const addressed = new Set(value.sources.map(({ assetId }) => assetId));
    if (addressed.size !== value.sources.length) {
      context.addIssue({
        code: 'custom',
        path: ['sources'],
        message: 'A Project holds each piece of source media once.',
      });
    }
    for (const [index, source] of value.sources.entries()) {
      if (
        source.contentUrl !== `/api/projects/${value.project.id}/sources/${source.assetId}/content`
      ) {
        context.addIssue({
          code: 'custom',
          path: ['sources', index],
          message: 'Each source must be addressed by the media the Project holds.',
        });
      }
    }
    // A Project that holds material names one piece of it as the original, because that pointer is
    // what every single-source read resolves through. A Project that holds none may still carry the
    // pointer: duplicating one copies its snapshot without its material.
    const primary = value.revision.snapshot.sourceAssetId;
    if (value.sources.length > 0 && (primary === null || !addressed.has(primary))) {
      context.addIssue({
        code: 'custom',
        path: ['sources'],
        message: 'A Project holds its original among its sources.',
      });
    }
  });

export type ProjectSnapshotContract = z.infer<typeof projectSnapshotSchema>;
export type ProjectTransformContract = NonNullable<z.infer<typeof projectTransformSchema>>;
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
export type ProjectSourceCollectionItem = z.infer<typeof projectSourceCollectionItemSchema>;
export type ProjectSourceListResponse = z.infer<typeof projectSourceListResponseSchema>;
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
