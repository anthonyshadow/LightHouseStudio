import { studioTheme } from './theme';

export type BreakpointName = keyof typeof studioTheme.breakpoints;

/**
 * `down()` has to exclude the boundary its `up()` partner claims, or a layout applies both rules at
 * exactly that width. Rounding down by 0.01rem is the convention CSS has no operator for, and doing
 * it here is the point: the repository previously wrote `39.99rem`, `47.99rem`, `63.99rem` and
 * `79.99rem` by hand beside `40rem`, `48rem`, `64rem` and `80rem`, and the two forms disagreed
 * about which side of the boundary they owned.
 */
const below = (value: string): string => {
  const rem = Number.parseFloat(value);
  return `${(rem - 0.01).toFixed(2)}rem`;
};

/**
 * The one place a viewport-tier media query is written.
 *
 * These name *page tiers*, not component thresholds. A card that reflows because its own content
 * stopped fitting should keep its own width — or better, become a container query — rather than
 * borrow a tier it has nothing to do with.
 */
export const media = {
  /** From this breakpoint upward, inclusive. */
  up: (name: BreakpointName): string => `@media (min-width: ${studioTheme.breakpoints[name]})`,
  /** Below this breakpoint, exclusive — the complement of `up(name)`. */
  down: (name: BreakpointName): string =>
    `@media (max-width: ${below(studioTheme.breakpoints[name])})`,
  /** One tier only: `from` inclusive, `to` exclusive, so adjacent bands cannot both apply. */
  between: (from: BreakpointName, to: BreakpointName): string =>
    `@media (min-width: ${studioTheme.breakpoints[from]}) and (max-width: ${below(
      studioTheme.breakpoints[to],
    )})`,
  /**
   * A tier or a short viewport. Nineteen call sites collapse the same layout for both reasons —
   * a phone, or a laptop with the browser chrome eating the window — and they should agree on
   * where the width half of that test falls.
   */
  downOrShort: (name: BreakpointName, maxHeight: string): string =>
    `@media (max-width: ${below(studioTheme.breakpoints[name])}), (max-height: ${maxHeight})`,
} as const;
