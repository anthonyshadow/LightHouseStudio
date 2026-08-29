import type { CSSObject, Theme } from '@emotion/react';

/**
 * The launcher section declares its own container-query context.
 *
 * The workspace route is `display: contents` and the Studio grid only opens a container below
 * `laptop`, so on a desktop the inspector column offers none at all. The Save task solves this the
 * same way on its own surface. Every reflow in this panel is caused by the panel's own width — the
 * same markup is ~20rem beside the stage and ~47rem stacked under it — so a viewport tier would be
 * the wrong instrument even where one existed.
 */
export const createLauncherSurfaceStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.sm,
  containerType: 'inline-size',
  '& > header': { display: 'grid', gap: theme.space.xxs },
  '& > header h3': {
    margin: 0,
    color: theme.colors.text,
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.label,
    fontWeight: 650,
    letterSpacing: '-0.01em',
  },
  '& > header p': {
    margin: 0,
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.45,
  },
});

export const createLauncherGridStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: theme.space.md,
  margin: 0,
  padding: 0,
  listStyle: 'none',
  '& > *': { minWidth: 0 },
  '@container (min-width: 34rem)': {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    // The on-device editor spans the row it shares with nothing, so a two-up grid does not leave a
    // hole beside it.
    '& > [data-create-launcher="adjust"]': { gridColumn: '1 / -1' },
  },
  '@container (min-width: 58rem)': {
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    '& > [data-create-launcher="adjust"]': { gridColumn: 'auto' },
  },
});

export const createLauncherCardStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  height: '100%',
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.xxs,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  '& h4': {
    minWidth: 0,
    margin: 0,
    color: theme.colors.text,
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.label,
    fontWeight: 650,
    overflowWrap: 'anywhere',
  },
  '& p, & small': { minWidth: 0, margin: 0, overflowWrap: 'anywhere' },
  '& p': { color: theme.colors.textMuted, fontSize: theme.fontSizes.metadata, lineHeight: 1.45 },
  '& small': { color: theme.colors.textFaint, fontSize: theme.fontSizes.caption, lineHeight: 1.45 },
  '& [data-create-launcher-input]': {
    minWidth: 0,
    display: 'grid',
    gap: theme.space.xxs,
    marginBlockStart: theme.space.xxs,
    paddingBlock: theme.space.xs,
    borderBlock: `1px solid ${theme.colors.divider}`,
  },
  '& [data-create-launcher-input-label]': {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    fontWeight: 800,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  '& [data-create-launcher-input-value]': {
    minWidth: 0,
    color: theme.colors.text,
    fontSize: theme.fontSizes.metadata,
    overflowWrap: 'anywhere',
  },
  '& [data-create-launcher-input-value][data-empty]': { color: theme.colors.textFaint },
  '& [data-create-launcher-input] button': { justifySelf: 'start', marginBlockStart: 0 },
  // The row only goes three-up once the card itself is wide enough to hold a value beside its
  // label; at inspector width it stays stacked.
  '@container (min-width: 30rem)': {
    '& [data-create-launcher-input]': {
      gridTemplateColumns: '5.5rem minmax(0, 1fr) auto',
      alignItems: 'center',
      columnGap: theme.space.sm,
    },
  },
  '& [data-create-launcher-blocked]': { color: theme.colors.warning },
  '& button': { width: '100%', marginBlockStart: theme.space.xs },
});

export const createEmptyStateStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  justifyItems: 'start',
  paddingBlock: theme.space.lg,
  color: theme.colors.textMuted,
  '& h3': {
    margin: 0,
    color: theme.colors.text,
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.label,
    fontWeight: 650,
  },
  '& p': { maxWidth: '46rem', margin: 0, fontSize: theme.fontSizes.metadata, lineHeight: 1.55 },
  '& [data-empty-state-preview]': { marginInline: 0, marginBlockEnd: theme.space.xs },
  '& button': { marginBlockStart: theme.space.xs },
});
