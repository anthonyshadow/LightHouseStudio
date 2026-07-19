// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingArtifact, RecordingAudioSidecar } from '../../features/recording/types';
import type { RecordingController } from '../../features/recording/types';

const adapters = vi.hoisted(() => ({
  convertRecordingVoice: vi.fn(),
  replaceRecordingAudio: vi.fn(),
}));

vi.mock('../../adapters/api-client/voicesApi', () => ({
  convertRecordingVoice: adapters.convertRecordingVoice,
}));

vi.mock('../../adapters/media-processing/replaceAudioTrack', () => ({
  replaceRecordingAudio: adapters.replaceRecordingAudio,
}));

vi.mock('../../adapters/media-processing/audioEffects', () => ({
  decodeAudioBlob: vi.fn(),
  renderLocalEffect: vi.fn(),
}));

import { useVoiceProcessing } from './useVoiceProcessing';

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
};

const deferred = <T,>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
};

const originalArtifact = (): RecordingArtifact => {
  const blob = new Blob(['original-video'], { type: 'video/webm' });
  return {
    id: 'original',
    media: blob,
    objectUrl: 'blob:original',
    mimeType: blob.type,
    filename: 'original.webm',
    sourceModeId: 'local',
    startedAt: '2026-07-14T12:00:00.000Z',
    durationMs: 1_000,
    sizeBytes: blob.size,
  };
};

const readySidecar = (): RecordingAudioSidecar => {
  const blob = new Blob(['original-audio'], { type: 'audio/webm' });
  return { state: 'ready', blob, mimeType: blob.type, error: null };
};

const recordingController = (): RecordingController => {
  const original = originalArtifact();
  return {
    lifecycle: 'recorded',
    activeSource: null,
    metadata: null,
    original,
    processed: null,
    presented: original,
    sidecar: readySidecar(),
    recordingError: null,
    processingState: 'idle',
    processingError: null,
    elapsedSeconds: 1,
    downloaded: false,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(original),
    discard: vi.fn(),
    markDownloaded: vi.fn(),
    beginProcessing: vi.fn(),
    cancelProcessing: vi.fn(),
    completeProcessing: vi.fn().mockReturnValue(original),
    failProcessing: vi.fn(),
    restoreOriginal: vi.fn(),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useVoiceProcessing operation ownership', () => {
  it('cancels active processing before restoring the immutable original', () => {
    const recording = recordingController();
    const { result, unmount } = renderHook(() => useVoiceProcessing(recording));

    act(() => result.current.restoreOriginal());

    expect(recording.cancelProcessing).toHaveBeenCalledTimes(1);
    expect(recording.restoreOriginal).toHaveBeenCalledTimes(1);
    expect(result.current.selection).toEqual({ kind: 'none' });

    unmount();
  });

  it('does not let a superseded operation cancel, fail, or overwrite the newer result', async () => {
    const firstConversion = deferred<Blob>();
    const secondConversion = deferred<Blob>();
    adapters.convertRecordingVoice
      .mockReturnValueOnce(firstConversion.promise)
      .mockReturnValueOnce(secondConversion.promise);
    adapters.replaceRecordingAudio.mockImplementation((_video: Blob, audio: Blob) =>
      Promise.resolve({ blob: audio, mimeType: 'video/webm' }),
    );

    const recording = recordingController();
    const { result, unmount } = renderHook(() => useVoiceProcessing(recording));

    let firstOperation!: Promise<void>;
    act(() => {
      firstOperation = result.current.applyElevenLabs('voice-old', 'Old voice');
    });
    await waitFor(() => expect(adapters.convertRecordingVoice).toHaveBeenCalledTimes(1));

    let secondOperation!: Promise<void>;
    act(() => {
      secondOperation = result.current.applyElevenLabs('voice-new', 'New voice');
    });
    await waitFor(() => expect(adapters.convertRecordingVoice).toHaveBeenCalledTimes(2));

    expect(recording.cancelProcessing).toHaveBeenCalledTimes(2);
    expect(recording.beginProcessing).toHaveBeenCalledTimes(2);

    await act(async () => {
      firstConversion.resolve(new Blob(['stale-audio'], { type: 'audio/webm' }));
      await firstOperation;
    });

    expect(recording.cancelProcessing).toHaveBeenCalledTimes(2);
    expect(recording.failProcessing).not.toHaveBeenCalled();
    expect(recording.completeProcessing).not.toHaveBeenCalled();

    await act(async () => {
      secondConversion.resolve(new Blob(['new-audio'], { type: 'audio/webm' }));
      await secondOperation;
    });

    expect(recording.cancelProcessing).toHaveBeenCalledTimes(2);
    expect(recording.failProcessing).not.toHaveBeenCalled();
    expect(recording.completeProcessing).toHaveBeenCalledTimes(1);
    expect(recording.completeProcessing).toHaveBeenCalledWith(
      expect.any(Blob),
      'video/webm',
      'voice',
    );
    expect(result.current.selection).toEqual({
      kind: 'elevenlabs',
      voiceId: 'voice-new',
      voiceName: 'New voice',
    });

    unmount();
  });
});
