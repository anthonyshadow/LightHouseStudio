import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';

/*
 * Asking the page itself about media, with the page's own decoder.
 *
 * Two questions live here. What did a render actually draw — answered by decoding a frame and
 * counting ink in a band, because a filename is not a pixel. And what can this browser decode —
 * answered with `VideoDecoder.isConfigSupported` over the file's own configuration, which is the
 * question `apps/web/src/adapters/media-processing/videoDecodeSupport.ts` asks in the product.
 *
 * Neither can go through a `<video>` element. Playwright's Linux Chromium cannot decode H.264
 * there, which `../studioVisualMatrix.ts` records and which is why the visual suite skips its
 * H.264 scenarios; `drawImage(video)` would therefore prove nothing on the platform that matters
 * most. WebCodecs can, and mediabunny is the reader `apps/web` already uses over it — loaded here
 * from that workspace's own copy, so the reader in a test and the reader in the product cannot be
 * different versions.
 */

/** A horizontal slice of a frame, as fractions of its height, measured from the top. */
export type FrameBand = Readonly<{ fromRatio: number; toRatio: number }>;

/** What one band holds: its size, and how much of it is far from the source's own flat tone. */
export type BandInk = Readonly<{ pixels: number; bright: number; dark: number }>;

export type FrameInk = Readonly<{
  width: number;
  height: number;
  /** The band the caption lays out in. */
  caption: BandInk;
  /** A band the caption never reaches, so "ink arrived" is read against "nothing arrived". */
  control: BandInk;
}>;

/**
 * Luma bounds either side of the fixture's own tone. Floors, never equalities: the rasterizer asks
 * for Inter first (`apps/web/src/features/video-editor/subtitleRasterizer.ts`) and nothing in this
 * repository ships it, so glyph widths — and therefore the exact pixel counts — differ per
 * platform.
 */
export type InkThresholds = Readonly<{ bright: number; dark: number }>;

/**
 * The pair every fixture in this suite is read against.
 *
 * All three committed H.264 fixtures are one flat teal on every frame, near luma 87 and never above
 * about 100 once a journey's brightness lift is applied; a cue draws its box at roughly 0.45 of
 * that, and its glyphs are white. One bound either side of that band therefore separates box from
 * source from glyph for all of them, with room to spare in both directions. A fixture with a
 * different tone needs its own pair rather than a widening of this one.
 */
export const DEFAULT_INK_THRESHOLDS: InkThresholds = { bright: 180, dark: 60 };

export type DecoderSupport = Readonly<{ codec: string; supported: boolean }>;

/**
 * The self-contained browser bundle, taken from whichever `node_modules` the install produced.
 * Reading the file rather than importing the package: this module runs in Node under Playwright,
 * the decode runs in the page, and the page resolves no bare specifiers of its own.
 */
const MEDIABUNNY_BUNDLES = [
  '../../apps/web/node_modules/mediabunny/dist/bundles/mediabunny.min.mjs',
  '../../node_modules/mediabunny/dist/bundles/mediabunny.min.mjs',
] as const;

let bundleSource: Promise<string> | null = null;

const mediabunnyBundle = (): Promise<string> => {
  bundleSource ??= (async () => {
    for (const candidate of MEDIABUNNY_BUNDLES) {
      try {
        return await readFile(new URL(candidate, import.meta.url), 'utf8');
      } catch {
        continue;
      }
    }
    throw new Error("mediabunny's browser bundle was not found. Run `bun install`.");
  })();
  return bundleSource;
};

type ProbeCanvas = Readonly<{ canvas: HTMLCanvasElement | OffscreenCanvas }>;

type ProbeVideoTrack = Readonly<{
  getCodec: () => Promise<string | null>;
  getDecoderConfig: () => Promise<VideoDecoderConfig | null>;
  getFirstTimestamp: () => Promise<number>;
}>;

type ProbeInput = Readonly<{
  getPrimaryVideoTrack: () => Promise<ProbeVideoTrack | null>;
  dispose: () => void;
}>;

/** Only the four names the probes below use, so the page-side code stays typed without a cast. */
type MediaReader = Readonly<{
  ALL_FORMATS: unknown;
  BlobSource: new (blob: Blob) => object;
  Input: new (options: { readonly formats: unknown; readonly source: object }) => ProbeInput;
  CanvasSink: new (track: ProbeVideoTrack) => Readonly<{
    getCanvas: (timestamp: number) => Promise<ProbeCanvas | null>;
  }>;
}>;

type ReaderWindow = typeof window & { __lightframeMediaReader?: MediaReader };

/** Whether one page's current document is holding the reader. */
type ReaderState = { holding: boolean };

/*
 * Where "is it already installed?" is answered, and why it is answered here.
 *
 * The bundle is the *argument* to `page.evaluate`, so a guard inside the page runs only after 648
 * KB has crossed the DevTools connection — the whole cost the guard exists to avoid, paid again on
 * every probe call. Node has to decide instead.
 *
 * Keyed on the page and cleared by the page's own navigations rather than assumed for the life of
 * the process: a navigation replaces the `window` the reader published itself on, and the specs
 * here do navigate between probes.
 */
const readerStates = new WeakMap<Page, ReaderState>();

const readerStateOf = (page: Page): ReaderState => {
  const existing = readerStates.get(page);
  if (existing !== undefined) return existing;
  const state: ReaderState = { holding: false };
  readerStates.set(page, state);
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) state.holding = false;
  });
  return state;
};

/**
 * Puts the reader on `window`, once per document.
 *
 * The bundle is an ES module whose exports have to be named to be reachable; awaiting a dynamic
 * import of its blob URL both names them and gives a completion to wait on.
 */
const installMediaReader = async (page: Page): Promise<void> => {
  const state = readerStateOf(page);
  if (state.holding) return;
  const bundle = await mediabunnyBundle();
  await page.evaluate(async (source) => {
    const bundleUrl = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
    try {
      const { ALL_FORMATS, BlobSource, Input, CanvasSink } = (await import(
        bundleUrl
      )) as Partial<MediaReader>;
      if (
        ALL_FORMATS === undefined ||
        BlobSource === undefined ||
        Input === undefined ||
        CanvasSink === undefined
      ) {
        throw new Error('The media reader loaded without the names these probes use.');
      }
      (window as ReaderWindow).__lightframeMediaReader = {
        ALL_FORMATS,
        BlobSource,
        Input,
        CanvasSink,
      };
    } finally {
      URL.revokeObjectURL(bundleUrl);
    }
  }, bundle);
  // After the evaluate rather than before it: a navigation part-way through destroys the execution
  // context and rejects, so this cannot record a reader that the next document never received.
  state.holding = true;
};

/**
 * Decodes the first frame of a video the page can fetch — a blob URL it is holding, or one of the
 * app's own content routes — and counts ink in two bands of it.
 *
 * Bands are fractions of the decoded frame's height, so the caller states where the caption should
 * be without restating how the frame was sized.
 */
export const readRenderedFrameInk = async (
  page: Page,
  mediaUrl: string,
  bands: Readonly<{ caption: FrameBand; control: FrameBand }>,
  thresholds: InkThresholds,
): Promise<FrameInk> => {
  await installMediaReader(page);
  return page.evaluate(
    async ({ url, bandRatios, limits }) => {
      const reader = (window as ReaderWindow).__lightframeMediaReader;
      if (!reader) throw new Error('The page media reader was not installed.');
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`The rendered output was not readable (${response.status}).`);
      }
      const input = new reader.Input({
        formats: reader.ALL_FORMATS,
        source: new reader.BlobSource(await response.blob()),
      });
      try {
        const track = await input.getPrimaryVideoTrack();
        if (!track) throw new Error('The rendered output holds no video track.');
        const sink = new reader.CanvasSink(track);
        const decoded = await sink.getCanvas(await track.getFirstTimestamp());
        if (!decoded) throw new Error('The rendered output decoded no frame.');
        const { canvas } = decoded;
        // Each canvas kind declares its own `getContext` overloads; calling through the union
        // collapses them, the way `videoEditShader.ts` describes for the WebGL context.
        const context =
          canvas instanceof HTMLCanvasElement ? canvas.getContext('2d') : canvas.getContext('2d');
        if (!context) throw new Error('The decoded frame exposes no 2D context.');
        const measure = (band: FrameBand): BandInk => {
          const from = Math.max(0, Math.round(band.fromRatio * canvas.height));
          const to = Math.min(canvas.height, Math.round(band.toRatio * canvas.height));
          const { data } = context.getImageData(0, from, canvas.width, Math.max(1, to - from));
          let bright = 0;
          let dark = 0;
          for (let offset = 0; offset < data.length; offset += 4) {
            const luma =
              0.2126 * (data[offset] ?? 0) +
              0.7152 * (data[offset + 1] ?? 0) +
              0.0722 * (data[offset + 2] ?? 0);
            if (luma >= limits.bright) bright += 1;
            else if (luma <= limits.dark) dark += 1;
          }
          return { pixels: data.length / 4, bright, dark };
        };
        return {
          width: canvas.width,
          height: canvas.height,
          caption: measure(bandRatios.caption),
          control: measure(bandRatios.control),
        };
      } finally {
        input.dispose();
      }
    },
    { url: mediaUrl, bandRatios: bands, limits: thresholds },
  );
};

/**
 * What this browser says about a file's own video configuration, and the codec it was asked about.
 *
 * The answer is a property of the machine the suite is running on — Chromium ships no software
 * HEVC decoder, so a GPU-less runner refuses what a laptop converts — which is why a journey over
 * a codec this product cannot publish has to ask rather than assume.
 */
export const readVideoDecoderSupport = async (
  page: Page,
  video: Buffer,
): Promise<DecoderSupport> => {
  await installMediaReader(page);
  return page.evaluate(async (base64) => {
    const reader = (window as ReaderWindow).__lightframeMediaReader;
    if (!reader) throw new Error('The page media reader was not installed.');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    const input = new reader.Input({
      formats: reader.ALL_FORMATS,
      source: new reader.BlobSource(new Blob([bytes])),
    });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error('The fixture holds no video track.');
      const config = await track.getDecoderConfig().catch(() => null);
      const codec = config?.codec ?? (await track.getCodec()) ?? 'unknown';
      if (!config || typeof VideoDecoder === 'undefined') return { codec, supported: false };
      const support = await VideoDecoder.isConfigSupported(config).catch(() => null);
      return { codec, supported: support?.supported === true };
    } finally {
      input.dispose();
    }
  }, video.toString('base64'));
};
