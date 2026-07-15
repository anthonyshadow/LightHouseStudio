import type { CSSObject, Theme } from '@emotion/react';

export const pageStyles = (theme: Theme): CSSObject => ({
  minHeight: '100dvh',
  padding: `max(${theme.space.md}, env(safe-area-inset-top)) max(${theme.space.md}, env(safe-area-inset-right)) max(${theme.space.xl}, env(safe-area-inset-bottom)) max(${theme.space.md}, env(safe-area-inset-left))`,
});

export const shellStyles = (): CSSObject => ({
  width: 'min(100%, 108rem)',
  marginInline: 'auto',
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
  paddingBlock: `${theme.space.xs} ${theme.space.lg}`,
  '@media (max-width: 45rem)': {
    display: 'grid',
    alignItems: 'flex-start',
    gap: theme.space.sm,
  },
});

export const brandStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: '0.15rem',
  '& span': {
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
});

export const capabilityStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: theme.space.xs,
  '@media (max-width: 45rem)': {
    justifyContent: 'flex-start',
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
});

export const mainGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.55fr) minmax(19rem, 0.65fr)',
  gap: `clamp(${theme.space.md}, 2vw, ${theme.space.xl})`,
  alignItems: 'start',
  '@media (max-width: 63.99rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

export const stageColumnStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
  minWidth: 0,
});

export const dockColumnStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
  minWidth: 0,
  position: 'sticky',
  insetBlockStart: theme.space.md,
  '@media (max-width: 63.99rem)': { position: 'static' },
});

export const toolRailStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.xs,
  paddingBlock: theme.space.lg,
  '& > button': { flex: '0 1 auto' },
  '@media (max-width: 35rem)': { '& > button': { flex: '1 1 8rem' } },
});

export const auxiliaryStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.lg,
  paddingBlockEnd: theme.space.lg,
});

export const creativePanelStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.lg,
  scrollMarginBlockStart: theme.space.lg,
});

export const libraryModeStyles = (theme: Theme): CSSObject => ({
  maxWidth: '38rem',
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
});

export const footerStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  paddingBlock: theme.space.lg,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  color: theme.colors.textFaint,
  fontSize: '0.72rem',
  lineHeight: 1.5,
});
