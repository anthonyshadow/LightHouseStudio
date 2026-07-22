import type { CSSObject, Theme } from '@emotion/react';

export const managerStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.md,
});

export const managerHeaderStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xxs,
  '& h2': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: 'clamp(1.3rem, 3vw, 1.85rem)',
    letterSpacing: '-0.025em',
  },
  '& p': {
    margin: 0,
    color: theme.colors.textMuted,
    lineHeight: 1.5,
  },
});

export const projectListStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

export const projectCardStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.md,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surfaceSoft,
  '&[data-focus-target="true"]': {
    borderColor: theme.colors.accent,
    boxShadow: `0 0 0 1px ${theme.colors.accentSoft}`,
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
  '& h3': { margin: 0 },
  '& p': {
    margin: `${theme.space.xxs} 0 0`,
    color: theme.colors.textMuted,
    lineHeight: 1.45,
  },
  '@media (max-width: 36rem)': { gridTemplateColumns: '1fr' },
});

export const projectActionsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: theme.space.xs,
  '@media (max-width: 36rem)': {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    justifyContent: 'stretch',
    '& button': { width: '100%' },
  },
});
