import { describe, expect, it } from 'vitest';
import { createSafeError } from '../errors/safe-error';
import {
  canStartRecording,
  canUseVoiceEffects,
  completeAudioSidecar,
  completeRecordingLifecycle,
  createRecordingLifecycle,
  createRecordingFilename,
  formatDuration,
  formatFileSize,
  selectRecordingMimeType,
  selectRecordingSource,
  shouldRevokeRecordingObjectUrl,
  startAudioSidecar,
  startRecordingLifecycle,
  stopRecordingLifecycle,
} from './index';

describe('recording source rules', () => {
  it('records local video with local microphone when available', () => {
    const source = selectRecordingSource({
      modeId: 'local',
      localVideoLive: true,
      localAudioLive: true,
      modelVideoLive: false,
      modelAudioLive: false,
    });
    expect(source).toMatchObject({
      videoSource: 'local-camera',
      audioSource: 'local-microphone',
    });
    expect(canStartRecording('ready', source)).toBe(true);
  });

  it('gates model recording on transformed video and prefers provider audio', () => {
    expect(
      selectRecordingSource({
        modeId: 'lucy-2.5',
        localVideoLive: true,
        localAudioLive: true,
        modelVideoLive: false,
        modelAudioLive: true,
      }),
    ).toBeNull();
    expect(
      selectRecordingSource({
        modeId: 'lucy-2.5',
        localVideoLive: true,
        localAudioLive: true,
        modelVideoLive: true,
        modelAudioLive: true,
      }),
    ).toMatchObject({ videoSource: 'model-output', audioSource: 'model-output' });
  });

  it('falls back to local microphone when provider audio is absent', () => {
    expect(
      selectRecordingSource({
        modeId: 'lucy-vton-3',
        localVideoLive: true,
        localAudioLive: true,
        modelVideoLive: true,
        modelAudioLive: false,
      }),
    ).toMatchObject({ audioSource: 'local-microphone', hasLiveAudio: true });
  });
});

describe('recording lifecycle rules', () => {
  const source = selectRecordingSource({
    modeId: 'local',
    localVideoLive: true,
    localAudioLive: true,
    modelVideoLive: false,
    modelAudioLive: false,
  });

  it('requires ready media, stops, then finalizes a nonempty artifact', () => {
    const initial = createRecordingLifecycle(true);
    const recording = startRecordingLifecycle(initial, source, '2026-07-14T12:00:00.000Z');
    const stopping = stopRecordingLifecycle(recording);
    const artifact = {
      id: 'take-1',
      media: { immutable: true },
      objectUrl: 'blob:take-1',
      mimeType: 'video/webm',
      filename: 'local-take.webm',
      sourceModeId: 'local' as const,
      startedAt: '2026-07-14T12:00:00.000Z',
      durationMs: 1_000,
      sizeBytes: 20,
    };
    expect(completeRecordingLifecycle(stopping, artifact)).toEqual({
      status: 'recorded',
      artifact,
    });
  });

  it('rejects starting without a usable source and finalizing before stop', () => {
    expect(() =>
      startRecordingLifecycle(createRecordingLifecycle(), null, '2026-07-14T12:00:00.000Z'),
    ).toThrow('not ready');
    expect(() =>
      completeRecordingLifecycle(
        { status: 'recording', startedAt: '2026-07-14T12:00:00.000Z' },
        {
          id: 'take',
          media: {},
          objectUrl: 'blob:take',
          mimeType: 'video/webm',
          filename: 'take.webm',
          sourceModeId: 'local',
          startedAt: '2026-07-14T12:00:00.000Z',
          durationMs: 1,
          sizeBytes: 1,
        },
      ),
    ).toThrow('must stop');
  });

  it('ties sidecars to the original attempt and ignores late completion', () => {
    const capturing = startAudioSidecar<{ id: string }>('attempt-1', true);
    expect(completeAudioSidecar(capturing, 'late-attempt', { id: 'late' }, 10)).toBe(capturing);
    expect(completeAudioSidecar(capturing, 'attempt-1', { id: 'original-audio' }, 10)).toEqual({
      status: 'ready',
      attemptId: 'attempt-1',
      audio: { id: 'original-audio' },
      sizeBytes: 10,
    });
    expect(startAudioSidecar('attempt-2', false)).toEqual({ status: 'unavailable' });
  });
});

describe('recording helpers and ownership', () => {
  it('prefers WebM variants and lets the browser choose when none are supported', () => {
    expect(selectRecordingMimeType((type) => type === 'video/webm;codecs=vp8,opus')).toBe(
      'video/webm;codecs=vp8,opus',
    );
    expect(selectRecordingMimeType(() => false)).toBeUndefined();
  });

  it('creates mode-aware filenames and useful metadata formatting', () => {
    expect(createRecordingFilename('lucy-vton-3', '2026-07-14T12:34:56.789Z', 'video/mp4')).toBe(
      'virtual-try-on-take-20260714T123456Z.mp4',
    );
    expect(formatDuration(3_661_000)).toBe('1:01:01');
    expect(formatFileSize(10 * 1024 * 1024)).toBe('10.0 MiB');
  });

  it('revokes clip URLs only for recording-specific release reasons', () => {
    expect(shouldRevokeRecordingObjectUrl('replacement')).toBe(true);
    expect(shouldRevokeRecordingObjectUrl('discard')).toBe(true);
    expect(shouldRevokeRecordingObjectUrl('unmount')).toBe(true);
    expect(shouldRevokeRecordingObjectUrl('model-disconnect')).toBe(false);
    expect(shouldRevokeRecordingObjectUrl('session-reset')).toBe(false);
    expect(shouldRevokeRecordingObjectUrl('stream-change')).toBe(false);
  });

  it('makes effects unavailable for an empty or failed sidecar without invalidating recording', () => {
    expect(canUseVoiceEffects({ status: 'unavailable' })).toBe(false);
    expect(
      canUseVoiceEffects({
        status: 'error',
        attemptId: 'a',
        error: createSafeError('recording-failure', 'Audio capture failed.'),
      }),
    ).toBe(false);
    expect(canUseVoiceEffects({ status: 'ready', attemptId: 'a', audio: {}, sizeBytes: 1 })).toBe(
      true,
    );
  });
});
