import { describe, expect, it } from 'vitest';
import { studioTheme } from './theme';

const channel = (value: number): number => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/** WCAG 2.1 relative luminance, from the sRGB hex the theme actually ships. */
const luminance = (hex: string): number => {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((offset) =>
    channel(Number.parseInt(value.slice(offset, offset + 2), 16)),
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a: string, b: string): number => {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (high + 0.05) / (low + 0.05);
};

/** Every background a boundary can be drawn against. */
const SURFACES = [
  'canvas',
  'canvasRaised',
  'surface',
  'surfaceStrong',
  'surfaceSoft',
] as const satisfies ReadonlyArray<keyof typeof studioTheme.colors>;

describe('theme boundary contrast', () => {
  /**
   * SC 1.4.11 requires 3:1 for the visual boundary of a UI component. Both tokens outline
   * controls — inputs and selects take `borderStrong`, selectable cards and chips take `border` —
   * so both are held to it against every surface, not just the one they are usually seen on.
   */
  it.each(['border', 'borderStrong'] as const)('keeps %s at 3:1 on every surface', (token) => {
    for (const surface of SURFACES) {
      const ratio = contrast(studioTheme.colors[token], studioTheme.colors[surface]);
      expect(
        ratio,
        `${token} on ${surface} is ${ratio.toFixed(2)}:1, below the 3:1 SC 1.4.11 requires`,
      ).toBeGreaterThanOrEqual(3);
    }
  });

  it('keeps borderStrong ahead of border, and both behind the faintest text', () => {
    const onCanvas = (token: keyof typeof studioTheme.colors): number =>
      contrast(studioTheme.colors[token], studioTheme.colors.canvas);

    expect(onCanvas('borderStrong')).toBeGreaterThan(onCanvas('border'));
    // Chrome that outshouts the faintest text would invert the hierarchy it is there to support.
    expect(onCanvas('borderStrong')).toBeLessThan(onCanvas('textFaint'));
  });

  it('leaves divider free of the component requirement it does not carry', () => {
    // A rule between stacked blocks bounds nothing interactive. It is exempt on purpose, and
    // deliberately lighter than `border`, so the two are never interchangeable by accident.
    expect(contrast(studioTheme.colors.divider, studioTheme.colors.canvas)).toBeLessThan(
      contrast(studioTheme.colors.border, studioTheme.colors.canvas),
    );
  });

  it('leaves the text tokens passing, as they already did', () => {
    for (const token of ['text', 'textMuted', 'textFaint'] as const) {
      for (const surface of SURFACES) {
        expect(contrast(studioTheme.colors[token], studioTheme.colors[surface])).toBeGreaterThan(3);
      }
    }
  });
});
