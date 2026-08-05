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

interface FilterSettings {
  type: BiquadFilterType;
  frequency: number;
  q?: number;
  gain?: number;
}

interface CompressorSettings {
  threshold: number;
  knee: number;
  ratio: number;
  attack: number;
  release: number;
}

const createFilter = (
  context: OfflineAudioContext,
  { type, frequency, q, gain }: FilterSettings,
) => {
  const filter = context.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  if (q !== undefined) filter.Q.value = q;
  if (gain !== undefined) filter.gain.value = gain;
  return filter;
};

const createCompressor = (context: OfflineAudioContext, values: CompressorSettings) => {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = values.threshold;
  compressor.knee.value = values.knee;
  compressor.ratio.value = values.ratio;
  compressor.attack.value = values.attack;
  compressor.release.value = values.release;
  return compressor;
};

const createGain = (context: OfflineAudioContext, value: number) => {
  const gain = context.createGain();
  gain.gain.value = value;
  return gain;
};

const connectAudioGraph = (source: AudioNode, ...nodes: AudioNode[]) => {
  let output = source;
  for (const node of nodes) output = output.connect(node);
  return output;
};

const connectWarmEffect = (
  context: OfflineAudioContext,
  source: AudioBufferSourceNode,
): AudioNode => {
  return connectAudioGraph(
    source,
    createFilter(context, { type: 'lowshelf', frequency: 180, gain: 2.2 }),
    createFilter(context, { type: 'lowpass', frequency: 13_500 }),
    createCompressor(context, {
      threshold: -20,
      knee: 18,
      ratio: 3,
      attack: 0.015,
      release: 0.22,
    }),
  );
};

const connectClearEffect = (
  context: OfflineAudioContext,
  source: AudioBufferSourceNode,
): AudioNode => {
  return connectAudioGraph(
    source,
    createFilter(context, { type: 'highpass', frequency: 85 }),
    createFilter(context, { type: 'peaking', frequency: 3_200, q: 0.8, gain: 3.2 }),
    createCompressor(context, {
      threshold: -24,
      knee: 12,
      ratio: 4,
      attack: 0.008,
      release: 0.16,
    }),
  );
};

const connectRobotEffect = (
  context: OfflineAudioContext,
  source: AudioBufferSourceNode,
  duration: number,
): AudioNode => {
  const ring = createGain(context, 0);
  const oscillator = context.createOscillator();
  oscillator.type = 'square';
  oscillator.frequency.value = 38;
  oscillator.connect(ring.gain);
  const band = createFilter(context, { type: 'bandpass', frequency: 1_850, q: 0.65 });
  const dry = createGain(context, 0.22);
  const wet = createGain(context, 0.85);
  const mix = createGain(context, 1);
  connectAudioGraph(source, ring, band, wet, mix);
  connectAudioGraph(source, dry, mix);
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
