import type { PromptBuilderDraft, PromptIntent } from './model';

export type WorkshopIntent = Exclude<PromptIntent, 'character-transform'>;
export type WorkshopDraft = Exclude<PromptBuilderDraft, { intent: 'character-transform' }>;

export const isWorkshopDraft = (draft: PromptBuilderDraft | undefined): draft is WorkshopDraft =>
  Boolean(draft && draft.intent !== 'character-transform');
