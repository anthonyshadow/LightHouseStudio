import type { CharacterTransformDraft, GuidedDesignV1 } from '@studio/domain';

export const GUIDED_PROJECT_SCHEMA_VERSION = 1 as const;

export type GuidedReferenceMode = 'prompt-only' | 'generate' | 'existing';

export type GuidedFinalVariant = 'original' | 'processed';

export interface PersistedVideoMetadata {
  readonly filename: string;
  readonly mimeType: string;
  readonly sourceModeId: string;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly sizeBytes: number;
}

export type GuidedProjectCheckpoint =
  | 'character-design'
  | 'character-ready'
  | 'review-take'
  | 'accepted-take'
  | 'selected-voice'
  | 'processed-voice'
  | 'delivery-ready'
  | 'complete';

/**
 * The complete allowlisted, serializable state required to resume a stable
 * guided-flow checkpoint. Runtime media objects and provider state do not
 * belong in this record.
 */
export interface GuidedProjectDataV1 {
  readonly characterId: string | null;
  readonly characterName: string;
  readonly characterPrompt: string;
  /** Complete canonical draft used by Guided and Advanced editing surfaces. */
  readonly characterDraft: CharacterTransformDraft | null;
  readonly guidedDesign: GuidedDesignV1 | null;
  readonly referenceMode: GuidedReferenceMode | null;
  readonly referenceImageAssetId: string | null;
  readonly referenceImageStale: boolean;
  readonly originalVideoArtifactId: string | null;
  readonly originalVideoMetadata: PersistedVideoMetadata | null;
  readonly originalAudioArtifactId: string | null;
  readonly originalAudioMimeType: string | null;
  readonly processedVideoArtifactId: string | null;
  readonly processedVideoMetadata: PersistedVideoMetadata | null;
  readonly finalVariant: GuidedFinalVariant | null;
  readonly selectedVoiceId: string | null;
  readonly selectedVoiceName: string | null;
  readonly downloadStartedAt: string | null;
  readonly completedAt: string | null;
}

export interface ProjectRecordV1 {
  readonly schemaVersion: typeof GUIDED_PROJECT_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly revision: number;
  readonly checkpoint: GuidedProjectCheckpoint;
  readonly data: GuidedProjectDataV1;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectSummary {
  readonly id: string;
  readonly title: string;
  readonly revision: number;
  readonly checkpoint: GuidedProjectCheckpoint;
  readonly characterName: string;
  readonly hasOriginalVideo: boolean;
  readonly hasProcessedVideo: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type ProjectStorageHealth = 'ready' | 'session-only' | 'degraded';

export interface ProjectStorageState {
  readonly health: ProjectStorageHealth;
  readonly durable: boolean;
  readonly notice: string | null;
}

export interface LocalProjectRepository {
  initialize(): Promise<ProjectStorageState>;
  getStorageState(): ProjectStorageState;
  count(): Promise<number>;
  list(): Promise<readonly ProjectSummary[]>;
  load(projectId: string): Promise<ProjectRecordV1 | null>;
  loadNewestCharacterDesign(): Promise<ProjectRecordV1 | null>;
  readArtifact(projectId: string, artifactId: string): Promise<Blob | null>;
  deleteProject(projectId: string): Promise<void>;
  close(): void;
}
