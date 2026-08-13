import { createEmptyProjectSnapshot, createProject } from '@studio/domain';
import { describe, expect, it } from 'vitest';
import {
  projectAssetLinksForRevision,
  projectMediaReferencesEqual,
  projectVersionReferenceLinksForRevision,
} from './project-snapshot-relations.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const revisionId = '3ac244b9-ec36-4a1e-b95e-7bcf37eb0b2d';
const sourceAssetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const referenceAssetId = '49943d8f-60a7-4879-87f9-e9a809687c9c';
const savedVideoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const videoVersionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
const now = '2026-08-11T12:00:00.000Z';

describe('Project snapshot relation normalization', () => {
  it('compares media references by their discriminated identity', () => {
    expect(projectMediaReferencesEqual(null, null)).toBe(true);
    expect(
      projectMediaReferencesEqual(
        { kind: 'asset', assetId: sourceAssetId },
        { kind: 'asset', assetId: sourceAssetId },
      ),
    ).toBe(true);
    expect(
      projectMediaReferencesEqual(
        { kind: 'saved-video-version', savedVideoId, videoVersionId },
        { kind: 'saved-video-version', savedVideoId, videoVersionId },
      ),
    ).toBe(true);
    expect(
      projectMediaReferencesEqual(
        { kind: 'asset', assetId: sourceAssetId },
        { kind: 'saved-video-version', savedVideoId, videoVersionId },
      ),
    ).toBe(false);
  });

  it('deduplicates shared asset roles while retaining both Saved Video reference roles', () => {
    const empty = createEmptyProjectSnapshot(now);
    const mediaReference = {
      kind: 'saved-video-version' as const,
      savedVideoId,
      videoVersionId,
    };
    const aggregate = createProject(
      {
        id: projectId,
        ownerUserId,
        title: 'Normalized relationships',
        snapshot: {
          ...empty,
          sourceAssetId,
          workingMedia: mediaReference,
          presentedMedia: mediaReference,
          selectedCharacter: {
            characterId: 'character-1',
            characterLabel: null,
            characterRevision: null,
            variantId: null,
            variantLabel: null,
            variantRevision: null,
            referenceAssetId,
          },
          selectedOutfit: {
            outfitId: 'outfit-1',
            outfitLabel: null,
            outfitRevision: null,
            referenceAssetId,
            inputKind: null,
          },
          creativeIntent: { ...empty.creativeIntent, referenceAssetId },
        },
        author: { kind: 'user', authorId: ownerUserId },
        facts: {
          sourceStatus: 'ready',
          currentAttempt: { status: 'none' },
          validatedLastSuccessfulOutput: null,
        },
      },
      { now, createId: () => revisionId },
    );
    const revision = aggregate.revisions[0]!;

    expect(
      projectAssetLinksForRevision(revision).map(({ assetId, role }) => ({ assetId, role })),
    ).toEqual([
      { assetId: sourceAssetId, role: 'source' },
      { assetId: referenceAssetId, role: 'reference' },
    ]);
    expect(
      projectVersionReferenceLinksForRevision(revision).map(
        ({ savedVideoId, videoVersionId, role }) => ({ savedVideoId, videoVersionId, role }),
      ),
    ).toEqual([
      { savedVideoId, videoVersionId, role: 'working' },
      { savedVideoId, videoVersionId, role: 'presented' },
    ]);
  });
});
