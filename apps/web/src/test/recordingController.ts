import { vi } from 'vitest';
import type { RecordingArtifact } from '../features/recording/types';
import type { useRecording } from '../orchestration/recording';

/**
 * The widest controller a Studio surface is handed: the `RecordingController` port plus the
 * source-validation member `useRecording` adds on top of it, which is what the take-review flow
 * passes on to the Studio hooks. Doubling the wide shape is what lets one factory serve a hook
 * typed on the review flow's controller and a component typed on the bare port, without either
 * type being widened to accept it.
 */
export type RecordingControllerDouble = ReturnType<typeof useRecording>;

/** A finalized take whose bytes this runtime owns — the thing `discard` is asked to destroy. */
export const ownedTakeArtifact = (): RecordingArtifact => {
  const media = new Blob(['take'], { type: 'video/webm' });
  return {
    id: 'take-1',
    media,
    objectUrl: 'blob:take-1',
    mimeType: media.type,
    filename: 'take.webm',
    sourceModeId: 'local',
    startedAt: '2026-09-07T09:00:00.000Z',
    durationMs: 2_500,
    sizeBytes: media.size,
  };
};

/**
 * Built whole rather than narrowed, because `discard`'s boolean is what the suites using this are
 * about: a partial double closed by an assertion is exactly what would hide a member a surface
 * starts reading. Whole is also why it is worth one owner — every member is checked against the
 * real controller here, so a port change fails in one place instead of drifting copy by copy.
 *
 * The defaults are an idle stage holding nothing and letting go of everything. What a case is
 * actually about — the take on the stage, the answer `discard` gives, the lifecycle a surface
 * reads — belongs in that case's own overrides, where a reader can see it.
 */
export const recordingControllerDouble = (
  overrides: Partial<RecordingControllerDouble> = {},
): RecordingControllerDouble => ({
  lifecycle: 'idle',
  activeSource: null,
  metadata: null,
  original: null,
  visual: null,
  processed: null,
  presented: null,
  sidecar: { state: 'unavailable', blob: null, mimeType: null, error: null },
  recordingError: null,
  processingState: 'idle',
  processingOperation: null,
  processingError: null,
  elapsedSeconds: 0,
  start: vi.fn(() => Promise.resolve()),
  stop: vi.fn(() => Promise.resolve(null)),
  restorePersistedOriginal: vi.fn(() => ownedTakeArtifact()),
  presentRemoteOriginal: vi.fn(() => ownedTakeArtifact()),
  completeSourceValidation: vi.fn(() => ownedTakeArtifact()),
  replaceSource: vi.fn(() => ownedTakeArtifact()),
  discard: vi.fn(() => true),
  beginProcessing: vi.fn(),
  cancelProcessing: vi.fn(),
  completeVisualProcessing: vi.fn(() => ownedTakeArtifact()),
  completeProcessing: vi.fn(() => ownedTakeArtifact()),
  failProcessing: vi.fn(),
  repairPresentedObjectUrl: vi.fn(() => false),
  clearVisualProcessing: vi.fn(),
  restoreOriginal: vi.fn(),
  ...overrides,
});
