import {
  createEmptyProjectSnapshot,
  createProject,
  EMPTY_PROJECT_TRANSFORM,
  type Composition,
} from '@studio/domain';
import { describe, expect, it } from 'vitest';
import {
  projectAssetLinksForRevision,
  projectHeldMedia,
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
          transform: {
            ...EMPTY_PROJECT_TRANSFORM,
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
            creativeIntent: { ...EMPTY_PROJECT_TRANSFORM.creativeIntent, referenceAssetId },
          },
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

  it('holds the media a composition arranges as clip links, once per Version', () => {
    const empty = createEmptyProjectSnapshot(now);
    const clipAssetId = '0f0e4a30-6b98-4d1a-8bd6-32bd0a3b9b21';
    const composition: Composition = {
      clips: [
        {
          id: 'c1b7f4e5-9e51-4f1a-9c39-1f01d0a2e7ad',
          media: { kind: 'asset', assetId: sourceAssetId },
          trim: { startMs: 0, endMs: 2_000 },
          audio: { level: 100, muted: false },
        },
        {
          id: 'd2c8a5f6-0f62-4a2b-8d4a-2f12e1b3f8be',
          media: { kind: 'saved-video-version', savedVideoId, videoVersionId },
          trim: { startMs: 0, endMs: 2_000 },
          audio: { level: 100, muted: false },
        },
        {
          id: 'e3d9b6a7-1a73-4b3c-9e5b-3a23f2c4a9cf',
          media: { kind: 'saved-video-version', savedVideoId, videoVersionId },
          trim: { startMs: 2_000, endMs: 4_000 },
          audio: { level: 60, muted: false },
        },
        {
          id: 'f4eac7b8-2b84-4c4d-8f6c-4b34a3d5bad0',
          media: { kind: 'asset', assetId: clipAssetId },
          trim: { startMs: 0, endMs: 1_000 },
          audio: { level: 100, muted: true },
        },
      ],
      subtitles: [],
    };
    const aggregate = createProject(
      {
        id: projectId,
        ownerUserId,
        title: 'Arranged',
        snapshot: {
          ...empty,
          sourceAssetId,
          workingMedia: { kind: 'asset', assetId: sourceAssetId },
          presentedMedia: { kind: 'asset', assetId: sourceAssetId },
          composition,
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

    // A transform that was never configured contributes no reference link.
    expect(revision.snapshot.transform).toBeNull();
    expect(
      projectAssetLinksForRevision(revision).map(({ assetId, role }) => ({ assetId, role })),
    ).toEqual([
      { assetId: sourceAssetId, role: 'source' },
      { assetId: sourceAssetId, role: 'working' },
      { assetId: sourceAssetId, role: 'presented' },
      { assetId: sourceAssetId, role: 'clip' },
      { assetId: clipAssetId, role: 'clip' },
    ]);
    // Two clips over one Version are one used-by relation, which is also the stored row's key.
    expect(
      projectVersionReferenceLinksForRevision(revision).map(({ role, videoVersionId: id }) => ({
        role,
        id,
      })),
    ).toEqual([{ role: 'clip', id: videoVersionId }]);
    expect(projectHeldMedia(revision.snapshot)).toEqual([
      { kind: 'asset', assetId: sourceAssetId },
      { kind: 'asset', assetId: sourceAssetId },
      { kind: 'asset', assetId: sourceAssetId },
      { kind: 'saved-video-version', savedVideoId, videoVersionId },
      { kind: 'saved-video-version', savedVideoId, videoVersionId },
      { kind: 'asset', assetId: clipAssetId },
    ]);
  });
});
