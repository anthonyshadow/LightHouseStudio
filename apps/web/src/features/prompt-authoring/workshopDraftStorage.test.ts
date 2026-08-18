// @vitest-environment jsdom

import { createPromptBuilderDraft } from '@studio/domain';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadWorkshopDrafts,
  persistWorkshopDrafts,
  workshopDraftsStorageKey,
} from './workshopDraftStorage';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';

afterEach(() => window.localStorage.clear());

describe('workshop draft persistence', () => {
  it('restores unsaved drafts per intent across a Studio teardown', () => {
    const draft = createPromptBuilderDraft('add-object');

    expect(persistWorkshopDrafts(ownerUserId, { 'add-object': draft })).toBe(true);
    expect(loadWorkshopDrafts(ownerUserId)).toEqual({ 'add-object': draft });
  });

  it('scopes storage to the operator', () => {
    persistWorkshopDrafts(ownerUserId, { 'add-object': createPromptBuilderDraft('add-object') });

    expect(loadWorkshopDrafts('a-different-user')).toEqual({});
    expect(workshopDraftsStorageKey(ownerUserId)).not.toBe(
      workshopDraftsStorageKey('a-different-user'),
    );
  });

  it.each([
    ['absent', null],
    ['unparseable', '{'],
    ['a future version', JSON.stringify({ version: 2, drafts: { 'add-object': {} } })],
  ])('returns no drafts when the stored value is %s', (_label, raw) => {
    if (raw !== null) window.localStorage.setItem(workshopDraftsStorageKey(ownerUserId), raw);

    expect(loadWorkshopDrafts(ownerUserId)).toEqual({});
  });

  it('drops an entry that no longer matches the draft shape rather than hydrating it', () => {
    const draft = createPromptBuilderDraft('add-object');
    window.localStorage.setItem(
      workshopDraftsStorageKey(ownerUserId),
      JSON.stringify({ version: 1, drafts: { 'add-object': draft, stale: { intent: undefined } } }),
    );

    // A half-understood draft would open the Workshop on something the operator never wrote.
    expect(loadWorkshopDrafts(ownerUserId)).toEqual({ 'add-object': draft });
  });
});
