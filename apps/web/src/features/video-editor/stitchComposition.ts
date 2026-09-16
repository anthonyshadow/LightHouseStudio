import {
  COMPOSITION_AUDIO_FALLBACK_TARGET,
  clipAudioConformance,
  clipVideoConformance,
  compositionAudioFrames,
  compositionAudioTarget,
  compositionPlacements,
  compositionVideoTarget,
  sequenceMsAt,
  videoEditAudioGain,
  type ClipAudioProfile,
  type CompositionAudioTarget,
  type CompositionPlacement,
} from '@studio/domain';
import type * as Mediabunny from 'mediabunny';
import { ensureAacEncodingSupport } from '../../adapters/media-processing/aacEncoding';
import {
  createAudioSampleConformer,
  scaledAudioSample,
  silentAudioSamples,
} from '../../adapters/media-processing/audioSampleConformer';
import { createSubtitleOverlaySync } from './subtitleRasterizer';
import type {
  CompositionRenderMedia,
  CompositionRenderPlan,
  VideoEditWorkerRequest,
} from './types';
import type { RenderCanvas } from './videoEditShader';

/**
 * Renders an arrangement to one file: every clip, in order, through one encoder.
 *
 * mediabunny's `Conversion` takes one input, so this is the loop beside it rather than a parameter
 * on it. It decides nothing about the output's format itself — the frame comes from the domain's
 * video rule over the media the arrangement names, the sound from its audio rule over what the
 * clips actually carry — and it pays for nothing until both decisions are made and probed against
 * this browser's encoders, which is when the plan is posted.
 *
 * Two clocks meet here, and confusing them is the whole hazard. A decoded frame carries **media
 * time**, a position in its own clip; the file is written in **sequence time**, and `sequenceMsAt`
 * is the one translation. Video frames are stamped with it directly and keep their own timing —
 * an MP4 carries per-frame durations, and no frame is dropped or duplicated. Audio is placed in
 * whole frames at the target rate from the same sequence edges, so the two clocks meet within half
 * an audio frame however many clips there are.
 *
 * The runtime is a parameter rather than an import, as the worker's other helpers have it:
 * mediabunny is dynamically imported in every media path, and a static import here would put the
 * whole library into whichever closure imports this module. Only the worker imports it.
 */

export type StitchRuntime = Pick<
  typeof Mediabunny,
  | 'ALL_FORMATS'
  | 'AudioSample'
  | 'AudioSampleSink'
  | 'AudioSampleSource'
  | 'CanvasSource'
  | 'Input'
  | 'Mp4OutputFormat'
  | 'Output'
  | 'QUALITY_HIGH'
  | 'UrlSource'
  | 'VideoSampleSink'
  | 'canEncodeAudio'
  | 'canEncodeVideo'
>;

export interface StitchHooks {
  /** Where the file's bytes go — the worker's bounded accumulator behind a chunked stream target. */
  readonly target: Mediabunny.StreamTarget;
  /** Throws the cancel outcome; checked between frames, between samples and between clips. */
  readonly throwIfCanceled: () => void;
  /** Registered once, before anything opens: what a cancel must tear down right away. */
  readonly onCancel: (cancel: () => void) => void;
  /** Posted once, before any paid work. */
  readonly onPlan: (plan: CompositionRenderPlan) => void;
  /** Whole percents of the sequence, non-decreasing. */
  readonly onProgress: (fraction: number) => void;
}

export type StitchRequest = Extract<VideoEditWorkerRequest, { type: 'render-composition' }>;

/**
 * A refusal an operator can act on, worded for them; the worker passes these through where every
 * other error is replaced by a generic sentence.
 */
export class StitchRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StitchRefusal';
  }
}

/**
 * Bounded, where the library's own policy backs off forever inside a worker. Returned in seconds.
 * The bound applies to a fetch that fails to start; a stream that dies part-way is resumed by the
 * library at the first delay each time, until the render is cancelled.
 */
const retryDelaySeconds = (previousAttempts: number): number | null =>
  previousAttempts >= 3 ? null : 0.5 * 2 ** previousAttempts;

interface ClipTracks {
  readonly video: Mediabunny.InputVideoTrack;
  readonly audio: Mediabunny.InputAudioTrack | null;
}

/** What one piece of media told the metadata pass; opened once however many clips stand over it. */
interface InspectedMedia {
  readonly audio: ClipAudioProfile | null;
  readonly audioDecodable: boolean;
}

export const stitchComposition = async (
  runtime: StitchRuntime,
  request: StitchRequest,
  hooks: StitchHooks,
): Promise<{ mimeType: string }> => {
  const { composition, media } = request;
  if (media.length !== composition.clips.length) {
    throw new Error('The arrangement and its media disagree.');
  }
  const placements = compositionPlacements(composition);
  const durationMs = placements.at(-1)?.endMs ?? 0;
  if (durationMs <= 0) throw new StitchRefusal('This arrangement has nothing to render.');

  // The frame, from the same numbers the surface holds, so a notice and the canvas cannot disagree.
  const videoTarget = compositionVideoTarget(media);
  const videoClips = media.map((item) => clipVideoConformance(item, videoTarget));
  const gains = composition.clips.map((clip) => videoEditAudioGain(clip.audio));

  let current: Mediabunny.Input | null = null;
  let output: Mediabunny.Output | null = null;
  let settled = false;
  hooks.onCancel(() => {
    current?.dispose();
    if (output !== null && !settled) {
      settled = true;
      void output.cancel().catch(() => undefined);
    }
  });

  const openInput = (item: CompositionRenderMedia): Mediabunny.Input =>
    new runtime.Input({
      formats: runtime.ALL_FORMATS,
      source: new runtime.UrlSource(item.url, {
        requestInit: { credentials: 'same-origin', headers: { Accept: item.mimeType } },
        getRetryDelay: retryDelaySeconds,
      }),
    });

  const tracksOf = async (
    input: Mediabunny.Input,
    item: CompositionRenderMedia,
  ): Promise<ClipTracks> => {
    const [video, audio] = await Promise.all([
      input.getPrimaryVideoTrack(),
      input.getPrimaryAudioTrack(),
    ]);
    if (video === null) throw new StitchRefusal(`“${item.filename}” has no video track.`);
    return { video, audio };
  };

  // The metadata pass: one input open at a time, each distinct media opened once, nothing decoded.
  const inspected = new Map<string, InspectedMedia>();
  const audioProfiles: (ClipAudioProfile | null)[] = [];
  for (const [index, item] of media.entries()) {
    hooks.throwIfCanceled();
    let facts = inspected.get(item.url);
    if (facts === undefined) {
      const input = openInput(item);
      current = input;
      try {
        const { video, audio } = await tracksOf(input, item);
        if (!(await video.canDecode())) {
          throw new StitchRefusal(
            `“${item.filename}” uses video this browser cannot decode. Remove that clip to render the rest.`,
          );
        }
        facts =
          audio === null
            ? { audio: null, audioDecodable: false }
            : {
                audio: {
                  sampleRate: await audio.getSampleRate(),
                  numberOfChannels: await audio.getNumberOfChannels(),
                },
                audioDecodable: await audio.canDecode(),
              };
      } finally {
        input.dispose();
        current = null;
      }
      inspected.set(item.url, facts);
    }
    // A muted clip contributes no sound, so its track neither raises the target nor has to decode.
    if (gains[index] === 0 || facts.audio === null) {
      audioProfiles.push(null);
      continue;
    }
    if (!facts.audioDecodable) {
      throw new StitchRefusal(
        `“${item.filename}” uses sound this browser cannot decode. Mute that clip to render without it.`,
      );
    }
    audioProfiles.push(facts.audio);
  }

  // Probe both encoders at the formats they will actually be asked for, before any paid work.
  const quality = runtime.QUALITY_HIGH;
  // The very configuration the source below is given, acceleration included: the probe's answer is
  // keyed by everything it was asked.
  if (
    !(await runtime.canEncodeVideo('avc', {
      width: videoTarget.width,
      height: videoTarget.height,
      quality,
      hardwareAcceleration: 'prefer-software',
    }))
  ) {
    throw new StitchRefusal(
      `This browser cannot encode H.264 video at ${videoTarget.width}×${videoTarget.height}, the frame this arrangement needs.`,
    );
  }
  let audioTarget = compositionAudioTarget(audioProfiles);
  let fellBack = false;
  if (audioTarget !== null) {
    // The same quality the source is configured with: the probe's memo key includes the bitrate.
    const encodable = (target: CompositionAudioTarget) => () =>
      runtime.canEncodeAudio('aac', {
        numberOfChannels: target.numberOfChannels,
        sampleRate: target.sampleRate,
        quality,
      });
    try {
      await ensureAacEncodingSupport(encodable(audioTarget));
    } catch {
      // The library's own fallback is unreachable on this path; the domain's rule stands in.
      audioTarget = COMPOSITION_AUDIO_FALLBACK_TARGET;
      fellBack = true;
      try {
        await ensureAacEncodingSupport(encodable(audioTarget));
      } catch {
        throw new StitchRefusal('This browser cannot encode the sound of this arrangement.');
      }
    }
  }
  const chosenAudio = audioTarget;
  hooks.onPlan({
    durationMs,
    video: { target: videoTarget, clips: videoClips },
    audio:
      chosenAudio === null
        ? null
        : {
            target: chosenAudio,
            fellBack,
            clips: audioProfiles.map((profile) => clipAudioConformance(profile, chosenAudio)),
          },
  });
  hooks.throwIfCanceled();

  // One canvas of the target's size for the whole render: the encoder refuses a size change.
  const canvas = new OffscreenCanvas(videoTarget.width, videoTarget.height);
  const context = canvas.getContext('2d', { alpha: false });
  if (context === null) throw new Error('The browser could not draw the arrangement.');
  let overlay: RenderCanvas | null = null;
  const syncOverlay = createSubtitleOverlaySync(
    () => new OffscreenCanvas(videoTarget.width, videoTarget.height),
    (next) => {
      overlay = next;
    },
  );
  const overlayFrame = { x: 0, y: 0, width: videoTarget.width, height: videoTarget.height };

  // Non-fragmented, as the single-clip render writes it: a clip's video and then its audio buffer
  // no bytes across tracks, where the fragmented layout would hold a whole clip's video back.
  output = new runtime.Output({
    format: new runtime.Mp4OutputFormat({ fastStart: false }),
    target: hooks.target,
  });
  const videoSource = new runtime.CanvasSource(canvas, {
    codec: 'avc',
    quality,
    hardwareAcceleration: 'prefer-software',
  });
  // No rotation on the track: drawing already applied each clip's own, and stating it again would
  // rotate twice. No frame rate: each frame carries its own duration.
  output.addVideoTrack(videoSource);
  const audioSource =
    chosenAudio === null ? null : new runtime.AudioSampleSource({ codec: 'aac', quality });
  if (audioSource !== null) output.addAudioTrack(audioSource);
  await output.start();

  let percent = -1;
  const progress = (sequenceMs: number): void => {
    const next = Math.max(0, Math.min(100, Math.floor((sequenceMs / durationMs) * 100)));
    if (next > percent) {
      percent = next;
      hooks.onProgress(next / 100);
    }
  };

  let lastFrameMs = Number.NEGATIVE_INFINITY;

  const stitchVideo = async (
    placement: CompositionPlacement,
    item: CompositionRenderMedia,
    track: Mediabunny.InputVideoTrack,
  ): Promise<void> => {
    const { trim } = placement.clip;
    const sink = new runtime.VideoSampleSink(track);
    let first = true;
    let drawn = 0;
    /*
     * A frame is written when the next one arrives, so its duration is exactly the gap to that
     * frame — the file derives every frame's length from its successor and keeps only the last
     * frame's own — and the clip's last frame is held to the cut. A decoder may hand a frame of
     * duration zero; this never trusts it.
     */
    let held: Mediabunny.VideoSample | null = null;
    let heldMediaMs = 0;
    const write = async (
      sample: Mediabunny.VideoSample,
      fromMediaMs: number,
      toMediaMs: number,
    ): Promise<void> => {
      const fromMs = sequenceMsAt(placement, fromMediaMs);
      const toMs = sequenceMsAt(placement, toMediaMs);
      // Strictly increasing, always: an equal stamp writes a zero-length frame the file cannot time.
      if (toMs <= fromMs || fromMs <= lastFrameMs) return;
      // The fit does not clear the bars, and the previous clip's pixels would show through them.
      context.fillStyle = '#000';
      context.fillRect(0, 0, videoTarget.width, videoTarget.height);
      sample.drawWithFit(context, { fit: 'contain' });
      // Cues are sequence time, and so is this frame's stamp: the lookup is the whole intersection.
      syncOverlay(composition.subtitles, fromMs, overlayFrame);
      if (overlay !== null) context.drawImage(overlay, 0, 0);
      // The canvas is captured as `add` is called, so it is free to change once this returns.
      await videoSource.add(
        fromMs / 1_000,
        (toMs - fromMs) / 1_000,
        first ? { keyFrame: true } : undefined,
      );
      first = false;
      drawn += 1;
      lastFrameMs = fromMs;
      progress(toMs);
    };
    try {
      for await (const sample of sink.samples(trim.startMs / 1_000, trim.endMs / 1_000)) {
        if (sample.timestamp * 1_000 >= trim.endMs) {
          sample.close();
          break;
        }
        // The first frame may start before the trim; it is shown from the trim on.
        const mediaMs = Math.max(sample.timestamp * 1_000, trim.startMs);
        // The new frame is held before the previous one is written, so a write that throws leaves
        // nothing unowned: the previous frame is closed here and the new one by the finally.
        const previous = held;
        const previousMediaMs = heldMediaMs;
        held = sample;
        heldMediaMs = mediaMs;
        if (previous !== null) {
          try {
            await write(previous, previousMediaMs, mediaMs);
          } finally {
            previous.close();
          }
        }
        hooks.throwIfCanceled();
      }
      if (held !== null) {
        await write(held, heldMediaMs, trim.endMs);
        held.close();
        held = null;
      }
    } finally {
      held?.close();
    }
    if (drawn === 0) throw new StitchRefusal(`“${item.filename}” produced no video frames.`);
  };

  const stitchAudio = async (
    placement: CompositionPlacement,
    item: CompositionRenderMedia,
    track: Mediabunny.InputAudioTrack | null,
    target: CompositionAudioTarget,
    source: Mediabunny.AudioSampleSource,
  ): Promise<void> => {
    // Placement from the cumulative edges: budgets telescope to offsets, and the audio clock stays
    // within half a frame of the video clock however many clips precede this one.
    const offsetFrames = compositionAudioFrames(placement.startMs, target.sampleRate);
    const frameBudget = compositionAudioFrames(placement.endMs, target.sampleRate) - offsetFrames;
    if (frameBudget <= 0) return;
    const gain = gains[placement.index]!;
    const feed = async (samples: Iterable<Mediabunny.AudioSample>): Promise<void> => {
      for (const sample of samples) {
        hooks.throwIfCanceled();
        await source.add(sample);
        sample.close();
      }
    };
    if (track === null || gain === 0 || audioProfiles[placement.index] === null) {
      // No decoding at all: exact zeros, and the same shape as a clip that never had sound.
      await feed(silentAudioSamples(runtime.AudioSample, target, { offsetFrames, frameBudget }));
      return;
    }
    const conformer = createAudioSampleConformer(runtime.AudioSample, target, {
      offsetFrames,
      frameBudget,
    });
    const { trim } = placement.clip;
    const startSeconds = trim.startMs / 1_000;
    /*
     * The conformer counts frames and reads no timestamps, so time inside the clip is owned here:
     * a gap before the first sample, or inside the clip, is stated as source-format silence pushed
     * first; frames before the trim are dropped by exact count; a level is applied to every frame
     * alike, because the conformer's seam carries the previous frame and a level applied to some
     * frames and not others would click.
     */
    let expected = 0;
    let sourceRate = 0;
    let sourceChannels = 0;
    const sink = new runtime.AudioSampleSink(track);
    for await (const sample of sink.samples(startSeconds, trim.endMs / 1_000)) {
      try {
        hooks.throwIfCanceled();
        if (sourceRate === 0) {
          sourceRate = sample.sampleRate;
          sourceChannels = sample.numberOfChannels;
        } else if (sample.sampleRate !== sourceRate || sample.numberOfChannels !== sourceChannels) {
          throw new StitchRefusal(`“${item.filename}” changes its sound format part-way through.`);
        }
        // Exact: the decoder places every sample on the source's own frame grid.
        const delta = Math.round((sample.timestamp - startSeconds) * sourceRate) - expected;
        if (delta > 0) {
          const gap = new runtime.AudioSample({
            data: new Float32Array(delta * sourceChannels),
            format: 'f32',
            numberOfChannels: sourceChannels,
            sampleRate: sourceRate,
            timestamp: startSeconds + expected / sourceRate,
          });
          try {
            await feed(conformer.push(gap));
          } finally {
            gap.close();
          }
          expected += delta;
        }
        const drop = delta < 0 ? -delta : 0;
        if (drop >= sample.numberOfFrames) continue;
        const pushed =
          drop === 0 && gain === 1
            ? sample
            : scaledAudioSample(runtime.AudioSample, sample, {
                frameOffset: drop,
                gain,
                timestamp: startSeconds + expected / sourceRate,
              });
        try {
          await feed(conformer.push(pushed));
        } finally {
          if (pushed !== sample) pushed.close();
        }
        expected += pushed.numberOfFrames;
      } finally {
        sample.close();
      }
    }
    await feed(conformer.flush());
  };

  let openUrl: string | null = null;
  let tracks: ClipTracks | null = null;
  try {
    for (const placement of placements) {
      hooks.throwIfCanceled();
      const item = media[placement.index]!;
      // Consecutive clips over the same media — the halves of a split — share one open input.
      if (tracks === null || openUrl !== item.url) {
        current?.dispose();
        current = openInput(item);
        openUrl = item.url;
        tracks = await tracksOf(current, item);
      }
      await stitchVideo(placement, item, tracks.video);
      if (audioSource !== null && chosenAudio !== null) {
        await stitchAudio(placement, item, tracks.audio, chosenAudio, audioSource);
      }
      progress(placement.endMs);
    }
    current?.dispose();
    current = null;
    hooks.throwIfCanceled();
    await output.finalize();
    settled = true;
    return { mimeType: await output.getMimeType() };
  } catch (error) {
    current?.dispose();
    current = null;
    if (!settled) {
      settled = true;
      await output.cancel().catch(() => undefined);
    }
    throw error;
  }
};
