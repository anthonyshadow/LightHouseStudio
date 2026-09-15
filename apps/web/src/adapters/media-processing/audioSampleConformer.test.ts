import { compositionAudioFrames, compositionAudioTarget } from '@studio/domain';
import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  Output,
  WavOutputFormat,
  type AudioEncodingConfig,
} from 'mediabunny';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createAudioSampleConformer,
  silentAudioSamples,
  type AudioSampleConformer,
} from './audioSampleConformer';

/*
 * Real mediabunny, deliberately. The worker's own suite mocks the library wholesale, which is the
 * right thing for a worker's protocol and exactly the wrong thing here: the hazard these cases
 * exist for is a guard *inside* the library, and a mock cannot throw it. A PCM output needs no
 * WebCodecs, so the real encoder wrapper runs in plain Node.
 */

/** Every sample a case creates, closed afterwards: the library tracks unclosed ones. */
const created: AudioSample[] = [];
afterEach(() => {
  for (const sample of created.splice(0)) sample.close();
});

const interleaved = (
  frames: readonly (readonly number[])[],
  sampleRate: number,
  timestamp = 0,
): AudioSample => {
  const sample = new AudioSample({
    data: Float32Array.from(frames.flat()),
    format: 'f32',
    numberOfChannels: frames[0]?.length ?? 1,
    sampleRate,
    timestamp,
  });
  created.push(sample);
  return sample;
};

const framesOf = (sample: AudioSample): number[][] => {
  created.push(sample);
  const data = new Float32Array(sample.numberOfFrames * sample.numberOfChannels);
  sample.copyTo(data, { planeIndex: 0, format: 'f32' });
  return Array.from({ length: sample.numberOfFrames }, (_, frame) =>
    Array.from(
      data.subarray(frame * sample.numberOfChannels, (frame + 1) * sample.numberOfChannels),
    ),
  );
};

const sine = (frames: number, sampleRate: number, hertz = 100): number[][] =>
  Array.from({ length: frames }, (_, index) => [
    Math.sin((2 * Math.PI * hertz * index) / sampleRate),
  ]);

/** Everything a conformer produces for one clip, in order. */
const conformAll = (
  conformer: AudioSampleConformer,
  samples: readonly AudioSample[],
): readonly AudioSample[] => [
  ...samples.flatMap((sample) => conformer.push(sample)),
  ...conformer.flush(),
];

const totalFrames = (samples: readonly AudioSample[]): number =>
  samples.reduce((sum, sample) => sum + sample.numberOfFrames, 0);

/** A started PCM WAV output: the smallest thing that puts the real encoder guard in the loop. */
const pcmOutput = async (transform?: AudioEncodingConfig['transform']) => {
  const target = new BufferTarget();
  const output = new Output({ format: new WavOutputFormat(), target });
  const source = new AudioSampleSource({ codec: 'pcm-s16', ...(transform ? { transform } : {}) });
  output.addAudioTrack(source);
  await output.start();
  return { output, source, target };
};

/** The canonical 44-byte header mediabunny writes when there are no tags. */
const wavHeader = (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  return {
    channels: view.getUint16(22, true),
    sampleRate: view.getUint32(24, true),
    bitsPerSample: view.getUint16(34, true),
    dataBytes: view.getUint32(40, true),
  };
};

const target = { sampleRate: 48_000, numberOfChannels: 2 };
const mono = { sampleRate: 48_000, numberOfChannels: 1 };
const at = (offsetFrames: number, frameBudget: number) => ({ offsetFrames, frameBudget });

describe('the hazard, against the real encoder', () => {
  it('refuses a second format even though it was asked to resample to one', async () => {
    // The transform is the point: the guard runs before the resampling it names.
    const { output, source } = await pcmOutput({ sampleRate: 48_000, numberOfChannels: 2 });
    await source.add(interleaved([[0.1, 0.2]], 48_000));
    await expect(source.add(interleaved([[0.3]], 44_100, 1 / 48_000))).rejects.toThrow(
      /Audio parameters must remain constant/u,
    );
    await output.cancel();
  });
});

describe('createAudioSampleConformer', () => {
  it('passes a clip that already matches straight through, stamped onto its offset', () => {
    const conformer = createAudioSampleConformer(AudioSample, target, at(120_000, 3));
    // Values a float32 holds exactly, so "identical" can be asserted as equality.
    const first = conformer.push(
      interleaved(
        [
          [0.5, -0.5],
          [0.75, -0.25],
        ],
        48_000,
        7,
      ),
    );
    const second = conformer.push(interleaved([[0.125, -0.125]], 48_000, 9));
    expect(first.map(framesOf)).toEqual([
      [
        [0.5, -0.5],
        [0.75, -0.25],
      ],
    ]);
    expect(first[0]?.timestamp).toBe(2.5);
    // Contiguous from the offset, whatever the source's own timestamps said.
    expect(second[0]?.timestamp).toBeCloseTo(2.5 + 2 / 48_000, 12);
    expect(conformer.flush()).toEqual([]);
  });

  it('mixes every layout the product meets with the coefficients Web Audio uses', () => {
    const cases: readonly {
      readonly name: string;
      readonly to: typeof target;
      readonly frame: readonly number[];
      readonly expected: readonly number[];
    }[] = [
      { name: 'mono → stereo', to: target, frame: [0.5], expected: [0.5, 0.5] },
      { name: 'stereo → mono', to: mono, frame: [0.5, -0.25], expected: [0.125] },
      { name: 'quad → mono', to: mono, frame: [0.4, 0.8, 0.2, 0.6], expected: [0.5] },
      { name: 'quad → stereo', to: target, frame: [0.4, 0.8, 0.2, 0.6], expected: [0.3, 0.7] },
      {
        name: '5.1 → mono',
        to: mono,
        frame: [0.5, 0.25, 0.125, 1, 0.5, 0.25],
        expected: [Math.SQRT1_2 * 0.75 + 0.125 + 0.375],
      },
      {
        name: '5.1 → stereo',
        to: target,
        frame: [0.5, 0.25, 0.125, 1, 0.5, 0.25],
        expected: [0.5 + Math.SQRT1_2 * 0.625, 0.25 + Math.SQRT1_2 * 0.375],
      },
      {
        name: 'three channels → stereo (discrete drop)',
        to: target,
        frame: [0.5, 0.25, 1],
        expected: [0.5, 0.25],
      },
    ];
    for (const { name, to, frame, expected } of cases) {
      const conformer = createAudioSampleConformer(AudioSample, to, at(0, 1));
      const [out] = conformAll(conformer, [interleaved([frame], 48_000)]).flatMap(framesOf);
      expect(out, name).toHaveLength(expected.length);
      out!.forEach((value, channel) => expect(value, name).toBeCloseTo(expected[channel]!, 6));
    }
  });

  it('resamples a ramp exactly, and flushes the tail so the clip lands on its budget', () => {
    // 4 → 8 frames per second: every other output frame sits halfway between two inputs.
    const budget = compositionAudioFrames(1_000, 8);
    const conformer = createAudioSampleConformer(
      AudioSample,
      { sampleRate: 8, numberOfChannels: 1 },
      at(0, budget),
    );
    const frames = conformAll(conformer, [interleaved([[0], [1], [2], [3]], 4)])
      .flatMap(framesOf)
      .flat();
    expect(frames).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3, 3]);
    expect(frames).toHaveLength(budget);
    expect(conformer.flush()).toEqual([]);
  });

  it('is seamless: a sine split unevenly across samples conforms to the same frames as one', () => {
    const wave = sine(300, 44_100);
    const budget = Math.ceil((300 * 48_000) / 44_100);
    const whole = createAudioSampleConformer(AudioSample, target, at(0, budget));
    const expected = conformAll(whole, [interleaved(wave, 44_100)]).flatMap(framesOf);

    const pieces = createAudioSampleConformer(AudioSample, target, at(0, budget));
    const actual = conformAll(pieces, [
      interleaved(wave.slice(0, 7), 44_100),
      interleaved(wave.slice(7, 128), 44_100),
      interleaved(wave.slice(128), 44_100),
    ]).flatMap(framesOf);

    expect(actual).toHaveLength(budget);
    actual.forEach((frame, index) => {
      expect(frame[0]).toBeCloseTo(expected[index]![0]!, 6);
      expect(frame[1]).toBeCloseTo(expected[index]![1]!, 6);
    });
  });

  it('downsamples to exactly the budget the domain gives the span', () => {
    const budget = compositionAudioFrames(100, 44_100);
    expect(budget).toBe(4_410);
    const conformer = createAudioSampleConformer(
      AudioSample,
      { sampleRate: 44_100, numberOfChannels: 1 },
      at(0, budget),
    );
    expect(totalFrames(conformAll(conformer, [interleaved(sine(4_800, 48_000), 48_000)]))).toBe(
      4_410,
    );
  });

  it('lands on the budget whether the clip decoded long or short', () => {
    // Long: a source that runs past its span is cut at the budget, resampled or not.
    const cut = createAudioSampleConformer(AudioSample, target, at(0, 5));
    const stereo = sine(20, 48_000).map(([value]) => [value!, value!]);
    expect(totalFrames(conformAll(cut, [interleaved(stereo, 48_000)]))).toBe(5);
    const cutResampled = createAudioSampleConformer(AudioSample, target, at(0, 5));
    expect(totalFrames(conformAll(cutResampled, [interleaved(sine(20, 44_100), 44_100)]))).toBe(5);
    // Short: the held last frame fills the span, so the next clip still starts where it should.
    const held = createAudioSampleConformer(AudioSample, target, at(0, 4));
    expect(conformAll(held, [interleaved([[0.5, -0.5]], 48_000)]).flatMap(framesOf)).toEqual([
      [0.5, -0.5],
      [0.5, -0.5],
      [0.5, -0.5],
      [0.5, -0.5],
    ]);
    // Nothing at all: the span is still owed, as silence.
    const empty = createAudioSampleConformer(AudioSample, target, at(0, 3));
    expect(conformAll(empty, []).flatMap(framesOf)).toEqual([
      [0, 0],
      [0, 0],
      [0, 0],
    ]);
  });

  it('places consecutive clips end to end by arithmetic', () => {
    const rate = 48_000;
    const spans = [1_001 / 30, 250, 100.4];
    let offsetFrames = 0;
    let lastEnd = 0;
    for (const span of spans) {
      const budget = compositionAudioFrames(span, rate);
      const conformer = createAudioSampleConformer(AudioSample, target, at(offsetFrames, budget));
      const emitted = conformAll(conformer, [interleaved(sine(500, 44_100), 44_100)]);
      // The first frame of this clip is the frame after the last of the one before it.
      expect(emitted[0]?.timestamp).toBeCloseTo(lastEnd, 12);
      let frames = 0;
      for (const sample of emitted) {
        expect(sample.timestamp).toBeCloseTo((offsetFrames + frames) / rate, 12);
        frames += sample.numberOfFrames;
      }
      expect(frames).toBe(budget);
      offsetFrames += budget;
      lastEnd = offsetFrames / rate;
    }
  });

  it('yields nothing for an empty sample, and nothing after its flush', () => {
    const conformer = createAudioSampleConformer(AudioSample, target, at(0, 10));
    expect(conformer.push(interleaved([], 44_100))).toEqual([]);
    for (const sample of conformer.flush()) created.push(sample);
    expect(conformer.push(interleaved(sine(5, 44_100), 44_100))).toEqual([]);
  });

  it('refuses a placement that is not whole frames, and a target wider than the product makes', () => {
    expect(() => createAudioSampleConformer(AudioSample, target, at(0, 1_601.6))).toThrow(
      /whole number of frames/u,
    );
    expect(() => createAudioSampleConformer(AudioSample, target, at(0.5, 10))).toThrow(
      /whole number of frames/u,
    );
    expect(() =>
      createAudioSampleConformer(
        AudioSample,
        { sampleRate: 48_000, numberOfChannels: 6 },
        at(0, 1),
      ),
    ).toThrow(/one to 2 channels/u);
  });
});

describe('silentAudioSamples', () => {
  it('chunks a silent clip by the second and stamps each chunk in sequence', () => {
    const samples = silentAudioSamples(AudioSample, target, at(3 * 48_000, 48_000 * 2 + 10));
    created.push(...samples);
    expect(samples.map((sample) => sample.numberOfFrames)).toEqual([48_000, 48_000, 10]);
    expect(samples.map((sample) => sample.timestamp)).toEqual([3, 4, 5]);
    expect(framesOf(samples[2]!)).toEqual(Array.from({ length: 10 }, () => [0, 0]));
  });

  it('refuses a span that is not whole frames rather than letting the library say so', () => {
    expect(() => silentAudioSamples(AudioSample, target, at(0, 1_601.6))).toThrow(
      /whole number of frames/u,
    );
  });
});

describe('the fix, end to end against the same encoder', () => {
  it('lets two clips of different formats reach one encoder, and the file says the target', async () => {
    const profiles = [
      { sampleRate: 48_000, numberOfChannels: 2 },
      { sampleRate: 44_100, numberOfChannels: 1 },
    ];
    const chosen = compositionAudioTarget(profiles)!;
    expect(chosen).toEqual({ sampleRate: 48_000, numberOfChannels: 2 });

    const { output, source, target: buffer } = await pcmOutput();
    const clips = [
      {
        frames: sine(4_800, 48_000).map(([value]) => [value!, value!]),
        rate: 48_000,
        spanMs: 100,
      },
      { frames: sine(4_410, 44_100), rate: 44_100, spanMs: 100 },
    ];
    let offsetFrames = 0;
    for (const clip of clips) {
      const budget = compositionAudioFrames(clip.spanMs, chosen.sampleRate);
      const conformer = createAudioSampleConformer(AudioSample, chosen, at(offsetFrames, budget));
      for (const emitted of conformAll(conformer, [interleaved(clip.frames, clip.rate)])) {
        await source.add(emitted);
        emitted.close();
      }
      offsetFrames += budget;
    }
    source.close();
    await output.finalize();

    const header = wavHeader(buffer.buffer!);
    expect(header).toMatchObject({ channels: 2, sampleRate: 48_000, bitsPerSample: 16 });
    expect(header.dataBytes).toBe(offsetFrames * 2 * 2);
  });
});
