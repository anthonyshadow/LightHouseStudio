import type { VideoEditSpec } from '../video-editing';

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

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

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

export type ProjectAssetRole = (typeof PROJECT_ASSET_ROLES)[number];

export const PROJECT_ASSET_KINDS = ['video', 'character', 'outfit', 'voice'] as const;

export type ProjectAssetKind = (typeof PROJECT_ASSET_KINDS)[number];

export const PROJECT_WORKFLOW_PHASES = [
  'source',
  'creative',
  'processing',
  'review',
  'export',
  'complete',
] as const;

export type ProjectWorkflowPhase = (typeof PROJECT_WORKFLOW_PHASES)[number];

export const PROJECT_REVISION_SOURCES = [
  'create',
  'user-edit',
  'job-result',
  'output-save',
  'restore',
  'migration',
] as const;

export type ProjectRevisionSource = (typeof PROJECT_REVISION_SOURCES)[number];

export type ProjectMediaReference =
  | { readonly kind: 'asset'; readonly assetId: string }
  | {
      readonly kind: 'saved-video-version';
      readonly savedVideoId: string;
      readonly videoVersionId: string;
    };

export interface ProjectCharacterSelection {
  readonly characterId: string;
  /** Applied display value retained even when the reusable Character is later unavailable. */
  readonly characterLabel: string | null;
  /** Creative-resource revision used at the checkpoint. Current stores use their updatedAt value. */
  readonly characterRevision: string | null;
  readonly variantId: string | null;
  readonly variantLabel: string | null;
  readonly variantRevision: string | null;
  /** Exact immutable reference used by this applied selection. */
  readonly referenceAssetId: string | null;
}

export interface ProjectOutfitSelection {
  readonly outfitId: string;
  readonly outfitLabel: string | null;
  readonly outfitRevision: string | null;
  readonly referenceAssetId: string | null;
  readonly inputKind: 'prompt' | 'saved-outfit' | null;
}

export type ProjectVoiceSelection =
  | {
      readonly kind: 'local-effect';
      readonly effectId: 'warm-studio' | 'clear-presenter' | 'robot';
      readonly effectRevision: 'builtin-v1' | null;
    }
  | {
      readonly kind: 'saved-voice';
      readonly voiceId: string;
      readonly voiceName: string;
      readonly resourceRevision: string | null;
      readonly treatment: {
        readonly stability: number | null;
        readonly similarity: number | null;
        readonly style: number | null;
        readonly speakerBoost: boolean | null;
      };
    };

export type ProjectVisualTreatment =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'character-swap';
      readonly providerId: string | null;
      readonly outputResolution: '720p' | '1080p' | null;
    }
  | {
      readonly kind: 'virtual-try-on';
      readonly providerId: string | null;
      readonly outputResolution: '720p' | '1080p' | null;
      readonly inputKind: 'prompt' | 'saved-outfit' | 'reference-image' | null;
      readonly enhancePrompt: boolean | null;
    };

export interface ProjectLiveModeMetadata {
  readonly modeId: string;
  readonly captureFormat: 'landscape' | 'portrait' | 'freeform';
  readonly audioSource: 'local-microphone' | 'model-output' | 'none';
}

export interface ProjectCreativeIntent {
  readonly promptId: string | null;
  readonly promptLabel: string | null;
  readonly recipeId: string | null;
  readonly recipeLabel: string | null;
  readonly userIntent: string;
  /** Canonical value applied to the controls, not a copy of the reusable record. */
  readonly appliedPrompt: string | null;
  readonly referenceAssetId: string | null;
  readonly resourceRevision: string | null;
}

/** Where a finished video is going. `source` keeps whatever shape the media already has. */
export const PROJECT_EXPORT_ASPECTS = ['source', '16:9', '9:16', '1:1', '4:5'] as const;

export type ProjectExportAspect = (typeof PROJECT_EXPORT_ASPECTS)[number];

export interface ProjectExportSpecification {
  readonly container: 'video/mp4';
  readonly aspect: ProjectExportAspect;
  readonly resolution: { readonly width: number; readonly height: number } | null;
  readonly includeAudio: boolean;
}

export interface ProjectOutputReference {
  readonly savedVideoId: string;
  readonly videoVersionId: string;
}

export interface ProjectSnapshot {
  readonly schemaVersion: typeof PROJECT_SNAPSHOT_SCHEMA_VERSION;
  readonly sourceAssetId: string | null;
  readonly workingMedia: ProjectMediaReference | null;
  readonly presentedMedia: ProjectMediaReference | null;
  readonly selectedCharacter: ProjectCharacterSelection | null;
  readonly selectedOutfit: ProjectOutfitSelection | null;
  readonly selectedVoice: ProjectVoiceSelection | null;
  readonly visualTreatment: ProjectVisualTreatment;
  readonly liveMode: ProjectLiveModeMetadata | null;
  readonly creativeIntent: ProjectCreativeIntent;
  readonly localEdit: VideoEditSpec | null;
  readonly exportSpecification: ProjectExportSpecification | null;
  readonly lastSuccessfulOutput: ProjectOutputReference | null;
  readonly workflowPhase: ProjectWorkflowPhase;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface Project {
  readonly id: string;
  readonly ownerUserId: string;
  /** Optional organizer only; Campaign never owns Project working state. */
  readonly campaignId: string | null;
  readonly title: string;
  readonly status: ProjectStatus;
  /** CAS token for every aggregate mutation, including metadata and lifecycle changes. */
  readonly version: number;
  readonly currentRevisionId: string;
  readonly currentRevisionNumber: number;
  readonly archivedAt: string | null;
  readonly deletedAt: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ProjectRevisionAuthor =
  | { readonly kind: 'user'; readonly authorId: string }
  | { readonly kind: 'system'; readonly authorId: string }
  | { readonly kind: 'migration'; readonly authorId: string };

export interface ProjectRevision {
  readonly id: string;
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly revisionNumber: number;
  readonly parentRevisionId: string | null;
  readonly parentRevisionNumber: number | null;
  readonly snapshot: ProjectSnapshot;
  readonly author: ProjectRevisionAuthor;
  readonly source: ProjectRevisionSource;
  readonly createdAt: string;
}

export interface ProjectAssetLink {
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly assetId: string;
  readonly role: ProjectAssetRole;
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly createdAt: string;
}

/** Non-owning organizational membership; it never replaces revision-scoped media lineage. */
export interface ProjectAssetMembership {
  readonly id: string;
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly kind: ProjectAssetKind;
  readonly resourceId: string;
  readonly createdAt: string;
}

export type ProjectVersionReferenceRole = 'working' | 'presented';

export const PROJECT_SOURCE_KINDS = ['uploaded', 'recorded', 'saved-video-version'] as const;

export type ProjectSourceKind = (typeof PROJECT_SOURCE_KINDS)[number];

/** A revision-scoped used-by relation. It never claims that this Project produced the Version. */
export interface ProjectVersionReferenceLink {
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly savedVideoId: string;
  readonly videoVersionId: string;
  readonly role: ProjectVersionReferenceRole;
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly createdAt: string;
}

export interface ProjectJobLink {
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly jobId: string;
  readonly initiatingRevisionId: string;
  readonly initiatingRevisionNumber: number;
  readonly createdAt: string;
}

export interface ProjectOutputLink {
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly savedVideoId: string;
  readonly videoVersionId: string;
  /** Immutable provenance for the revision that actually produced this Version. */
  readonly producingRevisionId: string;
  readonly producingRevisionNumber: number;
  readonly createdAt: string;
}

export interface ProjectAggregate {
  readonly project: Project;
  readonly revisions: readonly ProjectRevision[];
  readonly assetLinks: readonly ProjectAssetLink[];
  readonly versionReferenceLinks: readonly ProjectVersionReferenceLink[];
  readonly jobLinks: readonly ProjectJobLink[];
  readonly outputLinks: readonly ProjectOutputLink[];
}

export interface ProjectStatusFacts {
  readonly sourceStatus: 'none' | 'ready' | 'unavailable';
  /** Facts for the current attempt only; historical jobs cannot be folded into this value. */
  readonly currentAttempt:
    | { readonly status: 'none' }
    | {
        readonly status: 'active' | 'failed' | 'succeeded';
        readonly jobId: string;
      };
  /** Exact, owner-validated retained output for the current snapshot, or null. */
  readonly validatedLastSuccessfulOutput: ProjectOutputReference | null;
}

export type ProjectConflict =
  | {
      readonly kind: 'operation-key';
      readonly operation: 'create' | 'source-accept' | 'working-media-adopt' | 'output-save';
    }
  | {
      readonly kind: 'project-version';
      readonly projectId: string;
      readonly expectedVersion: number;
      readonly actualVersion: number;
    }
  | {
      readonly kind: 'revision';
      readonly projectId: string;
      readonly expectedRevisionNumber: number;
      readonly actualRevisionNumber: number;
    }
  | {
      readonly kind: 'relation-mismatch';
      readonly projectId: string;
      readonly relation: 'job' | 'output';
    }
  | {
      readonly kind: 'active-jobs';
      readonly projectId: string;
    }
  | {
      readonly kind: 'campaign-membership';
      readonly projectId: string;
    }
  | {
      readonly kind: 'immutable-source';
      readonly projectId: string;
    }
  | {
      readonly kind: 'saved-video-version';
      readonly savedVideoId: string;
      readonly expectedVersionId: string;
      readonly actualVersionId: string;
    };

export type ProjectMutationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly conflict: ProjectConflict };

export interface ProjectMutationContext {
  readonly now: string;
  readonly createId: () => string;
}
