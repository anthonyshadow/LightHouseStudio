import { useTheme } from '@emotion/react';
import type { CharacterTransformDraft } from '@studio/domain';
import type { GuidedDesignV1, GuidedFlowState, ProjectStorageState } from '../guided-flow';
import { Button, StatusNotice } from '../../ui';
import { GuidedCharacterBuilder } from './GuidedCharacterBuilder';
import {
  GuidedReferenceChoice,
  GuidedReferenceSettings,
  type GeneratedGuidedReference,
} from './GuidedReferencePanel';
import { primaryActionRowStyles } from './GuidedExperience.styles';
import { GuidedStageHeader } from './GuidedExperienceChrome';

export type GuidedCreateStageProps = {
  flow: GuidedFlowState;
  storage: ProjectStorageState;
  draft: CharacterTransformDraft;
  design: GuidedDesignV1;
  builderError: string | null;
  referencePreviewUrl: string | null;
  preparingCharacterSave: boolean;
  referenceImagesAvailable: boolean;
  referenceImageOptimizerAvailable: boolean;
  onBuilderChange(draft: CharacterTransformDraft, design: GuidedDesignV1): void;
  onRequestSaveCharacter(): void;
  onReferenceChoiceCancel(): void;
  onPromptOnly(): void;
  onGenerateSelected(): void;
  onKeepExisting(): void;
  onReferenceSettingsCancel(): void;
  onGenerated(result: GeneratedGuidedReference): Promise<void>;
};

export const GuidedCreateStage = ({
  flow,
  storage,
  draft,
  design,
  builderError,
  referencePreviewUrl,
  preparingCharacterSave,
  referenceImagesAvailable,
  referenceImageOptimizerAvailable,
  onBuilderChange,
  onRequestSaveCharacter,
  onReferenceChoiceCancel,
  onPromptOnly,
  onGenerateSelected,
  onKeepExisting,
  onReferenceSettingsCancel,
  onGenerated,
}: GuidedCreateStageProps) => {
  const theme = useTheme();
  const choosingReference =
    flow.status === 'create.reference-choice' ||
    (flow.status === 'create.saving' && flow.pending?.kind !== 'save-character-with-reference');
  const configuringReference =
    flow.status === 'create.reference-settings' ||
    (flow.status === 'create.saving' && flow.pending?.kind === 'save-character-with-reference');

  return (
    <>
      <GuidedStageHeader
        title="Create Your Character"
        description="Pick a starter, then shape every visual direction with guided choices."
        storage={storage}
      />
      {builderError ? (
        <StatusNotice role="alert" tone="danger">
          {builderError}
        </StatusNotice>
      ) : null}
      {flow.status === 'create.editing' ? (
        <>
          <GuidedCharacterBuilder
            draft={draft}
            design={design}
            referenceImageUrl={referencePreviewUrl}
            referenceImageStale={flow.data.referenceImageStale}
            onChange={onBuilderChange}
          />
          <div css={primaryActionRowStyles(theme)}>
            <Button
              variant="primary"
              busy={preparingCharacterSave}
              disabled={preparingCharacterSave}
              onClick={onRequestSaveCharacter}
            >
              Save Character
            </Button>
          </div>
        </>
      ) : null}
      {choosingReference ? (
        <GuidedReferenceChoice
          existingReferenceAvailable={Boolean(
            flow.data.referenceImageAssetId && !flow.data.referenceImageStale,
          )}
          error={flow.error}
          disabled={flow.status === 'create.saving'}
          onCancel={onReferenceChoiceCancel}
          onPromptOnly={onPromptOnly}
          onGenerateSelected={onGenerateSelected}
          onKeepExisting={onKeepExisting}
        />
      ) : null}
      {configuringReference ? (
        <GuidedReferenceSettings
          prompt={flow.data.characterPrompt}
          available={referenceImagesAvailable}
          optimizerAvailable={referenceImageOptimizerAvailable}
          externalError={flow.error}
          onCancel={onReferenceSettingsCancel}
          onContinuePromptOnly={onPromptOnly}
          onGenerated={onGenerated}
        />
      ) : null}
    </>
  );
};
