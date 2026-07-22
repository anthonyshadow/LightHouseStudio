import { useTheme } from '@emotion/react';
import type { CharacterReferenceOptions } from '@studio/contracts';
import type { CharacterTransformDraft, GuidedDesignV1 } from '@studio/domain';
import { useRef, type RefObject } from 'react';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import { CharacterBuilderForm } from './CharacterBuilderForm';
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
  onChange: (draft: CharacterTransformDraft, design: GuidedDesignV1) => void;
  onOptionsChange: (options: CharacterReferenceOptions) => void;
  onGenerate: () => void;
  onRequestRegeneration: () => void;
  onRegenerate: (changeInstructions: string) => void;
  onCancelRegeneration: () => void;
  onRequestReset: () => void;
  onConfirmReset: () => void;
  onCancelReset: () => void;
  onClose: () => void;
  onSave: () => void;
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
  onChange,
  onOptionsChange,
  onGenerate,
  onRequestRegeneration,
  onRegenerate,
  onCancelRegeneration,
  onRequestReset,
  onConfirmReset,
  onCancelReset,
  onClose,
  onSave,
  discardCloseOpen = false,
  discardCloseBusy = false,
  resetBusy = false,
  onCancelDiscardClose,
  onConfirmDiscardClose,
}: CharacterBuilderPanelProps) => {
  const theme = useTheme();
  const resetButtonRef = useRef<HTMLButtonElement>(null);
  const regenerateButtonRef = useRef<HTMLButtonElement>(null);
  const status = operationLabel(state);
  const generationBusy = isGenerationBusy(state);
  const saving = state.phase === 'saving';
  const closing = state.phase === 'closing';
  const operationLocked = saving || closing;
  const formLocked = operationLocked || state.phase === 'restoring' || saveRecoveryPending;
  const previewIsUsable = Boolean(state.preview && !state.preview.stale);
  const saveLabel =
    state.preview && state.preview.stale ? 'Save Character (prompt only)' : 'Save Character';

  return (
    <>
      <OverlayPanel
        open={open}
        onClose={onClose}
        title="Build Your Character"
        description="Shape a reusable Lucy 2.5 character. Image generation is optional; your unfinished draft stays on this browser."
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
            <Button
              variant="primary"
              busy={saving}
              disabled={!canSave || generationBusy || operationLocked}
              aria-disabled={Boolean(saveBlockedReason) || undefined}
              aria-describedby={
                saveBlockedReason ? 'character-builder-save-blocked-reason' : undefined
              }
              onClick={() => {
                if (!saveBlockedReason) onSave();
              }}
            >
              {saveLabel}
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
            referenceImageUrl={state.preview?.asset.contentUrl ?? null}
            referenceImageStale={state.preview?.stale ?? false}
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
                    disabled={generationBusy || formLocked}
                    aria-disabled={!generationAvailable || undefined}
                    aria-describedby={
                      !generationAvailable ? 'character-builder-generation-unavailable' : undefined
                    }
                    onClick={() => {
                      if (generationAvailable) onRequestRegeneration();
                    }}
                  >
                    Regenerate
                  </Button>
                ) : (
                  <Button
                    variant="primary"
                    disabled={generationBusy || formLocked}
                    aria-disabled={!generationAvailable || undefined}
                    aria-describedby={
                      !generationAvailable ? 'character-builder-generation-unavailable' : undefined
                    }
                    onClick={() => {
                      if (generationAvailable) onGenerate();
                    }}
                  >
                    Generate Preview
                  </Button>
                )}
                {state.preview?.stale ? (
                  <span role="status">
                    Regenerate to attach an image, or save this version as prompt-only.
                  </span>
                ) : previewIsUsable ? (
                  <span role="status">This preview matches the current character.</span>
                ) : null}
                {!generationAvailable ? (
                  <span id="character-builder-generation-unavailable" role="status">
                    Reference image generation is unavailable. You can still save this character
                    without an image.
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
