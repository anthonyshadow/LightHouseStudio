import { expect, test, type Page } from '@playwright/test';
import {
  DEFAULT_INK_THRESHOLDS,
  installMediaReader,
  readRenderedFrameInk,
  type ReaderWindow,
} from './support/browserMediaProbe';
import {
  loadDecodableH264VideoFixture,
  loadDeterministicRecordingFixture,
  loadPortraitH264VideoFixture,
} from './support/existingVideoHarness';

/**
 * The stitched render against the real encoder, on the real fixtures, in the one engine the
 * automated suite has that decodes and encodes video: three committed clips of three formats —
 * 1280x720 without sound, 1080x1920 at 6 fps without sound, 320x180 with AAC — rendered into one
 * file through the same client the arrangement surface calls, then read back with the page's own
 * decoder. The vitest suite proves the loop's arithmetic against a fake runtime; this proves that
 * the frame policy, the audio conformance and the burned-in cue survive contact with WebCodecs,
 * and it is where the render budget the roadmap asks for is measured rather than estimated.
 *
 * Driven at the module level on purpose. The surface's own path to a mixed arrangement is the
 * real-stack journey in `real-stack-project-deliverable.spec.ts`, which needs the API; this one
 * asks the render client directly, with the fixtures held in the page as blob URLs, because it is
 * the only place the fifth-of-a-second AAC recording, all three formats and the render budget are
 * exercised together without a server.
 */

type ClipFacts = Readonly<{
  url: string;
  mimeType: string;
  filename: string;
  width: number;
  height: number;
  hasAudio: boolean;
  durationMs: number;
  sampleRate: number | null;
}>;

type RenderClient = Readonly<{
  renderComposition: (input: {
    readonly composition: unknown;
    readonly media: readonly Omit<ClipFacts, 'durationMs' | 'sampleRate' | 'hasAudio'>[];
    readonly signal: AbortSignal;
    readonly onProgress: (progress: number) => void;
    readonly onPlan?: (plan: unknown) => void;
  }) => Promise<{ readonly blob: Blob; readonly plan: RenderPlan }>;
}>;

type RenderPlan = Readonly<{
  durationMs: number;
  video: Readonly<{
    target: Readonly<{ width: number; height: number }>;
    clips: readonly string[];
  }>;
  audio: Readonly<{
    target: Readonly<{ sampleRate: number; numberOfChannels: number }>;
    fellBack: boolean;
    clips: readonly string[];
  }> | null;
}>;

const RENDER_CLIENT_MODULE = '/src/features/video-editor/renderComposition.ts';

/** Holds the fixtures in the page as blob URLs and measures them with the page's own reader. */
const describeFixtures = async (
  page: Page,
  encoded: Readonly<Record<string, string>>,
): Promise<Record<string, ClipFacts>> => {
  await installMediaReader(page);
  return page.evaluate(async (fixtures) => {
    const reader = (window as ReaderWindow).__lightframeMediaReader;
    if (!reader) throw new Error('The page media reader was not installed.');
    const facts: Record<string, ClipFacts> = {};
    for (const [name, base64] of Object.entries(fixtures)) {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
      const blob = new Blob([bytes], { type: 'video/mp4' });
      const input = new reader.Input({
        formats: reader.ALL_FORMATS,
        source: new reader.BlobSource(blob),
      });
      try {
        const video = await input.getPrimaryVideoTrack();
        if (!video) throw new Error(`${name} holds no video track.`);
        const audio = await input.getPrimaryAudioTrack();
        facts[name] = {
          url: URL.createObjectURL(blob),
          mimeType: 'video/mp4',
          filename: `${name}.mp4`,
          width: Math.round(await video.getDisplayWidth()),
          height: Math.round(await video.getDisplayHeight()),
          hasAudio: audio !== null,
          durationMs: (await input.computeDuration()) * 1_000,
          sampleRate: audio === null ? null : await audio.getSampleRate(),
        };
      } finally {
        input.dispose();
      }
    }
    return facts;
  }, encoded);
};

const loadFixtures = async (): Promise<Record<string, string>> => ({
  landscape: (await loadDecodableH264VideoFixture()).toString('base64'),
  portrait: (await loadPortraitH264VideoFixture()).toString('base64'),
  recording: (await loadDeterministicRecordingFixture()).toString('base64'),
});

test('renders three clips of three formats into one file, says what it did to each, and reports its cost', async ({
  page,
}) => {
  /*
   * Three clips of a second or so at 1080x1920 through a software H.264 encoder: the measured
   * figure is printed below on every run, and that line — not this number — is the budget.
   */
  test.setTimeout(180_000);
  await page.goto('/');
  const facts = await describeFixtures(page, await loadFixtures());
  const clips = [facts['landscape']!, facts['portrait']!, facts['recording']!];
  const firstCutMs = clips[0]!.durationMs;
  const totalMs = clips.reduce((sum, clip) => sum + clip.durationMs, 0);

  let measured:
    | {
        plan: RenderPlan;
        progress: number[];
        elapsedMs: number;
        bytes: number;
        url: string;
        output: {
          width: number;
          height: number;
          durationMs: number;
          audio: { sampleRate: number; channels: number } | null;
        };
      }
    | undefined;
  try {
    measured = await page.evaluate(
      async ({ media, cutMs, modulePath }) => {
        const { renderComposition } = (await import(/* @vite-ignore */ modulePath)) as RenderClient;
        const id = () => crypto.randomUUID();
        const composition = {
          clips: media.map((clip) => ({
            id: id(),
            media: { kind: 'asset', assetId: id() },
            trim: { startMs: 0, endMs: clip.durationMs },
            audio: { level: 100, muted: false },
          })),
          // One cue across the first cut, so the burn-in is checked on both sides of it.
          subtitles: [
            {
              id: id(),
              text: 'Across the first cut',
              startMs: Math.max(0, cutMs - 200),
              endMs: cutMs + 300,
              placement: 'bottom',
            },
          ],
        };
        let plan: RenderPlan | null = null;
        const progress: number[] = [];
        const started = performance.now();
        const rendered = await renderComposition({
          composition,
          media: media.map(({ url, mimeType, filename, width, height }) => ({
            url,
            mimeType,
            filename,
            width,
            height,
          })),
          signal: new AbortController().signal,
          onProgress: (value) => {
            progress.push(value);
          },
          onPlan: (next) => {
            plan = next as RenderPlan;
          },
        });
        const elapsedMs = performance.now() - started;
        if (plan === null) throw new Error('The render posted no plan.');
        const reader = (window as ReaderWindow).__lightframeMediaReader;
        if (!reader) throw new Error('The page media reader was not installed.');
        const input = new reader.Input({
          formats: reader.ALL_FORMATS,
          source: new reader.BlobSource(rendered.blob),
        });
        try {
          const video = await input.getPrimaryVideoTrack();
          if (!video) throw new Error('The rendered file holds no video track.');
          const audio = await input.getPrimaryAudioTrack();
          return {
            plan,
            progress,
            elapsedMs,
            bytes: rendered.blob.size,
            url: URL.createObjectURL(rendered.blob),
            output: {
              width: Math.round(await video.getDisplayWidth()),
              height: Math.round(await video.getDisplayHeight()),
              durationMs: (await input.computeDuration()) * 1_000,
              audio:
                audio === null
                  ? null
                  : {
                      sampleRate: await audio.getSampleRate(),
                      channels: await audio.getNumberOfChannels(),
                    },
            },
          };
        } finally {
          input.dispose();
        }
      },
      { media: clips, cutMs: firstCutMs, modulePath: RENDER_CLIENT_MODULE },
    );

    // The plan: the largest frame wins and the others are fitted; only the recording has sound.
    expect(measured.plan.video).toEqual({
      target: { width: 1_080, height: 1_920 },
      clips: ['letterboxed', 'kept', 'letterboxed'],
    });
    expect(measured.plan.audio?.clips).toEqual(['silence', 'silence', 'kept']);
    expect(measured.plan.audio?.target.sampleRate).toBe(clips[2]!.sampleRate);
    expect(measured.plan.durationMs).toBeCloseTo(totalMs, 3);

    // The file: the plan's frame, the sequence's length, the target's sound.
    expect(measured.output.width).toBe(1_080);
    expect(measured.output.height).toBe(1_920);
    expect(Math.abs(measured.output.durationMs - totalMs)).toBeLessThan(100);
    expect(measured.output.audio).toEqual({
      sampleRate: measured.plan.audio!.target.sampleRate,
      channels: measured.plan.audio!.target.numberOfChannels,
    });
    for (let index = 1; index < measured.progress.length; index += 1) {
      expect(measured.progress[index]).toBeGreaterThanOrEqual(measured.progress[index - 1]!);
    }
    expect(measured.progress.at(-1)).toBe(1);

    /*
     * The pixels. The 1280x720 clip contained in a 1080x1920 frame is 1080x607 high, so the top
     * third of its first frame is the bar — black — and the middle is the fixture's own flat teal,
     * neither bright nor dark. Inside the portrait clip the frame is the clip, no bars at all, and
     * the cue's white glyphs land in the bottom band on both sides of the cut.
     */
    const firstFrame = await readRenderedFrameInk(
      page,
      measured.url,
      { caption: { fromRatio: 0.4, toRatio: 0.6 }, control: { fromRatio: 0, toRatio: 0.3 } },
      DEFAULT_INK_THRESHOLDS,
    );
    expect(firstFrame.control.dark / firstFrame.control.pixels).toBeGreaterThan(0.98);
    expect(firstFrame.caption.dark / firstFrame.caption.pixels).toBeLessThan(0.02);
    expect(firstFrame.caption.bright).toBe(0);
    const captionBands = {
      caption: { fromRatio: 0.6, toRatio: 0.85 },
      control: { fromRatio: 0.02, toRatio: 0.3 },
    } as const;
    const beforeCut = await readRenderedFrameInk(
      page,
      measured.url,
      captionBands,
      DEFAULT_INK_THRESHOLDS,
      (firstCutMs - 100) / 1_000,
    );
    const afterCut = await readRenderedFrameInk(
      page,
      measured.url,
      captionBands,
      DEFAULT_INK_THRESHOLDS,
      (firstCutMs + 100) / 1_000,
    );
    expect(beforeCut.caption.bright).toBeGreaterThan(0);
    expect(afterCut.caption.bright).toBeGreaterThan(0);
    // Inside the portrait clip there is no bar above the picture.
    expect(afterCut.control.dark / afterCut.control.pixels).toBeLessThan(0.02);
  } finally {
    if (measured) {
      const outputSeconds = measured.plan.durationMs / 1_000;
      console.log(
        `stitched render budget: ${measured.elapsedMs.toFixed(0)} ms for ${outputSeconds.toFixed(2)} s of ` +
          `${measured.plan.video.target.width}x${measured.plan.video.target.height} output from ` +
          `${clips.length} clips (${(measured.elapsedMs / outputSeconds).toFixed(0)} ms per output second); ` +
          `${measured.bytes} bytes; ${measured.progress.length} progress reports`,
      );
    }
  }
});

test('a render stops soon after it is asked to, and settles as a cancel rather than a failure', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const facts = await describeFixtures(page, await loadFixtures());
  const clips = [facts['landscape']!, facts['portrait']!, facts['recording']!];

  const outcome = await page.evaluate(
    async ({ media, modulePath }) => {
      const { renderComposition } = (await import(/* @vite-ignore */ modulePath)) as RenderClient;
      const id = () => crypto.randomUUID();
      const controller = new AbortController();
      let cancelledAt: number | null = null;
      const started = performance.now();
      try {
        await renderComposition({
          composition: {
            clips: media.map((clip) => ({
              id: id(),
              media: { kind: 'asset', assetId: id() },
              trim: { startMs: 0, endMs: clip.durationMs },
              audio: { level: 100, muted: false },
            })),
            subtitles: [],
          },
          media: media.map(({ url, mimeType, filename, width, height }) => ({
            url,
            mimeType,
            filename,
            width,
            height,
          })),
          signal: controller.signal,
          onProgress: () => {
            if (cancelledAt === null) {
              cancelledAt = performance.now();
              controller.abort();
            }
          },
        });
        return { settled: 'resolved' as const, afterMs: performance.now() - started };
      } catch (error) {
        return {
          settled:
            error instanceof DOMException && error.name === 'AbortError' ? 'aborted' : 'failed',
          afterMs: cancelledAt === null ? null : performance.now() - cancelledAt,
        };
      }
    },
    { media: clips, modulePath: RENDER_CLIENT_MODULE },
  );

  expect(outcome.settled).toBe('aborted');
  // The client gives the worker two seconds to acknowledge before it terminates it outright.
  expect(outcome.afterMs).not.toBeNull();
  expect(outcome.afterMs!).toBeLessThan(3_000);
});
