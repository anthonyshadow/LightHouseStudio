// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  composeRecordingSource,
  formatBytes,
  formatDuration,
  hasSameRecordingTracks,
  selectAudioMime,
  selectVideoMime,
} from './recordingHelpers';

type FakeTrack = MediaStreamTrack & { label: string };

const track = (
  kind: 'video' | 'audio',
  label: string,
  readyState: MediaStreamTrackState = 'live',
): FakeTrack =>
  ({
    kind,
    label,
    readyState,
    stop: vi.fn(),
  }) as unknown as FakeTrack;

class FakeMediaStream {
  readonly tracks: MediaStreamTrack[];

  constructor(tracks: MediaStreamTrack[] = []) {
    this.tracks = [...tracks];
  }

  getTracks() {
    return [...this.tracks];
  }

  getVideoTracks() {
    return this.tracks.filter((item) => item.kind === 'video');
  }

  getAudioTracks() {
    return this.tracks.filter((item) => item.kind === 'audio');
  }
}

const stream = (...tracks: MediaStreamTrack[]): MediaStream =>
  new FakeMediaStream(tracks) as unknown as MediaStream;

beforeEach(() => {
  vi.stubGlobal('MediaStream', FakeMediaStream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recording source composition', () => {
  it('records a local session from local video and microphone', () => {
    const camera = track('video', 'camera');
    const microphone = track('audio', 'microphone');

    const source = composeRecordingSource('local', stream(camera, microphone), null);

    expect(source).toMatchObject({ videoSource: 'local', audioSource: 'microphone' });
    expect(source?.stream.getTracks()).toEqual([camera, microphone]);
  });

  it('uses transformed video and prefers live provider audio', () => {
    const camera = track('video', 'camera');
    const microphone = track('audio', 'microphone');
    const transformed = track('video', 'transformed');
    const providerAudio = track('audio', 'provider');

    const source = composeRecordingSource(
      'lucy-2.5',
      stream(camera, microphone),
      stream(transformed, providerAudio),
    );

    expect(source).toMatchObject({ videoSource: 'transformed', audioSource: 'provider' });
    expect(source?.stream.getTracks()).toEqual([transformed, providerAudio]);
  });

  it('falls back to the local microphone when transformed output has no live audio', () => {
    const microphone = track('audio', 'microphone');
    const transformed = track('video', 'transformed');
    const endedProviderAudio = track('audio', 'provider', 'ended');

    const source = composeRecordingSource(
      'lucy-vton-3',
      stream(track('video', 'camera'), microphone),
      stream(transformed, endedProviderAudio),
    );

    expect(source).toMatchObject({ videoSource: 'transformed', audioSource: 'microphone' });
    expect(source?.stream.getTracks()).toEqual([transformed, microphone]);
  });

  it('keeps local video out of a model recording until transformed video is live', () => {
    const camera = track('video', 'camera');
    const microphone = track('audio', 'microphone');

    const source = composeRecordingSource(
      'lucy-2.5',
      stream(camera, microphone),
      stream(track('video', 'transformed', 'ended'), track('audio', 'provider')),
    );

    expect(source).toBeNull();
  });

  it('returns null without a live local or transformed video track', () => {
    expect(
      composeRecordingSource(
        'lucy-2.5',
        stream(track('video', 'camera', 'ended'), track('audio', 'microphone')),
        stream(track('audio', 'provider')),
      ),
    ).toBeNull();
  });

  it('detects selected audio or video track replacement during an active take', () => {
    const camera = track('video', 'camera');
    const microphone = track('audio', 'microphone');
    const providerAudio = track('audio', 'provider');
    const active = composeRecordingSource('local', stream(camera, microphone), null);
    const sameTracks = composeRecordingSource('local', stream(camera, microphone), null);
    const changedAudio = composeRecordingSource(
      'lucy-2.5',
      stream(track('video', 'local'), microphone),
      stream(camera, providerAudio),
    );

    expect(hasSameRecordingTracks(active, sameTracks)).toBe(true);
    expect(hasSameRecordingTracks(active, changedAudio)).toBe(false);
    expect(hasSameRecordingTracks(active, null)).toBe(false);
  });
});

describe('recording format selection and metadata', () => {
  it('prefers WebM variants in capability order for video and audio', () => {
    const supported = vi.fn((mime: string) =>
      ['video/webm;codecs=vp8,opus', 'video/mp4', 'audio/webm'].includes(mime),
    );
    vi.stubGlobal(
      'MediaRecorder',
      class {
        static isTypeSupported = supported;
      },
    );

    expect(selectVideoMime()).toBe('video/webm;codecs=vp8,opus');
    expect(selectAudioMime()).toBe('audio/webm');
    expect(supported.mock.calls.map(([mime]) => mime)).toContain('video/webm;codecs=vp9,opus');
  });

  it('allows the browser default when MediaRecorder has no supported candidate', () => {
    vi.stubGlobal(
      'MediaRecorder',
      class {
        static isTypeSupported = vi.fn(() => false);
      },
    );

    expect(selectVideoMime()).toBeUndefined();
    expect(selectAudioMime()).toBeUndefined();
  });

  it('formats duration and size for review UI', () => {
    expect(formatDuration(-3)).toBe('0:00');
    expect(formatDuration(65.9)).toBe('1:05');
    expect(formatBytes(800)).toBe('800 B');
    expect(formatBytes(2_048)).toBe('2.0 KiB');
    expect(formatBytes(2 * 1024 ** 2)).toBe('2.00 MiB');
  });
});
