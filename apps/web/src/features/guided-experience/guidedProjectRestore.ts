import { createPromptBuilderDraft, type CharacterTransformDraft } from '@studio/domain';
import {
  restoreGuidedFlowState,
  type GuidedFlowState,
  type GuidedProjectDataV1,
  type ProjectRecordV1,
} from '../guided-flow';
import type { GuidedDesignV1 } from '../guided-flow/types';
import { buildCanonicalCharacterDraft, createGuidedDesignFromDraft } from './guidedCharacterModel';

export type GuidedRestoredCharacter = Readonly<{
  draft: CharacterTransformDraft;
  design: GuidedDesignV1;
}>;

export type GuidedRestoreAvailability = Readonly<{
  referenceMissing: boolean;
  originalMissing: boolean;
  processedMissing: boolean;
}>;

export type GuidedRestoreResult = Readonly<{
  flow: GuidedFlowState;
  warnings: readonly string[];
}>;

export const restoreCharacterEditingState = (
  data: GuidedProjectDataV1,
  shelfDraft: CharacterTransformDraft | null,
): GuidedRestoredCharacter => {
  const draft =
    data.characterDraft ??
    shelfDraft ??
    (data.guidedDesign
      ? buildCanonicalCharacterDraft(data.guidedDesign)
      : createPromptBuilderDraft('character-transform'));
  return {
    draft,
    design: data.guidedDesign ?? createGuidedDesignFromDraft(draft),
  };
};

const withoutMedia = (data: GuidedProjectDataV1): GuidedProjectDataV1 => ({
  ...data,
  originalVideoArtifactId: null,
  originalVideoMetadata: null,
  originalAudioArtifactId: null,
  originalAudioMimeType: null,
  processedVideoArtifactId: null,
  processedVideoMetadata: null,
  finalVariant: null,
  selectedVoiceId: null,
  selectedVoiceName: null,
});

const withoutProcessed = (data: GuidedProjectDataV1): GuidedProjectDataV1 => ({
  ...data,
  processedVideoArtifactId: null,
  processedVideoMetadata: null,
  finalVariant: data.finalVariant === 'processed' ? 'original' : data.finalVariant,
});

/** Rebase a persisted checkpoint when an external reference or local media Blob is missing. */
export const reconcileGuidedRestore = (
  project: ProjectRecordV1,
  availability: GuidedRestoreAvailability,
): GuidedRestoreResult => {
  const warnings: string[] = [];
  let data = project.data;
  let status = restoreGuidedFlowState(project).status;

  if (availability.referenceMissing) {
    data = { ...data, referenceImageStale: true };
    warnings.push(
      'The prior reference image is unavailable, so this project resumed from its complete character prompt.',
    );
  }

  const checkpointNeedsOriginal =
    project.checkpoint !== 'character-design' && project.checkpoint !== 'character-ready';
  if (checkpointNeedsOriginal && availability.originalMissing) {
    data = withoutMedia(data);
    status = 'live.ready';
    warnings.push(
      'The saved take is unavailable. Your character is intact and ready for a new live session.',
    );
  } else if (data.processedVideoArtifactId && availability.processedMissing) {
    data = withoutProcessed(data);
    if (status === 'voice.review') status = 'voice.choosing';
    warnings.push(
      'The processed voice version is unavailable. The immutable original take remains ready.',
    );
  }

  return {
    flow: {
      ...restoreGuidedFlowState({ ...project, data }),
      status,
      error: warnings.length ? warnings.join(' ') : null,
    },
    warnings,
  };
};
