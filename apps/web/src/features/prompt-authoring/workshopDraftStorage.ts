import { environmentScopedPersistenceName } from '../../persistence/environmentScope';
import type { PromptBuilderDraft, PromptIntent } from './model';
import { isWorkshopDraft } from './workshopModel';

const STORAGE_BASE = 'lightframe.workshop-drafts.v1';

export type StoredWorkshopDrafts = Partial<Record<PromptIntent, PromptBuilderDraft>>;

type WorkshopDraftsEnvelope = Readonly<{
  version: 1;
  drafts: StoredWorkshopDrafts;
}>;

export const workshopDraftsStorageKey = (ownerUserId: string): string =>
  environmentScopedPersistenceName(STORAGE_BASE, ownerUserId);

/**
 * The intents a Workshop draft can carry.
 *
 * Checked here rather than leaning on `isWorkshopDraft` alone: that guard asks whether a draft the
 * app built is a Workshop one, and answers `true` for anything with an intent that is merely not
 * `character-transform`. Storage is an untrusted boundary — a value written by an older build, or
 * edited by hand, has to be recognised before it is trusted.
 */
const WORKSHOP_INTENTS: readonly PromptIntent[] = [
  'add-object',
  'replace-object',
  'change-attribute',
];

/**
 * Unsaved Prompt Workshop drafts.
 *
 * A draft is work the operator typed and has not saved, and the Studio runtime is now torn down on
 * the way out of Studio — so without this, opening the Dashboard mid-sentence would discard it.
 * Each entry is re-validated on read: a draft written by an older shape is dropped rather than
 * hydrated into the Workshop half-formed.
 */
export const loadWorkshopDrafts = (ownerUserId: string): StoredWorkshopDrafts => {
  try {
    const raw = window.localStorage.getItem(workshopDraftsStorageKey(ownerUserId));
    if (raw === null) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as { version?: unknown }).version !== 1
    ) {
      return {};
    }
    const { drafts } = parsed as { drafts?: unknown };
    if (typeof drafts !== 'object' || drafts === null) return {};
    const restored: StoredWorkshopDrafts = {};
    for (const candidate of Object.values(
      drafts as Record<string, PromptBuilderDraft | undefined>,
    )) {
      if (!isWorkshopDraft(candidate) || !WORKSHOP_INTENTS.includes(candidate.intent)) continue;
      restored[candidate.intent] = candidate;
    }
    return restored;
  } catch {
    return {};
  }
};

export const persistWorkshopDrafts = (
  ownerUserId: string,
  drafts: StoredWorkshopDrafts,
): boolean => {
  const envelope: WorkshopDraftsEnvelope = { version: 1, drafts };
  try {
    window.localStorage.setItem(workshopDraftsStorageKey(ownerUserId), JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
};
