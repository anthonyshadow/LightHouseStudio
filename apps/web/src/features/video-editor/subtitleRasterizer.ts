import {
  SUBTITLE_LAYOUT,
  stackSubtitleCues,
  subtitleBlockBox,
  subtitleCuesAt,
  subtitlePlacementsUsed,
  type SubtitleCue,
} from '@studio/domain';
import type { RenderCanvas } from './videoEditShader';

/**
 * Where the output frame sits inside the overlay canvas, in canvas pixels. Normally the whole
 * canvas; in the editor's crop mode the displayed frame is the uncropped source, so the frame is
 * the crop rectangle and captions lay out inside it exactly as the export will.
 */
export type SubtitleLayoutBox = Readonly<{ x: number; y: number; width: number; height: number }>;

/**
 * The face captions are drawn in. The same stack the interface uses (`theme.type.sans`), stated
 * here because a worker has no theme, and stated once so the preview and the export cannot pick
 * different faces on the same device.
 */
const SUBTITLE_FONT_FAMILY =
  'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const BOX_FILL = 'rgba(0, 0, 0, 0.55)';
const TEXT_FILL = '#ffffff';

type Canvas2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

/**
 * What a frame would draw, as a string: the active cues' identities, texts and regions, and the
 * frame they lay out in. Rasterization runs when this changes and never per frame, and an empty
 * set has an empty key so "nothing to draw" is the cheapest case.
 */
export const subtitleOverlayKey = (
  active: readonly SubtitleCue[],
  frame: SubtitleLayoutBox,
): string =>
  active.length === 0
    ? ''
    : JSON.stringify([
        frame.x,
        frame.y,
        frame.width,
        frame.height,
        active.map((cue) => [cue.id, cue.text, cue.placement]),
      ]);

// Both canvas kinds answer '2d' with the same drawing surface; only their overload sets differ.
const canvas2d = (canvas: RenderCanvas): Canvas2D | null =>
  (canvas as HTMLCanvasElement).getContext('2d');

/** A laid-out line: its text and the width it measured at, so nothing measures it twice. */
export type SubtitleLine = Readonly<{ text: string; width: number }>;

const measured = (context: Canvas2D, text: string): SubtitleLine => ({
  text,
  width: context.measureText(text).width,
});

const breakWord = (context: Canvas2D, word: string, maxWidth: number): SubtitleLine[] => {
  const pieces: SubtitleLine[] = [];
  let piece = measured(context, '');
  for (const character of word) {
    const candidate = measured(context, piece.text + character);
    if (piece.text !== '' && candidate.width > maxWidth) {
      pieces.push(piece);
      piece = measured(context, character);
    } else {
      piece = candidate;
    }
  }
  if (piece.text !== '') pieces.push(piece);
  return pieces;
};

const wrapParagraph = (context: Canvas2D, paragraph: string, maxWidth: number): SubtitleLine[] => {
  const lines: SubtitleLine[] = [];
  let line = measured(context, '');
  for (const word of paragraph.split(/\s+/u).filter((entry) => entry.length > 0)) {
    const candidate = measured(context, line.text === '' ? word : `${line.text} ${word}`);
    if (candidate.width <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line.text !== '') lines.push(line);
    const pieces = breakWord(context, word, maxWidth);
    line = pieces.pop() ?? measured(context, '');
    lines.push(...pieces);
  }
  if (line.text !== '') lines.push(line);
  return lines;
};

/** Greedy word wrap to a width, honouring the cue's own line breaks; a word wider than the box breaks by character. */
export const wrapSubtitleText = (
  context: Canvas2D,
  text: string,
  maxWidth: number,
): SubtitleLine[] =>
  text
    .split('\n')
    .flatMap((paragraph) =>
      paragraph.trim() === '' ? [] : wrapParagraph(context, paragraph, maxWidth),
    );

/**
 * Draws every active cue onto the canvas, region by region in `stackSubtitleCues` order: white
 * bold text on a rounded translucent box per line, centred, wrapped to the region's width. The
 * geometry is the domain's, in fractions of the frame, so a 1280-wide preview and a 1920-wide
 * export place text identically — and the box the chooser's crop check reads is the box drawn.
 */
export const rasterizeSubtitleCues = (
  canvas: RenderCanvas,
  active: readonly SubtitleCue[],
  frame: SubtitleLayoutBox,
): void => {
  const context = canvas2d(canvas);
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (active.length === 0) return;

  const fontPx = Math.round(frame.height * SUBTITLE_LAYOUT.fontHeightRatio);
  const lineHeight = fontPx * SUBTITLE_LAYOUT.lineHeightRatio;
  const maxWidth = frame.width * SUBTITLE_LAYOUT.maxWidthRatio;
  const paddingX = fontPx * 0.35;
  const cueGap = lineHeight * SUBTITLE_LAYOUT.cueGapRatio;
  const radius = fontPx * 0.25;
  const centreX = frame.x + frame.width / 2;
  context.font = `bold ${fontPx}px ${SUBTITLE_FONT_FAMILY}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  const stacked = stackSubtitleCues(active);
  for (const placement of subtitlePlacementsUsed(active)) {
    const blocks = stacked[placement].map((cue) => wrapSubtitleText(context, cue.text, maxWidth));
    const lineCount = blocks.reduce((sum, lines) => sum + lines.length, 0);
    const box = subtitleBlockBox(placement, frame, lineCount, blocks.length);
    // The stack lists cues from the frame's edge inward; drawing runs top to bottom, so at the
    // bottom the later cues come first on the way down and the earliest lands lowest.
    const ordered = placement === 'bottom' ? [...blocks].reverse() : blocks;
    let y = frame.y + box.y * frame.height;
    for (const lines of ordered) {
      for (const { text, width } of lines) {
        context.fillStyle = BOX_FILL;
        context.beginPath();
        context.roundRect(
          centreX - width / 2 - paddingX,
          y,
          width + paddingX * 2,
          lineHeight,
          radius,
        );
        context.fill();
        context.fillStyle = TEXT_FILL;
        context.fillText(text, centreX, y + lineHeight / 2);
        y += lineHeight;
      }
      y += cueGap;
    }
  }
};

/**
 * The one owner of "rasterize when the cues on screen change, never per frame". Both canvases —
 * the page's preview and the worker's output — get a sync from here, supplying only the canvas
 * they draw on and the renderer that composites it, so the caching rule cannot drift between the
 * preview and the export it promises to match.
 */
export const createSubtitleOverlaySync = (
  createCanvas: () => RenderCanvas,
  setOverlay: (overlay: RenderCanvas | null) => void,
): ((cues: readonly SubtitleCue[], timeMs: number, frame: SubtitleLayoutBox) => void) => {
  let canvas: RenderCanvas | null = null;
  let key = '';
  return (cues, timeMs, frame) => {
    const active = subtitleCuesAt(cues, timeMs);
    const nextKey = subtitleOverlayKey(active, frame);
    if (nextKey === key) return;
    key = nextKey;
    if (active.length === 0) {
      setOverlay(null);
      return;
    }
    canvas ??= createCanvas();
    rasterizeSubtitleCues(canvas, active, frame);
    setOverlay(canvas);
  };
};
