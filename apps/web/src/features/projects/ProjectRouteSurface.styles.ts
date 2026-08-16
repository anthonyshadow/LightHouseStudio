import type { CSSObject, Theme } from '@emotion/react';

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
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  border: 0,
  borderRadius: 0,
  background: theme.colors.canvas,
  scrollbarGutter: 'stable',
  containerType: 'inline-size',
});

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
  '& > button[data-project-create="quick"]': {
    borderColor: 'transparent',
    color: theme.colors.textMuted,
    background: 'transparent',
    textDecoration: 'underline',
    textDecorationColor: theme.colors.borderStrong,
    textUnderlineOffset: '0.3em',
    '&:hover:not(:disabled):not([aria-disabled="true"])': {
      color: theme.colors.text,
      background: 'transparent',
      textDecorationColor: theme.colors.accent,
      transform: 'none',
    },
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
  '& [data-project-identity]': { minWidth: 0 },
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
  '& [data-project-actions] > button[data-project-action="delete"]': {
    color: theme.colors.danger,
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
});

export const workspaceInnerStyles = (theme: Theme): CSSObject => ({
  minHeight: '100%',
  marginInline: 'auto',
  padding: `clamp(${theme.space.md}, 3vw, ${theme.space.xxl})`,
  display: 'grid',
  alignContent: 'start',
  gap: `clamp(${theme.space.lg}, 3vw, ${theme.space.xl})`,
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    padding: theme.space.md,
    gap: theme.space.lg,
  },
});

export const projectOverviewInnerStyles = (theme: Theme): CSSObject => ({
  minHeight: '100%',
  marginInline: 'auto',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  alignContent: 'start',
  '& > [role="status"]:empty': { display: 'none' },
  '@container (max-width: 52rem)': {
    paddingInline: 'clamp(1.5rem, 4cqi, 2.5rem)',
  },
  '@container (max-width: 30rem)': {
    paddingBlock: theme.space.xl,
    paddingInline: theme.space.md,
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

export const projectOverviewHeaderStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  '& [data-detail-breadcrumb]': {
    justifySelf: 'start',
    minWidth: 0,
    minHeight: '2.75rem',
    marginBlockEnd: theme.space.xl,
    padding: `${theme.space.xs} 0`,
    border: 0,
    borderRadius: 0,
    color: theme.colors.textMuted,
    background: 'transparent',
    boxShadow: 'none',
    fontSize: theme.fontSizes.body,
    fontWeight: 600,
    '&:hover:not(:disabled):not([aria-disabled="true"])': {
      color: theme.colors.text,
      background: 'transparent',
      transform: 'none',
    },
  },
  '& [data-detail-identity]': {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'end',
    gap: theme.space.xl,
    paddingBlockEnd: '2.5rem',
    borderBlockEnd: `1px solid ${theme.colors.border}`,
  },
  '& [data-detail-identity] > div:first-of-type': {
    minWidth: 0,
    width: '100%',
  },
  '& h1': {
    width: '100%',
    maxWidth: '48rem',
    margin: 0,
    overflowWrap: 'anywhere',
    fontFamily: theme.type.display,
    fontSize: 'clamp(2.25rem, 4cqi, 3rem)',
    fontWeight: 660,
    letterSpacing: '-0.05em',
    lineHeight: 1,
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
  '& [data-detail-actions]': {
    minWidth: 0,
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: `${theme.space.xs} ${theme.space.lg}`,
  },
  '& [data-detail-actions] > button': {
    minWidth: 0,
    minHeight: '2.75rem',
    padding: `${theme.space.xs} 0`,
    border: 0,
    borderRadius: 0,
    color: theme.colors.textMuted,
    background: 'transparent',
    boxShadow: 'none',
    fontSize: theme.fontSizes.body,
    fontWeight: 600,
    '&:hover:not(:disabled):not([aria-disabled="true"])': {
      color: theme.colors.text,
      background: 'transparent',
      transform: 'none',
    },
  },
  '& [data-detail-actions] > button[data-detail-action="continue"]': {
    minWidth: '9.5rem',
    paddingInline: theme.space.lg,
    borderRadius: theme.radii.small,
    color: theme.colors.onAccent,
    background: theme.colors.accent,
    '&:hover:not(:disabled):not([aria-disabled="true"])': {
      color: theme.colors.onAccent,
      background: theme.colors.accentStrong,
    },
  },
  '& [data-detail-actions] > button[data-detail-action="archive"], & [data-detail-actions] > button[data-detail-action="delete"]':
    {
      color: theme.colors.danger,
    },
  '@container (max-width: 64rem)': {
    '& [data-detail-identity]': {
      gridTemplateColumns: 'minmax(0, 1fr)',
      alignItems: 'stretch',
    },
    '& [data-detail-identity] > div:first-of-type': { maxWidth: 'none' },
    '& h1': { maxWidth: 'none' },
    '& [data-detail-actions]': { justifyContent: 'flex-start' },
  },
  '@container (max-width: 30rem)': {
    '& [data-detail-breadcrumb]': { marginBlockEnd: theme.space.lg },
    '& [data-detail-identity]': { gap: theme.space.lg, paddingBlockEnd: theme.space.xl },
    '& h1': { fontSize: 'clamp(2rem, 11cqi, 2.6rem)' },
    '& [data-detail-meta]': { columnGap: theme.space.md, fontSize: theme.fontSizes.metadata },
    '& [data-detail-actions]': {
      display: 'grid',
      gridTemplateColumns: 'repeat(3, minmax(0, auto))',
      justifyContent: 'start',
    },
    '& [data-detail-actions] > button[data-detail-action="continue"]': {
      width: '100%',
      gridColumn: '1 / -1',
    },
  },
  '@container (max-width: 21rem)': {
    '& [data-detail-actions]': { gridTemplateColumns: 'repeat(2, minmax(0, auto))' },
  },
});

export const emptyProjectStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: theme.space.lg,
  padding: `clamp(${theme.space.lg}, 4vw, ${theme.space.xxl})`,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  boxShadow: theme.shadows.soft,
  '& h3': { margin: 0, fontSize: 'clamp(1.25rem, 3vw, 1.7rem)' },
  '& p': { margin: `${theme.space.sm} 0 0`, color: theme.colors.textMuted, lineHeight: 1.65 },
  '& [data-source-actions]': { display: 'grid', gap: theme.space.sm },
  '& [data-source-actions] > button': { width: '100%', justifyContent: 'flex-start' },
  '& [data-source-actions] small': {
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.5,
  },
});

export const dialogActionsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: theme.space.sm,
});
