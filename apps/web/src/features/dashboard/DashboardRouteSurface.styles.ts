import type { CSSObject, Theme } from '@emotion/react';

export const dashboardStyles = (theme: Theme): CSSObject => ({
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  overflowY: 'auto',
  scrollbarGutter: 'stable',
  padding: `clamp(${theme.space.md}, 2.5vw, ${theme.space.xl})`,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: `linear-gradient(145deg, color-mix(in srgb, ${theme.colors.canvasRaised} 94%, ${theme.colors.accentSoft}), ${theme.colors.canvasRaised} 48%)`,
  '& h1, & h2': { fontFamily: theme.type.display },
  '& h1': {
    margin: 0,
    fontSize: 'clamp(1.75rem, 4vw, 3rem)',
    letterSpacing: '-0.045em',
  },
  '& h2': { margin: 0, fontSize: 'clamp(1rem, 2vw, 1.25rem)' },
  '& p': { margin: 0 },
});

export const dashboardHeroStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'end',
  gap: theme.space.lg,
  paddingBlockEnd: theme.space.xl,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  '& [data-dashboard-eyebrow]': {
    display: 'block',
    marginBlockEnd: theme.space.xs,
    color: theme.colors.accent,
    fontSize: theme.fontSizes.caption,
    fontWeight: 850,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  },
  '& p': {
    maxWidth: '50rem',
    marginBlockStart: theme.space.sm,
    color: theme.colors.textMuted,
    lineHeight: 1.55,
  },
  '& [data-hero-actions]': {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.space.sm,
  },
  '@media (max-width: 52rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    alignItems: 'start',
    '& [data-hero-actions]': { justifyContent: 'flex-start' },
  },
  '@media (max-width: 30rem)': {
    '& [data-hero-actions], & [data-hero-actions] > button': { width: '100%' },
  },
});

export const onboardingStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  gap: theme.space.md,
  marginBlockStart: theme.space.lg,
  padding: theme.space.lg,
  border: `1px solid color-mix(in srgb, ${theme.colors.accent} 42%, ${theme.colors.border})`,
  borderRadius: theme.radii.large,
  background: `color-mix(in srgb, ${theme.colors.accentSoft} 72%, ${theme.colors.surface})`,
  '& [data-onboarding-copy]': { display: 'grid', gap: theme.space.sm },
  '& [data-onboarding-copy] > p': { color: theme.colors.textMuted },
  '& [data-onboarding-steps]': {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: theme.space.sm,
  },
  '& [data-onboarding-step]': {
    display: 'grid',
    gap: theme.space.xxs,
    padding: theme.space.sm,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    background: theme.colors.surfaceSoft,
  },
  '& [data-onboarding-step] strong': { color: theme.colors.text },
  '& [data-onboarding-step] span': {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.45,
  },
  '@media (max-width: 48rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    '& [data-onboarding-steps]': { gridTemplateColumns: 'minmax(0, 1fr)' },
    '& > button': { justifySelf: 'start' },
  },
});

export const dashboardBodyStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.1fr) minmax(18rem, 0.9fr)',
  alignItems: 'start',
  gap: theme.space.lg,
  marginBlockStart: theme.space.lg,
  '@media (max-width: 62rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

export const dashboardSectionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.lg,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  '& > header': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  '& [data-section-copy]': { color: theme.colors.textMuted, lineHeight: 1.5 },
});

export const recentGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: theme.space.sm,
  marginBlockStart: theme.space.lg,
  '@media (max-width: 76rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

export const recentListStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  margin: 0,
  padding: 0,
  listStyle: 'none',
  '& li': { minWidth: 0 },
  '& button': {
    width: '100%',
    minHeight: '4.25rem',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: theme.space.sm,
    padding: theme.space.sm,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    color: theme.colors.text,
    background: theme.colors.surface,
    textAlign: 'start',
    cursor: 'pointer',
    '&:hover': { borderColor: theme.colors.accent, background: theme.colors.surfaceStrong },
    '&:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '2px' },
  },
  '& [data-recent-title]': {
    minWidth: 0,
    display: 'grid',
    gap: theme.space.xxs,
  },
  '& [data-recent-title] strong': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& [data-recent-title] span, & time': {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
  },
});

export const quickActionsStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.space.sm,
  '& button': { minHeight: '4.5rem', justifyContent: 'flex-start' },
  '@media (max-width: 30rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});
