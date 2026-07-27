import { useCallback, useMemo, useState } from 'react';
import type { PromptBuilderDraft, PromptIntent } from './model';
import { isWorkshopDraft, type WorkshopDraft } from './workshopModel';

export const useWorkshopDrafts = () => {
  const [draft, setDraft] = useState<WorkshopDraft | undefined>();
  const [drafts, setDrafts] = useState<Partial<Record<PromptIntent, PromptBuilderDraft>>>({});

  const rememberDraft = useCallback((next: PromptBuilderDraft) => {
    if (!isWorkshopDraft(next)) return;
    setDraft(next);
    setDrafts((current) => ({ ...current, [next.intent]: next }));
  }, []);

  return useMemo(() => ({ draft, drafts, rememberDraft }) as const, [draft, drafts, rememberDraft]);
};
