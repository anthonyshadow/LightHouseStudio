/**
 * How much of the viewport the Save panel's fixed action claims, counted from the bottom.
 *
 * The bar is positioned against the viewport, so padding inside the scrolling container cannot
 * clear it — a scrollport reaches its own padding edge, and content keeps travelling underneath at
 * every position except the very bottom. The container gives up this strip instead, and the bar
 * occupies the space it vacated. The shell's `mainGridStyles` reserves it and
 * `saveActionBarStyles` rests the bar on the matching inset, so the two cannot drift apart.
 *
 * These live in a module of their own because the shell reads them eagerly: importing them from
 * the Save panel's stylesheet would pull that whole file out of the lazily loaded Project chunk
 * and into the authenticated shell, which `check:build-manifest` holds to a budget.
 */

/** The strip the shell's fixed mobile navigation occupies below `compact`. */
const MOBILE_NAVIGATION_CLEARANCE = '4.5rem';

/** The action's own height: one primary control plus the bar's padding. */
const SAVE_ACTION_BAR_HEIGHT = '4.5rem';

/** Where the fixed action rests below `laptop`: clear of the panel edge. */
export const SAVE_ACTION_BAR_INSET = '1rem';

/** And below `compact`, where it must also clear the shell's mobile navigation. */
export const SAVE_ACTION_BAR_INSET_COMPACT = `calc(${MOBILE_NAVIGATION_CLEARANCE} + env(safe-area-inset-bottom) + 0.75rem)`;

/**
 * The narrowest tier reuses the compact reservation, which over-reserves by a few pixels against a
 * bar that has shed its padding there — room to spare cannot occlude anything.
 */
export const SAVE_ACTION_BAR_INSET_NARROW = `calc(${MOBILE_NAVIGATION_CLEARANCE} + env(safe-area-inset-bottom) + 0.25rem)`;

export const SAVE_ACTION_CLEARANCE = `calc(${SAVE_ACTION_BAR_INSET} + ${SAVE_ACTION_BAR_HEIGHT})`;
export const SAVE_ACTION_CLEARANCE_COMPACT = `calc(${SAVE_ACTION_BAR_INSET_COMPACT} + ${SAVE_ACTION_BAR_HEIGHT})`;
