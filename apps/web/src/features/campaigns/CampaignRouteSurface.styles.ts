import type { CSSObject, Theme } from '@emotion/react';

export const campaignBriefStyles = (theme: Theme): CSSObject => ({
  margin: `${theme.space.sm} 0 0`,
  maxWidth: '60rem',
  color: theme.colors.textMuted,
  lineHeight: 1.65,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
});

/** Keeps "Updated …" and the status pill on one wrapping line, outside the card's action row. */
export const campaignCardMetaStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.sm,
  marginTop: theme.space.sm,
});

export const campaignSearchRowStyles = (theme: Theme): CSSObject => ({
  paddingBlockStart: theme.space.lg,
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
  '& [data-campaign-identity]': {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    alignItems: 'center',
    gap: theme.space.md,
  },
  /* Fixed against the viewport, not the text, so 200% text grows the name and not the cover. */
  '& [data-campaign-cover]': { width: 'min(4.5rem, 20vw)' },
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
  '& [data-project-identity]': {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    alignItems: 'center',
    gap: theme.space.md,
  },
  '& [data-project-poster]': { width: 'min(5rem, 22vw)' },
  '& [data-project-actions]': { display: 'flex', flexWrap: 'wrap', gap: theme.space.sm },
  '@media (max-width: 39.99rem)': {
    '& article': { gridTemplateColumns: 'minmax(0, 1fr)' },
    '& [data-project-actions] > button': { flex: '1 1 auto' },
  },
});

/*
 * Surface layout for Campaigns.
 *
 * These moved out of `ProjectRouteSurface.styles.ts` when the Project surfaces were split into
 * their own files and stopped using them: a stylesheet named for a Project component was the
 * last place a Campaigns layout change would be looked for.
 */

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
  '& [data-empty-state-preview]': { marginBlockEnd: theme.space.sm },
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
