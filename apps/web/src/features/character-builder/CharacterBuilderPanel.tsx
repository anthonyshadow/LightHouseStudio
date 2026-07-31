import { useTheme } from '@emotion/react';
import type { CharacterReferenceOptions } from '@studio/contracts';
import type { CharacterTransformDraft, GuidedDesignV1 } from '@studio/domain';
import { useRef, useState, type RefObject } from 'react';
import { Button, ConfirmationDialog, OverlayPanel, StatusNotice } from '../../ui';
import { BuilderReferenceImageField } from './BuilderReferenceImageField';
import { CharacterBuilderForm, type CharacterBuilderStep } from './CharacterBuilderForm';
import { CharacterNameDialog } from './CharacterNameDialog';
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
  optimizationAvailable?: boolean;
  editAvailable: boolean;
  referenceImageProvider?: 'openai' | 'bfl' | 'wiro' | null;
  referenceImageModel?: string | null;
  referenceImageOptimizerModel?: string | null;
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
  onRetryOptimization?: () => void;
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

const referenceProviderLabel = (
  provider: CharacterBuilderPanelProps['referenceImageProvider'],
): string => {
  switch (provider) {
    case 'openai':
      return 'OpenAI';
    case 'bfl':
      return 'Black Forest Labs';
    case 'wiro':
      return 'Wiro';
    default:
      return 'the configured image provider';
  }
};

type ReferenceGenerationDisclosureOptions = Readonly<
  Pick<
    CharacterBuilderPanelProps,
    | 'generationAvailable'
    | 'referenceImageProvider'
    | 'referenceImageModel'
    | 'referenceImageOptimizerModel'
  >
>;

const buildReferenceGenerationDisclosure = ({
  generationAvailable,
  referenceImageProvider,
  referenceImageModel,
  referenceImageOptimizerModel,
}: ReferenceGenerationDisclosureOptions): string => {
  const optimizerContact = referenceImageOptimizerModel
    ? `OpenAI (${referenceImageOptimizerModel}) attempts to optimize the direction, then `
    : '';

  if (referenceImageProvider === 'wiro') {
    const model = referenceImageModel ?? 'selected model';
    if (generationAvailable) {
      return `${optimizerContact}Wiro (${model}) creates the image in this explicit operator-qualification run. Wiro is unavailable for participant generation. This may use provider credits; successful output remains local until this operator environment is retired.`;
    }
    return `Wiro (${model}) is restricted to explicit operator-qualification runs and is unavailable for participant generation. This configured generation path is currently unavailable. Upload and Save without generation remain local.`;
  }

  const provider = referenceProviderLabel(referenceImageProvider);
  const model = referenceImageModel ? ` (${referenceImageModel})` : '';
  return `${optimizerContact}${provider}${model} creates the image. This may use provider credits. The result is stored as an immutable local asset until this participant environment is retired. Upload and Save without generation do not contact image or optimizer providers.`;
};

const characterSaveLabel = (state: CharacterBuilderState): string => {
  if (!state.preview?.stale) return 'Save Character';
  return state.uploadedReference
    ? 'Save Character (uploaded image)'
    : 'Save Character (prompt only)';
};

export const CharacterBuilderPanel = ({
  open,
  state,
  returnFocusRef,
  generationAvailable,
  optimizationAvailable = true,
  editAvailable,
  referenceImageProvider = null,
  referenceImageModel = null,
  referenceImageOptimizerModel = null,
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
  onRetryOptimization = () => undefined,
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
  const [activeStep, setActiveStep] = useState<CharacterBuilderStep>(1);
  const status = operationLabel(state);
  const generationBusy = isGenerationBusy(state);
  const saving = state.phase === 'saving';
  const closing = state.phase === 'closing';
  const operationLocked = saving || closing;
  const formLocked = operationLocked || state.phase === 'restoring' || saveRecoveryPending;
  const previewIsUsable = Boolean(state.preview && !state.preview.stale);
  const previewUsedRawPrompt = Boolean(
    state.preview &&
    !state.preview.stale &&
    state.preview.asset.source === 'generated' &&
    !state.preview.asset.optimizationEnabled,
  );
  const uploadedReference = state.uploadedReference;
  const previewCapabilityAvailable = generationAvailable && (!uploadedReference || editAvailable);
  const heroReference = state.preview?.asset ?? uploadedReference?.asset ?? null;
  const saveLabel = characterSaveLabel(state);
  const referenceGenerationDisclosure = buildReferenceGenerationDisclosure({
    generationAvailable,
    referenceImageProvider,
    referenceImageModel,
    referenceImageOptimizerModel,
  });

  return (
    <>
      <OverlayPanel
        open={open}
        onClose={() => {
          setNamingMode(null);
          setActiveStep(1);
          onClose();
        }}
        title={editingCharacterName ? `Edit ${editingCharacterName}` : 'Build Your Character'}
        description={
          <span
            css={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: theme.space.xs,
              fontSize: theme.fontSizes.caption,
            }}
          >
            <strong css={{ color: theme.colors.accent }}>
              {editingCharacterName ? '✎ Editing Character' : '✎ Interactive Design'}
            </strong>
            <span css={{ color: theme.colors.textFaint }}>· Jump to any step</span>
          </span>
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
            <span
              id={saveBlockedReason ? 'character-builder-save-blocked-reason' : undefined}
              data-footer-status={
                saveBlockedReason ? 'blocking' : autosaveMessage ? 'notice' : 'default'
              }
            >
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
              variant="secondary"
              disabled={activeStep === 1}
              onClick={() => setActiveStep((step) => (step === 3 ? 2 : 1))}
            >
              Back
            </Button>
            {activeStep < 3 ? (
              <Button
                variant="primary"
                onClick={() => setActiveStep((step) => (step === 1 ? 2 : 3))}
              >
                Continue
              </Button>
            ) : null}
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
              variant={activeStep === 3 ? 'primary' : 'quiet'}
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
            activeStep={activeStep}
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
                        : 'character-builder-provider-disclosure'
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
                        : 'character-builder-provider-disclosure'
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
                {previewUsedRawPrompt ? (
                  <StatusNotice
                    tone="warning"
                    role="status"
                    title={
                      optimizationAvailable
                        ? 'Prompt optimization failed'
                        : 'Prompt optimization unavailable'
                    }
                  >
                    <div>
                      This preview was generated from your raw character prompt so image generation
                      could continue.
                    </div>
                    {optimizationAvailable ? (
                      <Button
                        type="button"
                        size="small"
                        variant="quiet"
                        disabled={generationBusy || formLocked || !previewCapabilityAvailable}
                        onClick={onRetryOptimization}
                      >
                        Retry optimization and regenerate
                      </Button>
                    ) : null}
                  </StatusNotice>
                ) : null}
                <StatusNotice
                  id="character-builder-provider-disclosure"
                  title="Provider, usage, and local retention"
                >
                  {referenceGenerationDisclosure}
                </StatusNotice>
              </div>
            }
            previewSettings={
              <ReferenceOptionsFields
                options={state.options}
                disabled={generationBusy || formLocked}
                onChange={onOptionsChange}
              />
            }
            onStepChange={setActiveStep}
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
        retainsReferenceAsset={Boolean(
          namingMode === 'image-only' || previewIsUsable || uploadedReference,
        )}
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
        providerDisclosure={referenceGenerationDisclosure}
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
            ? 'This abandons the pending Studio handoff and removes the resumable draft. Any character already committed to the Shelf remains saved. Reference relationships are detached; immutable local image bytes remain until whole-environment retirement.'
            : 'This removes the resumable draft from this browser and starts a fresh character. Reference relationships are detached; immutable local image bytes remain until whole-environment retirement.'
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
