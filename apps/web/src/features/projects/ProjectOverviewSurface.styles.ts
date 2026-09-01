import type { CSSObject, Theme } from '@emotion/react';

/**
 * Only what `PageHeader` does not own: the breadcrumb above the identity row, and the metadata and
 * workflow lines this surface adds under its title. Width, title scale, identity grid and the
 * actions slot come from the shared header.
 */
export const projectOverviewHeaderStyles = (theme: Theme): CSSObject => ({
  /* Placement only: `Button variant="link"` owns how a breadcrumb reads. */
  '& [data-detail-breadcrumb]': {
    justifySelf: 'start',
    minWidth: 0,
    marginBlockEnd: theme.space.xl,
    fontSize: theme.fontSizes.body,
  },
  '& [data-detail-meta]': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: theme.space.lg,
    rowGap: theme.space.xs,
    marginBlockStart: theme.space.md,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.body,
  },
  '& [data-project-overview-status]': {
    color: theme.colors.accent,
    fontSize: '0.6875rem',
    fontWeight: 760,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  '& [data-project-workspace-status]': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.xs,
    marginBlockStart: theme.space.lg,
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.5,
  },
  '& [data-project-workspace-status] svg': {
    width: '1rem',
    height: '1rem',
    flex: '0 0 auto',
    color: theme.colors.accent,
  },
  '@container (max-width: 30rem)': {
    '& [data-detail-breadcrumb]': { marginBlockEnd: theme.space.lg },
    '& [data-detail-meta]': { columnGap: theme.space.md, fontSize: theme.fontSizes.metadata },
  },
});

/**
 * The finished deliverable, laid out beside its poster once there is room for one.
 *
 * It shares the source section's rhythm above it deliberately: both are "one thing this Project has
 * right now", and reading them as siblings is what makes the overview a summary rather than a list
 * of unrelated panels.
 */
export const projectDeliverableStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  alignContent: 'start',
  gap: theme.space.md,
  paddingBlock: `clamp(${theme.space.xl}, 4cqi, 2.5rem) 0`,
  '& > header': { minWidth: 0, display: 'grid', gap: theme.space.xs },
  '& > header h2': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: '1.25rem',
  },
  '& > header p': {
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.55,
  },
  '& [data-project-deliverable-body]': {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    gap: theme.space.md,
    alignItems: 'start',
  },
  '& [data-project-deliverable-poster]': { minWidth: 0, maxWidth: '18rem' },
  '& [data-project-deliverable-copy]': {
    minWidth: 0,
    display: 'grid',
    gap: theme.space.xs,
    alignContent: 'start',
  },
  '& [data-project-deliverable-copy] h3': {
    margin: 0,
    overflowWrap: 'anywhere',
    fontSize: '1rem',
    fontWeight: 640,
  },
  '& [data-project-deliverable-meta]': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: theme.space.md,
    rowGap: theme.space.xxs,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
  },
  '& [data-project-deliverable-placement]': {
    padding: `0.125rem ${theme.space.xs}`,
    borderRadius: theme.radii.small,
    color: theme.colors.accent,
    background: theme.colors.accentSoft,
    fontSize: '0.6875rem',
    fontWeight: 760,
  },
  '& [data-project-deliverable-actions]': {
    display: 'flex',
    flexWrap: 'wrap',
    gap: theme.space.sm,
    marginBlockStart: theme.space.xs,
  },
  '& [role="alert"], & [role="status"]': { borderRadius: 0 },
  '@container (min-width: 34rem)': {
    '& [data-project-deliverable-body]': {
      gridTemplateColumns: 'minmax(0, 18rem) minmax(0, 1fr)',
      gap: theme.space.lg,
    },
  },
});

export const projectOverviewSourceStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  alignContent: 'start',
  gap: theme.space.md,
  paddingBlock: `clamp(${theme.space.xl}, 4cqi, 2.5rem) 0`,
  '& > header': { minWidth: 0, display: 'grid', gap: theme.space.xs },
  '& > header h2': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: '1.25rem',
  },
  '& > header p': {
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.55,
  },
});
