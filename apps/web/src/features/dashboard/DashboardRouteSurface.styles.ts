import type { CSSObject, Theme } from '@emotion/react';

export const dashboardStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  maxWidth: '75rem',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  marginInline: 'auto',
  padding: `4.5rem ${theme.space.xxl} 4rem`,
  overflowY: 'auto',
  background: theme.colors.canvas,
  '& h1, & h2, & h3': { fontFamily: theme.type.display },
  '& p': { margin: 0 },
  '@media (max-width: 47.99rem)': {
    padding: `${theme.space.xl} ${theme.space.lg} max(5rem, calc(env(safe-area-inset-bottom) + 4.5rem))`,
  },
  '@media (max-width: 22rem)': {
    paddingInline: theme.space.lg,
  },
});

export const dashboardHeaderStyles = (theme: Theme): CSSObject => ({
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
    fontSize: '0.625rem',
    fontWeight: 850,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
  },
  '& h1': {
    margin: 0,
    color: theme.colors.text,
    fontSize: 'clamp(1.5rem, 3vw, 1.875rem)',
    letterSpacing: '-0.035em',
    lineHeight: 1.05,
  },
  '& p': {
    maxWidth: '34rem',
    marginBlockStart: theme.space.xs,
    color: theme.colors.textMuted,
    fontSize: 'clamp(0.875rem, 1.5vw, 1rem)',
    lineHeight: 1.55,
  },
  '& [data-dashboard-actions]': {
    display: 'flex',
    alignItems: 'center',
    gap: theme.space.md,
  },
  '& [data-dashboard-actions] > button:first-of-type': {
    minWidth: '9.375rem',
    borderRadius: theme.radii.small,
    boxShadow: 'none',
  },
  '& [data-dashboard-actions] > button:last-of-type': { paddingInline: 0 },
  '@media (max-width: 57rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    alignItems: 'start',
  },
  '@media (max-width: 30rem)': {
    '& [data-dashboard-actions]': {
      flexWrap: 'wrap',
    },
  },
});

export const onboardingStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: '1rem minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.sm,
  paddingBlock: theme.space.xxs,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.metadata,
  lineHeight: 1.5,
  '& [data-onboarding-heading]': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  '& [data-onboarding-icon]': {
    width: '1rem',
    height: '1rem',
    color: theme.colors.violet,
  },
  '& strong': { color: theme.colors.text, fontWeight: 720 },
  '& > button': {
    minHeight: '2.75rem',
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  '@media (max-width: 36rem)': {
    gridTemplateColumns: '1rem minmax(0, 1fr)',
    alignItems: 'start',
    rowGap: 0,
    paddingBlock: theme.space.xs,
    '& > button': { gridColumn: 2, justifySelf: 'start', paddingInline: 0 },
  },
});

export const sectionEyebrowStyles = (theme: Theme): CSSObject => ({
  margin: `0 0 ${theme.space.xl}`,
  color: theme.colors.textFaint,
  fontFamily: `${theme.type.sans} !important`,
  fontSize: '0.625rem',
  fontWeight: 850,
  letterSpacing: '0.2em',
  lineHeight: 1.2,
  textTransform: 'uppercase',
});

export const dashboardBodyStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.5fr) minmax(19rem, 1fr)',
  gap: 'clamp(3rem, 5vw, 4rem)',
  paddingBlock: theme.space.xxl,
  '& [data-dashboard-primary-column]': {
    minWidth: 0,
    display: 'grid',
    alignContent: 'start',
    gap: 'clamp(3rem, 6vw, 4rem)',
  },
  '@media (max-width: 71.99rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: theme.space.xxl,
  },
  '@media (max-width: 47.99rem)': {
    paddingBlock: theme.space.xl,
    gap: theme.space.xxl,
  },
});

export const continuePanelStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  justifyItems: 'start',
  gap: theme.space.xs,
  padding: `clamp(${theme.space.lg}, 3vw, 2.5rem)`,
  border: `1px solid ${theme.colors.border}`,
  background: theme.colors.surfaceSoft,
  transition: `border-color ${theme.motion.quick}, background ${theme.motion.quick}`,
  '& [data-project-context]': {
    color: theme.colors.violet,
    fontSize: theme.fontSizes.caption,
    fontWeight: 720,
  },
  '& h3': {
    maxWidth: '100%',
    margin: `${theme.space.xxs} 0 0`,
    overflow: 'hidden',
    color: theme.colors.text,
    fontSize: 'clamp(1.25rem, 3vw, 1.6rem)',
    letterSpacing: '-0.025em',
    textOverflow: 'ellipsis',
  },
  '& time': {
    marginBlockStart: theme.space.xxs,
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
  },
  '& > button': {
    minHeight: '2.75rem',
    marginBlockStart: '2.25rem',
    borderRadius: theme.radii.small,
    boxShadow: 'none',
  },
  '&[data-empty="true"] p': {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.body,
    lineHeight: 1.5,
  },
  '&:focus-within, &:hover': { borderColor: theme.colors.borderStrong },
  '@media (max-width: 30rem)': { '& > button': { marginBlockStart: theme.space.xl } },
});

export const quickActionsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: `${theme.space.md} ${theme.space.xxl}`,
  '& button': {
    minHeight: '2.75rem',
    justifyContent: 'flex-start',
    paddingInline: theme.space.xxs,
    color: theme.colors.textMuted,
    background: 'transparent',
  },
  '& button:first-of-type svg': { color: theme.colors.accent },
  '& button:last-of-type svg': { color: theme.colors.violet },
  '& svg': { width: '1.2rem', height: '1.2rem' },
});

export const recentWorkStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  alignSelf: 'start',
  '& > header': {
    minWidth: 0,
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.space.md,
    marginBlockEnd: theme.space.xxs,
  },
  '& > header h2': { flex: '0 0 auto', margin: 0, whiteSpace: 'nowrap' },
  '& > p[role="status"]': {
    marginBlockEnd: theme.space.sm,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
  },
  '@media (max-width: 80rem)': { '& > header': { gap: theme.space.sm } },
  '@media (max-width: 34rem)': {
    '& > header': {
      alignItems: 'flex-start',
      flexDirection: 'column',
      marginBlockEnd: theme.space.lg,
    },
  },
});

export const recentFilterStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: theme.space.md,
  '& button': {
    minHeight: '2.75rem',
    padding: 0,
    border: 0,
    color: theme.colors.textFaint,
    background: 'transparent',
    fontSize: '0.625rem',
    fontWeight: 850,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  '& button[aria-pressed="true"]': { color: theme.colors.text },
  '& button:hover': { color: theme.colors.textMuted },
  '& button:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
  '@media (max-width: 80rem)': { gap: theme.space.xs },
  '@media (max-width: 34rem)': { justifyContent: 'flex-start' },
});

export const recentListStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  padding: 0,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  listStyle: 'none',
  '& li': { minWidth: 0, borderBlockEnd: `1px solid ${theme.colors.border}` },
  '& li > button': {
    width: '100%',
    minHeight: '4.5rem',
    display: 'grid',
    gridTemplateColumns: '2rem minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: theme.space.md,
    padding: `${theme.space.md} ${theme.space.xs}`,
    border: 0,
    color: theme.colors.text,
    background: 'transparent',
    textAlign: 'start',
    cursor: 'pointer',
    transition: `color ${theme.motion.quick}, background ${theme.motion.quick}`,
  },
  '& li > button:hover': { background: theme.colors.surfaceSoft },
  '& li > button:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '-2px',
  },
  '& [data-recent-icon]': {
    width: '1.15rem',
    height: '1.15rem',
    justifySelf: 'center',
    color: theme.colors.textFaint,
  },
  '& button:hover [data-recent-icon]': { color: theme.colors.accent },
  '& [data-recent-title]': { minWidth: 0, display: 'grid', gap: '0.15rem' },
  '& [data-recent-title] strong': {
    overflow: 'hidden',
    fontSize: theme.fontSizes.body,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& [data-recent-title] span, & time': {
    color: theme.colors.textFaint,
    fontSize: '0.6875rem',
  },
  '& time': { whiteSpace: 'nowrap' },
});

export const emptyRecentStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  justifyItems: 'start',
  gap: theme.space.sm,
  paddingBlock: theme.space.xl,
  borderBlock: `1px solid ${theme.colors.border}`,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.body,
  lineHeight: 1.55,
  '& button': { paddingInline: 0 },
});

export const allDestinationsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.lg,
  marginBlockStart: theme.space.xl,
  '& button': {
    minHeight: '2.75rem',
    paddingInline: 0,
    color: theme.colors.accent,
    fontSize: '0.625rem',
    fontWeight: 850,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
});
