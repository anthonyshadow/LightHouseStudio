import { CharacterTransformFields } from './CharacterTransformFields';
import type { PromptBuilderDraft, PromptIssue } from './model';
import { SingleEditIntentFields } from './SingleEditIntentFields';
import type { PromptWorkshopStepId } from './workshopSteps';

interface PromptIntentFieldsProps {
  draft: PromptBuilderDraft;
  issues: readonly PromptIssue[];
  activeStep: PromptWorkshopStepId;
  onChange: (draft: PromptBuilderDraft) => void;
}

export const PromptIntentFields = ({
  draft,
  issues,
  activeStep,
  onChange,
}: PromptIntentFieldsProps) => {
  if (draft.intent === 'character-transform') {
    return (
      <CharacterTransformFields
        draft={draft}
        issues={issues}
        activeStep={activeStep}
        onChange={onChange}
      />
    );
  }

  return (
    <SingleEditIntentFields
      draft={draft}
      issues={issues}
      activeStep={activeStep}
      onChange={onChange}
    />
  );
};
