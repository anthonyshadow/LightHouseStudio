// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAudioLevel } from './useAudioLevel';

class FakeAudioTrack extends EventTarget {
  public readonly readyState: MediaStreamTrackState = 'live';
}

class FakeAudioStream {
  constructor(private readonly track: FakeAudioTrack | null) {}

  getAudioTracks(): MediaStreamTrack[] {
    return this.track ? ([this.track] as unknown as MediaStreamTrack[]) : [];
  }
}

const MeterProbe = ({ stream }: { stream: MediaStream | null }) => {
  const state = useAudioLevel(stream);
  return (
    <output
      data-testid="meter-state"
      data-has-audio={String(state.hasAudio)}
      data-metering={String(state.metering)}
    >
      {state.level.toFixed(3)}
    </output>
  );
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useAudioLevel', () => {
  it('samples an existing audio track at a bounded interval and releases Web Audio resources', async () => {
    vi.useFakeTimers();
    const disconnectSource = vi.fn();
    const disconnectAnalyser = vi.fn();
    const close = vi.fn().mockResolvedValue(undefined);
    const resume = vi.fn().mockResolvedValue(undefined);
    const analyser = {
      fftSize: 0,
      smoothingTimeConstant: 0,
      disconnect: disconnectAnalyser,
      getByteTimeDomainData: (samples: Uint8Array<ArrayBuffer>) => samples.fill(160),
    } as unknown as AnalyserNode;
    const source = {
      connect: vi.fn(),
      disconnect: disconnectSource,
    } as unknown as MediaStreamAudioSourceNode;

    class FakeAudioContext {
      readonly state: AudioContextState = 'running';
      createMediaStreamSource = vi.fn(() => source);
      createAnalyser = vi.fn(() => analyser);
      close = close;
      resume = resume;
    }

    vi.stubGlobal('AudioContext', FakeAudioContext);
    const stream = new FakeAudioStream(new FakeAudioTrack()) as unknown as MediaStream;
    const view = render(<MeterProbe stream={stream} />);

    await act(() => vi.advanceTimersByTimeAsync(80));

    expect(screen.getByTestId('meter-state')).toHaveAttribute('data-has-audio', 'true');
    expect(screen.getByTestId('meter-state')).toHaveAttribute('data-metering', 'true');
    expect(Number(screen.getByTestId('meter-state').textContent)).toBeGreaterThan(0);
    expect(source.connect).toHaveBeenCalledWith(analyser);

    view.unmount();
    expect(disconnectSource).toHaveBeenCalledOnce();
    expect(disconnectAnalyser).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('reports connected audio without fabricating a level when Web Audio is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    const stream = new FakeAudioStream(new FakeAudioTrack()) as unknown as MediaStream;

    render(<MeterProbe stream={stream} />);

    expect(screen.getByTestId('meter-state')).toHaveAttribute('data-has-audio', 'true');
    expect(screen.getByTestId('meter-state')).toHaveAttribute('data-metering', 'false');
    expect(screen.getByTestId('meter-state')).toHaveTextContent('0.000');
  });
});
