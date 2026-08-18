import { sanitizePromptBuilderDraft } from '@studio/domain';
import { createVersionedRecordStore } from '../../persistence/versionedRecord';
import type { PromptBuilderDraft, PromptIntent } from './model';
import { isWorkshopDraft } from './workshopModel';

export type StoredWorkshopDrafts = Partial<Record<PromptIntent, PromptBuilderDraft>>;

/**
 * Unsaved Prompt Workshop drafts.
 *
 * A draft is work the operator typed and has not saved, and the Studio runtime is torn down on the
 * way out of Studio — so without this, opening the Dashboard mid-sentence would discard it.
 *
 * Every entry is re-parsed by the domain's allowlist sanitizer on read. That matters more than a
 * shape check: `isWorkshopDraft` answers "is this one of ours" for a draft the app just built, and
 * says yes to anything whose intent is merely not `character-transform`. Storage is untrusted, so
 * the value has to be rebuilt field by field rather than believed.
 */
const store = createVersionedRecordStore<StoredWorkshopDrafts>({
  storageBase: 'lightframe.workshop-drafts',
  version: 1,
  parse: (payload) => {
    if (typeof payload !== 'object' || payload === null) return null;
    const restored: StoredWorkshopDrafts = {};
    for (const candidate of Object.values(payload as Record<string, unknown>)) {
      const draft = sanitizePromptBuilderDraft(candidate);
      if (draft === null || !isWorkshopDraft(draft)) continue;
      restored[draft.intent] = draft;
    }
    return restored;
  },
});

export const workshopDraftsStorageKey = store.storageKey;

export const loadWorkshopDrafts = (ownerUserId: string): StoredWorkshopDrafts =>
  store.load(ownerUserId) ?? {};

export const persistWorkshopDrafts = (ownerUserId: string, drafts: StoredWorkshopDrafts): boolean =>
  store.save(ownerUserId, drafts);
