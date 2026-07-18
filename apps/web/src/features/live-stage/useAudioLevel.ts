import { useEffect, useState } from 'react';

export type AudioLevelState = {
  hasAudio: boolean;
  metering: boolean;
  level: number;
};

const silentState: AudioLevelState = {
  hasAudio: false,
  metering: false,
  level: 0,
};

const connectedWithoutMeterState: AudioLevelState = {
  hasAudio: true,
  metering: false,
  level: 0,
};

const audioContextConstructor = (): typeof AudioContext | undefined =>
  window.AudioContext ?? window.webkitAudioContext;

const measureLevel = (analyser: AnalyserNode, samples: Uint8Array<ArrayBuffer>): number => {
  analyser.getByteTimeDomainData(samples);
  let sumOfSquares = 0;

  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sumOfSquares += centered * centered;
  }

  const rootMeanSquare = Math.sqrt(sumOfSquares / samples.length);
  return Math.min(1, rootMeanSquare * 3.2);
};

/**
 * Reads an audio track that the application already owns. This hook never acquires
 * media and keeps its low-frequency sampling isolated from the stage component.
 */
export const useAudioLevel = (stream: MediaStream | null): AudioLevelState => {
  const audioTrack = stream?.getAudioTracks().find((track) => track.readyState === 'live') ?? null;
  const [state, setState] = useState<AudioLevelState>(
    audioTrack ? connectedWithoutMeterState : silentState,
  );

  useEffect(() => {
    if (!stream || !audioTrack) {
      setState(silentState);
      return;
    }

    const Constructor = audioContextConstructor();
    if (!Constructor) {
      setState(connectedWithoutMeterState);
      return;
    }

    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let intervalId: number | null = null;
    let ended = false;

    const stopMeter = () => {
      if (intervalId !== null) window.clearInterval(intervalId);
      intervalId = null;
      source?.disconnect();
      analyser?.disconnect();
      if (context) void context.close().catch(() => undefined);
      source = null;
      analyser = null;
      context = null;
    };

    try {
      context = new Constructor();
      source = context.createMediaStreamSource(stream);
      analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.76;
      source.connect(analyser);

      const samples = new Uint8Array(new ArrayBuffer(analyser.fftSize));
      let smoothedLevel = 0;

      const sample = () => {
        if (document.visibilityState === 'hidden') return;
        if (audioTrack.readyState !== 'live') {
          setState(silentState);
          stopMeter();
          return;
        }

        const nextLevel = measureLevel(analyser!, samples);
        smoothedLevel = smoothedLevel * 0.58 + nextLevel * 0.42;
        setState((current) => {
          if (Math.abs(current.level - smoothedLevel) < 0.015 && current.metering) return current;
          return { hasAudio: true, metering: true, level: smoothedLevel };
        });
      };

      setState({ hasAudio: true, metering: true, level: 0 });
      sample();
      intervalId = window.setInterval(sample, 80);
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
    } catch {
      stopMeter();
      setState(connectedWithoutMeterState);
    }

    const handleEnded = () => {
      ended = true;
      setState(silentState);
      stopMeter();
    };
    audioTrack.addEventListener('ended', handleEnded, { once: true });

    return () => {
      if (!ended) audioTrack.removeEventListener('ended', handleEnded);
      stopMeter();
    };
  }, [audioTrack, stream]);

  return state;
};
