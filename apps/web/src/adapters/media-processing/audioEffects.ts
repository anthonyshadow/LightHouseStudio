import type { LocalVoiceEffectId } from '@studio/domain';

const getAudioContext = (): AudioContext => {
  const Constructor = window.AudioContext ?? window.webkitAudioContext;
  if (!Constructor) throw new Error('Web Audio is unavailable in this browser.');
  return new Constructor();
};

const getOfflineContext = (
  channels: number,
  length: number,
  sampleRate: number,
): OfflineAudioContext => {
  const Constructor = window.OfflineAudioContext ?? window.webkitOfflineAudioContext;
  if (!Constructor) throw new Error('Offline audio processing is unavailable in this browser.');
  return new Constructor(channels, length, sampleRate);
};

export const decodeAudioBlob = async (blob: Blob): Promise<AudioBuffer> => {
  const context = getAudioContext();
  try {
    return await context.decodeAudioData(await blob.arrayBuffer());
  } finally {
    await context.close();
  }
};

const connectWarmEffect = (
  context: OfflineAudioContext,
  source: AudioBufferSourceNode,
): AudioNode => {
  const warmth = context.createBiquadFilter();
  warmth.type = 'lowshelf';
  warmth.frequency.value = 180;
  warmth.gain.value = 2.2;
  const soften = context.createBiquadFilter();
  soften.type = 'lowpass';
  soften.frequency.value = 13_500;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -20;
  compressor.knee.value = 18;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.015;
  compressor.release.value = 0.22;
  source.connect(warmth).connect(soften).connect(compressor);
  return compressor;
};

const connectClearEffect = (
  context: OfflineAudioContext,
  source: AudioBufferSourceNode,
): AudioNode => {
  const highPass = context.createBiquadFilter();
  highPass.type = 'highpass';
  highPass.frequency.value = 85;
  const presence = context.createBiquadFilter();
  presence.type = 'peaking';
  presence.frequency.value = 3_200;
  presence.Q.value = 0.8;
  presence.gain.value = 3.2;
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 12;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.16;
  source.connect(highPass).connect(presence).connect(compressor);
  return compressor;
};

const connectRobotEffect = (
  context: OfflineAudioContext,
  source: AudioBufferSourceNode,
  duration: number,
): AudioNode => {
  const ring = context.createGain();
  ring.gain.value = 0;
  const oscillator = context.createOscillator();
  oscillator.type = 'square';
  oscillator.frequency.value = 38;
  oscillator.connect(ring.gain);
  const band = context.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1_850;
  band.Q.value = 0.65;
  const dry = context.createGain();
  dry.gain.value = 0.22;
  const wet = context.createGain();
  wet.gain.value = 0.85;
  const mix = context.createGain();
  source.connect(ring).connect(band).connect(wet).connect(mix);
  source.connect(dry).connect(mix);
  oscillator.start(0);
  oscillator.stop(duration);
  return mix;
};

export const renderLocalEffect = async (
  original: AudioBuffer,
  effect: LocalVoiceEffectId,
  signal: AbortSignal,
): Promise<AudioBuffer> => {
  signal.throwIfAborted();
  const context = getOfflineContext(
    original.numberOfChannels,
    original.length,
    original.sampleRate,
  );
  const source = context.createBufferSource();
  source.buffer = original;
  const output =
    effect === 'warm-studio'
      ? connectWarmEffect(context, source)
      : effect === 'clear-presenter'
        ? connectClearEffect(context, source)
        : connectRobotEffect(context, source, original.duration);
  output.connect(context.destination);
  source.start(0);
  const rendered = await context.startRendering();
  signal.throwIfAborted();
  return rendered;
};
