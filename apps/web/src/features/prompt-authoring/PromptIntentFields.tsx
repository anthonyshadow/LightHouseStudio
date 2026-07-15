import { CharacterTransformFields } from './CharacterTransformFields';
import type { PromptBuilderDraft, PromptIssue } from './model';
import { SingleEditIntentFields } from './SingleEditIntentFields';

interface PromptIntentFieldsProps {
  draft: PromptBuilderDraft;
  issues: readonly PromptIssue[];
  onChange: (draft: PromptBuilderDraft) => void;
}

export const PromptIntentFields = ({ draft, issues, onChange }: PromptIntentFieldsProps) => {
  if (draft.intent === 'character-transform') {
    return <CharacterTransformFields draft={draft} issues={issues} onChange={onChange} />;
  }

  return <SingleEditIntentFields draft={draft} issues={issues} onChange={onChange} />;
};
