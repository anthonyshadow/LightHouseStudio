import { useCallback, useMemo, useState } from 'react';
import type { PromptBuilderDraft, PromptIntent } from './model';
import { isWorkshopDraft, type WorkshopDraft } from './workshopModel';
import {
  loadWorkshopDrafts,
  persistWorkshopDrafts,
  type StoredWorkshopDrafts,
} from './workshopDraftStorage';

/**
 * The Workshop's in-progress prompts, per intent.
 *
 * Restored from browser storage because the Studio runtime is torn down on leaving Studio: a draft
 * is work the operator typed and did not save, and opening the Dashboard mid-sentence must not
 * discard it. The most recent draft is not restored as *active* — the operator did not reopen the
 * Workshop, so re-selecting one is theirs to do.
 */
export const useWorkshopDrafts = (ownerUserId: string) => {
  const [draft, setDraft] = useState<WorkshopDraft | undefined>();
  const [drafts, setDrafts] = useState<StoredWorkshopDrafts>(() => loadWorkshopDrafts(ownerUserId));

  const rememberDraft = useCallback(
    (next: PromptBuilderDraft) => {
      if (!isWorkshopDraft(next)) return;
      setDraft(next);
      setDrafts((current) => {
        const updated: Partial<Record<PromptIntent, PromptBuilderDraft>> = {
          ...current,
          [next.intent]: next,
        };
        persistWorkshopDrafts(ownerUserId, updated);
        return updated;
      });
    },
    [ownerUserId],
  );

  return useMemo(() => ({ draft, drafts, rememberDraft }) as const, [draft, drafts, rememberDraft]);
};
