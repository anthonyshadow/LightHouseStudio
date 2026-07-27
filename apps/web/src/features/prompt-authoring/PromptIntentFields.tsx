import type { PromptIssue } from './model';
import { SingleEditIntentFields } from './SingleEditIntentFields';
import type { PromptWorkshopStepId } from './workshopSteps';
import type { WorkshopDraft } from './workshopModel';

interface PromptIntentFieldsProps {
  draft: WorkshopDraft;
  issues: readonly PromptIssue[];
  activeStep: PromptWorkshopStepId;
  onChange: (draft: WorkshopDraft) => void;
}

export const PromptIntentFields = ({
  draft,
  issues,
  activeStep,
  onChange,
}: PromptIntentFieldsProps) => {
  return (
    <SingleEditIntentFields
      draft={draft}
      issues={issues}
      activeStep={activeStep}
      onChange={onChange}
    />
  );
};
