import { useTheme } from '@emotion/react';
import type { CharacterReferenceOptions } from '@studio/contracts';
import type { CharacterTransformDraft, GuidedDesignV1 } from '@studio/domain';
import { useRef, useState, type RefObject } from 'react';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import { BuilderReferenceImageField } from './BuilderReferenceImageField';
import { CharacterBuilderForm } from './CharacterBuilderForm';
import { CharacterNameDialog } from './CharacterNameDialog';
import { ConfirmationDialog } from './ConfirmationDialog';
import type { CharacterBuilderState } from './machine';
import { ReferenceOptionsFields } from './ReferenceOptionsFields';
import { RegenerationDialog } from './RegenerationDialog';
import {
  characterBuilderFooterStyles,
  characterBuilderPreviewActionsStyles,
  characterBuilderShellStyles,
  characterBuilderStatusStyles,
} from './styles';

export interface CharacterBuilderPanelProps {
  open: boolean;
  state: CharacterBuilderState;
  returnFocusRef?: RefObject<HTMLElement | null>;
  generationAvailable: boolean;
  editAvailable: boolean;
  saveBlockedReason?: string | undefined;
  autosaveMessage?: string | null;
  saveRecoveryPending?: boolean;
  canSave: boolean;
  canSaveImageOnly?: boolean;
  suggestedCharacterName?: string;
  suggestedImageOnlyCharacterName?: string;
  characterNameLocked?: boolean;
  editingCharacterName?: string | null;
  onChange: (draft: CharacterTransformDraft, design: GuidedDesignV1) => void;
  onOptionsChange: (options: CharacterReferenceOptions) => void;
  onGenerate: () => void;
  onUploadReference?: (file: File) => void;
  onRemoveUpload?: () => void;
  onRequestRegeneration: () => void;
  onRegenerate: (changeInstructions: string) => void;
  onCancelRegeneration: () => void;
  onRequestReset: () => void;
  onConfirmReset: () => void;
  onCancelReset: () => void;
  onClose: () => void;
  onSave: (name: string) => void;
  onSaveImageOnly?: (name: string) => void;
  discardCloseOpen?: boolean;
  discardCloseBusy?: boolean;
  resetBusy?: boolean;
  onCancelDiscardClose?: () => void;
  onConfirmDiscardClose?: () => void;
}

const operationLabel = (state: CharacterBuilderState): string | null => {
  switch (state.phase) {
    case 'restoring':
      return 'Restoring your draft…';
    case 'optimizing':
      return 'Optimizing prompt…';
    case 'generating':
      return 'Generating preview…';
    case 'regenerating':
      return 'Regenerating preview…';
    case 'saving':
      return 'Saving and preloading character…';
    case 'closing':
      return 'Saving the latest draft…';
    default:
      return null;
  }
};

const isGenerationBusy = (state: CharacterBuilderState) =>
  ['optimizing', 'generating', 'regenerating'].includes(state.phase);

export const CharacterBuilderPanel = ({
  open,
  state,
  returnFocusRef,
  generationAvailable,
  editAvailable,
  saveBlockedReason,
  autosaveMessage = null,
  saveRecoveryPending = false,
  canSave,
  canSaveImageOnly = false,
  suggestedCharacterName = 'New Character 01',
  suggestedImageOnlyCharacterName = 'Uploaded Character 01',
  characterNameLocked = false,
  editingCharacterName = null,
  onChange,
  onOptionsChange,
  onGenerate,
  onUploadReference = () => undefined,
  onRemoveUpload = () => undefined,
  onRequestRegeneration,
  onRegenerate,
  onCancelRegeneration,
  onRequestReset,
  onConfirmReset,
  onCancelReset,
  onClose,
  onSave,
  onSaveImageOnly = () => undefined,
  discardCloseOpen = false,
  discardCloseBusy = false,
  resetBusy = false,
  onCancelDiscardClose,
  onConfirmDiscardClose,
}: CharacterBuilderPanelProps) => {
  const theme = useTheme();
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const regenerateButtonRef = useRef<HTMLButtonElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const imageOnlySaveButtonRef = useRef<HTMLButtonElement>(null);
  const [namingMode, setNamingMode] = useState<'default' | 'image-only' | null>(null);
  const status = operationLabel(state);
  const generationBusy = isGenerationBusy(state);
  const saving = state.phase === 'saving';
  const closing = state.phase === 'closing';
  const operationLocked = saving || closing;
  const formLocked = operationLocked || state.phase === 'restoring' || saveRecoveryPending;
  const previewIsUsable = Boolean(state.preview && !state.preview.stale);
  const uploadedReference = state.uploadedReference;
  const previewCapabilityAvailable = generationAvailable && (!uploadedReference || editAvailable);
  const heroReference = state.preview?.asset ?? uploadedReference?.asset ?? null;
  const saveLabel =
    state.preview?.stale && uploadedReference
      ? 'Save Character (uploaded image)'
      : state.preview?.stale
        ? 'Save Character (prompt only)'
        : 'Save Character';

  return (
    <>
      <OverlayPanel
        open={open}
        onClose={() => {
          setNamingMode(null);
          onClose();
        }}
        title={editingCharacterName ? `Edit ${editingCharacterName}` : 'Build Your Character'}
        description={
          editingCharacterName
            ? 'Update this reusable Lucy 2.5 character. Image generation remains optional.'
            : 'Shape a reusable Lucy 2.5 character. Image generation is optional; your unfinished draft stays on this browser.'
        }
        placement="fullscreen"
        size="wide"
        bodyMode="contained"
        initialFocus="heading"
        closeLabel="Close character builder"
        closeDisabled={operationLocked}
        closeOnBackdrop={false}
        {...(returnFocusRef ? { returnFocusRef } : {})}
        footer={
          <div css={characterBuilderFooterStyles(theme)} aria-busy={operationLocked || undefined}>
            <span id={saveBlockedReason ? 'character-builder-save-blocked-reason' : undefined}>
              {saveBlockedReason ??
                (state.preview?.stale
                  ? 'The visible preview is from an earlier character version and will not be attached.'
                  : (autosaveMessage ?? 'Draft changes autosave on this browser.'))}
            </span>
            <Button
              ref={resetButtonRef}
              variant="quiet"
              disabled={operationLocked || state.phase === 'restoring' || resetBusy}
              onClick={onRequestReset}
            >
              Reset Draft
            </Button>
            {uploadedReference ? (
              <Button
                ref={imageOnlySaveButtonRef}
                variant="secondary"
                busy={saving}
                disabled={
                  !canSaveImageOnly || state.uploadPending || generationBusy || operationLocked
                }
                aria-disabled={Boolean(saveBlockedReason) || undefined}
                aria-describedby={
                  saveBlockedReason ? 'character-builder-save-blocked-reason' : undefined
                }
                onClick={() => {
                  if (!saveBlockedReason) setNamingMode('image-only');
                }}
              >
                Save &amp; Use Image Only
              </Button>
            ) : null}
            <Button
              ref={saveButtonRef}
              variant="primary"
              busy={saving}
              disabled={!canSave || state.uploadPending || generationBusy || operationLocked}
              aria-disabled={Boolean(saveBlockedReason) || undefined}
              aria-describedby={
                saveBlockedReason ? 'character-builder-save-blocked-reason' : undefined
              }
              onClick={() => {
                if (!saveBlockedReason) setNamingMode('default');
              }}
            >
              {editingCharacterName ? 'Save Changes' : saveLabel}
            </Button>
          </div>
        }
      >
        <div css={characterBuilderShellStyles(theme)}>
          <div css={characterBuilderStatusStyles(theme)}>
            <span role="status" aria-live="polite" aria-atomic="true">
              {status}
            </span>
            {autosaveMessage ? (
              <StatusNotice tone="warning" role="status">
                {autosaveMessage}
              </StatusNotice>
            ) : null}
          </div>

          <CharacterBuilderForm
            draft={state.draft}
            design={state.design}
            disabled={formLocked}
            referenceImageUrl={heroReference?.contentUrl ?? null}
            referenceImageGenerated={Boolean(state.preview)}
            referenceImageUploadedFallback={Boolean(!state.preview && uploadedReference)}
            referenceImageStale={state.preview?.stale ?? false}
            referenceUpload={
              <BuilderReferenceImageField
                reference={uploadedReference}
                pending={state.uploadPending}
                error={state.uploadError}
                disabled={formLocked}
                onSelect={onUploadReference}
                onRemove={onRemoveUpload}
              />
            }
            previewBusy={generationBusy}
            previewStatus={status}
            previewError={
              state.error ? (
                <StatusNotice role="alert" tone="danger">
                  {state.error}
                </StatusNotice>
              ) : null
            }
            previewActions={
              <div css={characterBuilderPreviewActionsStyles(theme)}>
                {state.preview ? (
                  <Button
                    ref={regenerateButtonRef}
                    variant="secondary"
                    disabled={state.uploadPending || generationBusy || formLocked}
                    aria-disabled={!previewCapabilityAvailable || undefined}
                    aria-describedby={
                      !previewCapabilityAvailable
                        ? 'character-builder-generation-unavailable'
                        : undefined
                    }
                    onClick={() => {
                      if (previewCapabilityAvailable) onRequestRegeneration();
                    }}
                  >
                    Regenerate
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={state.uploadPending || generationBusy || formLocked}
                    aria-disabled={!previewCapabilityAvailable || undefined}
                    aria-describedby={
                      !previewCapabilityAvailable
                        ? 'character-builder-generation-unavailable'
                        : undefined
                    }
                    onClick={() => {
                      if (previewCapabilityAvailable) onGenerate();
                    }}
                  >
                    {uploadedReference ? 'Generate Combined Preview' : 'Generate Preview'}
                  </Button>
                )}
                {state.preview?.stale ? (
                  <span role="status">
                    {uploadedReference
                      ? 'Regenerate to attach a combined image, or save with the uploaded reference.'
                      : 'Regenerate to attach an image, or save this version as prompt-only.'}
                  </span>
                ) : previewIsUsable ? (
                  <span role="status">This preview matches the current character.</span>
                ) : null}
                {!previewCapabilityAvailable ? (
                  <span id="character-builder-generation-unavailable" role="status">
                    {uploadedReference
                      ? 'Combined preview generation is unavailable. You can still save and use the uploaded image directly.'
                      : 'Reference image generation is unavailable. You can still save this character without an image.'}
                  </span>
                ) : null}
              </div>
            }
            previewSettings={
              <ReferenceOptionsFields
                options={state.options}
                disabled={generationBusy || formLocked}
                onChange={onOptionsChange}
              />
            }
            onChange={onChange}
          />
        </div>
      </OverlayPanel>

      <CharacterNameDialog
        key={`${namingMode ?? 'closed'}:${characterNameLocked ? 'locked' : 'editable'}`}
        open={open && namingMode !== null}
        initialName={
          namingMode === 'image-only' ? suggestedImageOnlyCharacterName : suggestedCharacterName
        }
        imageOnly={namingMode === 'image-only'}
        locked={characterNameLocked}
        returnFocusRef={namingMode === 'image-only' ? imageOnlySaveButtonRef : saveButtonRef}
        onCancel={() => setNamingMode(null)}
        onSubmit={(name) => {
          const requestedMode = namingMode;
          setNamingMode(null);
          if (requestedMode === 'image-only') onSaveImageOnly(name);
          else if (requestedMode === 'default') onSave(name);
        }}
      />

      <RegenerationDialog
        open={state.phase === 'requesting-regeneration'}
        busy={state.phase === 'regenerating'}
        editAvailable={editAvailable}
        returnFocusRef={regenerateButtonRef}
        onCancel={onCancelRegeneration}
        onSubmit={(instructions) => {
          if (instructions.trim() && !editAvailable) return;
          onRegenerate(instructions);
        }}
      />

      <ConfirmationDialog
        open={state.phase === 'confirming-reset'}
        title="Reset this character draft?"
        description={
          saveRecoveryPending
            ? 'This abandons the pending Studio handoff and removes the resumable draft. Any character already committed to the Shelf remains saved; generated server assets may remain unreferenced.'
            : 'This removes the resumable draft from this browser and starts a fresh character. Generated server assets remain stored and may become unreferenced.'
        }
        confirmLabel="Reset Draft"
        danger
        busy={resetBusy}
        returnFocusRef={resetButtonRef}
        onCancel={onCancelReset}
        onConfirm={onConfirmReset}
      />
      <ConfirmationDialog
        open={discardCloseOpen}
        title="Discard changes that are not reload-safe?"
        description="This browser could not durably save the latest character changes. Stay to retry, or explicitly discard this draft and close."
        confirmLabel="Discard and Close"
        danger
        busy={discardCloseBusy}
        onCancel={onCancelDiscardClose ?? (() => undefined)}
        onConfirm={onConfirmDiscardClose ?? (() => undefined)}
      />
    </>
  );
};
