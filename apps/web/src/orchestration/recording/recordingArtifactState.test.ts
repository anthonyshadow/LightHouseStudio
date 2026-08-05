import { describe, expect, it } from 'vitest';
import type { RecordingArtifact } from '../../features/recording/types';
import { initialRecordingArtifactState, recordingArtifactReducer } from './recordingArtifactState';

const artifact = (id: string): RecordingArtifact => ({
  id,
  name: id,
  createdAt: '2026-08-05T12:00:00.000Z',
  kind: id === 'original' ? 'recorded' : 'voice',
  parentArtifactId: id === 'original' ? null : 'original',
  media: new Blob([id], { type: 'video/mp4' }),
  objectUrl: `blob:${id}`,
  mimeType: 'video/mp4',
  filename: `${id}.mp4`,
  sourceModeId: 'local',
  startedAt: '2026-08-05T12:00:00.000Z',
  durationMs: 1_000,
  sizeBytes: id.length,
});

describe('recordingArtifactReducer', () => {
  it('keeps original, visual, and voice transitions atomic', () => {
    const original = artifact('original');
    const visual = artifact('visual');
    const processed = artifact('processed');
    let state = recordingArtifactReducer(initialRecordingArtifactState, {
      type: 'publish-original',
      artifact: original,
      sidecar: initialRecordingArtifactState.sidecar,
    });
    state = recordingArtifactReducer(state, { type: 'complete-visual', artifact: visual });
    state = recordingArtifactReducer(state, {
      type: 'complete-processing',
      artifact: processed,
      replaceVisual: false,
    });

    expect(state).toMatchObject({ original, visual, processed, processingState: 'ready' });
    expect(recordingArtifactReducer(state, { type: 'restore-original' })).toMatchObject({
      original,
      visual,
      processed: null,
      processingState: 'idle',
      downloaded: false,
    });
  });

  it('replaces generated layers without mutating the prior state', () => {
    const original = artifact('original');
    const visual = artifact('visual');
    const processed = artifact('processed');
    const before = {
      ...initialRecordingArtifactState,
      original,
      visual,
      downloaded: true,
    };
    const after = recordingArtifactReducer(before, {
      type: 'complete-processing',
      artifact: processed,
      replaceVisual: true,
    });

    expect(before.visual).toBe(visual);
    expect(after).toMatchObject({ original, visual: null, processed, downloaded: false });
  });
});
