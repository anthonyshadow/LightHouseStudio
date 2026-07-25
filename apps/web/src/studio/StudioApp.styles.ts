import type { CSSObject, Theme } from '@emotion/react';

export const pageStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100vh',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  padding: `max(${theme.space.sm}, env(safe-area-inset-top)) max(${theme.space.sm}, env(safe-area-inset-right)) max(${theme.space.sm}, env(safe-area-inset-bottom)) max(${theme.space.sm}, env(safe-area-inset-left))`,
  '@supports (height: 100svh)': { height: '100svh' },
  '@supports (height: 100dvh)': { height: '100dvh' },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    padding: `max(${theme.space.xs}, env(safe-area-inset-top)) max(${theme.space.xs}, env(safe-area-inset-right)) max(${theme.space.xs}, env(safe-area-inset-bottom)) max(${theme.space.xs}, env(safe-area-inset-left))`,
  },
});

export const shellStyles = (theme: Theme): CSSObject => ({
  width: 'min(100%, 108rem)',
  height: '100%',
  marginInline: 'auto',
  display: 'grid',
  gridTemplateRows: `${theme.layout.shellRows.header} minmax(0, 1fr) ${theme.layout.shellRows.launcher}`,
  gap: theme.space.sm,
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  '@media (max-width: 80rem), (max-height: 48rem)': {
    gridTemplateRows: `${theme.layout.shellRows.headerCompact} minmax(0, 1fr) ${theme.layout.shellRows.launcherCompact}`,
    gap: theme.space.xs,
  },
  '@media (max-width: 39.99rem)': {
    gridTemplateRows: `6.5rem minmax(0, 1fr) ${theme.layout.shellRows.launcherMobile}`,
  },
  '@media (max-width: 20rem), (max-height: 36rem)': {
    gridTemplateRows: `6rem minmax(0, 1fr) ${theme.layout.shellRows.launcherUltra}`,
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
  gridTemplateColumns: 'minmax(12rem, 1fr) auto minmax(10rem, 1fr)',
  alignItems: 'center',
  gap: theme.space.lg,
  minWidth: 0,
  paddingBlock: theme.space.xxs,
  '@media (max-width: 45rem), (max-height: 48rem)': {
    gridTemplateColumns: 'minmax(11rem, 1fr) auto minmax(8rem, 1fr)',
    gap: theme.space.xs,
  },
  '@media (max-width: 39.99rem)': {
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gridTemplateRows: 'auto auto',
    alignContent: 'center',
  },
});

export const characterSelectorStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  justifyContent: 'center',
  minWidth: 0,
  '& > button': {
    minWidth: 0,
    maxWidth: '20rem',
    minHeight: '2.55rem',
    paddingBlock: theme.space.xxs,
    whiteSpace: 'nowrap',
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
  '@media (max-width: 39.99rem)': {
    gridColumn: '1 / -1',
    gridRow: '2',
    '& > button': { width: '100%', maxWidth: 'none', minHeight: '2.55rem' },
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
    gridTemplateColumns: '1.8rem minmax(0, 1fr)',
    gap: theme.space.xs,
    '& img': { width: '1.75rem', height: '1.75rem' },
    '& span': { display: 'none' },
    '& h1': { fontSize: '0.95rem', whiteSpace: 'nowrap' },
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
    gridColumn: '2',
    gridRow: '1',
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
  display: 'grid',
  gridTemplateRows: `minmax(0, 1fr) ${theme.layout.shellRows.capture}`,
  gap: theme.space.sm,
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  '@media (max-width: 80rem), (max-height: 48rem)': {
    gap: theme.space.xs,
    gridTemplateRows: `minmax(0, 1fr) ${theme.layout.shellRows.captureCompact}`,
  },
  '@media (min-width: 40rem) and (max-width: 63.99rem) and (min-height: 48.01rem)': {
    gridTemplateRows: `minmax(0, 1fr) ${theme.layout.shellRows.captureTablet}`,
  },
  '@media (max-width: 39.99rem)': {
    gridTemplateRows: `minmax(0, 1fr) ${theme.layout.shellRows.captureMobile}`,
  },
  '@media (max-width: 20rem), (max-height: 36rem)': {
    gridTemplateRows: `minmax(0, 1fr) ${theme.layout.shellRows.captureUltra}`,
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
  padding: theme.space.xxs,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  overflow: 'hidden',
  '& > button': { flex: '0 1 auto', whiteSpace: 'nowrap' },
  '& > span': {
    minWidth: 0,
    marginInlineStart: 'auto',
    color: theme.colors.textFaint,
    fontSize: '0.7rem',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    '& > button': { flex: '1 1 0', minWidth: 0, paddingInline: theme.space.xs },
    '& > span': { display: 'none' },
  },
  '@media (max-width: 20rem), (max-height: 36rem)': {
    '& > button': {
      width: 'auto',
      minWidth: 0,
      paddingInline: theme.space.xxs,
      fontSize: '0.68rem',
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
