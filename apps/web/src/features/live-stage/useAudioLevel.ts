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
  const [measurement, setMeasurement] = useState<{
    track: MediaStreamTrack | null;
    state: AudioLevelState;
  }>(() => ({
    track: audioTrack,
    state: audioTrack ? connectedWithoutMeterState : silentState,
  }));
  const state =
    measurement.track === audioTrack
      ? measurement.state
      : audioTrack
        ? connectedWithoutMeterState
        : silentState;

  useEffect(() => {
    if (!stream || !audioTrack) return;

    const Constructor = audioContextConstructor();
    if (!Constructor) return;

    let context: AudioContext | null = null;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let intervalId: number | null = null;
    let ended = false;
    let active = true;

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
          setMeasurement({ track: null, state: silentState });
          stopMeter();
          return;
        }

        const nextLevel = measureLevel(analyser!, samples);
        smoothedLevel = smoothedLevel * 0.58 + nextLevel * 0.42;
        setMeasurement((current) => {
          if (
            current.track === audioTrack &&
            Math.abs(current.state.level - smoothedLevel) < 0.015 &&
            current.state.metering
          ) {
            return current;
          }
          return {
            track: audioTrack,
            state: { hasAudio: true, metering: true, level: smoothedLevel },
          };
        });
      };

      queueMicrotask(() => {
        if (active) sample();
      });
      intervalId = window.setInterval(sample, 80);
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
    } catch {
      stopMeter();
    }

    const handleEnded = () => {
      ended = true;
      setMeasurement({ track: null, state: silentState });
      stopMeter();
    };
    audioTrack.addEventListener('ended', handleEnded, { once: true });

    return () => {
      active = false;
      if (!ended) audioTrack.removeEventListener('ended', handleEnded);
      stopMeter();
    };
  }, [audioTrack, stream]);

  return state;
};
