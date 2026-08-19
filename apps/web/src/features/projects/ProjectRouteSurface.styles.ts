import type { CSSObject, Theme } from '@emotion/react';

export const projectWorkspaceRouteStyles = (): CSSObject => ({
  display: 'contents',
});

export const workspaceStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: [
    'radial-gradient(circle at 12% 0%, rgba(98, 230, 194, 0.1), transparent 28rem)',
    'radial-gradient(circle at 90% 8%, rgba(155, 124, 255, 0.08), transparent 24rem)',
    theme.colors.canvasRaised,
  ].join(', '),
  scrollbarGutter: 'stable',
});

export const projectsIndexRouteStyles = (theme: Theme): CSSObject => ({
  ...workspaceStyles(theme),
  border: 0,
  borderRadius: 0,
  background: theme.colors.canvas,
});

export const projectOverviewRouteStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  overscrollBehavior: 'contain',
  border: 0,
  borderRadius: 0,
  background: theme.colors.canvas,
  scrollbarGutter: 'stable',
  containerType: 'inline-size',
});

export const workspaceInnerStyles = (theme: Theme): CSSObject => ({
  gridColumn: 2,
  gridRow: 2,
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  display: 'grid',
  padding: theme.space.lg,
  alignContent: 'start',
  overflowY: 'auto',
  borderInlineStart: `1px solid ${theme.colors.border}`,
  background: theme.colors.canvas,
  '@media (max-width: 63.99rem)': {
    gridColumn: 1,
    gridRow: 3,
    minHeight: '20rem',
    height: 'auto',
    borderInlineStart: 0,
    borderBlockStart: `1px solid ${theme.colors.border}`,
  },
});

export const workspaceHeaderStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'end',
  justifyContent: 'space-between',
  gap: theme.space.lg,
  '& > div': { minWidth: 0 },
  '& h2': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: 'clamp(1.7rem, 4vw, 2.6rem)',
    letterSpacing: '-0.04em',
  },
  '& p': {
    maxWidth: '48rem',
    margin: `${theme.space.xs} 0 0`,
    color: theme.colors.textMuted,
    lineHeight: 1.6,
  },
  '@media (max-width: 39.99rem)': {
    alignItems: 'stretch',
    flexDirection: 'column',
    '& > button': { width: '100%' },
  },
});

export const listSectionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.md,
  padding: `clamp(${theme.space.md}, 2vw, ${theme.space.lg})`,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  boxShadow: theme.shadows.soft,
  '& > header': {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.space.sm,
  },
  '& h3': { margin: 0, fontSize: theme.fontSizes.section },
  '& header span': { color: theme.colors.textFaint, fontSize: theme.fontSizes.caption },
});

export const statusPillStyles = (theme: Theme, archived: boolean): CSSObject => ({
  display: 'inline-flex',
  alignItems: 'center',
  minHeight: '1.55rem',
  paddingInline: theme.space.sm,
  border: `1px solid ${archived ? theme.colors.borderStrong : theme.colors.accentSoft}`,
  borderRadius: theme.radii.round,
  color: archived ? theme.colors.textMuted : theme.colors.accent,
  background: archived ? theme.colors.surfaceStrong : theme.colors.accentSoft,
  fontSize: theme.fontSizes.caption,
  fontWeight: 780,
  textTransform: 'capitalize',
});

export const emptyListStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  padding: `${theme.space.xl} ${theme.space.md}`,
  border: `1px dashed ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.textMuted,
  textAlign: 'center',
  '& strong': { color: theme.colors.text },
  '& p': { margin: 0, lineHeight: 1.5 },
});

export const detailHeaderStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
  '& [data-detail-breadcrumb]': {
    justifySelf: 'start',
    minHeight: '2.75rem',
  },
  '& [data-detail-identity]': {
    display: 'flex',
    alignItems: 'end',
    justifyContent: 'space-between',
    gap: theme.space.lg,
  },
  '& h2': {
    margin: 0,
    overflowWrap: 'anywhere',
    fontFamily: theme.type.display,
    fontSize: 'clamp(1.7rem, 4vw, 2.6rem)',
    letterSpacing: '-0.04em',
  },
  '& [data-detail-meta]': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.sm,
    marginBlockStart: theme.space.sm,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
  },
  '& [data-detail-actions]': {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.space.sm,
  },
  '@media (max-width: 45rem)': {
    '& [data-detail-identity]': { alignItems: 'stretch', flexDirection: 'column' },
    '& [data-detail-actions]': { justifyContent: 'stretch' },
    '& [data-detail-actions] > button': { flex: '1 1 auto' },
  },
});

export const emptyProjectStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  boxShadow: 'none',
  '& h3': { margin: 0, fontSize: theme.fontSizes.label },
  '& p': {
    margin: `${theme.space.xs} 0 0`,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.55,
  },
  '& [data-source-actions]': { display: 'grid', gap: theme.space.sm },
  '& [data-source-actions] > button': {
    width: '100%',
    justifyContent: 'flex-start',
    fontSize: theme.fontSizes.metadata,
  },
  '& [data-source-actions] small': {
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.5,
  },
});

export const projectWorkflowProgressStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  margin: 0,
  padding: 0,
  listStyle: 'none',
  '& li': {
    display: 'inline-flex',
    alignItems: 'center',
    gap: theme.space.xxs,
    padding: `0.28rem ${theme.space.sm}`,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.round,
    color: theme.colors.textFaint,
    background: theme.colors.canvasRaised,
    fontSize: theme.fontSizes.caption,
    fontWeight: 720,
  },
  '& li[data-state="done"]': {
    borderColor: theme.colors.borderStrong,
    color: theme.colors.textMuted,
    background: theme.colors.surfaceStrong,
  },
  '& li[aria-current="step"]': {
    borderColor: theme.colors.accent,
    color: theme.colors.text,
    background: theme.colors.accentSoft,
  },
  '& li span[data-step-ordinal]': {
    color: theme.colors.textFaint,
    fontWeight: 640,
  },
  // The workspace masthead is a fixed 3rem row shared with the title and save status, so the
  // compact variant must never wrap or claim flexible width. Below the tablet breakpoint the
  // labels drop and each step is left with its ordinal plus its own aria-label.
  '&[data-variant="masthead"]': {
    flex: '0 0 auto',
    flexWrap: 'nowrap',
    gap: theme.space.xxs,
    '& li': {
      padding: `0.15rem ${theme.space.xs}`,
      fontSize: theme.fontSizes.metadata,
    },
    '@media (max-width: 63.99rem)': {
      '& li span[data-step-label]': { display: 'none' },
    },
  },
});

export const dialogActionsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: theme.space.sm,
});
