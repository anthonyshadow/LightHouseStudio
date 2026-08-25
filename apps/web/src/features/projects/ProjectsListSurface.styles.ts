import type { CSSObject, Theme } from '@emotion/react';

export const projectsSearchRowStyles = (theme: Theme): CSSObject => ({
  paddingBlockStart: theme.space.lg,
});

/** Layout only: the segments themselves are `SegmentedControl`'s, not this surface's. */
export const projectsGroupFilterStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 24rem)',
  paddingBlock: theme.space.lg,
  borderBlockEnd: `1px solid ${theme.colors.divider}`,
  '@container (max-width: 28rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

export const projectsLedgerLayoutStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 0,
  paddingBlockEnd: theme.space.xxl,
});

export const projectsLedgerSectionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  alignContent: 'start',
  paddingBlockStart: `clamp(${theme.space.xl}, 4vw, ${theme.space.xxl})`,
  '& > header': {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.space.md,
    paddingBlockEnd: theme.space.md,
    borderBlockEnd: `1px solid ${theme.colors.divider}`,
  },
  '& h3': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: 'clamp(1.2rem, 2.2cqi, 1.55rem)',
    letterSpacing: '-0.025em',
  },
  '& > header span': {
    color: theme.colors.textFaint,
    fontFamily: theme.type.mono,
    fontSize: theme.fontSizes.caption,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  '& > [role="alert"]': {
    marginBlockStart: theme.space.md,
    borderRadius: 0,
  },
  '&[data-project-ledger-section="archived"] [data-project-status]': {
    color: theme.colors.textFaint,
  },
  '& > button': {
    justifySelf: 'start',
    marginBlockStart: theme.space.md,
    borderRadius: 0,
  },
});

export const projectsLedgerListStyles = (): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

/** The row placeholder borrows the real row's separator so the ledger keeps its rhythm mid-load. */
export const projectsLedgerSkeletonStyles = (theme: Theme): CSSObject => ({
  ...projectsLedgerListStyles(),
  '& > li': { borderBlockEnd: `1px solid ${theme.colors.divider}` },
});

export const projectsLedgerRowStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: '5.5rem',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  alignItems: 'center',
  columnGap: theme.space.lg,
  rowGap: theme.space.sm,
  paddingBlock: theme.space.md,
  borderBlockEnd: `1px solid ${theme.colors.divider}`,
  '& [data-project-identity]': {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    alignItems: 'center',
    gap: theme.space.md,
  },
  /*
   * Sized against the container rather than the text, so raising the page to 200% grows the title
   * and leaves the poster alone. `aspect-ratio` inside the tile reserves the height before the
   * image arrives, so a row never jumps as posters load.
   */
  '& [data-project-poster]': { width: 'min(5.5rem, 26cqi)' },
  '& h4': {
    margin: 0,
    overflowWrap: 'anywhere',
    color: theme.colors.text,
    fontSize: theme.fontSizes.label,
    fontWeight: 700,
    lineHeight: 1.35,
  },
  '& [data-project-meta]': {
    minWidth: 0,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: `${theme.space.xs} ${theme.space.md}`,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
  },
  '& [data-project-status]': {
    color: theme.colors.accent,
    fontFamily: theme.type.mono,
    fontSize: theme.fontSizes.caption,
    fontWeight: 720,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  '& [data-project-updated]': { whiteSpace: 'nowrap' },
  '& [data-project-actions]': {
    minWidth: 0,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: theme.space.xxs,
  },
  '& [data-project-actions] > button': {
    minHeight: '2.75rem',
    minWidth: '2.75rem',
    paddingInline: theme.space.sm,
    border: 0,
    borderRadius: 0,
    color: theme.colors.textMuted,
    background: 'transparent',
    boxShadow: 'none',
    '&:hover:not(:disabled):not([aria-disabled="true"])': {
      color: theme.colors.text,
      background: 'transparent',
      textDecoration: 'underline',
      textUnderlineOffset: '0.25em',
      transform: 'none',
    },
  },
  '& [data-project-actions] > button[data-project-action="open"]': {
    color: theme.colors.accent,
  },
  '@container (min-width: 32rem)': {
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    '& [data-project-meta]': { gridColumn: 1 },
    '& [data-project-actions]': {
      gridColumn: 2,
      gridRow: '1 / span 2',
      justifyContent: 'flex-end',
    },
  },
  '@container (min-width: 52rem)': {
    gridTemplateColumns: 'minmax(10rem, 1fr) 7.5rem 12rem minmax(17rem, auto)',
    '& [data-project-meta]': { display: 'contents' },
    '& [data-project-status]': { gridColumn: 2 },
    '& [data-project-updated]': { gridColumn: 3 },
    '& [data-project-actions]': {
      gridColumn: 4,
      gridRow: 1,
      justifyContent: 'flex-end',
    },
  },
});

export const projectsLedgerEmptyStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  paddingBlock: theme.space.xl,
  borderBlockEnd: `1px solid ${theme.colors.divider}`,
  color: theme.colors.textMuted,
  '& strong': { color: theme.colors.text },
  '& p': { maxWidth: '46rem', margin: 0, lineHeight: 1.55 },
  '& [data-empty-state-preview]': { marginInline: 0, marginBlockEnd: theme.space.sm },
});
