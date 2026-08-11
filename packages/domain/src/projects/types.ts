import type { VideoEditSpec } from '../video-editing';

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
  readonly variantId: string | null;
}

export interface ProjectOutfitSelection {
  readonly outfitId: string;
}

export type ProjectVoiceSelection =
  | {
      readonly kind: 'local-effect';
      readonly effectId: 'warm-studio' | 'clear-presenter' | 'robot';
    }
  | {
      readonly kind: 'saved-voice';
      readonly voiceId: string;
      readonly voiceName: string;
      readonly treatment: {
        readonly stability: number | null;
        readonly similarity: number | null;
        readonly style: number | null;
        readonly speakerBoost: boolean | null;
      };
    };

export type ProjectVisualTreatment =
  | { readonly kind: 'none' }
  | { readonly kind: 'character-swap' }
  | { readonly kind: 'virtual-try-on' };

export interface ProjectLiveModeMetadata {
  readonly modeId: string;
  readonly captureFormat: 'landscape' | 'portrait' | 'freeform';
  readonly audioSource: 'local-microphone' | 'model-output' | 'none';
}

export interface ProjectCreativeIntent {
  readonly promptId: string | null;
  readonly recipeId: string | null;
  readonly userIntent: string;
}

export interface ProjectExportSpecification {
  readonly container: 'video/mp4';
  readonly aspect: 'source' | '16:9' | '9:16' | '1:1' | '4:5';
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

export interface ProjectJobLink {
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly jobId: string;
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly createdAt: string;
}

export interface ProjectOutputLink {
  readonly projectId: string;
  readonly ownerUserId: string;
  readonly savedVideoId: string;
  readonly videoVersionId: string;
  readonly revisionId: string;
  readonly revisionNumber: number;
  readonly createdAt: string;
}

export interface ProjectAggregate {
  readonly project: Project;
  readonly revisions: readonly ProjectRevision[];
  readonly assetLinks: readonly ProjectAssetLink[];
  readonly jobLinks: readonly ProjectJobLink[];
  readonly outputLinks: readonly ProjectOutputLink[];
}

export interface ProjectStatusFacts {
  readonly sourceStatus: 'none' | 'ready' | 'unavailable';
  readonly activeJobCount: number;
  readonly failedJobCount: number;
  readonly successfulOutputCount: number;
}

export type ProjectConflict =
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
    };

export type ProjectMutationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly conflict: ProjectConflict };

export interface ProjectMutationContext {
  readonly now: string;
  readonly createId: () => string;
}
