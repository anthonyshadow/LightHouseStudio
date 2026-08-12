import type { CSSObject, Theme } from '@emotion/react';

export const campaignBriefStyles = (theme: Theme): CSSObject => ({
  margin: `${theme.space.sm} 0 0`,
  maxWidth: '60rem',
  color: theme.colors.textMuted,
  lineHeight: 1.65,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
});

export const campaignGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 19rem), 1fr))',
  gap: theme.space.md,
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

export const campaignCardStyles = (theme: Theme): CSSObject => ({
  minHeight: '12rem',
  display: 'grid',
  alignContent: 'space-between',
  gap: theme.space.lg,
  padding: theme.space.lg,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surface,
  boxShadow: theme.shadows.soft,
  '& h4': { margin: 0, overflowWrap: 'anywhere', fontSize: theme.fontSizes.section },
  '& p': {
    display: '-webkit-box',
    margin: `${theme.space.sm} 0 0`,
    overflow: 'hidden',
    color: theme.colors.textMuted,
    lineHeight: 1.5,
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 3,
  },
  '& [data-campaign-actions]': {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.space.sm,
  },
  '@media (max-width: 39.99rem)': {
    minHeight: 0,
    '& [data-campaign-actions] > button': { flex: '1 1 auto' },
  },
});

export const projectGroupStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
  padding: `clamp(${theme.space.md}, 2vw, ${theme.space.lg})`,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  '& > header': {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  '& h3': { margin: 0 },
  '& ul': { display: 'grid', gap: theme.space.sm, margin: 0, padding: 0, listStyle: 'none' },
  '& article': {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: theme.space.md,
    padding: theme.space.md,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    background: theme.colors.surface,
  },
  '& article h4': { margin: 0, overflowWrap: 'anywhere' },
  '& [data-project-actions]': { display: 'flex', flexWrap: 'wrap', gap: theme.space.sm },
  '@media (max-width: 39.99rem)': {
    '& article': { gridTemplateColumns: 'minmax(0, 1fr)' },
    '& [data-project-actions] > button': { flex: '1 1 auto' },
  },
});
