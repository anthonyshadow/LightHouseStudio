// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import {
  preparationMatchesBasis,
  projectOutputRenditionPreparationStore,
  type ProjectOutputRenditionPreparation,
} from './projectOutputRenditionPreparationStorage';

const ownerUserId = '11111111-1111-4111-8111-111111111111';
const projectId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const operationKey = '44444444-4444-4444-8444-444444444444';
const assetId = '55555555-5555-4555-8555-555555555555';

const store = projectOutputRenditionPreparationStore(projectId);

const phone = {
  container: 'video/mp4' as const,
  aspect: '9:16' as const,
  resolution: { width: 1_080, height: 1_920 },
  includeAudio: true,
};

const preparation = (
  overrides: Partial<ProjectOutputRenditionPreparation> = {},
): ProjectOutputRenditionPreparation => ({
  attemptId,
  projectId,
  basis: {
    expectedVersion: 4,
    expectedRevisionNumber: 2,
    media: { kind: 'asset', assetId },
  },
  variantSetId: null,
  members: [{ specification: phone, operationKey, outcome: 'stored', assetId, reason: null }],
  ...overrides,
});

describe('project output rendition preparation', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips an attempt, and forgets it on request', () => {
    expect(store.save(ownerUserId, preparation())).toBe(true);
    expect(store.load(ownerUserId)).toEqual(preparation());
    store.remove(ownerUserId);
    expect(store.load(ownerUserId)).toBeNull();
  });

  it('ignores a record that could not be acted on', () => {
    const write = (payload: unknown) =>
      window.localStorage.setItem(
        store.storageKey(ownerUserId),
        JSON.stringify({ version: 1, payload }),
      );

    write({ ...preparation(), projectId: '66666666-6666-4666-8666-666666666666' });
    expect(store.load(ownerUserId)).toBeNull();

    // "Stored" without the bytes it names cannot be skipped on a resume, and believing it would
    // silently drop that placement from the save.
    write({
      ...preparation(),
      members: [
        { specification: phone, operationKey, outcome: 'stored', assetId: null, reason: null },
      ],
    });
    expect(store.load(ownerUserId)).toBeNull();

    write({ ...preparation(), members: [] });
    expect(store.load(ownerUserId)).toBeNull();

    write({ ...preparation(), basis: { expectedVersion: 4, expectedRevisionNumber: 2 } });
    expect(store.load(ownerUserId)).toBeNull();

    // A record written by a later version of this app is ignored rather than half-read.
    window.localStorage.setItem(
      store.storageKey(ownerUserId),
      JSON.stringify({ version: 2, payload: preparation() }),
    );
    expect(store.load(ownerUserId)).toBeNull();
  });

  it('matches only the Project state the attempt was made against', () => {
    const stored = preparation();
    expect(
      preparationMatchesBasis(stored, {
        expectedVersion: 4,
        expectedRevisionNumber: 2,
        media: { kind: 'asset', assetId },
      }),
    ).toBe(true);
    expect(
      preparationMatchesBasis(stored, {
        expectedVersion: 5,
        expectedRevisionNumber: 2,
        media: { kind: 'asset', assetId },
      }),
    ).toBe(false);
    expect(
      preparationMatchesBasis(stored, {
        expectedVersion: 4,
        expectedRevisionNumber: 2,
        media: { kind: 'asset', assetId: '77777777-7777-4777-8777-777777777777' },
      }),
    ).toBe(false);
    expect(
      preparationMatchesBasis(stored, {
        expectedVersion: 4,
        expectedRevisionNumber: 2,
        media: null,
      }),
    ).toBe(false);
  });

  it("keys per Project, so one Project never reads another Project's attempt", () => {
    const other = projectOutputRenditionPreparationStore('88888888-8888-4888-8888-888888888888');
    store.save(ownerUserId, preparation());
    expect(other.load(ownerUserId)).toBeNull();
    expect(other.storageKey(ownerUserId)).not.toBe(store.storageKey(ownerUserId));
  });
});
