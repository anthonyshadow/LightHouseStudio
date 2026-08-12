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

export const workspaceInnerStyles = (theme: Theme): CSSObject => ({
  width: 'min(100%, 88rem)',
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

export const listLayoutStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1.65fr) minmax(18rem, 0.75fr)',
  alignItems: 'start',
  gap: theme.space.lg,
  '@media (max-width: 62rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
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

export const projectListStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.sm,
  margin: 0,
  padding: 0,
  listStyle: 'none',
});

export const projectCardStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.md,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surface,
  '& h4': {
    margin: 0,
    overflowWrap: 'anywhere',
    fontSize: theme.fontSizes.label,
  },
  '& [data-project-meta]': {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.xs,
    marginBlockStart: theme.space.xs,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
  },
  '& [data-project-actions]': {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: theme.space.xs,
  },
  '@media (max-width: 39.99rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
    '& [data-project-actions]': { justifyContent: 'stretch' },
    '& [data-project-actions] > button': { flex: '1 1 auto' },
  },
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
  gridTemplateColumns: 'minmax(0, 1fr) minmax(16rem, 0.8fr)',
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
  '@media (max-width: 48rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

export const dialogActionsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: theme.space.sm,
});
