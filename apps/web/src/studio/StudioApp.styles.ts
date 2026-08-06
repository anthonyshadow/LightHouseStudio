import type { CSSObject, Theme } from '@emotion/react';

export const pageStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100vh',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  padding: `max(clamp(${theme.space.sm}, 1.5vw, ${theme.space.lg}), env(safe-area-inset-top)) max(clamp(${theme.space.sm}, 1.5vw, ${theme.space.lg}), env(safe-area-inset-right)) max(clamp(${theme.space.sm}, 1.5vw, ${theme.space.lg}), env(safe-area-inset-bottom)) max(clamp(${theme.space.sm}, 1.5vw, ${theme.space.lg}), env(safe-area-inset-left))`,
  '@supports (height: 100svh)': { height: '100svh' },
  '@supports (height: 100dvh)': { height: '100dvh' },
  '@media (max-width: 39.99rem), (max-height: 48rem)': {
    padding: `max(${theme.space.xs}, env(safe-area-inset-top)) max(${theme.space.xs}, env(safe-area-inset-right)) max(${theme.space.xs}, env(safe-area-inset-bottom)) max(${theme.space.xs}, env(safe-area-inset-left))`,
  },
});

export const shellStyles = (theme: Theme): CSSObject => ({
  width: 'min(100%, 108rem)',
  height: '100%',
  marginInline: 'auto',
  display: 'grid',
  gridTemplateRows: '4rem minmax(0, 1fr)',
  gap: theme.space.sm,
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  '@media (max-width: 80rem), (max-height: 48rem)': {
    gridTemplateRows: '3.5rem minmax(0, 1fr)',
    gap: theme.space.xs,
  },
  '@media (max-width: 39.99rem)': {
    gridTemplateRows: '3.25rem minmax(0, 1fr)',
  },
});

export const headerRegionStyles = (): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
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
  display: 'grid',
  height: '100%',
  gridTemplateColumns: 'minmax(10rem, 1fr) minmax(15rem, auto) minmax(8rem, 1fr)',
  alignItems: 'center',
  gap: theme.space.md,
  minWidth: 0,
  '@media (max-width: 45rem), (max-height: 48rem)': {
    gridTemplateColumns: 'minmax(9rem, 1fr) minmax(12rem, auto) minmax(3rem, 1fr)',
    gap: theme.space.xs,
  },
  '@media (max-width: 39.99rem)': {
    gridTemplateColumns: '5.5rem minmax(0, 1fr) 2.75rem',
    gap: theme.space.xs,
  },
});

export const characterSelectorStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.space.xxs,
  minWidth: 0,
  '& > button:first-of-type': {
    minWidth: 0,
    maxWidth: '20rem',
    minHeight: '2.55rem',
    paddingBlock: theme.space.xxs,
    whiteSpace: 'nowrap',
  },
  '& > button[data-clear-character="true"]': {
    width: '2.75rem',
    minWidth: '2.75rem',
    maxWidth: '2.75rem',
    minHeight: '2.75rem',
    padding: 0,
    color: theme.colors.danger,
    fontSize: '1.25rem',
  },
  '& img, & [data-character-placeholder]': {
    width: '1.65rem',
    height: '1.65rem',
    display: 'grid',
    flex: '0 0 auto',
    placeItems: 'center',
    borderRadius: theme.radii.small,
    background: theme.colors.surfaceSoft,
    objectFit: 'cover',
  },
  '& [data-character-label]': {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '& [data-character-chevron]': {
    width: '0.9rem',
    height: '0.9rem',
    flex: '0 0 auto',
    color: theme.colors.textFaint,
  },
  '@media (max-width: 39.99rem)': {
    '& > button:first-of-type': {
      width: '100%',
      maxWidth: 'none',
      minHeight: '2.75rem',
      paddingInline: theme.space.xs,
    },
    '& > button[data-clear-character="true"]': {
      width: '2.75rem',
      flex: '0 0 2.75rem',
    },
  },
});

export const brandStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: '2.4rem minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.sm,
  minWidth: 0,
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
  '& h1': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: 'clamp(1.05rem, 2vw, 1.35rem)',
    letterSpacing: '-0.025em',
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    display: 'block',
    '& img': { width: '2.1rem', height: '2.1rem' },
    '& > div': { display: 'none' },
  },
});

export const capabilityStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  justifySelf: 'end',
  minWidth: 0,
  '& summary': {
    minHeight: '2.45rem',
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.space.xs,
    padding: `0.38rem ${theme.space.sm}`,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.round,
    color: theme.colors.textMuted,
    background: theme.colors.canvasRaised,
    fontSize: theme.fontSizes.caption,
    fontWeight: 760,
    whiteSpace: 'nowrap',
    cursor: 'pointer',
    listStyle: 'none',
  },
  '& summary::-webkit-details-marker': { display: 'none' },
  '& summary:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
  '&[open] summary': {
    borderColor: theme.colors.accent,
    color: theme.colors.text,
  },
  '@media (max-width: 39.99rem)': {
    '& summary': {
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
  width: 'min(18rem, calc(100vw - 1rem))',
  display: 'grid',
  gap: theme.space.xs,
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.overlaySurface,
  boxShadow: theme.shadows.lifted,
  backdropFilter: 'blur(14px)',
  '& span': {
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.space.md,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
  },
  '& strong': { color: theme.colors.text, fontWeight: 760 },
  '@media (max-width: 39.99rem)': {
    position: 'fixed',
    insetInline: theme.space.xs,
    insetBlockStart: '4rem',
    width: 'auto',
  },
});

export const mainGridStyles = (): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  alignItems: 'stretch',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
});

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
  '@media (max-width: 80rem), (max-height: 48rem)': {
    gap: theme.space.xs,
    gridTemplateRows: 'minmax(0, 1fr) 3.15rem 2.85rem',
  },
  '&[data-video-edit-active="true"]': {
    gridTemplateRows: 'minmax(8rem, 1fr) 3.15rem minmax(11rem, 38vh)',
  },
  '@media (max-width: 39.99rem)': {
    gridTemplateRows: 'minmax(0, 1fr) 3.15rem 2.85rem',
    '&[data-video-edit-active="true"]': {
      gridTemplateRows: 'minmax(8rem, 1fr) 3.15rem minmax(10.5rem, 42vh)',
    },
  },
  '@media (max-width: 20rem), (max-height: 36rem)': {
    gridTemplateRows: 'minmax(0, 1fr) 3rem 2.75rem',
    '&[data-video-edit-active="true"]': {
      gridTemplateRows: 'minmax(7rem, 1fr) 3rem minmax(9.5rem, 43vh)',
    },
  },
  '@media (min-width: 64rem)': {
    gridTemplateColumns: 'minmax(12rem, 15rem) minmax(0, 1fr) minmax(18rem, 20rem)',
    gridTemplateRows: 'minmax(0, 1fr)',
    gap: theme.space.lg,
    '& > [data-media-stage-layout]': { gridColumn: 2, gridRow: 1 },
    '& > [data-studio-tool-rail]': { gridColumn: 1, gridRow: 1 },
    '& > [data-capture-controls]': { gridColumn: 3, gridRow: 1 },
    '&[data-video-edit-active="true"]': {
      gridTemplateRows: 'minmax(0, 1fr)',
    },
  },
  '@media (min-width: 64rem) and (max-height: 48rem)': {
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
  '& [data-workshop-label-short]': { display: 'none' },
  '& [data-tool-label] small': {
    maxWidth: '8rem',
    overflow: 'hidden',
    color: 'currentColor',
    fontSize: '0.66rem',
    fontWeight: 600,
    opacity: 0.74,
    textOverflow: 'ellipsis',
  },
  '& > span': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.space.xs,
    minWidth: 0,
    marginInlineStart: 'auto',
    color: theme.colors.textFaint,
    fontSize: '0.7rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& > span svg': {
    width: '0.95rem',
    height: '0.95rem',
    flex: '0 0 auto',
    color: theme.colors.accent,
  },
  '@media (max-width: 79.99rem), (max-height: 48rem)': {
    '& > button': { flex: '1 1 0', justifyContent: 'center' },
    '& > span': { display: 'none' },
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
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
    '& [data-tool-label] small': { display: 'none' },
    '& [data-tool-icon]': { width: '0.95rem', height: '0.95rem' },
  },
  '@media (max-width: 20rem), (max-height: 36rem)': {
    '& > button': {
      gap: '0.2rem',
      fontSize: '0.66rem',
    },
    '& [data-tool-label] strong': { fontSize: '0.66rem' },
    '& [data-tool-icon]': { width: '0.82rem', height: '0.82rem' },
    '& [data-workshop-label-long]': { display: 'none' },
    '& [data-workshop-label-short]': { display: 'inline' },
  },
  '@media (min-width: 64rem)': {
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
    '& [data-tool-label] small': {
      display: 'block',
      maxWidth: 'none',
      whiteSpace: 'nowrap',
    },
    '& > span': {
      alignItems: 'flex-start',
      marginBlockStart: 'auto',
      marginInlineStart: 0,
      padding: theme.space.xs,
      overflow: 'visible',
      whiteSpace: 'normal',
    },
  },
  '@media (min-width: 64rem) and (max-height: 48rem)': {
    gap: theme.space.xs,
    padding: theme.space.xs,
    '& > button': {
      height: '3.55rem',
      minHeight: '3.55rem',
      padding: theme.space.xs,
    },
    '& > span': { display: 'none' },
  },
});

export const firstSuccessGuideStyles = (theme: Theme): CSSObject => ({
  display: 'inline-grid',
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  width: 'min(42rem, calc(100vw - 4rem))',
  maxWidth: '100%',
  alignItems: 'center',
  gap: theme.space.sm,
  marginBlockStart: theme.space.lg,
  padding: `${theme.space.xxs} ${theme.space.xs} ${theme.space.xxs} ${theme.space.sm}`,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  color: theme.colors.text,
  background: `color-mix(in srgb, ${theme.colors.canvasRaised} 76%, transparent)`,
  boxShadow: theme.shadows.soft,
  backdropFilter: 'blur(12px)',
  fontSize: theme.fontSizes.caption,
  lineHeight: 1.35,
  '&& > strong': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.space.xs,
    height: '100%',
    margin: 0,
    fontFamily: theme.type.sans,
    color: theme.colors.accent,
    fontSize: '0.68rem',
    fontWeight: 850,
    letterSpacing: '0.12em',
    lineHeight: 1.35,
    textTransform: 'uppercase',
  },
  '& [data-guide-copy]': {
    minWidth: 0,
    display: 'grid',
    gap: '0.1rem',
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  '& [data-guide-copy] > span': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& [data-guide-step-number]': { display: 'none' },
  '& [data-guide-upload]': { color: theme.colors.textFaint },
  '& button': { minHeight: '2.75rem' },
  '& [data-guide-dismiss-short]': { display: 'none' },
  '[data-stage-aspect-ratio="9:16"] &': {
    width: 'min(22rem, 100%)',
    gridTemplateColumns: 'minmax(0, 1fr) 2.75rem',
    alignItems: 'start',
    marginBlockStart: theme.space.md,
    padding: theme.space.sm,
    rowGap: theme.space.sm,
    '&& > strong': {
      gridColumn: 1,
      gridRow: 1,
      maxWidth: 'none',
      alignSelf: 'center',
      whiteSpace: 'nowrap',
    },
    '& [data-guide-copy]': {
      gridColumn: '1 / -1',
      gridRow: 2,
      gap: theme.space.xs,
      textAlign: 'start',
    },
    '& [data-guide-copy] > span': {
      display: 'grid',
      gridTemplateColumns: '1.35rem minmax(0, 1fr)',
      alignItems: 'start',
      gap: theme.space.xs,
      overflow: 'visible',
      textOverflow: 'clip',
      whiteSpace: 'normal',
    },
    '& [data-guide-step-number]': {
      width: '1.25rem',
      height: '1.25rem',
      display: 'grid',
      placeItems: 'center',
      marginBlockStart: '0.05rem',
      border: `1px solid color-mix(in srgb, ${theme.colors.accent} 60%, transparent)`,
      borderRadius: theme.radii.round,
      color: theme.colors.accent,
      background: `color-mix(in srgb, ${theme.colors.accent} 10%, transparent)`,
      fontSize: '0.62rem',
      fontWeight: 850,
      lineHeight: 1,
    },
    '& [data-guide-upload]': { display: 'grid', color: theme.colors.textMuted },
    '& button': {
      gridColumn: 2,
      gridRow: 1,
      width: '2.75rem',
      minWidth: '2.75rem',
      padding: 0,
    },
    '& [data-guide-dismiss-long]': { display: 'none' },
    '& [data-guide-dismiss-short]': { display: 'inline' },
    '@media (max-width: 22.49rem)': {
      width: '100%',
      padding: theme.space.xs,
      rowGap: theme.space.xs,
      '&& > strong': { whiteSpace: 'normal' },
    },
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    width: '100%',
    gridTemplateColumns: 'auto minmax(0, 1fr) 2.75rem',
    marginBlockStart: theme.space.xs,
    padding: theme.space.xs,
    gap: theme.space.xs,
    '& button': { width: '2.75rem', minWidth: '2.75rem', padding: 0 },
    '& [data-guide-dismiss-long]': { display: 'none' },
    '& [data-guide-dismiss-short]': { display: 'inline' },
  },
  '@media (max-height: 36rem)': {
    '[data-stage-aspect-ratio="9:16"] &': {
      position: 'relative',
      width: '100%',
      gridTemplateColumns: 'minmax(0, 1fr) 2rem',
      marginBlockStart: '0.3rem',
      padding: '0.3rem',
      gap: '0.2rem',
      rowGap: '0.25rem',
      borderRadius: theme.radii.medium,
      fontSize: '0.55rem',
      lineHeight: 1.2,
      '&& > strong': {
        alignSelf: 'center',
        fontSize: '0.52rem',
        letterSpacing: '0.08em',
        whiteSpace: 'nowrap',
      },
      '& [data-guide-copy]': { gap: '0.2rem' },
      '& [data-guide-copy] > span': {
        gridTemplateColumns: '0.8rem minmax(0, 1fr)',
        gap: '0.2rem',
      },
      '& [data-guide-step-number]': {
        width: '0.75rem',
        height: '0.75rem',
        marginBlockStart: 0,
        fontSize: '0.45rem',
      },
      '& button': {
        width: '2rem',
        height: '2rem',
        minWidth: '2rem',
        minHeight: '2rem',
      },
    },
  },
});

export const libraryModeStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  maxWidth: '38rem',
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
});

export const creativeOverlayContentStyles = (
  theme: Theme,
  panel: 'workshop' | 'shelf',
): CSSObject => ({
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: panel === 'shelf' ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)',
  gap: panel === 'shelf' ? theme.space.sm : 0,
  overflow: 'hidden',
});
