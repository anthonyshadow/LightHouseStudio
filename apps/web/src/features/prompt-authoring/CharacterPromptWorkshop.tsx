import { useTheme } from '@emotion/react';
import { useId, useMemo, useState } from 'react';
import { ConfirmationRequestDialog, Surface, useConfirmationRequest } from '../../ui';
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
import { PromptWorkshopActions, type PromptSaveState } from './PromptWorkshopActions';
import { PromptWorkshopHeader } from './PromptWorkshopHeader';
import { PromptWorkshopAccordion, PromptWorkshopReview } from './PromptWorkshopSections';
import {
  footerStyles,
  headerRegionStyles,
  scrollRegionStyles,
  workshopStyles,
  workshopSurfaceStyles,
} from './CharacterPromptWorkshop.styles';
import {
  defaultPromptWorkshopStep,
  getPromptWorkshopSteps,
  promptWorkshopDraftHasContent,
  type PromptWorkshopStepId,
} from './workshopSteps';
import { isWorkshopDraft, type WorkshopDraft, type WorkshopIntent } from './workshopModel';

export type { WorkshopDraft, WorkshopIntent } from './workshopModel';

export interface PromptWorkshopAction {
  prompt: string;
  draft: WorkshopDraft;
  validation: PromptValidation;
  referenceImageAssetId: null;
}

export interface SavePromptWorkshopAction extends PromptWorkshopAction {
  name: string;
}

export interface CharacterPromptWorkshopProps {
  initialDraft?: PromptBuilderDraft | undefined;
  initialDrafts?: Partial<Record<PromptIntent, PromptBuilderDraft>> | undefined;
  hasReferenceImage?: boolean;
  referenceImage?: { width?: number; height?: number } | undefined;
  disabled?: boolean;
  onDraftChange?: ((draft: WorkshopDraft) => void) | undefined;
  onUse: (action: PromptWorkshopAction) => void | Promise<void>;
  onSave?: ((action: SavePromptWorkshopAction) => void | Promise<void>) | undefined;
}

const workshopIntents = ['add-object', 'replace-object', 'change-attribute'] as const;

const createWorkshopDraft = (intent: WorkshopIntent): WorkshopDraft =>
  createPromptBuilderDraft(intent) as WorkshopDraft;

const normalizeWorkshopDraft = (draft: WorkshopDraft): WorkshopDraft =>
  normalizePromptBuilderDraft(draft) as WorkshopDraft;

const createDraftForIntent = (
  intent: WorkshopIntent,
  initial?: PromptBuilderDraft,
  initialDrafts: Partial<Record<PromptIntent, PromptBuilderDraft>> = {},
): WorkshopDraft => {
  if (isWorkshopDraft(initial) && initial.intent === intent) {
    return normalizeWorkshopDraft(initial);
  }
  const savedDraft = initialDrafts[intent];
  if (isWorkshopDraft(savedDraft) && savedDraft.intent === intent) {
    return normalizeWorkshopDraft(savedDraft);
  }
  return createWorkshopDraft(intent);
};

const createDraftMap = (
  initial?: PromptBuilderDraft,
  initialDrafts: Partial<Record<PromptIntent, PromptBuilderDraft>> = {},
): Record<WorkshopIntent, WorkshopDraft> =>
  Object.fromEntries(
    workshopIntents.map((intent) => [intent, createDraftForIntent(intent, initial, initialDrafts)]),
  ) as Record<WorkshopIntent, WorkshopDraft>;

const createStepMap = (): Record<WorkshopIntent, PromptWorkshopStepId> =>
  Object.fromEntries(
    workshopIntents.map((intent) => [intent, defaultPromptWorkshopStep(intent)]),
  ) as Record<WorkshopIntent, PromptWorkshopStepId>;

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
  disabled = false,
  onDraftChange,
  onUse,
  onSave,
}: CharacterPromptWorkshopProps) => {
  const theme = useTheme();
  const componentId = useId();
  const [drafts, setDrafts] = useState(() => createDraftMap(initialDraft, initialDrafts));
  const [intent, setIntent] = useState<WorkshopIntent>(
    isWorkshopDraft(initialDraft) ? initialDraft.intent : 'add-object',
  );
  const [activeSteps, setActiveSteps] = useState(createStepMap);
  const [showSummary, setShowSummary] = useState(true);
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveState, setSaveState] = useState<PromptSaveState>('idle');

  const draft = drafts[intent];
  const activeStep = activeSteps[intent];
  const steps = getPromptWorkshopSteps(draft);
  const hasChanges = promptWorkshopDraftHasContent(draft);
  const context = useMemo(
    () => referenceContext(hasReferenceImage, referenceImage),
    [hasReferenceImage, referenceImage],
  );
  const normalizedDraft = useMemo(() => normalizeWorkshopDraft(draft), [draft]);
  const validation = useMemo(
    () => validatePromptBuilderDraft(normalizedDraft, context),
    [context, normalizedDraft],
  );
  const generatedPrompt = useMemo(
    () => generateStructuredPrompt(normalizedDraft, context),
    [context, normalizedDraft],
  );
  const canCommit = !disabled && validation.blocking.length === 0 && generatedPrompt.length > 0;

  const updateDraft = (nextDraft: WorkshopDraft) => {
    setDrafts((current) => ({ ...current, [nextDraft.intent]: nextDraft }));
    setSaveState('idle');
    onDraftChange?.(nextDraft);
  };

  const confirmation = useConfirmationRequest();

  const changeIntent = (nextIntent: WorkshopIntent) => {
    setIntent(nextIntent);
    setShowSave(false);
    setSaveState('idle');
    onDraftChange?.(drafts[nextIntent]);
  };

  const resetCurrent = async () => {
    if (
      hasChanges &&
      !(await confirmation.ask({
        title: 'Reset this intent?',
        description: 'Its current workshop choices are discarded and cannot be recovered.',
        confirmLabel: 'Reset intent',
        danger: true,
      }))
    ) {
      return;
    }
    updateDraft(createWorkshopDraft(intent));
    setActiveSteps((current) => ({
      ...current,
      [intent]: defaultPromptWorkshopStep(intent),
    }));
    setSaveName('');
    setShowSave(false);
  };

  const actionPayload = (): PromptWorkshopAction => ({
    prompt: generatedPrompt,
    draft: normalizedDraft,
    validation,
    referenceImageAssetId: null,
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
      aria-labelledby="prompt-workshop-title"
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
            onReset={() => void resetCurrent()}
          />
        </div>

        <div css={scrollRegionStyles(theme)} data-scroll-region="prompt-workshop">
          <PromptWorkshopAccordion
            componentId={componentId}
            intent={intent}
            draft={draft}
            validation={validation}
            steps={steps}
            activeStep={activeStep}
            onActiveStepChange={(step) =>
              setActiveSteps((current) => ({ ...current, [intent]: step }))
            }
            onDraftChange={updateDraft}
          />

          <PromptWorkshopReview
            componentId={componentId}
            generatedPrompt={generatedPrompt}
            validation={validation}
            showSummary={showSummary}
            onToggleSummary={() => setShowSummary((visible) => !visible)}
          />
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
      <ConfirmationRequestDialog request={confirmation} />
    </Surface>
  );
};
