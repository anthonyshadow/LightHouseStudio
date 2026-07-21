import { createPromptBuilderDraft } from '@studio/domain';
import { describe, expect, it } from 'vitest';
import { createEmptyGuidedProjectData, type ProjectRecordV1 } from '../guided-flow';
import { reconcileGuidedRestore, restoreCharacterEditingState } from './guidedProjectRestore';

const project = (checkpoint: ProjectRecordV1['checkpoint']): ProjectRecordV1 => ({
  schemaVersion: 1,
  id: 'project-1',
  title: 'Restorable project',
  revision: 4,
  checkpoint,
  data: createEmptyGuidedProjectData(),
  createdAt: '2026-07-20T12:00:00.000Z',
  updatedAt: '2026-07-20T12:01:00.000Z',
});

describe('guided project restore reconciliation', () => {
  it('uses the canonical project draft before the separate Recipe Shelf', () => {
    const projectDraft = {
      ...createPromptBuilderDraft('character-transform'),
      hair: 'project hair kept exactly',
      preserve: 'project constraint kept exactly',
    };
    const shelfDraft = {
      ...createPromptBuilderDraft('character-transform'),
      hair: 'stale shelf hair',
    };

    const restored = restoreCharacterEditingState(
      { ...createEmptyGuidedProjectData(), characterDraft: projectDraft },
      shelfDraft,
    );

    expect(restored.draft).toBe(projectDraft);
    expect(restored.design.choices.hair).toEqual({
      optionId: 'custom',
      customValue: 'project hair kept exactly',
    });
  });

  it('rebases an advanced checkpoint with no original Blob to live-ready', () => {
    const stored = project('delivery-ready');
    const next = reconcileGuidedRestore(
      {
        ...stored,
        data: {
          ...stored.data,
          originalVideoArtifactId: 'original-1',
          originalVideoMetadata: {
            filename: 'take.webm',
            mimeType: 'video/webm',
            sourceModeId: 'lucy-2.5',
            startedAt: stored.createdAt,
            durationMs: 10_000,
            sizeBytes: 1_024,
          },
          finalVariant: 'original',
        },
      },
      { referenceMissing: false, originalMissing: true, processedMissing: false },
    );

    expect(next.flow).toMatchObject({
      status: 'live.ready',
      data: { originalVideoArtifactId: null, finalVariant: null },
    });
    expect(next.flow.error).toMatch(/ready for a new live session/i);
  });

  it('falls back from missing processed bytes to the immutable original', () => {
    const stored = project('delivery-ready');
    const next = reconcileGuidedRestore(
      {
        ...stored,
        data: {
          ...stored.data,
          originalVideoArtifactId: 'original-1',
          processedVideoArtifactId: 'processed-1',
          finalVariant: 'processed',
        },
      },
      { referenceMissing: true, originalMissing: false, processedMissing: true },
    );

    expect(next.flow).toMatchObject({
      status: 'download.ready',
      data: {
        referenceImageStale: true,
        originalVideoArtifactId: 'original-1',
        processedVideoArtifactId: null,
        finalVariant: 'original',
      },
    });
    expect(next.warnings).toHaveLength(2);
  });
});
