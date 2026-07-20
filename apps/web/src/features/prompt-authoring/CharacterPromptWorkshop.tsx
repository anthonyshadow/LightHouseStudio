import { useTheme } from '@emotion/react';
import type {
  CreateReferenceImageRequest,
  OptimizeCharacterReferencePromptRequest,
  OptimizeCharacterReferencePromptResponse,
} from '@studio/contracts';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
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
import {
  createOptimizerReferenceOptions,
  createWorkshopOptimizationKey,
  isCustomBackgroundMissing,
  loadWorkshopReferencePreferences,
  saveWorkshopReferencePreferences,
  type WorkshopReferenceOptions,
  type WorkshopReferencePreferences,
} from './referenceOptimization';
import { isSameCanonicalWorkshopPrompt } from './referencePromptHash';
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

export type WorkshopReferenceGenerationInput = Omit<CreateReferenceImageRequest, 'requestId'>;

export type OptimizeWorkshopReferencePrompt = (
  input: OptimizeCharacterReferencePromptRequest,
  signal: AbortSignal,
) => Promise<OptimizeCharacterReferencePromptResponse>;

export interface CharacterPromptWorkshopProps {
  initialDraft?: PromptBuilderDraft | undefined;
  initialDrafts?: Partial<Record<PromptIntent, PromptBuilderDraft>> | undefined;
  hasReferenceImage?: boolean;
  referenceImage?: { width?: number; height?: number } | undefined;
  generatedReferenceImage?: WorkshopReferenceImage | null | undefined;
  referenceGeneration?: ReferenceGenerationState | undefined;
  referenceImagesAvailable?: boolean | undefined;
  referenceImageModel?: string | null | undefined;
  optimizerModel?: string | null | undefined;
  optimizerVersion?: string | null | undefined;
  disabled?: boolean;
  onDraftChange?: ((draft: PromptBuilderDraft) => void) | undefined;
  onUse: (action: PromptWorkshopAction) => void | Promise<void>;
  onSave?: ((action: SavePromptWorkshopAction) => void | Promise<void>) | undefined;
  onOptimizeReference?: OptimizeWorkshopReferencePrompt | undefined;
  onGenerateReference?:
    ((input: WorkshopReferenceGenerationInput) => void | Promise<void>) | undefined;
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

type ReferenceOptimizationState = {
  status: 'idle' | 'optimizing' | 'ready' | 'error';
  response: OptimizeCharacterReferencePromptResponse | null;
  responseInputKey: string | null;
  manuallyEdited: boolean;
  error: string | null;
};

type OptimizationRequest = {
  inputKey: string;
  controller: AbortController;
  promise: Promise<OptimizeCharacterReferencePromptResponse | null>;
};

const createReferenceOptimizationState = (): ReferenceOptimizationState => ({
  status: 'idle',
  response: null,
  responseInputKey: null,
  manuallyEdited: false,
  error: null,
});

const settleOptimizationState = (
  current: ReferenceOptimizationState,
): ReferenceOptimizationState => ({
  ...current,
  status: current.response ? 'ready' : 'idle',
  error: null,
});

const hasCompleteOptimizationResponse = (
  response: OptimizeCharacterReferencePromptResponse | null,
): response is OptimizeCharacterReferencePromptResponse => {
  if (!response) return false;
  return Boolean(
    response.result.optimizedImagePrompt.trim() && response.result.lucy25CharacterPrompt.trim(),
  );
};

const optimizationErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  return 'The character prompt could not be optimized. Retry before generating the reference.';
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === 'AbortError';

export const CharacterPromptWorkshop = ({
  initialDraft,
  initialDrafts,
  hasReferenceImage = false,
  referenceImage,
  generatedReferenceImage = null,
  referenceGeneration = { status: 'idle', error: null },
  referenceImagesAvailable = false,
  referenceImageModel = null,
  optimizerModel = null,
  optimizerVersion = null,
  disabled = false,
  onDraftChange,
  onUse,
  onSave,
  onOptimizeReference,
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
  const [referencePreferences, setReferencePreferences] = useState<WorkshopReferencePreferences>(
    loadWorkshopReferencePreferences,
  );
  const [optimization, setOptimization] = useState<ReferenceOptimizationState>(
    createReferenceOptimizationState,
  );
  const optimizationRequestRef = useRef<OptimizationRequest | null>(null);
  const generationPipelineRef = useRef<Promise<void> | null>(null);

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
  const referenceOptions = referencePreferences.options;
  const optimizationInput = useMemo<OptimizeCharacterReferencePromptRequest>(
    () => ({
      rawPrompt: generatedPrompt,
      options: createOptimizerReferenceOptions(referenceOptions),
      ...(referenceImageModel
        ? { generator: { provider: 'openai', model: referenceImageModel } }
        : {}),
    }),
    [generatedPrompt, referenceImageModel, referenceOptions],
  );
  const optimizationInputKey = useMemo(
    () =>
      createWorkshopOptimizationKey(
        generatedPrompt,
        referenceOptions,
        optimizerModel,
        optimizerVersion,
        optimizationInput.generator,
      ),
    [
      generatedPrompt,
      optimizationInput.generator,
      optimizerModel,
      optimizerVersion,
      referenceOptions,
    ],
  );
  const optimizationInputKeyRef = useRef(optimizationInputKey);
  const optimizationStale = Boolean(
    optimization.response && optimization.responseInputKey !== optimizationInputKey,
  );
  const customBackgroundMissing = isCustomBackgroundMissing(referenceOptions);
  const imageOperationBusy = ['generating', 'restoring'].includes(referenceGeneration.status);
  const canOptimize =
    !disabled &&
    !imageOperationBusy &&
    validation.blocking.length === 0 &&
    generatedPrompt.length > 0 &&
    !customBackgroundMissing;
  const referenceBusy =
    imageOperationBusy ||
    optimization.status === 'optimizing' ||
    (referenceGeneration.status === 'error' && referenceGeneration.errorKind === 'restore');
  const canCommit =
    !disabled && !referenceBusy && validation.blocking.length === 0 && generatedPrompt.length > 0;

  useEffect(() => {
    saveWorkshopReferencePreferences(referencePreferences);
  }, [referencePreferences]);

  useEffect(() => {
    optimizationInputKeyRef.current = optimizationInputKey;
  }, [optimizationInputKey]);

  useEffect(() => {
    const request = optimizationRequestRef.current;
    if (request && request.inputKey !== optimizationInputKey) {
      request.controller.abort();
      optimizationRequestRef.current = null;
    }
    setOptimization((current) =>
      current.status === 'optimizing' || current.status === 'error'
        ? settleOptimizationState(current)
        : current,
    );
  }, [optimizationInputKey]);

  useEffect(
    () => () => {
      optimizationRequestRef.current?.controller.abort();
      optimizationRequestRef.current = null;
    },
    [],
  );

  const runOptimization =
    useCallback((): Promise<OptimizeCharacterReferencePromptResponse | null> => {
      const existing = optimizationRequestRef.current;
      if (existing?.inputKey === optimizationInputKey) return existing.promise;
      if (!canOptimize) {
        if (customBackgroundMissing) {
          setOptimization((current) => ({
            ...current,
            status: 'error',
            error: 'Provide a short plain background description before optimizing.',
          }));
        }
        return Promise.resolve(null);
      }
      if (!onOptimizeReference) {
        setOptimization((current) => ({
          ...current,
          status: 'error',
          error: 'Prompt optimization is unavailable. Retry after the local server is configured.',
        }));
        return Promise.resolve(null);
      }

      existing?.controller.abort();
      const controller = new AbortController();
      setOptimization((current) => ({ ...current, status: 'optimizing', error: null }));

      const promise = Promise.resolve()
        .then(() => onOptimizeReference(optimizationInput, controller.signal))
        .then((response) => {
          if (
            controller.signal.aborted ||
            optimizationInputKeyRef.current !== optimizationInputKey ||
            optimizationRequestRef.current?.controller !== controller
          ) {
            return null;
          }
          if (!hasCompleteOptimizationResponse(response)) {
            throw new Error(
              'The optimizer returned an incomplete character prompt. Retry optimization.',
            );
          }
          setOptimization({
            status: 'ready',
            response,
            responseInputKey: optimizationInputKey,
            manuallyEdited: false,
            error: null,
          });
          return response;
        })
        .catch((error: unknown) => {
          if (
            controller.signal.aborted ||
            isAbortError(error) ||
            optimizationInputKeyRef.current !== optimizationInputKey ||
            optimizationRequestRef.current?.controller !== controller
          ) {
            return null;
          }
          setOptimization((current) => ({
            ...current,
            status: 'error',
            error: optimizationErrorMessage(error),
          }));
          return null;
        })
        .finally(() => {
          if (optimizationRequestRef.current?.controller === controller) {
            optimizationRequestRef.current = null;
          }
        });

      optimizationRequestRef.current = { inputKey: optimizationInputKey, controller, promise };
      return promise;
    }, [
      canOptimize,
      customBackgroundMissing,
      onOptimizeReference,
      optimizationInput,
      optimizationInputKey,
    ]);

  const referenceIsStale = (() => {
    if (!generatedReferenceImage) return false;
    if (
      !isSameCanonicalWorkshopPrompt(
        generatedReferenceImage.generatedFromPrompt ?? generatedReferenceImage.originalPrompt,
        generatedPrompt,
      )
    ) {
      return true;
    }
    if (
      JSON.stringify(generatedReferenceImage.options) !== JSON.stringify(optimizationInput.options)
    ) {
      return true;
    }
    if (generatedReferenceImage.optimizationEnabled !== referencePreferences.optimizePrompt) {
      return true;
    }
    if (referenceImageModel !== null && generatedReferenceImage.model !== referenceImageModel) {
      return true;
    }
    if (!referencePreferences.optimizePrompt) return false;
    if (optimizerModel !== null && generatedReferenceImage.optimizer?.model !== optimizerModel) {
      return true;
    }
    if (
      optimizerVersion !== null &&
      generatedReferenceImage.optimizer?.version !== optimizerVersion
    ) {
      return true;
    }

    const currentResponse =
      optimization.responseInputKey === optimizationInputKey ? optimization.response : null;
    if (!currentResponse) return false;

    return (
      currentResponse.result.optimizedImagePrompt.trim() !==
        generatedReferenceImage.optimizedImagePrompt.trim() ||
      currentResponse.result.lucy25CharacterPrompt.trim() !==
        generatedReferenceImage.lucy25CharacterPrompt.trim() ||
      currentResponse.model !== generatedReferenceImage.optimizer?.model ||
      currentResponse.version !== generatedReferenceImage.optimizer?.version
    );
  })();

  const cancelPendingOptimization = () => {
    const request = optimizationRequestRef.current;
    if (!request) return;
    request.controller.abort();
    optimizationRequestRef.current = null;
    setOptimization((current) =>
      current.status === 'optimizing' ? settleOptimizationState(current) : current,
    );
  };

  const changeOptimizationEnabled = (enabled: boolean) => {
    setReferencePreferences((current) => ({ ...current, optimizePrompt: enabled }));
  };

  const changeReferenceOptions = (options: WorkshopReferenceOptions) => {
    cancelPendingOptimization();
    setReferencePreferences((current) => ({ ...current, options }));
  };

  const changeOptimizedImagePrompt = (prompt: string) => {
    setOptimization((current) => {
      if (!current.response) return current;
      const responseMatchesCurrentInput =
        current.responseInputKey === optimizationInputKeyRef.current;
      return {
        ...current,
        status: responseMatchesCurrentInput ? 'ready' : current.status,
        response: {
          ...current.response,
          result: { ...current.response.result, optimizedImagePrompt: prompt },
        },
        manuallyEdited: true,
        error: responseMatchesCurrentInput ? null : current.error,
      };
    });
  };

  const generateReference = () => {
    if (generationPipelineRef.current || !onGenerateReference) return;

    const pipeline = (async () => {
      if (!referencePreferences.optimizePrompt) {
        await onGenerateReference({
          ...optimizationInput,
          optimization: { enabled: false },
        });
        return;
      }

      const existingResponse =
        optimization.response &&
        optimization.responseInputKey === optimizationInputKey &&
        optimization.status === 'ready' &&
        hasCompleteOptimizationResponse(optimization.response)
          ? optimization.response
          : null;
      const response = existingResponse ?? (await runOptimization());
      if (
        !response ||
        optimizationInputKeyRef.current !== optimizationInputKey ||
        !hasCompleteOptimizationResponse(response)
      ) {
        return;
      }

      await onGenerateReference({
        ...optimizationInput,
        optimization: {
          enabled: true,
          result: response.result,
          model: response.model,
          version: response.version,
          inputHash: response.inputHash,
          manuallyEdited: existingResponse ? optimization.manuallyEdited : false,
        },
      });
    })().catch(() => undefined);

    generationPipelineRef.current = pipeline;
    void pipeline.finally(() => {
      if (generationPipelineRef.current === pipeline) generationPipelineRef.current = null;
    });
  };

  const updateDraft = (nextDraft: PromptBuilderDraft) => {
    cancelPendingOptimization();
    setDrafts((current) => ({ ...current, [nextDraft.intent]: nextDraft }));
    setSaveState('idle');
    onDraftChange?.(nextDraft);
  };

  const changeIntent = (nextIntent: PromptIntent) => {
    cancelPendingOptimization();
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
                  label={intent === 'character-transform' ? 'Original character recipe' : undefined}
                  {...(intent === 'character-transform' && onGenerateReference && onDetachReference
                    ? {
                        referenceGeneration: {
                          available: referenceImagesAvailable,
                          disabled,
                          generateDisabled: !canCommit || customBackgroundMissing,
                          stale: referenceIsStale,
                          referenceImage: generatedReferenceImage,
                          generation: referenceGeneration,
                          optimization: {
                            enabled: referencePreferences.optimizePrompt,
                            options: referenceOptions,
                            status: optimization.status,
                            stale: optimizationStale,
                            optimizedImagePrompt:
                              optimization.response?.result.optimizedImagePrompt ?? '',
                            lucy25CharacterPrompt:
                              optimization.response?.result.lucy25CharacterPrompt ?? '',
                            warnings: optimization.response?.result.warnings ?? [],
                            model: optimization.response?.model ?? null,
                            version: optimization.response?.version ?? null,
                            manuallyEdited: optimization.manuallyEdited,
                            error: optimization.error,
                          },
                          onOptimizationEnabledChange: changeOptimizationEnabled,
                          onReferenceOptionsChange: changeReferenceOptions,
                          onOptimize: () => void runOptimization(),
                          onOptimizedImagePromptChange: changeOptimizedImagePrompt,
                          onGenerate: generateReference,
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
