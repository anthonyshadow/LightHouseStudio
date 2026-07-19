import { useTheme } from '@emotion/react';
import { useEffect, useId, useMemo, useState } from 'react';
import { Surface } from '../../ui';
import { GeneratedPromptPreview } from './GeneratedPromptPreview';
import {
  createPromptBuilderDraft,
  generateStructuredPrompt,
  normalizePromptBuilderDraft,
  validatePromptBuilderDraft,
  type PromptBuilderDraft,
  type PromptIntent,
  type PromptValidation,
  type ReferenceImageContext,
} from './model';
import { PromptFeedback } from './PromptFeedback';
import { PromptIntentFields } from './PromptIntentFields';
import { PromptWorkshopActions, type PromptSaveState } from './PromptWorkshopActions';
import { PromptWorkshopHeader } from './PromptWorkshopHeader';
import type { ReferenceGenerationState, WorkshopReferenceImage } from './ReferenceImageGenerator';
import { hashWorkshopPrompt, isSameCanonicalWorkshopPrompt } from './referencePromptHash';
import {
  accordionStyles,
  chevronStyles,
  footerStyles,
  headerRegionStyles,
  reviewColumnStyles,
  reviewToggleStyles,
  scrollRegionStyles,
  stepButtonStyles,
  stepCopyStyles,
  stepDescriptionStyles,
  stepLabelStyles,
  stepNumberStyles,
  stepPanelStyles,
  stepStyles,
  stepSummaryStyles,
  workshopStyles,
  workshopSurfaceStyles,
} from './CharacterPromptWorkshop.styles';
import {
  defaultPromptWorkshopStep,
  getPromptWorkshopSteps,
  promptWorkshopDraftHasContent,
  type PromptWorkshopStepId,
} from './workshopSteps';

export interface PromptWorkshopAction {
  prompt: string;
  draft: PromptBuilderDraft;
  validation: PromptValidation;
  referenceImageAssetId: string | null;
}

export interface SavePromptWorkshopAction extends PromptWorkshopAction {
  name: string;
}

export interface CharacterPromptWorkshopProps {
  initialDraft?: PromptBuilderDraft | undefined;
  initialDrafts?: Partial<Record<PromptIntent, PromptBuilderDraft>> | undefined;
  hasReferenceImage?: boolean;
  referenceImage?: { width?: number; height?: number } | undefined;
  generatedReferenceImage?: WorkshopReferenceImage | null | undefined;
  referenceGeneration?: ReferenceGenerationState | undefined;
  referenceImagesAvailable?: boolean | undefined;
  disabled?: boolean;
  onDraftChange?: ((draft: PromptBuilderDraft) => void) | undefined;
  onUse: (action: PromptWorkshopAction) => void | Promise<void>;
  onSave?: ((action: SavePromptWorkshopAction) => void | Promise<void>) | undefined;
  onGenerateReference?: ((workshopPrompt: string) => void) | undefined;
  onDetachReference?: (() => void) | undefined;
  onRetryReferenceRestore?: (() => void) | undefined;
}

const createDraftForIntent = (
  intent: PromptIntent,
  initial?: PromptBuilderDraft,
  initialDrafts: Partial<Record<PromptIntent, PromptBuilderDraft>> = {},
): PromptBuilderDraft => {
  if (initial?.intent === intent) return normalizePromptBuilderDraft(initial);
  const savedDraft = initialDrafts[intent];
  if (savedDraft?.intent === intent) return normalizePromptBuilderDraft(savedDraft);
  return createPromptBuilderDraft(intent);
};

const createDraftMap = (
  initial?: PromptBuilderDraft,
  initialDrafts: Partial<Record<PromptIntent, PromptBuilderDraft>> = {},
): Record<PromptIntent, PromptBuilderDraft> => ({
  'character-transform': createDraftForIntent('character-transform', initial, initialDrafts),
  'add-object': createDraftForIntent('add-object', initial, initialDrafts),
  'replace-object': createDraftForIntent('replace-object', initial, initialDrafts),
  'change-attribute': createDraftForIntent('change-attribute', initial, initialDrafts),
});

const createStepMap = (): Record<PromptIntent, PromptWorkshopStepId> => ({
  'character-transform': defaultPromptWorkshopStep('character-transform'),
  'add-object': defaultPromptWorkshopStep('add-object'),
  'replace-object': defaultPromptWorkshopStep('replace-object'),
  'change-attribute': defaultPromptWorkshopStep('change-attribute'),
});

const referenceContext = (
  hasReferenceImage: boolean,
  image: CharacterPromptWorkshopProps['referenceImage'],
): ReferenceImageContext => ({
  hasReferenceImage,
  ...(typeof image?.width === 'number' ? { width: image.width } : {}),
  ...(typeof image?.height === 'number' ? { height: image.height } : {}),
});

export const CharacterPromptWorkshop = ({
  initialDraft,
  initialDrafts,
  hasReferenceImage = false,
  referenceImage,
  generatedReferenceImage = null,
  referenceGeneration = { status: 'idle', error: null },
  referenceImagesAvailable = false,
  disabled = false,
  onDraftChange,
  onUse,
  onSave,
  onGenerateReference,
  onDetachReference,
  onRetryReferenceRestore,
}: CharacterPromptWorkshopProps) => {
  const theme = useTheme();
  const componentId = useId();
  const [drafts, setDrafts] = useState(() => createDraftMap(initialDraft, initialDrafts));
  const [intent, setIntent] = useState<PromptIntent>(initialDraft?.intent ?? 'character-transform');
  const [activeSteps, setActiveSteps] = useState(createStepMap);
  const [showSummary, setShowSummary] = useState(true);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveState, setSaveState] = useState<PromptSaveState>('idle');
  const [generatedPromptHash, setGeneratedPromptHash] = useState<string | null>(null);

  const draft = drafts[intent];
  const activeStep = activeSteps[intent];
  const steps = getPromptWorkshopSteps(draft);
  const hasChanges = promptWorkshopDraftHasContent(draft);
  const context = useMemo(
    () =>
      referenceContext(
        Boolean(hasReferenceImage || generatedReferenceImage),
        generatedReferenceImage
          ? { width: generatedReferenceImage.width, height: generatedReferenceImage.height }
          : referenceImage,
      ),
    [generatedReferenceImage, hasReferenceImage, referenceImage],
  );
  const normalizedDraft = useMemo(() => normalizePromptBuilderDraft(draft), [draft]);
  const validation = useMemo(
    () => validatePromptBuilderDraft(normalizedDraft, context),
    [context, normalizedDraft],
  );
  const generatedPrompt = useMemo(
    () => generateStructuredPrompt(normalizedDraft, context),
    [context, normalizedDraft],
  );
  const referenceBusy =
    ['generating', 'restoring'].includes(referenceGeneration.status) ||
    (referenceGeneration.status === 'error' && referenceGeneration.errorKind === 'restore');
  const canCommit =
    !disabled && !referenceBusy && validation.blocking.length === 0 && generatedPrompt.length > 0;

  useEffect(() => {
    let active = true;
    setGeneratedPromptHash(null);
    void hashWorkshopPrompt(generatedPrompt)
      .then((hash) => {
        if (active) setGeneratedPromptHash(hash);
      })
      .catch(() => {
        if (active) setGeneratedPromptHash(null);
      });
    return () => {
      active = false;
    };
  }, [generatedPrompt]);

  const referenceIsStale = Boolean(
    generatedReferenceImage &&
    (generatedReferenceImage.generatedFromPrompt
      ? !isSameCanonicalWorkshopPrompt(generatedReferenceImage.generatedFromPrompt, generatedPrompt)
      : generatedPromptHash && generatedPromptHash !== generatedReferenceImage.promptHash),
  );

  const updateDraft = (nextDraft: PromptBuilderDraft) => {
    setDrafts((current) => ({ ...current, [nextDraft.intent]: nextDraft }));
    setSaveState('idle');
    onDraftChange?.(nextDraft);
  };

  const changeIntent = (nextIntent: PromptIntent) => {
    setIntent(nextIntent);
    setShowSave(false);
    setSaveState('idle');
    onDraftChange?.(drafts[nextIntent]);
  };

  const resetCurrent = () => {
    if (
      hasChanges &&
      !window.confirm('Reset this intent and discard its current workshop choices?')
    ) {
      return;
    }
    updateDraft(createPromptBuilderDraft(intent));
    setActiveSteps((current) => ({ ...current, [intent]: defaultPromptWorkshopStep(intent) }));
    setSaveName('');
    setShowSave(false);
  };

  const actionPayload = (): PromptWorkshopAction => ({
    prompt: generatedPrompt,
    draft: normalizedDraft,
    validation,
    referenceImageAssetId:
      normalizedDraft.intent === 'character-transform'
        ? (generatedReferenceImage?.assetId ?? null)
        : null,
  });

  const savePrompt = async () => {
    const name = saveName.replace(/\s+/gu, ' ').trim().slice(0, 80).trim();
    if (!onSave || !canCommit || !name) return;
    setSaveState('saving');
    try {
      await onSave({ ...actionPayload(), name });
      setSaveState('saved');
      setShowSave(false);
    } catch {
      setSaveState('error');
    }
  };

  return (
    <Surface
      aria-labelledby="character-workshop-title"
      padding="compact"
      css={workshopSurfaceStyles(theme)}
    >
      <div css={workshopStyles()}>
        <div css={headerRegionStyles(theme)}>
          <PromptWorkshopHeader
            intent={intent}
            disabled={disabled}
            hasChanges={hasChanges}
            onIntentChange={changeIntent}
            onReset={resetCurrent}
          />
        </div>

        <div css={scrollRegionStyles(theme)} data-scroll-region="character-workshop">
          <div css={accordionStyles(theme)} aria-label="Prompt sections">
            {steps.map((step, index) => {
              const panelId = `${componentId}-${intent}-${step.id}-panel`;
              const buttonId = `${componentId}-${intent}-${step.id}-button`;
              const active = step.id === activeStep;

              return (
                <section key={step.id} css={stepStyles(theme, active)}>
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={active}
                    aria-controls={panelId}
                    css={stepButtonStyles(theme, active)}
                    onClick={() => setActiveSteps((current) => ({ ...current, [intent]: step.id }))}
                  >
                    <span aria-hidden="true" css={stepNumberStyles(theme, active)}>
                      {index + 1}
                    </span>
                    <span css={stepCopyStyles()}>
                      <span css={stepLabelStyles(theme)}>{step.label}</span>
                      <span css={stepSummaryStyles(theme)} title={step.summary}>
                        {step.summary}
                      </span>
                    </span>
                    <span aria-hidden="true" css={chevronStyles(theme, active)}>
                      ›
                    </span>
                  </button>

                  <div
                    id={panelId}
                    role="region"
                    aria-labelledby={buttonId}
                    hidden={!active}
                    css={active ? stepPanelStyles(theme) : undefined}
                  >
                    {active ? (
                      <>
                        <p css={stepDescriptionStyles(theme)}>{step.description}</p>
                        <PromptIntentFields
                          draft={draft}
                          issues={validation.blocking}
                          activeStep={activeStep}
                          onChange={updateDraft}
                        />
                      </>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>

          <aside css={reviewColumnStyles(theme)} aria-label="Recipe review">
            <button
              type="button"
              aria-expanded={showSummary}
              aria-controls={`${componentId}-recipe-summary`}
              css={reviewToggleStyles(theme)}
              onClick={() => setShowSummary((visible) => !visible)}
            >
              <span>Generated recipe summary</span>
              <span aria-hidden="true">{showSummary ? '−' : '+'}</span>
            </button>
            {showSummary ? (
              <div id={`${componentId}-recipe-summary`}>
                <GeneratedPromptPreview
                  prompt={generatedPrompt}
                  {...(intent === 'character-transform' && onGenerateReference && onDetachReference
                    ? {
                        referenceGeneration: {
                          available: referenceImagesAvailable,
                          disabled,
                          generateDisabled: !canCommit,
                          stale: referenceIsStale,
                          referenceImage: generatedReferenceImage,
                          generation: referenceGeneration,
                          onGenerate: onGenerateReference,
                          onDetach: onDetachReference,
                          ...(onRetryReferenceRestore
                            ? { onRetryRestore: onRetryReferenceRestore }
                            : {}),
                        },
                      }
                    : {})}
                />
              </div>
            ) : null}
            <PromptFeedback validation={validation} />
          </aside>
        </div>

        <footer css={footerStyles(theme)}>
          <PromptWorkshopActions
            canCommit={canCommit}
            hasSaveAction={Boolean(onSave)}
            showSave={showSave}
            saveName={saveName}
            saveState={saveState}
            onUse={() => void onUse(actionPayload())}
            onToggleSave={() => setShowSave((visible) => !visible)}
            onSaveNameChange={(name) => {
              setSaveName(name);
              setSaveState('idle');
            }}
            onSave={() => void savePrompt()}
          />
        </footer>
      </div>
    </Surface>
  );
};
