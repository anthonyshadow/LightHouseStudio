import type { CSSObject, Theme } from '@emotion/react';

export const projectsWorkspaceInnerStyles = (theme: Theme): CSSObject => ({
  minHeight: '100%',
  marginInline: 'auto',
  paddingInline: `clamp(${theme.space.md}, 4vw, ${theme.space.xxl})`,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  alignContent: 'start',
  containerType: 'inline-size',
  '& button': { borderRadius: 0 },
  '& > [role="alert"]': {
    marginBlockStart: theme.space.lg,
    borderRadius: 0,
  },
  '& > [role="status"]:empty': { display: 'none' },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    paddingInline: theme.space.md,
  },
});

export const projectsWorkspaceHeaderStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'end',
  gap: theme.space.xl,
  paddingBlock: `clamp(${theme.space.xl}, 5vw, 4.5rem) ${theme.space.xl}`,
  borderBlockEnd: `1px solid ${theme.colors.borderStrong}`,
  '& > div': { minWidth: 0 },
  '& h1': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: 'clamp(2.4rem, 5cqi, 4rem)',
    fontWeight: 660,
    letterSpacing: '-0.055em',
    lineHeight: 0.98,
  },
  '& p': {
    maxWidth: '42rem',
    margin: `${theme.space.md} 0 0`,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.label,
    lineHeight: 1.55,
  },
  '@container (max-width: 52rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    alignItems: 'stretch',
    gap: theme.space.lg,
  },
  '@container (max-width: 28rem)': {
    '& h1': { fontSize: 'clamp(2.15rem, 13cqi, 3rem)' },
    '& p': { fontSize: theme.fontSizes.body },
  },
});

export const projectsHeaderActionsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: theme.space.md,
  '& > button': {
    minWidth: '8rem',
    borderRadius: 0,
    boxShadow: 'none',
    whiteSpace: 'nowrap',
  },
  '& > button[data-project-create="named"]': {
    borderColor: theme.colors.accent,
    color: theme.colors.onAccent,
    background: theme.colors.accent,
    '&:hover:not(:disabled):not([aria-disabled="true"])': {
      borderColor: theme.colors.accentStrong,
      background: theme.colors.accentStrong,
      transform: 'none',
    },
  },
  '@container (max-width: 52rem)': {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    justifyContent: 'stretch',
    '& > button': { width: '100%', minWidth: 0 },
  },
  '@container (max-width: 28rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
});

export const projectsSearchRowStyles = (theme: Theme): CSSObject => ({
  paddingBlockStart: theme.space.lg,
});

export const projectsGroupFilterStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'end',
  gap: theme.space.lg,
  paddingBlock: theme.space.lg,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  '& > button': {
    position: 'relative',
    minWidth: 0,
    minHeight: '2.75rem',
    padding: `${theme.space.xs} 0`,
    border: 0,
    borderRadius: 0,
    color: theme.colors.textMuted,
    background: 'transparent',
    boxShadow: 'none',
    '&::after': {
      position: 'absolute',
      insetInline: 0,
      insetBlockEnd: `calc(-1 * ${theme.space.lg} - 1px)`,
      height: '2px',
      background: 'transparent',
      content: '""',
    },
    '&[aria-pressed="true"]': { color: theme.colors.text },
    '&[aria-pressed="true"]::after': { background: theme.colors.accent },
    '&:hover:not(:disabled):not([aria-disabled="true"])': {
      color: theme.colors.text,
      background: 'transparent',
      transform: 'none',
    },
  },
  '@container (max-width: 28rem)': {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: theme.space.md,
    '& > button': { width: '100%' },
  },
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
    borderBlockEnd: `1px solid ${theme.colors.borderStrong}`,
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
  '& > [role="status"]': {
    margin: 0,
    paddingBlock: theme.space.lg,
    borderBlockEnd: `1px solid ${theme.colors.border}`,
    color: theme.colors.textMuted,
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

export const projectsLedgerRowStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: '5.5rem',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  alignItems: 'center',
  columnGap: theme.space.lg,
  rowGap: theme.space.sm,
  paddingBlock: theme.space.md,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
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
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  color: theme.colors.textMuted,
  '& strong': { color: theme.colors.text },
  '& p': { maxWidth: '46rem', margin: 0, lineHeight: 1.55 },
  '& [data-empty-state-preview]': { marginInline: 0, marginBlockEnd: theme.space.sm },
});
