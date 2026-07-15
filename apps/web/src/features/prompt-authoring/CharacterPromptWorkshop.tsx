import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useMemo, useState } from 'react';
import { Surface, TextAreaField } from '../../ui';
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

export interface PromptWorkshopAction {
  prompt: string;
  draft: PromptBuilderDraft;
  validation: PromptValidation;
}

export interface SavePromptWorkshopAction extends PromptWorkshopAction {
  name: string;
}

export interface CharacterPromptWorkshopProps {
  initialDraft?: PromptBuilderDraft | undefined;
  hasReferenceImage?: boolean;
  referenceImage?: { width?: number; height?: number } | undefined;
  disabled?: boolean;
  onDraftChange?: ((draft: PromptBuilderDraft) => void) | undefined;
  onUse: (action: PromptWorkshopAction) => void;
  onSave?: ((action: SavePromptWorkshopAction) => void | Promise<void>) | undefined;
}

const workshopStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: `clamp(${theme.space.md}, 2.5vw, ${theme.space.lg})`,
});

const customFieldStyles = (): CSSObject => ({
  display: 'grid',
});

const createDraftMap = (
  initial?: PromptBuilderDraft,
): Record<PromptIntent, PromptBuilderDraft> => ({
  'character-transform':
    initial?.intent === 'character-transform'
      ? normalizePromptBuilderDraft(initial)
      : createPromptBuilderDraft('character-transform'),
  'add-object':
    initial?.intent === 'add-object'
      ? normalizePromptBuilderDraft(initial)
      : createPromptBuilderDraft('add-object'),
  'replace-object':
    initial?.intent === 'replace-object'
      ? normalizePromptBuilderDraft(initial)
      : createPromptBuilderDraft('replace-object'),
  'change-attribute':
    initial?.intent === 'change-attribute'
      ? normalizePromptBuilderDraft(initial)
      : createPromptBuilderDraft('change-attribute'),
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
  hasReferenceImage = false,
  referenceImage,
  disabled = false,
  onDraftChange,
  onUse,
  onSave,
}: CharacterPromptWorkshopProps) => {
  const theme = useTheme();
  const [drafts, setDrafts] = useState(() => createDraftMap(initialDraft));
  const [intent, setIntent] = useState<PromptIntent>(initialDraft?.intent ?? 'character-transform');
  const [showSave, setShowSave] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveState, setSaveState] = useState<PromptSaveState>('idle');

  const draft = drafts[intent];
  const context = useMemo(
    () => referenceContext(hasReferenceImage, referenceImage),
    [hasReferenceImage, referenceImage],
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
  const canCommit = !disabled && validation.blocking.length === 0 && generatedPrompt.length > 0;

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
    updateDraft(createPromptBuilderDraft(intent));
    setSaveName('');
    setShowSave(false);
  };

  const actionPayload = (): PromptWorkshopAction => ({
    prompt: generatedPrompt,
    draft: normalizedDraft,
    validation,
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
    <Surface aria-labelledby="character-workshop-title" padding="spacious">
      <div css={workshopStyles(theme)}>
        <PromptWorkshopHeader
          intent={intent}
          disabled={disabled}
          onIntentChange={changeIntent}
          onReset={resetCurrent}
        />

        <PromptIntentFields draft={draft} issues={validation.blocking} onChange={updateDraft} />

        {draft.intent === 'character-transform' ? (
          <div css={customFieldStyles()}>
            <TextAreaField
              label="Optional custom constraints"
              hint="Add one focused visual constraint. Adult subjects only; up to 500 characters."
              placeholder="e.g. Keep the camera framing and natural skin texture unchanged."
              value={draft.customDetails}
              maxLength={500}
              onChange={(event) =>
                updateDraft({ ...draft, customDetails: event.currentTarget.value })
              }
            />
          </div>
        ) : null}

        <PromptFeedback validation={validation} />
        <GeneratedPromptPreview prompt={generatedPrompt} />
        <PromptWorkshopActions
          canCommit={canCommit}
          hasSaveAction={Boolean(onSave)}
          showSave={showSave}
          saveName={saveName}
          saveState={saveState}
          onUse={() => onUse(actionPayload())}
          onToggleSave={() => setShowSave((visible) => !visible)}
          onSaveNameChange={(name) => {
            setSaveName(name);
            setSaveState('idle');
          }}
          onSave={() => void savePrompt()}
        />
      </div>
    </Surface>
  );
};
