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
  gridTemplateColumns: 'minmax(15rem, 1fr) auto minmax(15rem, 1fr)',
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
    alignContent: 'stretch',
  },
});

export const characterBuilderActionStyles = (): CSSObject => ({
  display: 'flex',
  justifyContent: 'center',
  minWidth: 0,
  '& > button': { minHeight: '2.75rem', whiteSpace: 'nowrap' },
  '@media (max-width: 39.99rem)': {
    gridColumn: '1 / -1',
    gridRow: '2',
    '& > button': { width: '100%', minHeight: '2.75rem' },
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
  display: 'flex',
  flexWrap: 'nowrap',
  justifyContent: 'flex-end',
  gap: theme.space.xs,
  minWidth: 0,
  overflow: 'hidden',
  '@media (max-width: 39.99rem)': {
    gridColumn: '2',
    gridRow: '1',
  },
});

export const capabilityPillStyles = (theme: Theme, available: boolean): CSSObject => ({
  padding: '0.38rem 0.62rem',
  border: `1px solid ${available ? theme.colors.borderStrong : theme.colors.border}`,
  borderRadius: theme.radii.round,
  color: available ? theme.colors.textMuted : theme.colors.textFaint,
  background: theme.colors.canvasRaised,
  fontSize: '0.72rem',
  fontWeight: 720,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  '@media (max-width: 39.99rem)': {
    width: '0.75rem',
    height: '0.75rem',
    minWidth: '0.75rem',
    padding: 0,
    borderColor: available ? theme.colors.accent : theme.colors.borderStrong,
    background: available ? theme.colors.accent : theme.colors.surfaceStrong,
    color: 'transparent',
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
      width: '2.75rem',
      minWidth: '2.75rem',
      paddingInline: 0,
      fontSize: 0,
    },
    '& > button::first-letter': { fontSize: '1rem' },
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
