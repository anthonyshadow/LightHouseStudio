import {
  COMPOSITION_AUDIO_FALLBACK_TARGET,
  compositionAudioFrames,
  compositionPlacements,
  type Composition,
  type CompositionClip,
} from '@studio/domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stitchComposition, type StitchHooks, type StitchRuntime } from './stitchComposition';
import type { CompositionRenderMedia, CompositionRenderPlan } from './types';

/*
 * The loop, driven with a fake runtime and no WebCodecs. Every decision the loop makes — which
 * frame lands when, how each clip is fitted, where each clip's sound starts and how many frames it
 * owes, what a cancel tears down — is visible in what the fakes record. The library's own guards
 * cannot fire here; the conformer suite proves those against the real encoder, and the Chromium
 * journey renders the real fixtures.
 */

// The AAC fallback's contract without its WASM registration: refuse when the probe refuses.
vi.mock('../../adapters/media-processing/aacEncoding', () => ({
  ensureAacEncodingSupport: async (canEncode: () => Promise<boolean>) => {
    if (!(await canEncode())) throw new Error('This browser cannot encode AAC audio.');
  },
}));

type AudioDescriptor = Readonly<{
  sampleRate: number;
  channels: number;
  canDecode?: boolean;
  /** Where the first decoded sample starts, in seconds; may precede the trim or follow it. */
  firstTimestamp?: number;
  chunkFrames?: number;
}>;

type MediaDescriptor = Readonly<{
  width: number;
  height: number;
  fps: number;
  durationS: number;
  canDecode?: boolean;
  audio?: AudioDescriptor | null;
  /** Awaited before the given frame index is yielded, so a test can act mid-clip. */
  beforeFrame?: (index: number) => Promise<void>;
}>;

class FakeAudioSample {
  static created = 0;
  static closed = 0;
  readonly data: Float32Array;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly timestamp: number;
  readonly numberOfFrames: number;
  closed = false;

  constructor(init: {
    data: ArrayBufferView;
    numberOfChannels: number;
    sampleRate: number;
    timestamp: number;
  }) {
    this.data = new Float32Array(init.data.buffer, init.data.byteOffset, init.data.byteLength / 4);
    this.numberOfChannels = init.numberOfChannels;
    this.sampleRate = init.sampleRate;
    this.timestamp = init.timestamp;
    this.numberOfFrames = this.data.length / init.numberOfChannels;
    FakeAudioSample.created += 1;
  }

  copyTo(destination: Float32Array, options: { frameOffset?: number }): void {
    const offset = (options.frameOffset ?? 0) * this.numberOfChannels;
    destination.set(this.data.subarray(offset, offset + destination.length));
  }

  close(): void {
    if (!this.closed) FakeAudioSample.closed += 1;
    this.closed = true;
  }
}

class FakeVideoSample {
  static created = 0;
  static closed = 0;
  static draws: { fit: string; rotation?: number }[] = [];
  closed = false;

  constructor(
    readonly timestamp: number,
    readonly duration: number,
  ) {
    FakeVideoSample.created += 1;
  }

  drawWithFit(_context: unknown, options: { fit: string; rotation?: number }): void {
    FakeVideoSample.draws.push(options);
  }

  close(): void {
    if (!this.closed) FakeVideoSample.closed += 1;
    this.closed = true;
  }
}

class FakeUrlSource {
  static constructed: { url: string; options: Record<string, unknown> }[] = [];

  constructor(
    readonly url: string,
    readonly options: Record<string, unknown>,
  ) {
    FakeUrlSource.constructed.push({ url, options });
  }
}

const iteratorReturns: string[] = [];

/**
 * The library's range semantics over a lazily decoded stream: the sample at or before `start`
 * comes first, the iterator ends by itself at the first sample at or past `end`, and `return()`
 * is what an early exit calls. Samples exist only once yielded, as a decoder's would.
 */
const rangeIterable = <T>(
  label: string,
  count: number,
  timestampOf: (index: number) => number,
  make: (index: number) => T,
  start: number,
  end: number,
  beforeYield: (index: number) => Promise<void>,
  /** The library's own rule: a read on a disposed input throws rather than yielding. */
  isDisposed: () => boolean,
): AsyncIterable<T> => {
  let firstAtOrPast = 0;
  while (firstAtOrPast < count && timestampOf(firstAtOrPast) < start) firstAtOrPast += 1;
  let index =
    firstAtOrPast < count && timestampOf(firstAtOrPast) === start
      ? firstAtOrPast
      : Math.max(0, firstAtOrPast - 1);
  let done = false;
  return {
    [Symbol.asyncIterator]: () => ({
      next: async () => {
        const disposed = (): never => {
          done = true;
          throw Object.assign(new Error('Input has been disposed.'), {
            name: 'InputDisposedError',
          });
        };
        if (isDisposed()) disposed();
        if (done || index >= count || timestampOf(index) >= end) {
          done = true;
          return { value: undefined as never, done: true };
        }
        await beforeYield(index);
        // A cancel that lands while this read is parked disposes the input under it.
        if (isDisposed()) disposed();
        const value = make(index);
        index += 1;
        return { value, done: false };
      },
      return: () => {
        done = true;
        iteratorReturns.push(label);
        return Promise.resolve({ value: undefined as never, done: true as const });
      },
    }),
  };
};

class FakeInput {
  static open = new Set<FakeInput>();
  static maxOpen = 0;
  static constructed: FakeInput[] = [];
  static descriptors = new Map<string, MediaDescriptor>();
  readonly url: string;
  disposed = false;

  constructor(options: { source: FakeUrlSource }) {
    this.url = options.source.url;
    FakeInput.constructed.push(this);
    FakeInput.open.add(this);
    FakeInput.maxOpen = Math.max(FakeInput.maxOpen, FakeInput.open.size);
  }

  get descriptor(): MediaDescriptor {
    const descriptor = FakeInput.descriptors.get(this.url);
    if (!descriptor) throw new Error(`No fake media at ${this.url}`);
    return descriptor;
  }

  getPrimaryVideoTrack() {
    const { descriptor, url } = this;
    return Promise.resolve({
      kind: 'video' as const,
      url,
      descriptor,
      input: this,
      canDecode: () => Promise.resolve(descriptor.canDecode ?? true),
    });
  }

  getPrimaryAudioTrack() {
    const { descriptor, url } = this;
    const audio = descriptor.audio ?? null;
    return Promise.resolve(
      audio === null
        ? null
        : {
            kind: 'audio' as const,
            url,
            audio,
            input: this,
            getSampleRate: () => Promise.resolve(audio.sampleRate),
            getNumberOfChannels: () => Promise.resolve(audio.channels),
            canDecode: () => Promise.resolve(audio.canDecode ?? true),
          },
    );
  }

  dispose(): void {
    this.disposed = true;
    FakeInput.open.delete(this);
  }
}

type FakeVideoTrack = Awaited<ReturnType<FakeInput['getPrimaryVideoTrack']>>;
type FakeAudioTrack = NonNullable<Awaited<ReturnType<FakeInput['getPrimaryAudioTrack']>>>;

class FakeVideoSampleSink {
  constructor(private readonly track: FakeVideoTrack) {}

  samples(start: number, end: number) {
    const { descriptor } = this.track;
    return rangeIterable(
      `video:${this.track.url}`,
      Math.round(descriptor.durationS * descriptor.fps),
      (index) => index / descriptor.fps,
      (index) => new FakeVideoSample(index / descriptor.fps, 1 / descriptor.fps),
      start,
      end,
      descriptor.beforeFrame ?? (() => Promise.resolve()),
      () => this.track.input.disposed,
    );
  }
}

const audioSinks: string[] = [];

class FakeAudioSampleSink {
  constructor(private readonly track: FakeAudioTrack) {
    audioSinks.push(track.url);
  }

  samples(start: number, end: number) {
    const { audio } = this.track;
    const descriptor = FakeInput.descriptors.get(this.track.url)!;
    const chunk = audio.chunkFrames ?? 1_024;
    const first = audio.firstTimestamp ?? 0;
    const totalFrames = Math.round((descriptor.durationS - first) * audio.sampleRate);
    return rangeIterable(
      `audio:${this.track.url}`,
      Math.ceil(totalFrames / chunk),
      (index) => first + (index * chunk) / audio.sampleRate,
      (index) => {
        const frame = index * chunk;
        const count = Math.min(chunk, totalFrames - frame);
        const data = new Float32Array(count * audio.channels);
        // Every frame carries its own index, so trimming and placement are checkable to the frame.
        for (let offset = 0; offset < count; offset += 1) {
          for (let channel = 0; channel < audio.channels; channel += 1) {
            data[offset * audio.channels + channel] = frame + offset + 1;
          }
        }
        return new FakeAudioSample({
          data,
          numberOfChannels: audio.channels,
          sampleRate: audio.sampleRate,
          timestamp: first + frame / audio.sampleRate,
        });
      },
      start,
      end,
      () => Promise.resolve(),
      () => this.track.input.disposed,
    );
  }
}

type VideoAdd = { timestamp: number; duration: number; keyFrame: boolean | undefined };
type AudioAdd = {
  timestamp: number;
  frames: number;
  channels: number;
  rate: number;
  data: Float32Array;
};

class FakeCanvasSource {
  static adds: VideoAdd[] = [];
  static config: Record<string, unknown> | null = null;

  constructor(
    readonly canvas: unknown,
    config: Record<string, unknown>,
  ) {
    FakeCanvasSource.config = config;
  }

  add(timestamp: number, duration: number, options?: { keyFrame?: boolean }): Promise<void> {
    FakeCanvasSource.adds.push({ timestamp, duration, keyFrame: options?.keyFrame });
    return Promise.resolve();
  }
}

class FakeAudioSampleSource {
  static adds: AudioAdd[] = [];
  static config: Record<string, unknown> | null = null;

  constructor(config: Record<string, unknown>) {
    FakeAudioSampleSource.config = config;
  }

  add(sample: FakeAudioSample): Promise<void> {
    if (sample.closed) throw new Error('A closed sample reached the encoder.');
    FakeAudioSampleSource.adds.push({
      timestamp: sample.timestamp,
      frames: sample.numberOfFrames,
      channels: sample.numberOfChannels,
      rate: sample.sampleRate,
      data: Float32Array.from(sample.data),
    });
    return Promise.resolve();
  }
}

class FakeOutput {
  static instances: FakeOutput[] = [];
  readonly videoTrackMeta: unknown[] = [];
  audioTracks = 0;
  started = 0;
  finalized = 0;
  cancelled = 0;

  constructor(readonly options: { format: unknown; target: unknown }) {
    FakeOutput.instances.push(this);
  }

  addVideoTrack(_source: unknown, meta?: unknown): void {
    this.videoTrackMeta.push(meta);
  }

  addAudioTrack(): void {
    this.audioTracks += 1;
  }

  start(): Promise<void> {
    this.started += 1;
    return Promise.resolve();
  }

  finalize(): Promise<void> {
    this.finalized += 1;
    return Promise.resolve();
  }

  cancel(): Promise<void> {
    this.cancelled += 1;
    return Promise.resolve();
  }

  getMimeType(): Promise<string> {
    return Promise.resolve('video/mp4');
  }
}

type Drawn = { kind: 'fill' | 'image'; on: string; text?: string };

/** One recording 2D context per canvas: the frame canvas and the overlay canvas are told apart. */
const drawn: Drawn[] = [];
const rasterized: string[][] = [];

class FakeOffscreenCanvas {
  static count = 0;
  readonly name: string;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    FakeOffscreenCanvas.count += 1;
    this.name = FakeOffscreenCanvas.count === 1 ? 'frame' : `overlay-${FakeOffscreenCanvas.count}`;
  }

  getContext() {
    const { name } = this;
    return {
      canvas: this,
      font: '',
      textAlign: '',
      textBaseline: '',
      fillStyle: '',
      fillRect: () => {
        drawn.push({ kind: 'fill', on: name });
      },
      drawImage: () => {
        drawn.push({ kind: 'image', on: name });
      },
      clearRect: () => {
        rasterized.push([]);
      },
      measureText: (text: string) => ({ width: text.length * 10 }),
      beginPath: () => undefined,
      roundRect: () => undefined,
      fill: () => undefined,
      fillText: (text: string) => {
        rasterized.at(-1)?.push(text);
      },
    };
  }
}

const canEncodeVideo =
  vi.fn<(codec: string, options: Record<string, unknown>) => Promise<boolean>>();
const canEncodeAudio =
  vi.fn<(codec: string, options: Record<string, unknown>) => Promise<boolean>>();
const QUALITY_HIGH = { level: 'high' };

const runtime = {
  ALL_FORMATS: [],
  AudioSample: FakeAudioSample,
  AudioSampleSink: FakeAudioSampleSink,
  AudioSampleSource: FakeAudioSampleSource,
  CanvasSource: FakeCanvasSource,
  Input: FakeInput,
  Mp4OutputFormat: class {
    constructor(readonly options: unknown) {}
  },
  Output: FakeOutput,
  QUALITY_HIGH,
  UrlSource: FakeUrlSource,
  VideoSampleSink: FakeVideoSampleSink,
  canEncodeAudio,
  canEncodeVideo,
} as unknown as StitchRuntime;

const clipId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

type ClipSpec = Readonly<{
  url: string;
  trim: readonly [number, number];
  audio?: { level: number; muted: boolean };
}>;

const arrangement = (
  clips: readonly ClipSpec[],
  subtitles: Composition['subtitles'] = [],
): { composition: Composition; media: CompositionRenderMedia[] } => ({
  composition: {
    clips: clips.map((spec, index): CompositionClip => ({
      id: clipId(index + 1),
      media: { kind: 'asset', assetId: `79b94c02-d268-4201-a05b-1f3baa0caed${index}` },
      trim: { startMs: spec.trim[0], endMs: spec.trim[1] },
      audio: spec.audio ?? { level: 100, muted: false },
    })),
    subtitles,
  },
  media: clips.map((spec) => {
    const descriptor = FakeInput.descriptors.get(spec.url)!;
    return {
      url: spec.url,
      mimeType: 'video/mp4',
      filename: spec.url.split('/').at(-1)!,
      width: descriptor.width,
      height: descriptor.height,
    };
  }),
});

const describeMedia = (url: string, descriptor: MediaDescriptor): string => {
  FakeInput.descriptors.set(url, descriptor);
  return url;
};

const run = (
  clips: readonly ClipSpec[],
  options: {
    readonly subtitles?: Composition['subtitles'];
    readonly cancel?: { readonly signal: { canceled: boolean } };
  } = {},
) => {
  const { composition, media } = arrangement(clips, options.subtitles);
  const plans: CompositionRenderPlan[] = [];
  const progress: number[] = [];
  let cancel: (() => void) | null = null;
  const hooks: StitchHooks = {
    target: {} as StitchHooks['target'],
    throwIfCanceled: () => {
      if (options.cancel?.signal.canceled) {
        throw new DOMException('The local video render was canceled.', 'AbortError');
      }
    },
    onCancel: (next) => {
      cancel = next;
    },
    onPlan: (plan) => {
      plans.push(plan);
    },
    onProgress: (fraction) => {
      progress.push(fraction);
    },
  };
  const outcome = stitchComposition(
    runtime,
    { type: 'render-composition', operationId: 1, composition, media },
    hooks,
  );
  return { outcome, plans, progress, composition, cancelNow: () => cancel?.() };
};

const A = 'https://studio.test/api/projects/p/sources/a/content';
const B = 'https://studio.test/api/projects/p/sources/b/content';
const C = 'https://studio.test/api/projects/p/sources/c/content';

beforeEach(() => {
  FakeInput.descriptors.clear();
  FakeInput.open.clear();
  FakeInput.maxOpen = 0;
  FakeInput.constructed = [];
  FakeUrlSource.constructed = [];
  FakeCanvasSource.adds = [];
  FakeCanvasSource.config = null;
  FakeAudioSampleSource.adds = [];
  FakeAudioSampleSource.config = null;
  FakeOutput.instances = [];
  FakeOffscreenCanvas.count = 0;
  FakeAudioSample.created = 0;
  FakeAudioSample.closed = 0;
  FakeVideoSample.created = 0;
  FakeVideoSample.closed = 0;
  FakeVideoSample.draws = [];
  drawn.length = 0;
  rasterized.length = 0;
  iteratorReturns.length = 0;
  audioSinks.length = 0;
  canEncodeVideo.mockReset().mockResolvedValue(true);
  canEncodeAudio.mockReset().mockResolvedValue(true);
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const near = (value: number, expected: number) =>
  expect(Math.abs(value - expected)).toBeLessThan(1e-9);

describe('stitchComposition — order and the two clocks', () => {
  it('stamps every frame on the sequence clock, holds each clip to its cut, and keys every clip', async () => {
    describeMedia(A, { width: 1_280, height: 720, fps: 30, durationS: 2, audio: null });
    describeMedia(B, { width: 1_280, height: 720, fps: 6, durationS: 3, audio: null });
    describeMedia(C, { width: 1_280, height: 720, fps: 24, durationS: 2, audio: null });
    // Trims that start between frames and end on no frame boundary at all.
    const { outcome, composition, plans } = run([
      { url: A, trim: [10, 500] },
      { url: B, trim: [1_000, 2_000] },
      { url: C, trim: [250, 1_250.5] },
    ]);
    await expect(outcome).resolves.toEqual({ mimeType: 'video/mp4' });

    const placements = compositionPlacements(composition);
    const adds = FakeCanvasSource.adds;
    // Strictly increasing, with every frame's length being the gap to the next frame.
    for (let index = 1; index < adds.length; index += 1) {
      expect(adds[index]!.timestamp).toBeGreaterThan(adds[index - 1]!.timestamp);
      near(adds[index - 1]!.duration, adds[index]!.timestamp - adds[index - 1]!.timestamp);
    }
    // Each clip's first frame lands exactly on its placement and is keyed; its last frame ends on the cut.
    for (const placement of placements) {
      const first = adds.find((add) => add.timestamp >= placement.startMs / 1_000 - 1e-9)!;
      near(first.timestamp, placement.startMs / 1_000);
      expect(first.keyFrame).toBe(true);
      const last = [...adds].reverse().find((add) => add.timestamp < placement.endMs / 1_000)!;
      near(last.timestamp + last.duration, placement.endMs / 1_000);
    }
    expect(adds.filter((add) => add.keyFrame === true)).toHaveLength(3);
    // The frame before the first trim is shown from the trim on: a 23.33 ms sliver, not a 33 ms frame.
    near(adds[0]!.timestamp, 0);
    near(adds[0]!.duration, (1_000 / 30 - 10) / 1_000);
    // The sequence ends where the arrangement says, not where the last decoded frame happened to.
    const final = adds.at(-1)!;
    near(final.timestamp + final.duration, plans[0]!.durationMs / 1_000);
    // Frame timing is carried: the track states no frame rate, and no rotation of its own.
    expect(FakeOutput.instances[0]!.videoTrackMeta).toEqual([undefined]);
    // Every decoded frame was closed, the held ones included.
    expect(FakeVideoSample.closed).toBe(FakeVideoSample.created);
    expect(FakeVideoSample.created).toBe(adds.length);
  });

  it('draws every clip into the one largest frame with a black fill first, and says what that did', async () => {
    describeMedia(A, { width: 1_280, height: 720, fps: 30, durationS: 1, audio: null });
    describeMedia(B, { width: 1_081, height: 1_919, fps: 6, durationS: 1, audio: null });
    const { outcome, plans } = run([
      { url: A, trim: [0, 500] },
      { url: B, trim: [0, 500] },
    ]);
    await expect(outcome).resolves.toBeDefined();
    expect(plans).toHaveLength(1);
    expect(plans[0]!.video).toEqual({
      target: { width: 1_080, height: 1_918 },
      clips: ['letterboxed', 'kept'],
    });
    // The one canvas is the target's size, and the encoder is configured as the single-clip path is.
    expect(FakeOffscreenCanvas.count).toBe(1);
    expect(FakeCanvasSource.config).toEqual({
      codec: 'avc',
      quality: QUALITY_HIGH,
      hardwareAcceleration: 'prefer-software',
    });
    expect(FakeOutput.instances[0]!.options.format).toMatchObject({
      options: { fastStart: false },
    });
    // The probe asked about the frame the encoder will actually be handed.
    expect(canEncodeVideo).toHaveBeenCalledWith('avc', {
      width: 1_080,
      height: 1_918,
      quality: QUALITY_HIGH,
      hardwareAcceleration: 'prefer-software',
    });
    // A black fill before every frame, then the frame with the contain fit — never stretched, and
    // never rotated by hand: the sample's own rotation is the library's to apply.
    const fills = drawn.filter((entry) => entry.kind === 'fill' && entry.on === 'frame');
    expect(fills).toHaveLength(FakeCanvasSource.adds.length);
    expect(FakeVideoSample.draws).toHaveLength(FakeCanvasSource.adds.length);
    expect(
      FakeVideoSample.draws.every((draw) => draw.fit === 'contain' && draw.rotation === undefined),
    ).toBe(true);
  });

  it('shows a cue across a cut, rasterized once, and a cue starting on the cut only from the cut', async () => {
    describeMedia(A, { width: 640, height: 360, fps: 10, durationS: 1, audio: null });
    describeMedia(B, { width: 640, height: 360, fps: 10, durationS: 1, audio: null });
    const { outcome } = run(
      [
        { url: A, trim: [0, 1_000] },
        { url: B, trim: [0, 1_000] },
      ],
      {
        subtitles: [
          {
            id: '11111111-0000-4000-8000-000000000001',
            text: 'Across',
            startMs: 900,
            endMs: 1_300,
            placement: 'bottom',
          },
          {
            id: '11111111-0000-4000-8000-000000000002',
            text: 'From the cut',
            startMs: 1_000,
            endMs: 1_100,
            placement: 'top',
          },
        ],
      },
    );
    await expect(outcome).resolves.toBeDefined();
    // Three sets on screen: 'Across' alone, both, 'Across' alone again — then nothing.
    expect(rasterized).toEqual([['Across'], ['From the cut', 'Across'], ['Across']]);
    // The overlay is composited on exactly the frames whose sequence stamp is inside a cue.
    const stamps = FakeCanvasSource.adds.map((add) => Math.round(add.timestamp * 1_000));
    const overlays = drawn.filter((entry) => entry.kind === 'image' && entry.on === 'frame');
    const covered = stamps.filter((ms) => ms >= 900 && ms < 1_300);
    expect(overlays).toHaveLength(covered.length);
    expect(covered).toEqual([900, 1_000, 1_100, 1_200]);
  });
});

describe('stitchComposition — sound', () => {
  it('places each clip in whole frames from the sequence edges, contiguous and to the budget', async () => {
    describeMedia(A, {
      width: 640,
      height: 360,
      fps: 10,
      durationS: 1,
      audio: { sampleRate: 48_000, channels: 2 },
    });
    describeMedia(B, {
      width: 640,
      height: 360,
      fps: 10,
      durationS: 1,
      audio: { sampleRate: 44_100, channels: 1 },
    });
    const { outcome, plans, composition } = run([
      { url: A, trim: [0, 1_001 / 3] },
      { url: B, trim: [100, 800] },
    ]);
    await expect(outcome).resolves.toBeDefined();
    expect(plans[0]!.audio).toEqual({
      target: { sampleRate: 48_000, numberOfChannels: 2 },
      fellBack: false,
      clips: ['kept', 'resampled-and-remixed'],
    });
    expect(FakeOutput.instances[0]!.audioTracks).toBe(1);
    expect(FakeAudioSampleSource.config).toEqual({ codec: 'aac', quality: QUALITY_HIGH });
    const adds = FakeAudioSampleSource.adds;
    expect(adds[0]!.timestamp).toBe(0);
    // Contiguous: every sample starts exactly where the previous one ended, in frames.
    let frames = 0;
    for (const add of adds) {
      near(add.timestamp * 48_000, frames);
      expect(add.rate).toBe(48_000);
      expect(add.channels).toBe(2);
      frames += add.frames;
    }
    // And each clip owes exactly its budget, from the cumulative edges.
    const [first, second] = compositionPlacements(composition);
    const budget = (placement: typeof first) =>
      compositionAudioFrames(placement!.endMs, 48_000) -
      compositionAudioFrames(placement!.startMs, 48_000);
    expect(frames).toBe(budget(first) + budget(second));
    // Every sample the loop touched was closed: the decoded ones, the emitted ones, the silence.
    expect(FakeAudioSample.closed).toBe(FakeAudioSample.created);
  });

  it('states a gap before the first sample as silence, trims a sample that starts early, skips one wholly early', async () => {
    describeMedia(A, {
      width: 640,
      height: 360,
      fps: 10,
      durationS: 1,
      audio: { sampleRate: 48_000, channels: 2, firstTimestamp: 0.02, chunkFrames: 480 },
    });
    describeMedia(B, {
      width: 640,
      height: 360,
      fps: 10,
      durationS: 1,
      audio: { sampleRate: 48_000, channels: 2, firstTimestamp: 0, chunkFrames: 480 },
    });
    const { outcome } = run([
      { url: A, trim: [0, 100] },
      // Starts 15 ms in: the first chunk (frames 0..479) is trimmed by 720 frames.
      { url: B, trim: [15, 100] },
    ]);
    await expect(outcome).resolves.toBeDefined();
    const adds = FakeAudioSampleSource.adds;
    // Clip A owes 4 800 frames. 20 ms of silence at 48 kHz is 960 frames of zeros before the first
    // real frame (value 1), whether the encoder received that as one sample or several.
    const clipA = adds.filter((add) => Math.round(add.timestamp * 48_000) < 4_800);
    const left = clipA.flatMap((add) => Array.from(add.data).filter((_, index) => index % 2 === 0));
    expect(left).toHaveLength(4_800);
    expect(left.slice(0, 960).every((value) => value === 0)).toBe(true);
    expect(left[960]).toBe(1);
    // The second clip's first frame is source frame 720 (value 721), nothing earlier.
    const clipB = adds.find((add) => Math.round(add.timestamp * 48_000) === 4_800)!;
    expect(clipB.data[0]).toBe(721);
  });

  it('renders silence for a clip without sound and for a muted clip, without decoding either', async () => {
    describeMedia(A, {
      width: 640,
      height: 360,
      fps: 10,
      durationS: 1,
      audio: { sampleRate: 48_000, channels: 2 },
    });
    describeMedia(B, { width: 640, height: 360, fps: 10, durationS: 1, audio: null });
    describeMedia(C, {
      width: 640,
      height: 360,
      fps: 10,
      durationS: 1,
      // Undecodable, and muted: never asked to decode, never raises the target.
      audio: { sampleRate: 96_000, channels: 6, canDecode: false },
    });
    const { outcome, plans } = run([
      { url: A, trim: [0, 100], audio: { level: 50, muted: false } },
      { url: B, trim: [0, 100] },
      { url: C, trim: [0, 100], audio: { level: 100, muted: true } },
    ]);
    await expect(outcome).resolves.toBeDefined();
    expect(plans[0]!.audio).toEqual({
      target: { sampleRate: 48_000, numberOfChannels: 2 },
      fellBack: false,
      clips: ['kept', 'silence', 'silence'],
    });
    expect(audioSinks).toEqual([A]);
    const adds = FakeAudioSampleSource.adds;
    // Level 50: every value halved, uniformly.
    expect(adds[0]!.data[0]).toBe(0.5);
    expect(adds[0]!.data[2]).toBe(1);
    const silent = adds.filter((add) => Math.round(add.timestamp * 48_000) >= 4_800);
    expect(silent.length).toBeGreaterThan(0);
    expect(silent.every((add) => add.data.every((value) => value === 0))).toBe(true);
    expect(silent.reduce((sum, add) => sum + add.frames, 0)).toBe(9_600);
  });

  it('carries no audio track at all when nothing contributes sound', async () => {
    describeMedia(A, { width: 640, height: 360, fps: 10, durationS: 1, audio: null });
    const { outcome, plans } = run([{ url: A, trim: [0, 100] }]);
    await expect(outcome).resolves.toBeDefined();
    expect(plans[0]!.audio).toBeNull();
    expect(FakeOutput.instances[0]!.audioTracks).toBe(0);
    expect(canEncodeAudio).not.toHaveBeenCalled();
  });

  it('falls back to the domain target when the clips own rate cannot be encoded, and refuses when that cannot either', async () => {
    describeMedia(A, {
      width: 640,
      height: 360,
      fps: 10,
      durationS: 1,
      audio: { sampleRate: 16_000, channels: 1 },
    });
    canEncodeAudio.mockImplementation((_codec, options) =>
      Promise.resolve(options.sampleRate === 48_000),
    );
    const first = run([{ url: A, trim: [0, 100] }]);
    await expect(first.outcome).resolves.toBeDefined();
    expect(first.plans[0]!.audio).toEqual({
      target: COMPOSITION_AUDIO_FALLBACK_TARGET,
      fellBack: true,
      clips: ['resampled-and-remixed'],
    });
    // The probe and the source share one quality, because the probe's answer is keyed by it.
    expect(canEncodeAudio).toHaveBeenLastCalledWith('aac', {
      numberOfChannels: 2,
      sampleRate: 48_000,
      quality: QUALITY_HIGH,
    });

    canEncodeAudio.mockResolvedValue(false);
    FakeOutput.instances = [];
    const second = run([{ url: A, trim: [0, 100] }]);
    await expect(second.outcome).rejects.toThrow(/cannot encode the sound/u);
    expect(second.plans).toHaveLength(0);
    expect(FakeOutput.instances).toHaveLength(0);
  });
});

describe('stitchComposition — refusals before paid work', () => {
  it('refuses when the frame cannot be encoded, before any output exists', async () => {
    describeMedia(A, { width: 3_840, height: 2_160, fps: 30, durationS: 1, audio: null });
    canEncodeVideo.mockResolvedValue(false);
    const { outcome, plans } = run([{ url: A, trim: [0, 100] }]);
    await expect(outcome).rejects.toThrow(/cannot encode H\.264 video at 3840×2160/u);
    expect(plans).toHaveLength(0);
    expect(FakeOutput.instances).toHaveLength(0);
  });

  it('names the clip whose media cannot be decoded, and disposes what it opened', async () => {
    describeMedia(A, { width: 640, height: 360, fps: 10, durationS: 1, audio: null });
    describeMedia(B, {
      width: 640,
      height: 360,
      fps: 10,
      durationS: 1,
      canDecode: false,
      audio: null,
    });
    const video = run([
      { url: A, trim: [0, 100] },
      { url: B, trim: [0, 100] },
    ]);
    await expect(video.outcome).rejects.toThrow(/“content” uses video this browser cannot decode/u);
    expect(FakeInput.constructed.every((input) => input.disposed)).toBe(true);

    describeMedia(C, {
      width: 640,
      height: 360,
      fps: 10,
      durationS: 1,
      audio: { sampleRate: 48_000, channels: 2, canDecode: false },
    });
    const audio = run([{ url: C, trim: [0, 100] }]);
    await expect(audio.outcome).rejects.toThrow(/Mute that clip to render without it/u);
    expect(FakeOutput.instances).toHaveLength(0);
  });

  it('refuses an arrangement whose media list does not describe its clips', async () => {
    describeMedia(A, { width: 640, height: 360, fps: 10, durationS: 1, audio: null });
    const { composition, media } = arrangement([{ url: A, trim: [0, 100] }]);
    await expect(
      stitchComposition(
        runtime,
        { type: 'render-composition', operationId: 1, composition, media: [...media, ...media] },
        {
          target: {} as StitchHooks['target'],
          throwIfCanceled: () => undefined,
          onCancel: () => undefined,
          onPlan: () => undefined,
          onProgress: () => undefined,
        },
      ),
    ).rejects.toThrow(/disagree/u);
  });
});

describe('stitchComposition — cancellation, disposal and bounds', () => {
  /** A clip whose fourth frame waits on a gate the test releases, and a clip after it. */
  const gatedArrangement = (): { release: () => void } => {
    let release: (() => void) | null = null;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    describeMedia(A, {
      width: 640,
      height: 360,
      fps: 10,
      durationS: 1,
      audio: { sampleRate: 48_000, channels: 2 },
      beforeFrame: (index) => (index === 3 ? gate : Promise.resolve()),
    });
    describeMedia(B, { width: 640, height: 360, fps: 10, durationS: 1, audio: null });
    return { release: () => release?.() };
  };

  it('a cancel that disposes the open input stops the read itself, and tears down exactly once', async () => {
    const signal = { canceled: false };
    const gated = gatedArrangement();
    const { outcome, cancelNow } = run(
      [
        { url: A, trim: [0, 1_000] },
        { url: B, trim: [0, 1_000] },
      ],
      { cancel: { signal } },
    );
    // The worker's handler: mark the operation cancelled, then run what the loop registered.
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal.canceled = true;
    cancelNow();
    gated.release();
    // The library's own refusal, not the cancel check: the read was already in flight.
    await expect(outcome).rejects.toMatchObject({ name: 'InputDisposedError' });
    // Frames 0 and 1 were written; frame 2 was held and never written; frame 3 was never decoded.
    expect(FakeCanvasSource.adds).toHaveLength(2);
    expect(FakeVideoSample.created).toBe(3);
    expect(FakeVideoSample.closed).toBe(3);
    // A read that rejected is not returned — nothing is left queued behind a disposed input.
    expect(iteratorReturns).not.toContain(`video:${A}`);
    // The closure cancelled the output; the catch did not cancel it a second time.
    expect(FakeOutput.instances[0]!.cancelled).toBe(1);
    expect(FakeOutput.instances[0]!.finalized).toBe(0);
    expect(FakeInput.constructed.every((input) => input.disposed)).toBe(true);
    expect(FakeInput.maxOpen).toBe(1);
    // The second clip was opened once, for the metadata pass, and never for a render.
    expect(FakeInput.constructed.filter((input) => input.url === B)).toHaveLength(1);
  });

  it('stops between frames when only the cancel flag is set, returning the iterator and closing every frame', async () => {
    const signal = { canceled: false };
    const gated = gatedArrangement();
    const { outcome } = run(
      [
        { url: A, trim: [0, 1_000] },
        { url: B, trim: [0, 1_000] },
      ],
      { cancel: { signal } },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    signal.canceled = true;
    gated.release();
    await expect(outcome).rejects.toMatchObject({ name: 'AbortError' });
    // Frame 3 arrived, frame 2 was written on its arrival, then the flag was seen.
    expect(FakeCanvasSource.adds).toHaveLength(3);
    expect(FakeVideoSample.created).toBe(4);
    expect(FakeVideoSample.closed).toBe(4);
    expect(iteratorReturns).toContain(`video:${A}`);
    expect(FakeOutput.instances[0]!.cancelled).toBe(1);
    expect(FakeOutput.instances[0]!.finalized).toBe(0);
    expect(FakeInput.constructed.every((input) => input.disposed)).toBe(true);
    expect(FakeInput.maxOpen).toBe(1);
  });

  it('keeps one input open across a hundred clips of one source, and reports progress once per percent', async () => {
    describeMedia(A, {
      width: 640,
      height: 360,
      fps: 10,
      durationS: 40,
      audio: { sampleRate: 44_100, channels: 1, chunkFrames: 4_096 },
    });
    // 333 ms is 14 685.3 frames at 44.1 kHz: summing per-clip budgets would drift by frames over
    // a hundred clips, where offsets from the cumulative edges stay within half a frame.
    const clips = Array.from({ length: 100 }, (_, index): ClipSpec => ({
      url: A,
      trim: [index * 333 + 0.7, (index + 1) * 333 + 0.7],
    }));
    const { outcome, progress, composition, plans } = run(clips);
    await expect(outcome).resolves.toBeDefined();
    expect(FakeInput.maxOpen).toBe(1);
    // Once for the metadata pass, once for the render — never per clip.
    expect(FakeInput.constructed).toHaveLength(2);
    for (let index = 1; index < progress.length; index += 1) {
      expect(progress[index]).toBeGreaterThan(progress[index - 1]!);
    }
    expect(progress.at(-1)).toBe(1);
    expect(progress.length).toBeLessThanOrEqual(101);
    expect(progress.every((value) => value >= 0 && value <= 1)).toBe(true);
    // Contiguous: every emitted sample starts exactly where the previous one ended, in frames.
    let frames = 0;
    const starts = new Map<number, number>();
    for (const add of FakeAudioSampleSource.adds) {
      near(add.timestamp * 44_100, frames);
      expect(add.rate).toBe(44_100);
      starts.set(frames, add.timestamp);
      frames += add.frames;
    }
    // Every clip's sound begins on its offset from the cumulative sequence edges — never on the
    // sum of the budgets before it, which would be frames away by the hundredth clip.
    for (const placement of compositionPlacements(composition)) {
      const offset = compositionAudioFrames(placement.startMs, 44_100);
      expect(starts.has(offset)).toBe(true);
      near(starts.get(offset)!, offset / 44_100);
    }
    // And the whole arrangement owes exactly the frames its length rounds to.
    expect(frames).toBe(compositionAudioFrames(plans[0]!.durationMs, 44_100));
  });

  it('opens each clip by an absolute URL with the session cookie, a content type, and a finite retry policy', async () => {
    describeMedia(A, { width: 640, height: 360, fps: 10, durationS: 1, audio: null });
    const { outcome } = run([{ url: A, trim: [0, 100] }]);
    await expect(outcome).resolves.toBeDefined();
    const source = FakeUrlSource.constructed[0]!;
    expect(source.url).toBe(A);
    expect(source.options.requestInit).toEqual({
      credentials: 'same-origin',
      headers: { Accept: 'video/mp4' },
    });
    const retry = source.options.getRetryDelay as (attempts: number) => number | null;
    expect([retry(1), retry(2), retry(3)]).toEqual([1, 2, null]);
  });
});
