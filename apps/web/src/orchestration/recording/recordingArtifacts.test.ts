// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RecordingArtifact } from '../../features/recording/types';
import {
  createPersistedOriginalRecording,
  createProcessedRecordingArtifact,
} from './recordingArtifacts';

const sourceArtifact = (): RecordingArtifact => {
  const media = new Blob(['source'], { type: 'video/mp4' });
  return {
    id: 'video-source',
    name: 'Uploaded source',
    createdAt: '2026-07-31T12:00:00.000Z',
    kind: 'uploaded',
    parentArtifactId: null,
    media,
    objectUrl: 'blob:source',
    mimeType: 'video/mp4',
    filename: 'source.mp4',
    sourceModeId: 'local',
    startedAt: '2026-07-31T12:00:00.000Z',
    durationMs: 1_000,
    sizeBytes: media.size,
  };
};

afterEach(() => vi.restoreAllMocks());

describe('recording artifact identity', () => {
  it('creates unique generated identities, names, filenames, and lineage', () => {
    vi.spyOn(URL, 'createObjectURL')
      .mockReturnValueOnce('blob:first')
      .mockReturnValueOnce('blob:second');
    const source = sourceArtifact();
    const blob = new Blob(['result'], { type: 'video/mp4' });
    const first = createProcessedRecordingArtifact(source, blob, 'video/mp4', 'voice-Northstar');
    const second = createProcessedRecordingArtifact(source, blob, 'video/mp4', 'voice-Northstar');

    expect(first.id).not.toBe(second.id);
    expect(first.name).not.toBe(second.name);
    expect(first.filename).not.toBe(second.filename);
    expect(first.kind).toBe('voice');
    expect(first.parentArtifactId).toBe(source.id);
    expect(first.filename).toMatch(/voice-northstar-\d{8}T\d{6}Z-[0-9a-f]{8}\.mp4$/u);
  });

  it('pins parent character and variant attribution on a visual result', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:character-result');
    const result = createProcessedRecordingArtifact(
      sourceArtifact(),
      new Blob(['result'], { type: 'video/mp4' }),
      'video/mp4',
      'character-swap-1',
      { characterName: 'Mara', characterVariantName: 'Evening' },
    );

    expect(result).toMatchObject({
      characterName: 'Mara',
      characterVariantName: 'Evening',
    });
  });

  it('derives safe metadata when restoring a legacy artifact', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:restored');
    const blob = new Blob(['legacy'], { type: 'video/mp4' });
    const restored = createPersistedOriginalRecording({
      blob,
      artifactMetadata: {
        id: 'legacy-artifact',
        mimeType: 'video/mp4',
        filename: 'legacy.mp4',
        sourceModeId: 'local',
        startedAt: '2026-07-31T12:00:00.000Z',
        durationMs: 1_000,
      },
    }).artifact;

    expect(restored.name).toBe('Restored video · artifact');
    expect(restored.createdAt).toBe(restored.startedAt);
    expect(restored.kind).toBe('uploaded');
    expect(restored.parentArtifactId).toBeNull();
  });
});
