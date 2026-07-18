import type { CSSObject, Theme } from '@emotion/react';

export const workshopSurfaceStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  padding: 0,
  overflow: 'hidden',
  borderColor: theme.colors.border,
  background: theme.colors.overlaySurface,
  containerType: 'inline-size',
});

export const workshopStyles = (): CSSObject => ({
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr) auto',
  overflow: 'hidden',
});

export const headerRegionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.md,
  padding: theme.space.md,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  background: theme.colors.surfaceSoft,
  '@media (max-height: 36rem)': {
    gap: theme.space.sm,
    padding: theme.space.sm,
    '& [role="group"]': {
      gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    },
    '& [role="group"] button': {
      minWidth: 0,
      paddingInline: theme.space.xxs,
      fontSize: theme.fontSizes.caption,
    },
  },
});

export const scrollRegionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.md,
  padding: theme.space.md,
  overflow: 'auto',
  overscrollBehavior: 'contain',
  scrollbarGutter: 'stable',
  '@media (min-width: 64rem)': {
    gridTemplateColumns: 'minmax(0, 1.45fr) minmax(16rem, 0.75fr)',
    alignItems: 'start',
  },
  '@media (max-height: 36rem)': {
    padding: theme.space.sm,
  },
});

export const accordionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xs,
});

export const stepStyles = (theme: Theme, active: boolean): CSSObject => ({
  minWidth: 0,
  overflow: 'hidden',
  border: `1px solid ${active ? theme.colors.borderStrong : theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: active ? theme.colors.surface : theme.colors.canvasRaised,
  boxShadow: active ? `inset 3px 0 0 ${theme.colors.accent}` : 'none',
  transition: `border-color ${theme.motion.quick}, background ${theme.motion.quick}`,
});

export const stepButtonStyles = (theme: Theme, active: boolean): CSSObject => ({
  width: '100%',
  minWidth: 0,
  minHeight: '3.25rem',
  padding: theme.space.sm,
  display: 'grid',
  gridTemplateColumns: '1.6rem minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.sm,
  border: 0,
  color: theme.colors.text,
  background: active ? theme.colors.accentSoft : 'transparent',
  textAlign: 'left',
  cursor: 'pointer',
  '&:hover': { background: active ? theme.colors.accentSoft : theme.colors.surfaceStrong },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '-3px',
  },
});

export const stepNumberStyles = (theme: Theme, active: boolean): CSSObject => ({
  width: '1.55rem',
  height: '1.55rem',
  display: 'inline-grid',
  placeItems: 'center',
  border: `1px solid ${active ? theme.colors.accent : theme.colors.borderStrong}`,
  borderRadius: theme.radii.round,
  color: active ? theme.colors.onAccent : theme.colors.textMuted,
  background: active ? theme.colors.accent : 'transparent',
  fontFamily: theme.type.mono,
  fontSize: theme.fontSizes.caption,
  fontWeight: 800,
});

export const stepCopyStyles = (): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: '0.15rem',
});

export const stepLabelStyles = (theme: Theme): CSSObject => ({
  color: theme.colors.text,
  fontSize: theme.fontSizes.body,
  fontWeight: 760,
  lineHeight: 1.25,
});

export const stepSummaryStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  overflow: 'hidden',
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.caption,
  lineHeight: 1.25,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const chevronStyles = (theme: Theme, active: boolean): CSSObject => ({
  color: active ? theme.colors.accent : theme.colors.textFaint,
  transform: active ? 'rotate(90deg)' : 'rotate(0deg)',
  transition: `transform ${theme.motion.quick}`,
});

export const stepPanelStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.md,
  padding: `0 ${theme.space.md} ${theme.space.md}`,
  borderBlockStart: `1px solid ${theme.colors.border}`,
});

export const stepDescriptionStyles = (theme: Theme): CSSObject => ({
  margin: `${theme.space.sm} 0 0`,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.metadata,
  lineHeight: 1.45,
});

export const reviewColumnStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.sm,
  '@media (min-width: 64rem)': {
    position: 'sticky',
    insetBlockStart: 0,
  },
});

export const reviewToggleStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  minHeight: '2.75rem',
  padding: `${theme.space.xs} ${theme.space.sm}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.text,
  background: theme.colors.canvasRaised,
  fontWeight: 740,
  cursor: 'pointer',
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
});

export const footerStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  padding: `${theme.space.sm} ${theme.space.md} max(${theme.space.sm}, env(safe-area-inset-bottom))`,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  background: theme.colors.overlaySurface,
  boxShadow: `0 -0.75rem 2rem ${theme.colors.shadow}`,
});
