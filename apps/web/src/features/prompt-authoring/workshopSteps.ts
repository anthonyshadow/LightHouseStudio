import type { PromptBuilderDraft, PromptIntent } from './model';

export type PromptWorkshopStepId =
  | 'starting-point'
  | 'character'
  | 'appearance'
  | 'wardrobe'
  | 'expression'
  | 'preserve'
  | 'constraints'
  | 'edit';

export interface PromptWorkshopStep {
  id: PromptWorkshopStepId;
  label: string;
  description: string;
  summary: string;
}

const concise = (values: readonly (string | null | false)[], fallback: string): string => {
  const present = values.filter(
    (value): value is string => typeof value === 'string' && Boolean(value),
  );
  return present.length > 0 ? present.slice(0, 2).join(' · ') : fallback;
};

const characterSteps = (
  draft: Extract<PromptBuilderDraft, { intent: 'character-transform' }>,
): readonly PromptWorkshopStep[] => [
  {
    id: 'starting-point',
    label: 'Visible starting point',
    description: 'Begin from a focused preset, or keep your own choices.',
    summary: draft.presetId ? 'Preset selected' : 'Optional preset',
  },
  {
    id: 'character',
    label: 'Character concept',
    description: 'Define the adult character, gender direction, and age direction.',
    summary: concise([draft.characterBase, draft.gender, draft.adultAge], 'Add the core concept'),
  },
  {
    id: 'appearance',
    label: 'Appearance & hair',
    description: 'Describe visible facial styling, complexion, and hair.',
    summary: concise(
      [draft.appearance, draft.skinTone, draft.bodyShape, draft.hair, draft.hairColor],
      'Optional visible details',
    ),
  },
  {
    id: 'wardrobe',
    label: 'Outfit & accessories',
    description: 'Direct the wardrobe and a few clearly visible accessories.',
    summary: concise([draft.outfit, draft.accessories], 'Optional styling details'),
  },
  {
    id: 'expression',
    label: 'Expression & mood',
    description: 'Set the performance expression and overall visual mood.',
    summary: concise([draft.expression, draft.mood], 'Optional performance direction'),
  },
  {
    id: 'preserve',
    label: 'Keep unchanged',
    description: 'Protect important visible details and optionally match the selected portrait.',
    summary: concise(
      [draft.matchReference && 'Match current portrait', draft.preserve],
      'Optional preservation notes',
    ),
  },
  {
    id: 'constraints',
    label: 'Optional constraints',
    description: 'Add one final, focused consistency constraint.',
    summary: concise([draft.customDetails], 'No extra constraints'),
  },
];

const editLabel: Record<Exclude<PromptIntent, 'character-transform'>, string> = {
  'add-object': 'Object & placement',
  'replace-object': 'Object & replacement',
  'change-attribute': 'Object & new look',
};

const editSummary = (
  draft: Exclude<PromptBuilderDraft, { intent: 'character-transform' }>,
): string => {
  switch (draft.intent) {
    case 'add-object':
      return concise([draft.objectDescription, draft.placement], 'Add the required edit details');
    case 'replace-object':
      return concise([draft.target, draft.replacementDescription], 'Add the required edit details');
    case 'change-attribute':
      return concise([draft.target, draft.newValue], 'Add the required edit details');
  }
};

export const getPromptWorkshopSteps = (
  draft: PromptBuilderDraft,
): readonly PromptWorkshopStep[] => {
  if (draft.intent === 'character-transform') return characterSteps(draft);

  return [
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
};

export const defaultPromptWorkshopStep = (intent: PromptIntent): PromptWorkshopStepId =>
  intent === 'character-transform' ? 'character' : 'edit';

export const promptWorkshopDraftHasContent = (draft: PromptBuilderDraft): boolean => {
  const values = Object.entries(draft).filter(
    ([key]) => key !== 'intent' && key !== 'presetId' && key !== 'matchReference',
  );
  return (
    draft.presetId !== null ||
    (draft.intent === 'character-transform' && draft.matchReference) ||
    values.some(([, value]) => typeof value === 'string' && value.trim().length > 0)
  );
};
