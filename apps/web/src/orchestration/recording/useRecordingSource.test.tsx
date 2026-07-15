// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useRecordingSource } from './useRecordingSource';

class FakeTrack extends EventTarget {
  constructor(
    readonly kind: 'video' | 'audio',
    readonly label: string,
    public readyState: MediaStreamTrackState = 'live',
  ) {
    super();
  }
}

class FakeMediaStream extends EventTarget {
  constructor(private readonly tracks: FakeTrack[] = []) {
    super();
  }

  getTracks(): MediaStreamTrack[] {
    return [...this.tracks] as unknown as MediaStreamTrack[];
  }

  getVideoTracks(): MediaStreamTrack[] {
    return this.getTracks().filter((track) => track.kind === 'video');
  }

  getAudioTracks(): MediaStreamTrack[] {
    return this.getTracks().filter((track) => track.kind === 'audio');
  }
}

beforeEach(() => {
  vi.stubGlobal('MediaStream', FakeMediaStream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useRecordingSource', () => {
  it('recomposes with microphone audio when provider audio ends in the same remote stream', () => {
    const microphone = new FakeTrack('audio', 'microphone');
    const providerAudio = new FakeTrack('audio', 'provider');
    const local = new FakeMediaStream([
      new FakeTrack('video', 'camera'),
      microphone,
    ]) as unknown as MediaStream;
    const remote = new FakeMediaStream([
      new FakeTrack('video', 'transformed'),
      providerAudio,
    ]) as unknown as MediaStream;
    const { result } = renderHook(() => useRecordingSource('lucy-2.5', local, remote));

    expect(result.current?.audioSource).toBe('provider');

    act(() => {
      providerAudio.readyState = 'ended';
      providerAudio.dispatchEvent(new Event('ended'));
    });

    expect(result.current?.audioSource).toBe('microphone');
    expect(result.current?.stream.getAudioTracks()).toEqual([microphone]);
  });
});
