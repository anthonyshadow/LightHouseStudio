import { type ReferenceImageAsset } from '@studio/contracts';
import { createPromptBuilderDraft, type GuidedDesignV1 } from '@studio/domain';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import { createEmptyGuidedDesign } from './CharacterBuilderForm';
import type { CharacterBuilderState } from './machine';
import { DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS } from './ReferenceOptionsFields';
import type {
  CharacterBuilderDraftValueV1,
  PersistedCharacterBuilderPreview,
  PersistedCharacterSaveSnapshot,
} from './characterBuilderPersistence';

export interface CharacterBuilderOperationLocks {
  save: boolean;
  close: boolean;
  discard: boolean;
  reset: boolean;
  generation: boolean;
}

export interface CharacterBuilderOperationLocksRef {
  readonly current: CharacterBuilderOperationLocks;
}

export interface CharacterBuilderStateRef {
  readonly current: CharacterBuilderState;
}

export const createCharacterBuilderOperationLocks = (): CharacterBuilderOperationLocks => ({
  save: false,
  close: false,
  discard: false,
  reset: false,
  generation: false,
});

export const createFreshCharacterBuilderDraftValue = (): CharacterBuilderDraftValueV1 => ({
  draft: createPromptBuilderDraft('character-transform'),
  design: createEmptyGuidedDesign(),
  options: DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS,
  preview: null,
  pendingSave: null,
});

export const toPersistedCharacterBuilderPreview = (
  state: CharacterBuilderState,
): PersistedCharacterBuilderPreview | null =>
  state.preview
    ? {
        assetId: state.preview.asset.assetId,
        sourceKey: state.preview.sourceKey,
        stale: state.preview.stale,
      }
    : null;

export const deriveCharacterName = (design: GuidedDesignV1): string => {
  const base = design.starterId ?? 'new-character';
  return `${base
    .split('-')
    .filter(Boolean)
    .map((part) => `${part[0]?.toLocaleUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ')} 01`;
};

export const characterBuilderOperationError = (error: unknown): string => {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'moderation_blocked':
        return 'The provider could not accept this character direction. Adjust it and try again.';
      case 'generation_in_progress':
        return 'Another reference request is still finishing. Wait a moment, then retry.';
      case 'request_timeout':
        return 'The image request timed out. Your character and previous preview are unchanged.';
      case 'edit_unavailable':
      case 'provider_configuration':
        return 'Instructed image editing is not available. Leave feedback blank for a fresh preview.';
      default:
        return error.message;
    }
  }
  return error instanceof Error
    ? error.message
    : 'The operation could not finish. Your character draft is unchanged.';
};

export interface CharacterSaveSnapshot extends PersistedCharacterSaveSnapshot {
  readonly referenceImage: ReferenceImageAsset | null;
}

export interface CharacterSaveProgress {
  markCharacterPersisted(): Promise<void>;
  markStudioPreloaded(): Promise<void>;
}
