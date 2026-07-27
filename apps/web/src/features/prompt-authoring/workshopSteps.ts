import type { WorkshopDraft, WorkshopIntent } from './workshopModel';

export type PromptWorkshopStepId = 'constraints' | 'edit';

export interface PromptWorkshopStep {
  id: PromptWorkshopStepId;
  label: string;
  description: string;
  summary: string;
}

const concise = (values: readonly string[], fallback: string): string => {
  const present = values.filter(Boolean);
  return present.length > 0 ? present.slice(0, 2).join(' · ') : fallback;
};

const editLabel: Record<WorkshopIntent, string> = {
  'add-object': 'Object & placement',
  'replace-object': 'Object & replacement',
  'change-attribute': 'Object & new look',
};

const editSummary = (draft: WorkshopDraft): string => {
  switch (draft.intent) {
    case 'add-object':
      return concise([draft.objectDescription, draft.placement], 'Add the required edit details');
    case 'replace-object':
      return concise([draft.target, draft.replacementDescription], 'Add the required edit details');
    case 'change-attribute':
      return concise([draft.target, draft.newValue], 'Add the required edit details');
  }
};

export const getPromptWorkshopSteps = (draft: WorkshopDraft): readonly PromptWorkshopStep[] => [
  {
    id: 'edit',
    label: editLabel[draft.intent],
    description: 'Describe one visible edit with enough detail to place it accurately.',
    summary: editSummary(draft),
  },
  {
    id: 'constraints',
    label: 'Optional guardrails',
    description: 'Add lighting, preservation, or consistency guidance for this edit.',
    summary: concise([draft.customDetails], 'No extra guardrails'),
  },
];

export const defaultPromptWorkshopStep = (_intent: WorkshopIntent): PromptWorkshopStepId => 'edit';

export const promptWorkshopDraftHasContent = (draft: WorkshopDraft): boolean =>
  Object.entries(draft).some(
    ([key, value]) =>
      key !== 'intent' &&
      key !== 'presetId' &&
      typeof value === 'string' &&
      value.trim().length > 0,
  );
