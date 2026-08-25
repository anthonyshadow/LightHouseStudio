import type { CSSObject, Theme } from '@emotion/react';
import { media } from '../ui/media';

export const pageStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100vh',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  padding: 0,
  background: theme.colors.canvas,
  '@supports (height: 100svh)': { height: '100svh' },
  '@supports (height: 100dvh)': { height: '100dvh' },
});

/**
 * One navigation chrome for every protected surface: a left rail from 48rem up, a compact top bar
 * plus the fixed bottom navigation below it. Studio, Dashboard, Projects, Campaigns and Assets all
 * render inside this same shell, so the layout never depends on which surface is active.
 */
export const shellStyles = (): CSSObject => ({
  '--studio-shell-rail-width': '11.5rem',
  width: '100%',
  height: '100%',
  display: 'grid',
  // The regions are named once, here, and each one states only which area it occupies. The
  // optional shell notice owns the first content row: absent, its wrapper is empty and the row
  // collapses to zero; present, it reduces the main viewport rather than overflowing the
  // navigation rail or covering the active surface.
  gridTemplateAreas: '"nav notice" "nav main"',
  gridTemplateColumns: '11.5rem minmax(0, 1fr)',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  gap: 0,
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  [media.up('laptop')]: {
    '--studio-shell-rail-width': '13.5rem',
    gridTemplateColumns: '13.5rem minmax(0, 1fr)',
  },
  [media.up('desktop')]: {
    '--studio-shell-rail-width': '15.5rem',
    gridTemplateColumns: '15.5rem minmax(0, 1fr)',
  },
  [media.down('compact')]: {
    '--studio-shell-rail-width': '0rem',
    gridTemplateAreas: '"nav" "notice" "main"',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateRows: '3.5rem auto minmax(0, 1fr)',
  },
});

export const headerRegionStyles = (theme: Theme): CSSObject => ({
  gridArea: 'nav',
  position: 'relative',
  zIndex: theme.layers.stageNotices + 1,
  minWidth: 0,
  minHeight: 0,
  overflow: 'visible',
  background: theme.colors.canvas,
  [media.up('compact')]: {
    borderInlineEnd: `1px solid ${theme.colors.divider}`,
  },
  [media.down('compact')]: {
    borderBlockEnd: `1px solid ${theme.colors.divider}`,
  },
});

/**
 * The bounded shell row for an actionable, shell-wide recovery notice.
 *
 * The navigation header has a fixed responsive footprint. Keeping such a notice inside that header
 * made it start below a full-height desktop rail and overflow a 3.5rem mobile bar, so it was either
 * unreachable or painted over the route masthead. Its own row stays visible without changing the
 * active surface's scroll ownership.
 *
 * The cap is the notice's own content first and the viewport second, so a long message scrolls
 * inside the row instead of consuming the surface below it. One bound serves both breakpoints:
 * this row is shell chrome, and must not be tuned to whichever route happens to sit under it.
 */
export const shellNoticeRegionStyles = (theme: Theme): CSSObject => ({
  gridArea: 'notice',
  display: 'grid',
  minWidth: 0,
  minHeight: 0,
  maxHeight: 'min(20rem, 44vh)',
  overflowX: 'hidden',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  background: theme.colors.canvas,
  '& > *': {
    margin: `${theme.space.sm} clamp(${theme.space.sm}, 2vw, ${theme.space.lg})`,
  },
  '@supports (height: 100dvh)': { maxHeight: 'min(20rem, 44dvh)' },
  [media.down('compact')]: {
    '& > *': { margin: `0 ${theme.space.xs}` },
  },
});

export const skipLinkStyles = (theme: Theme): CSSObject => ({
  position: 'fixed',
  zIndex: theme.layers.skipLink,
  insetBlockStart: theme.space.sm,
  insetInlineStart: theme.space.sm,
  padding: theme.space.sm,
  borderRadius: theme.radii.small,
  color: theme.colors.canvas,
  background: theme.colors.accent,
  fontWeight: 800,
  transform: 'translateY(-180%)',
  '&:focus': { transform: 'translateY(0)' },
});

export const headerStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  height: '100%',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.md,
  minWidth: 0,
  [media.up('compact')]: {
    display: 'grid',
    /*
     * The fourth row is the gap between the destinations and the bottom cluster. It was `1fr`,
     * which on a tall viewport pushed the cluster to the far edge and left a third of the rail
     * empty. Capped, the rail reads as one column: the cluster still sits below everything else,
     * just not at the end of a void.
     */
    gridTemplateRows: `auto auto auto minmax(${theme.space.xl}, 6rem) auto`,
    alignContent: 'start',
    alignItems: 'stretch',
    justifyContent: 'initial',
    gap: 0,
    padding: theme.space.lg,
  },
  [media.up('laptop')]: { padding: theme.space.xl },
  [media.down('compact')]: {
    paddingInline: `max(${theme.space.md}, env(safe-area-inset-left)) max(${theme.space.md}, env(safe-area-inset-right))`,
    gap: theme.space.xs,
  },
  '@media (max-width: 22rem)': { paddingInline: theme.space.md },
});

export const headerActionsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: theme.space.sm,
  flex: '0 0 auto',
  '& [data-create-action], & [data-utility-actions]': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.space.sm,
  },
  [media.up('compact')]: {
    display: 'contents',
    '& [data-create-action]': {
      gridRow: 2,
      display: 'block',
      marginBlockEnd: '1.75rem',
    },
    '& [data-utility-actions]': {
      gridRow: 5,
      display: 'grid',
      alignItems: 'stretch',
      gap: theme.space.sm,
      paddingBlockStart: theme.space.md,
      borderBlockStart: `1px solid ${theme.colors.divider}`,
    },
  },
  [media.down('compact')]: {
    gap: theme.space.xs,
    '& [data-create-action], & [data-utility-actions]': { gap: theme.space.xs },
  },
});

export const primaryNavigationStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flex: '0 0 auto',
  alignItems: 'center',
  gap: theme.space.xxs,
  padding: theme.space.xxs,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.round,
  background: theme.colors.canvasRaised,
  '& > button': {
    minHeight: '2.4rem',
    minWidth: 0,
    padding: `0.45rem ${theme.space.md}`,
    borderRadius: theme.radii.round,
    fontSize: theme.fontSizes.metadata,
    whiteSpace: 'nowrap',
  },
  '& > button[aria-current="page"]': {
    color: theme.colors.onAccent,
    background: theme.colors.accent,
  },
  '& [data-nav-icon]': { display: 'none' },
  [media.up('compact')]: {
    gridRow: 3,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 0,
    padding: 0,
    border: 0,
    borderRadius: 0,
    background: 'transparent',
    '& > button': {
      position: 'relative',
      width: '100%',
      minHeight: '2.75rem',
      justifyContent: 'flex-start',
      gap: theme.space.sm,
      padding: `${theme.space.xs} 0`,
      borderRadius: theme.radii.small,
      color: theme.colors.textMuted,
      background: 'transparent',
      fontSize: theme.fontSizes.body,
      whiteSpace: 'normal',
    },
    '& > button[aria-current="page"]': {
      color: theme.colors.text,
      background: 'transparent',
    },
    '& > button[aria-current="page"]::before': {
      position: 'absolute',
      insetBlock: '0.85rem',
      insetInlineStart: `-${theme.space.md}`,
      width: '2px',
      background: theme.colors.accent,
      content: '""',
    },
    '& > button:hover:not(:disabled)': { background: theme.colors.surfaceSoft },
    '& [data-nav-icon]': {
      width: '1.1rem',
      height: '1.1rem',
      display: 'block',
      flex: '0 0 auto',
      color: theme.colors.textFaint,
    },
    '& > button[aria-current="page"] [data-nav-icon]': { color: theme.colors.accent },
  },
  [media.down('compact')]: { display: 'none' },
});

/** The header brand with the wordmark column removed, leaving the logo mark on its own. */
const brandMarkOnly: CSSObject = { gridTemplateColumns: '2rem', '& > div': { display: 'none' } };

export const brandStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'inline-grid',
  gridTemplateColumns: '2.4rem minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.sm,
  padding: theme.space.xxs,
  border: 0,
  borderRadius: theme.radii.medium,
  color: theme.colors.text,
  background: 'transparent',
  textAlign: 'start',
  cursor: 'pointer',
  '& img': { width: '2.35rem', height: '2.35rem' },
  '& > div': { minWidth: 0 },
  '& span': {
    display: 'block',
    marginBlockStart: '0.1rem',
    color: theme.colors.accent,
    fontSize: '0.68rem',
    fontWeight: 850,
    letterSpacing: '0.15em',
    textTransform: 'uppercase',
  },
  '& strong': {
    display: 'block',
    margin: 0,
    overflow: 'hidden',
    fontFamily: theme.type.display,
    fontSize: 'clamp(1.05rem, 2vw, 1.35rem)',
    letterSpacing: '-0.025em',
    // The product's name is never broken mid-word. The column is `minmax(0, 1fr)`, so without
    // this it wrapped to `Ligh / tfra / me` on the first authenticated screen at 320px.
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  '&:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '2px' },
  '&:hover': { background: theme.colors.surfaceSoft },
  [media.up('compact')]: {
    gridRow: 1,
    gridTemplateColumns: '2rem minmax(0, 1fr)',
    alignSelf: 'start',
    padding: 0,
    marginBlockEnd: theme.space.xl,
    '& img': { width: '2rem', height: '2rem' },
    '& strong': { fontSize: theme.fontSizes.section },
    '& span': { fontSize: '0.62rem' },
  },
  [media.down('compact')]: {
    gridTemplateColumns: '2rem minmax(0, 1fr)',
    padding: 0,
    '& img': { width: '2rem', height: '2rem' },
    '& span': { display: 'none' },
    '& strong': { fontSize: theme.fontSizes.label },
  },
  // Below this the header row cannot hold the wordmark and the action cluster. The button keeps
  // its `aria-label`, so the destination is still announced.
  '@media (max-width: 22rem)': brandMarkOnly,
});

export const mobileNavigationStyles = (theme: Theme): CSSObject => ({
  display: 'none',
  [media.down('compact')]: {
    position: 'fixed',
    zIndex: theme.layers.stageNotices + 2,
    insetInline: 0,
    insetBlockEnd: 0,
    minHeight: `calc(4.5rem + env(safe-area-inset-bottom))`,
    display: 'grid',
    // Equal columns, however many destinations the bar carries; a count here would be one more
    // thing to keep in step with the list that decides it.
    gridAutoFlow: 'column',
    gridAutoColumns: 'minmax(0, 1fr)',
    gap: theme.space.xxs,
    padding: `${theme.space.xxs} max(${theme.space.xs}, env(safe-area-inset-right)) max(${theme.space.xxs}, env(safe-area-inset-bottom)) max(${theme.space.xs}, env(safe-area-inset-left))`,
    borderBlockStart: `1px solid ${theme.colors.borderStrong}`,
    background: theme.colors.canvasRaised,
    '& button': {
      minWidth: 0,
      minHeight: '3.5rem',
      flexDirection: 'column',
      gap: '0.18rem',
      paddingInline: theme.space.xxs,
      borderRadius: theme.radii.small,
      fontSize: '0.65rem',
    },
    '& button svg': { width: '1.05rem', height: '1.05rem' },
    '& button[aria-current="page"]': {
      color: theme.colors.accent,
      background: 'transparent',
    },
  },
});

export const createMenuStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  flex: '0 0 auto',
  '& [data-create-menu]': {
    position: 'absolute',
    zIndex: theme.layers.overlay,
    insetBlockStart: 'calc(100% + .45rem)',
    insetInlineEnd: 0,
    width: 'min(17rem, calc(100vw - 1rem))',
    display: 'grid',
    gap: theme.space.xxs,
    padding: theme.space.sm,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.large,
    background: theme.colors.overlaySurface,
    boxShadow: theme.shadows.lifted,
  },
  '& [data-create-menu] > button': { width: '100%', justifyContent: 'flex-start' },
  '& [data-create-menu] small': {
    display: 'block',
    padding: theme.space.xs,
    color: theme.colors.textMuted,
    lineHeight: 1.4,
  },
  width: '100%',
  [media.up('compact')]: {
    '& > button': {
      width: '100%',
      minHeight: '2.75rem',
      justifyContent: 'center',
      paddingInline: theme.space.xs,
      borderRadius: theme.radii.small,
      boxShadow: 'none',
      whiteSpace: 'nowrap',
    },
    '& [data-create-menu]': {
      insetBlockStart: 0,
      insetInlineStart: `calc(100% + ${theme.space.sm})`,
      insetInlineEnd: 'auto',
    },
  },
  [media.down('compact')]: {
    width: 'auto',
    '& > button': { minWidth: '2.75rem', paddingInline: theme.space.sm },
    '& [data-create-label-long]': { display: 'none' },
    '& [data-create-menu]': {
      position: 'fixed',
      insetBlockStart: '4rem',
      insetInline: theme.space.xs,
      width: 'auto',
    },
  },
});

export const capabilityStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  flex: '0 0 auto',
  '& > button': {
    minHeight: '2.75rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.space.xs,
    padding: `0.45rem ${theme.space.sm}`,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.round,
    color: theme.colors.textMuted,
    background: theme.colors.canvasRaised,
    fontSize: theme.fontSizes.caption,
    fontWeight: 760,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    transition: `color ${theme.motion.quick}, border-color ${theme.motion.quick}, background ${theme.motion.quick}`,
    '&:hover': {
      color: theme.colors.text,
      borderColor: theme.colors.borderStrong,
      background: theme.colors.surface,
    },
  },
  '& > button:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
  '& > button[aria-expanded="true"]': {
    borderColor: theme.colors.accent,
    color: theme.colors.text,
    background: theme.colors.surface,
  },
  width: '100%',
  [media.up('compact')]: {
    '& > button': {
      width: '100%',
      justifyContent: 'flex-start',
      padding: theme.space.xxs,
      borderColor: 'transparent',
      borderRadius: theme.radii.small,
      background: 'transparent',
      color: theme.colors.textFaint,
      fontSize: '0.68rem',
      letterSpacing: '0.03em',
    },
    '& > button:hover': {
      borderColor: 'transparent',
      background: theme.colors.surfaceSoft,
    },
  },
  [media.down('compact')]: {
    width: 'auto',
    '& > button': {
      width: '2.75rem',
      height: '2.75rem',
      justifyContent: 'center',
      padding: 0,
    },
    '& [data-system-label]': { display: 'none' },
  },
});

export const systemStatusDotStyles = (
  theme: Theme,
  state: 'ready' | 'loading' | 'limited',
): CSSObject => ({
  width: '0.48rem',
  height: '0.48rem',
  flex: '0 0 auto',
  borderRadius: '50%',
  background:
    state === 'ready'
      ? theme.colors.accent
      : state === 'loading'
        ? theme.colors.warning
        : theme.colors.danger,
  boxShadow: `0 0 0 0.18rem ${
    state === 'ready'
      ? theme.colors.accentSoft
      : state === 'loading'
        ? theme.colors.warningSoft
        : theme.colors.dangerSoft
  }`,
});

export const capabilityDetailStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  zIndex: theme.layers.stageNotices,
  insetBlockStart: 'calc(100% + 0.45rem)',
  insetInlineEnd: 0,
  width: 'min(20rem, calc(100vw - 1rem))',
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.large,
  background: theme.colors.overlaySurface,
  boxShadow: theme.shadows.lifted,
  backdropFilter: 'blur(14px)',
  '& [data-capability-heading]': {
    display: 'grid',
    gap: theme.space.xxs,
    paddingBlockEnd: theme.space.sm,
    borderBottom: `1px solid ${theme.colors.divider}`,
    '& > strong': { color: theme.colors.text, fontSize: theme.fontSizes.body },
    '& > span': { color: theme.colors.textMuted, fontSize: theme.fontSizes.caption },
  },
  '& span': {
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.space.md,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
  },
  '& strong': { color: theme.colors.text, fontWeight: 760 },
  '& small': {
    paddingBlockStart: theme.space.sm,
    borderTop: `1px solid ${theme.colors.divider}`,
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.45,
  },
  [media.up('compact')]: {
    insetBlockStart: 'auto',
    insetBlockEnd: 0,
    insetInlineStart: `calc(100% + ${theme.space.sm})`,
    insetInlineEnd: 'auto',
  },
  [media.down('compact')]: {
    position: 'fixed',
    insetInline: theme.space.xs,
    insetBlockStart: '4rem',
    width: 'auto',
  },
});

export const mainGridStyles = (
  projectContextActive = false,
  dashboardRouteActive = false,
): CSSObject => ({
  gridArea: 'main',
  display: 'grid',
  gridTemplateColumns: projectContextActive
    ? 'minmax(0, 1.45fr) minmax(20rem, 25rem)'
    : 'minmax(0, 1fr)',
  gridTemplateRows: projectContextActive ? '3rem minmax(0, 1fr)' : 'minmax(0, 1fr)',
  gap: 0,
  alignItems: 'stretch',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  outline: 'none',
  ...(!dashboardRouteActive && !projectContextActive
    ? { padding: 'clamp(0.75rem, 2vw, 1.5rem)' }
    : {}),
  /** Clears the fixed bottom navigation the shell renders below 48rem. */
  [media.down('compact')]: {
    paddingBlockEnd: `max(4.5rem, calc(env(safe-area-inset-bottom) + 4.5rem))`,
  },
  ...(projectContextActive
    ? {
        [media.down('laptop')]: {
          gridTemplateColumns: 'minmax(0, 1fr)',
          gridTemplateRows: '3rem auto auto',
          alignContent: 'start',
          containerType: 'inline-size',
          overflowX: 'hidden',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
        },
      }
    : {}),
  '&:has(> [data-video-edit-active="true"])': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateRows: 'minmax(0, 1fr)',
    padding: 0,
    overflow: 'hidden',
  },
  '&:has(> [data-video-edit-active="true"][data-project-context="true"]) > [data-project-route]': {
    display: 'none',
  },
});

/*
 * The stage is the work, so the two columns beside it are sized to their content rather than to a
 * comfortable band: the tool rail holds three labelled buttons, and a collapsed capture column
 * holds two device rows and a control. Every rem taken back here is width the 16:9 frame can use,
 * and width is what binds it — the column is far taller than 16:9 of itself.
 *
 * Named because three layout branches must agree on them.
 */
const STUDIO_COLUMNS = 'minmax(10.5rem, 13rem) minmax(0, 1fr) minmax(16rem, 18rem)';
const STUDIO_COLUMNS_CAPTURE_COLLAPSED =
  'minmax(10.5rem, 13rem) minmax(0, 1fr) minmax(10rem, 11.5rem)';

export const stageColumnStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  isolation: 'isolate',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gridTemplateRows: 'minmax(0, 1fr) 3.4rem 3rem',
  gap: theme.space.sm,
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  '&[hidden]': { display: 'none' },
  '& > [data-media-stage-layout]': { gridColumn: 1, gridRow: 1 },
  '& > [data-studio-tool-rail]': { gridColumn: 1, gridRow: 2 },
  '& > [data-capture-controls]': { gridColumn: 1, gridRow: 3 },
  '&:fullscreen': {
    display: 'block',
    padding: 0,
    background: theme.colors.canvas,
  },
  '&:fullscreen > [data-media-stage-layout]': {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    padding: theme.space.sm,
    border: 0,
    borderRadius: 0,
  },
  '&:fullscreen [data-stage-frame]': {
    width: '100%',
    height: '100%',
    aspectRatio: 'auto',
    border: 0,
    borderRadius: 0,
  },
  '&:fullscreen > [data-studio-tool-rail], &:fullscreen > [data-capture-controls]': {
    display: 'none',
  },
  [media.downOrShort('desktop', '48rem')]: {
    gap: theme.space.xs,
    gridTemplateRows: 'minmax(0, 1fr) 3.15rem 2.85rem',
  },
  '&[data-video-edit-active="true"]': {
    gridTemplateRows: 'minmax(8rem, 1fr) 3.15rem minmax(11rem, 38vh)',
  },
  '&[data-project-context="true"]': {
    gridColumn: 1,
    gridRow: 2,
    gridTemplateColumns: 'minmax(0, 1fr)',
    gridTemplateRows: 'minmax(0, 1fr) 3.4rem',
    gap: theme.space.sm,
    padding: `clamp(${theme.space.sm}, 1.4vw, ${theme.space.md})`,
    '& > [data-media-stage-layout]': { gridColumn: 1, gridRow: 1 },
    '& > [data-studio-tool-rail]': {
      gridColumn: 1,
      gridRow: 2,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.xs,
      padding: '0.3rem',
      '& > button': {
        flex: '1 1 0',
        width: 'auto',
        height: '100%',
        minHeight: '2.75rem',
        justifyContent: 'center',
        padding: `${theme.space.xxs} ${theme.space.sm}`,
        whiteSpace: 'nowrap',
      },
    },
    '&[data-video-edit-active="true"]': {
      gridTemplateRows: 'minmax(8rem, 1fr) 3.15rem minmax(11rem, 38vh)',
    },
  },
  [media.down('tablet')]: {
    gridTemplateRows: 'minmax(0, 1fr) 3.15rem 2.85rem',
    '&[data-video-edit-active="true"]': {
      gridTemplateRows: 'minmax(8rem, 1fr) 3.15rem minmax(10.5rem, 42vh)',
    },
  },
  [`${media.down('laptop')} and (min-width: 0px)`]: {
    '&[data-project-context="true"]': {
      alignSelf: 'start',
      boxSizing: 'border-box',
      height: 'calc((100cqw - 1.5rem) * 0.5625 + 6.5rem)',
      gridTemplateRows: 'auto 4.25rem',
      gap: theme.space.sm,
      padding: theme.space.sm,
      overflow: 'visible',
      '& > [data-media-stage-layout]': {
        width: '100%',
        height: 'auto',
      },
      '& > [data-media-stage-layout] [data-stage-frame]': {
        width: '100%',
        height: 'auto',
        maxHeight: 'none',
        aspectRatio: '16 / 9',
      },
      '&[data-video-edit-active="true"]': {
        height: 'calc((100cqw - 1.5rem) * 0.5625 + 6.5rem + max(11rem, 38vh))',
        gridTemplateRows: 'auto 4.25rem minmax(11rem, 38vh)',
      },
    },
  },
  '@media (max-width: 20rem), (max-height: 36rem)': {
    gridTemplateRows: 'minmax(0, 1fr) 3rem 2.75rem',
    '&[data-video-edit-active="true"]': {
      gridTemplateRows: 'minmax(7rem, 1fr) 3rem minmax(9.5rem, 43vh)',
    },
    '&[data-project-context="true"]': {
      height: 'calc((100cqw - 1.5rem) * 0.5625 + 6.25rem)',
      gridTemplateRows: 'auto 4rem',
      '&[data-video-edit-active="true"]': {
        height: 'calc((100cqw - 1.5rem) * 0.5625 + 6.25rem + max(9.5rem, 43vh))',
        gridTemplateRows: 'auto 4rem minmax(9.5rem, 43vh)',
      },
    },
  },
  [media.up('laptop')]: {
    gridTemplateColumns: STUDIO_COLUMNS,
    gridTemplateRows: 'minmax(0, 1fr)',
    gap: theme.space.md,
    '& > [data-media-stage-layout]': { gridColumn: 2, gridRow: 1 },
    '& > [data-studio-tool-rail]': { gridColumn: 1, gridRow: 1 },
    '& > [data-capture-controls]': { gridColumn: 3, gridRow: 1 },
    /*
     * Collapsed capture settings hand most of their column to the stage, keeping only what has to
     * stay readable: the current devices, any blocked camera, and the control that reopens the
     * panel. The column stays put rather than moving, so opening the panel does not relocate what
     * the operator just clicked.
     */
    '&[data-capture-settings="collapsed"]': {
      gridTemplateColumns: STUDIO_COLUMNS_CAPTURE_COLLAPSED,
    },
    '&[data-video-edit-active="true"]': {
      gridTemplateRows: 'minmax(0, 1fr)',
    },
    '&[data-project-context="true"]': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: 'minmax(0, 1fr) 3.4rem',
      gap: theme.space.sm,
      '& > [data-media-stage-layout]': { gridColumn: 1, gridRow: 1 },
      '& > [data-studio-tool-rail]': { gridColumn: 1, gridRow: 2 },
      '&[data-video-edit-active="true"]': {
        gridTemplateRows: 'minmax(0, 1fr)',
        gridTemplateColumns: STUDIO_COLUMNS,
        '& > [data-media-stage-layout]': { gridColumn: 2, gridRow: 1 },
        '& > [data-studio-tool-rail]': { gridColumn: 1, gridRow: 1 },
        '& > [data-capture-controls]': { gridColumn: 3, gridRow: 1 },
      },
    },
  },
  [`${media.up('laptop')} and (max-height: 48rem)`]: {
    gap: theme.space.sm,
  },
});

export const toolRailStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'nowrap',
  alignItems: 'center',
  gap: theme.space.xs,
  minWidth: 0,
  height: '100%',
  minHeight: 0,
  padding: '0.3rem',
  border: `1px solid ${theme.colors.surfaceStrong}`,
  borderRadius: '1rem',
  background: theme.colors.canvasRaised,
  overflow: 'hidden',
  '& > button': {
    position: 'relative',
    flex: '0 1 10rem',
    minWidth: 0,
    height: '100%',
    minHeight: '2.75rem',
    justifyContent: 'flex-start',
    padding: `${theme.space.xxs} ${theme.space.sm}`,
    overflow: 'hidden',
    borderColor: theme.colors.surfaceStrong,
    background: theme.colors.surface,
    whiteSpace: 'nowrap',
  },
  '& > button[aria-current="page"]': {
    borderColor: theme.colors.border,
    background: theme.colors.surfaceStrong,
    boxShadow: 'none',
  },
  '& > button[aria-current="page"]::before': {
    position: 'absolute',
    insetBlock: 0,
    insetInlineStart: 0,
    width: '0.2rem',
    background: theme.colors.accent,
    content: '""',
  },
  '& [data-tool-icon]': {
    width: '1.05rem',
    height: '1.05rem',
    flex: '0 0 auto',
    color: theme.colors.textMuted,
  },
  '& > button[aria-current="page"] [data-tool-icon]': { color: theme.colors.accent },
  '& [data-tool-label]': {
    minWidth: 0,
    display: 'grid',
    justifyItems: 'start',
    textAlign: 'start',
  },
  '& [data-tool-label] strong': {
    fontSize: 'inherit',
    fontWeight: 'inherit',
  },
  // The rail carries three tools at every width now, so the narrowest layouts trade the verb for
  // the noun rather than truncating it. Each control states its full name in `aria-label`, so
  // only the visible text changes.
  '& [data-tool-label-short]': { display: 'none' },
  '& [data-tool-label] small': {
    maxWidth: '8rem',
    overflow: 'hidden',
    color: 'currentColor',
    fontSize: '0.66rem',
    fontWeight: 600,
    opacity: 0.74,
    textOverflow: 'ellipsis',
  },
  // A blocked tool trades its description for the condition it is waiting on, which is a sentence
  // rather than a label: two clamped lines fit the button, and `title` carries the rest.
  '& [data-tool-label] small[data-tool-blocked]': { opacity: 0.9 },
  [media.downOrShort('desktop', '48rem')]: {
    '& > button': { flex: '1 1 0', justifyContent: 'center' },
  },
  [media.downOrShort('tablet', '36rem')]: {
    gap: '0.3rem',
    padding: theme.space.xxs,
    '& > button': {
      flex: '1 1 0',
      minWidth: 0,
      paddingInline: theme.space.xxs,
      gap: '0.28rem',
    },
    '& [data-tool-label]': { justifyItems: 'center' },
    '& [data-tool-label] strong': { fontSize: '0.72rem' },
    '& [data-tool-label-long]': { display: 'none' },
    '& [data-tool-label-short]': { display: 'inline' },
    // The description is a label a compact rail can do without. The blocked reason is not: it is
    // the only thing that explains a dead control, and `title` never reaches a touch user. It
    // stays, clamped to two lines, so the `aria-describedby` target is visible rather than hidden.
    '& [data-tool-label] small': { display: 'none' },
    '& [data-tool-label] small[data-tool-blocked]': {
      display: '-webkit-box',
      maxWidth: '100%',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: 2,
      fontSize: '0.6rem',
      lineHeight: 1.25,
      whiteSpace: 'normal',
      textAlign: 'center',
    },
    '& [data-tool-icon]': { width: '0.95rem', height: '0.95rem' },
  },
  '@media (max-width: 20rem), (max-height: 36rem)': {
    '& > button': {
      gap: '0.2rem',
      fontSize: '0.66rem',
    },
    '& [data-tool-label] strong': { fontSize: '0.66rem' },
    '& [data-tool-icon]': { width: '0.82rem', height: '0.82rem' },
  },
  [media.up('laptop')]: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: theme.space.sm,
    padding: theme.space.sm,
    borderRadius: theme.radii.large,
    '& > button': {
      flex: '0 0 auto',
      width: '100%',
      height: '4.25rem',
      minHeight: '4.25rem',
      justifyContent: 'flex-start',
      padding: theme.space.sm,
      whiteSpace: 'normal',
    },
    // Two clamped lines rather than one truncated one: the rail is sized to its buttons now, and
    // a description that ends in an ellipsis teaches nothing.
    '& [data-tool-label] small': {
      display: '-webkit-box',
      maxWidth: 'none',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: 2,
      whiteSpace: 'normal',
      lineHeight: 1.25,
    },
    '& [data-tool-label] small[data-tool-blocked]': {
      display: '-webkit-box',
      WebkitBoxOrient: 'vertical',
      WebkitLineClamp: 2,
      whiteSpace: 'normal',
      lineHeight: 1.25,
    },
  },
  [`${media.up('laptop')} and (max-height: 48rem)`]: {
    gap: theme.space.xs,
    padding: theme.space.xs,
    '& > button': {
      height: '3.55rem',
      minHeight: '3.55rem',
      padding: theme.space.xs,
    },
  },
});
