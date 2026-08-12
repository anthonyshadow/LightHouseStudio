import { describe, expect, it } from 'vitest';
import {
  projectOutputLinkSchema,
  projectSnapshotSchema,
  projectStatusFactsSchema,
} from './projects';

const assetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const videoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const versionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
const now = '2026-08-11T12:00:00.000Z';

const validSnapshot = () => ({
  schemaVersion: 1 as const,
  sourceAssetId: assetId,
  workingMedia: { kind: 'asset' as const, assetId },
  presentedMedia: {
    kind: 'saved-video-version' as const,
    savedVideoId: videoId,
    videoVersionId: versionId,
  },
  selectedCharacter: { characterId: 'character-one', variantId: 'red-jacket' },
  selectedOutfit: { outfitId: 'summer-outfit' },
  selectedVoice: {
    kind: 'saved-voice' as const,
    voiceId: 'northstar',
    voiceName: 'Northstar',
    treatment: { stability: 0.5, similarity: 0.8, style: null, speakerBoost: true },
  },
  visualTreatment: { kind: 'character-swap' as const },
  liveMode: null,
  creativeIntent: {
    promptId: 'prompt-one',
    recipeId: 'recipe-one',
    userIntent: 'Create a bright summer campaign launch.',
  },
  localEdit: {
    trim: { startMs: 0, endMs: 30_000 },
    crop: { preset: 'original' as const, rectangle: { x: 0, y: 0, width: 1, height: 1 } },
    rotation: 0 as const,
    flipHorizontal: false,
    flipVertical: false,
    adjustments: {
      brightness: 0,
      contrast: 0,
      saturation: 0,
      temperature: 0,
      highlights: 0,
      shadows: 0,
    },
    filter: 'original' as const,
  },
  exportSpecification: {
    container: 'video/mp4' as const,
    aspect: '9:16' as const,
    resolution: { width: 1080, height: 1920 },
    includeAudio: true,
  },
  lastSuccessfulOutput: { savedVideoId: videoId, videoVersionId: versionId },
  workflowPhase: 'review' as const,
  createdAt: now,
  updatedAt: now,
});

describe('Project snapshot contract', () => {
  it('accepts versioned creative intent without browser or provider internals', () => {
    expect(projectSnapshotSchema.parse(validSnapshot())).toEqual(validSnapshot());
  });

  it('rejects missing visual selections, object URLs, unknown state, and invalid edits', () => {
    expect(
      projectSnapshotSchema.safeParse({
        ...validSnapshot(),
        selectedCharacter: null,
      }).success,
    ).toBe(false);
    expect(
      projectSnapshotSchema.safeParse({
        ...validSnapshot(),
        selectedCharacter: { characterId: 'blob:browser-state', variantId: null },
      }).success,
    ).toBe(false);
    expect(
      projectSnapshotSchema.safeParse({
        ...validSnapshot(),
        providerRequest: { apiKey: 'must-not-persist' },
      }).success,
    ).toBe(false);
    expect(
      projectSnapshotSchema.safeParse({
        ...validSnapshot(),
        localEdit: {
          ...validSnapshot().localEdit,
          trim: { startMs: 20_000, endMs: 10_000 },
        },
      }).success,
    ).toBe(false);
  });

  it('canonicalizes timestamps and requires explicitly current status facts', () => {
    expect(
      projectSnapshotSchema.parse({
        ...validSnapshot(),
        createdAt: '2026-08-11T12:00:00Z',
        updatedAt: '2026-08-11T12:00:00Z',
      }),
    ).toMatchObject({ createdAt: now, updatedAt: now });
    expect(
      projectStatusFactsSchema.safeParse({
        sourceStatus: 'ready',
        activeJobCount: 1,
        failedJobCount: 3,
        successfulOutputCount: 4,
      }).success,
    ).toBe(false);
    expect(
      projectStatusFactsSchema.safeParse({
        sourceStatus: 'ready',
        currentAttempt: { status: 'none' },
        validatedLastSuccessfulOutput: null,
      }).success,
    ).toBe(true);
  });

  it('keeps relationship contracts owner-free and strict', () => {
    const link = {
      projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
      savedVideoId: videoId,
      videoVersionId: versionId,
      producingRevisionId: '3ac244b9-ec36-4a1e-b95e-7bcf37eb0b2d',
      producingRevisionNumber: 1,
      createdAt: now,
    };
    expect(projectOutputLinkSchema.parse(link)).toEqual(link);
    expect(projectOutputLinkSchema.safeParse({ ...link, ownerUserId: assetId }).success).toBe(
      false,
    );
  });
});
