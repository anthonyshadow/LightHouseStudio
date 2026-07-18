import type { CSSObject, Theme } from '@emotion/react';

export const pageStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100vh',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  padding: `max(${theme.space.sm}, env(safe-area-inset-top)) max(${theme.space.sm}, env(safe-area-inset-right)) max(${theme.space.sm}, env(safe-area-inset-bottom)) max(${theme.space.sm}, env(safe-area-inset-left))`,
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
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  gap: theme.space.sm,
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  '@media (max-height: 48rem)': { gap: theme.space.xs },
});

export const headerRegionStyles = (): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
});

export const skipLinkStyles = (theme: Theme): CSSObject => ({
  position: 'fixed',
  zIndex: 100,
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
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.lg,
  minWidth: 0,
  paddingBlock: theme.space.xxs,
  '@media (max-width: 45rem), (max-height: 48rem)': {
    gap: theme.space.xs,
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

export const mainGridStyles = (
  theme: Theme,
  recording = false,
  workshopOpen = false,
): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: recording
    ? 'minmax(0, 1fr) 3rem'
    : workshopOpen
      ? 'minmax(0, 1fr) clamp(34rem, 49vw, 50rem)'
      : 'minmax(0, 1fr) clamp(19rem, 27vw, 24rem)',
  gap: theme.space.sm,
  alignItems: 'stretch',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  '@media (max-width: 63.99rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  '@media (max-height: 48rem)': { gap: theme.space.xs },
});

export const recordingRailStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  placeItems: 'center',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  border: `1px solid ${theme.colors.recording}`,
  borderRadius: theme.radii.large,
  color: theme.colors.recording,
  background: theme.colors.recordingSoft,
  boxShadow: theme.shadows.recording,
  '& > span': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.space.xs,
    writingMode: 'vertical-rl',
    fontSize: theme.fontSizes.caption,
    fontWeight: 850,
    letterSpacing: '0.12em',
  },
  '& > span::before': {
    width: '0.55rem',
    height: '0.55rem',
    borderRadius: theme.radii.round,
    background: theme.colors.recording,
    content: '""',
  },
  '@media (max-width: 63.99rem)': { display: 'none' },
});

export const stageColumnStyles = (
  theme: Theme,
  hasWorkbench: boolean,
  recording: boolean,
  shelfOpen = false,
): CSSObject => ({
  display: 'grid',
  gridTemplateRows: recording
    ? 'minmax(0, 1fr) auto'
    : hasWorkbench
      ? shelfOpen
        ? 'minmax(0, 1fr) auto clamp(16rem, 34vh, 22rem)'
        : 'minmax(0, 1fr) auto clamp(9rem, 21vh, 12.5rem)'
      : 'minmax(0, 1fr) auto',
  gap: theme.space.sm,
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  '@media (max-height: 48rem)': {
    gap: theme.space.xs,
    gridTemplateRows: recording
      ? 'minmax(0, 1fr) auto'
      : hasWorkbench
        ? shelfOpen
          ? 'minmax(0, 1fr) auto minmax(12rem, 30vh)'
          : 'minmax(0, 1fr) auto minmax(6.5rem, 16vh)'
        : 'minmax(0, 1fr) auto',
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    gridTemplateRows: 'minmax(0, 1fr) auto',
  },
});

export const dockColumnStyles = (): CSSObject => ({
  display: 'grid',
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
  '& > *': { minHeight: 0 },
});

export const workbenchStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  overflow: 'auto',
  overscrollBehavior: 'contain',
  scrollbarGutter: 'stable',
  borderRadius: theme.radii.large,
  '@media (max-width: 39.99rem), (max-height: 36rem)': { display: 'none' },
});

export const workbenchTrayStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overflow: 'hidden',
  '& > div': {
    display: 'grid',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    gap: theme.space.xs,
    height: '100%',
    minHeight: 0,
  },
  '& [role="tabpanel"]': {
    minWidth: 0,
    minHeight: 0,
    overflow: 'auto',
    overscrollBehavior: 'contain',
  },
});

export const toolRailStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'nowrap',
  alignItems: 'center',
  gap: theme.space.xs,
  minWidth: 0,
  minHeight: '2.75rem',
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
    minHeight: '2.5rem',
    '& > button': { flex: '1 1 0', minWidth: 0, paddingInline: theme.space.xs },
    '& > span': { display: 'none' },
  },
});

export const mobileToolButtonStyles = (): CSSObject => ({
  display: 'none',
  '@media (max-width: 63.99rem)': { display: 'inline-flex' },
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

export const inlineCreativePanelStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  padding: 0,
  overflow: 'hidden',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.overlaySurface,
  boxShadow: theme.shadows.soft,
});

export const inlineCreativeHeaderStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  padding: `${theme.space.sm} ${theme.space.md}`,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  '& > div': { minWidth: 0 },
  '& h2': {
    margin: 0,
    color: theme.colors.text,
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.section,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& p': {
    margin: `${theme.space.xxs} 0 0`,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

export const inlineCreativeBodyStyles = (): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  overflow: 'hidden',
});
