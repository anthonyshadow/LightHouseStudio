// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import type { SubtitleCue } from '@studio/domain';
import {
  createSubtitleOverlaySync,
  rasterizeSubtitleCues,
  subtitleOverlayKey,
  wrapSubtitleText,
  type SubtitleLayoutBox,
} from './subtitleRasterizer';

/** Every character is ten pixels wide, whatever the font, so widths are arithmetic. */
const CHARACTER_WIDTH = 10;

const scriptedCanvas = (width = 1_000, height = 1_000) => {
  const texts: [string, number, number][] = [];
  const boxes: [number, number, number, number][] = [];
  const context = {
    font: '',
    textAlign: '',
    textBaseline: '',
    fillStyle: '',
    clearRect: vi.fn(),
    measureText: (text: string) => ({ width: text.length * CHARACTER_WIDTH }),
    beginPath: vi.fn(),
    roundRect: vi.fn((x: number, y: number, w: number, h: number) => boxes.push([x, y, w, h])),
    rect: vi.fn(),
    fill: vi.fn(),
    fillText: vi.fn((text: string, x: number, y: number) => texts.push([text, x, y])),
  };
  const canvas = {
    width,
    height,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
  return { canvas, context, texts, boxes };
};

const cue = (overrides: Partial<SubtitleCue> & Pick<SubtitleCue, 'id'>): SubtitleCue => ({
  text: 'Hello',
  startMs: 0,
  endMs: 1_000,
  placement: 'bottom',
  ...overrides,
});

const fullFrame = (width: number, height: number): SubtitleLayoutBox => ({
  x: 0,
  y: 0,
  width,
  height,
});

describe('subtitleRasterizer', () => {
  it('wraps words greedily, keeps explicit breaks, and breaks a word wider than the box', () => {
    const { context } = scriptedCanvas();
    const measured = context as unknown as CanvasRenderingContext2D;
    const texts = (text: string, maxWidth: number) =>
      wrapSubtitleText(measured, text, maxWidth).map((line) => line.text);
    expect(texts('one two three', 80)).toEqual(['one two', 'three']);
    expect(texts('a\n\nb', 80)).toEqual(['a', 'b']);
    expect(texts('abcdefghijkl', 50)).toEqual(['abcde', 'fghij', 'kl']);
    expect(texts('   ', 50)).toEqual([]);
    // Each line carries the width it was measured at, so drawing never measures it again.
    expect(wrapSubtitleText(measured, 'one two three', 80)[0]).toEqual({
      text: 'one two',
      width: 70,
    });
  });

  it('rasterizes once per change of the active set, reuses one canvas, and clears on empty', () => {
    const { canvas, context } = scriptedCanvas();
    const createCanvas = vi.fn(() => canvas);
    const setOverlay = vi.fn();
    const sync = createSubtitleOverlaySync(createCanvas, setOverlay);
    const frame = fullFrame(1_000, 1_000);
    const cues = [cue({ id: 'a', endMs: 2_000 }), cue({ id: 'b', startMs: 1_500, endMs: 3_000 })];

    sync(cues, 0, frame);
    sync(cues, 500, frame);
    expect(createCanvas).toHaveBeenCalledOnce();
    expect(context.clearRect).toHaveBeenCalledOnce();
    expect(setOverlay).toHaveBeenCalledExactlyOnceWith(canvas);

    sync(cues, 1_600, frame);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
    expect(setOverlay).toHaveBeenCalledTimes(2);

    sync(cues, 3_500, frame);
    expect(setOverlay).toHaveBeenLastCalledWith(null);
    expect(context.clearRect).toHaveBeenCalledTimes(2);
    expect(createCanvas).toHaveBeenCalledOnce();
  });

  it('keys the overlay on the active set and the frame, and on nothing when the set is empty', () => {
    const frame = fullFrame(1_000, 1_000);
    const active = [cue({ id: 'a' })];
    expect(subtitleOverlayKey([], frame)).toBe('');
    expect(subtitleOverlayKey(active, frame)).toBe(subtitleOverlayKey([cue({ id: 'a' })], frame));
    expect(subtitleOverlayKey(active, frame)).not.toBe(
      subtitleOverlayKey([cue({ id: 'a', text: 'Hi' })], frame),
    );
    expect(subtitleOverlayKey(active, frame)).not.toBe(
      subtitleOverlayKey([cue({ id: 'a', placement: 'top' })], frame),
    );
    expect(subtitleOverlayKey(active, frame)).not.toBe(
      subtitleOverlayKey(active, { ...frame, width: 500 }),
    );
    // Timing is not part of the key: a retimed cue draws the same pixels.
    expect(subtitleOverlayKey(active, frame)).toBe(
      subtitleOverlayKey([cue({ id: 'a', startMs: 5, endMs: 9 })], frame),
    );
  });

  it('places each region from the domain geometry at the frame type size, centred', () => {
    const { canvas, context, texts, boxes } = scriptedCanvas();
    // 1000×1000 is not portrait, so the landscape insets apply: 8 % top, 10 % bottom.
    rasterizeSubtitleCues(canvas, [cue({ id: 'bottom' })], fullFrame(1_000, 1_000));
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 1_000, 1_000);
    expect(context.font).toBe(
      'bold 45px Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    );
    // One line of 56.25 px whose bottom edge sits at 90 % of the frame.
    expect(texts).toHaveLength(1);
    expect(texts[0]![0]).toBe('Hello');
    expect(texts[0]![1]).toBeCloseTo(500);
    expect(texts[0]![2]).toBeCloseTo(900 - 56.25 / 2);
    expect(boxes[0]![1]).toBeCloseTo(900 - 56.25);
    expect(boxes[0]![3]).toBeCloseTo(56.25);
    // The box hugs the measured text plus padding, centred on the same axis.
    expect(boxes[0]![0]).toBeCloseTo(500 - 25 - 45 * 0.35);
    expect(boxes[0]![2]).toBeCloseTo(50 + 2 * 45 * 0.35);

    const top = scriptedCanvas();
    rasterizeSubtitleCues(
      top.canvas,
      [cue({ id: 'top', placement: 'top' })],
      fullFrame(1_000, 1_000),
    );
    expect(top.texts[0]![2]).toBeCloseTo(80 + 56.25 / 2);

    const middle = scriptedCanvas();
    rasterizeSubtitleCues(
      middle.canvas,
      [cue({ id: 'middle', placement: 'middle' })],
      fullFrame(1_000, 1_000),
    );
    expect(middle.texts[0]![2]).toBeCloseTo(500);
  });

  it('stacks simultaneous cues in one region toward the centre, earliest at the edge', () => {
    const { canvas, texts } = scriptedCanvas();
    rasterizeSubtitleCues(
      canvas,
      [
        cue({ id: 'later', text: 'Later', startMs: 500 }),
        cue({ id: 'earlier', text: 'Earlier', startMs: 0 }),
      ],
      fullFrame(1_000, 1_000),
    );
    // Drawn top to bottom: the later cue above, the earlier one lowest — exactly where it would
    // sit alone — with one gap of 0.2 em between them.
    expect(texts.map(([text]) => text)).toEqual(['Later', 'Earlier']);
    expect(texts[1]![2]).toBeCloseTo(900 - 56.25 / 2);
    expect(texts[0]![2]).toBeCloseTo(900 - 56.25 - 9 - 56.25 / 2);
  });

  it('lays out inside an offset frame, as crop mode asks, and draws nothing for no cues', () => {
    const { canvas, texts } = scriptedCanvas();
    const frame: SubtitleLayoutBox = { x: 100, y: 200, width: 500, height: 400 };
    rasterizeSubtitleCues(canvas, [cue({ id: 'a' })], frame);
    const fontPx = Math.round(400 * 0.045);
    const lineHeight = fontPx * 1.25;
    expect(texts[0]![1]).toBeCloseTo(350);
    expect(texts[0]![2]).toBeCloseTo(200 + 0.9 * 400 - lineHeight / 2);

    const empty = scriptedCanvas();
    rasterizeSubtitleCues(empty.canvas, [], fullFrame(1_000, 1_000));
    expect(empty.context.clearRect).toHaveBeenCalledOnce();
    expect(empty.texts).toHaveLength(0);
  });
});
