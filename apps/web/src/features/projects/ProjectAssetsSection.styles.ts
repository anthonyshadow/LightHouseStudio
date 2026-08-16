import type { CSSObject, Theme } from '@emotion/react';

export const projectAssetsSectionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  alignContent: 'start',
  paddingBlock: `clamp(${theme.space.xl}, 4cqi, 2.5rem) ${theme.space.xxl}`,
  '& > [role="alert"], & > [role="status"]': {
    marginBlockEnd: theme.space.lg,
    borderRadius: 0,
  },
  '& > p[role="status"]': {
    margin: 0,
    paddingBlock: theme.space.xl,
    borderBlockEnd: `1px solid ${theme.colors.border}`,
    color: theme.colors.textMuted,
  },
  '& > button': {
    justifySelf: 'start',
    marginBlockStart: theme.space.xl,
    border: 0,
    borderRadius: 0,
    background: 'transparent',
    boxShadow: 'none',
  },
});

export const projectAssetsHeaderStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: theme.space.md,
  marginBlockEnd: theme.space.xl,
  '& h2': {
    margin: 0,
    fontFamily: theme.type.display,
    fontSize: '1.25rem',
    fontWeight: 650,
    letterSpacing: '-0.025em',
  },
  '& [data-project-assets-read-only]': {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
  },
});

export const addAssetActionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: '2.75rem',
  padding: 0,
  border: 0,
  borderRadius: 0,
  color: theme.colors.accent,
  background: 'transparent',
  boxShadow: 'none',
  fontSize: theme.fontSizes.body,
  '& svg': { width: '1rem', height: '1rem' },
  '&:hover:not(:disabled):not([aria-disabled="true"])': {
    color: theme.colors.accentStrong,
    background: 'transparent',
    transform: 'none',
  },
});

export const projectAssetFiltersStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'end',
  gap: theme.space.xl,
  marginBlockEnd: `clamp(${theme.space.xl}, 4cqi, 2.5rem)`,
  overscrollBehaviorInline: 'contain',
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  scrollbarWidth: 'thin',
  '& > button': {
    position: 'relative',
    minWidth: 'max-content',
    minHeight: '2.75rem',
    padding: `0 0 ${theme.space.md}`,
    border: 0,
    borderRadius: 0,
    color: theme.colors.textMuted,
    background: 'transparent',
    boxShadow: 'none',
    fontSize: theme.fontSizes.body,
    fontWeight: 600,
    '&::after': {
      position: 'absolute',
      insetInline: 0,
      insetBlockEnd: '-1px',
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
});

export const projectAssetGridStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  columnGap: theme.space.lg,
  rowGap: theme.space.xxl,
  margin: 0,
  padding: 0,
  listStyle: 'none',
  '@container (min-width: 32rem)': {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  },
  '@container (min-width: 58rem)': {
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  },
  '@container (min-width: 78rem)': {
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
  },
});

export const projectAssetItemStyles = (theme: Theme): CSSObject => ({
  height: '100%',
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: theme.space.xs,
  padding: 0,
  border: 0,
  borderRadius: 0,
  background: 'transparent',
  boxShadow: 'none',
  '& h3': {
    margin: 0,
    overflowWrap: 'anywhere',
    color: theme.colors.text,
    fontSize: '0.9375rem',
    fontWeight: 620,
    lineHeight: 1.35,
  },
  '& [data-project-asset-kind]': {
    color: theme.colors.accent,
    fontSize: '0.625rem',
    fontWeight: 820,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  '& [data-project-asset-id]': {
    minWidth: 0,
    color: theme.colors.textFaint,
    fontFamily: theme.type.mono,
    fontSize: '0.6875rem',
    overflowWrap: 'anywhere',
  },
  '& > [role="status"]': { marginBlock: theme.space.xs, borderRadius: 0 },
});

export const assetThumbnailStyles = (theme: Theme, unavailable: boolean): CSSObject => ({
  position: 'relative',
  width: '100%',
  aspectRatio: '16 / 9',
  display: 'grid',
  placeItems: 'center',
  marginBlockEnd: theme.space.xxs,
  overflow: 'hidden',
  borderRadius: '0.25rem',
  color: unavailable ? theme.colors.warning : theme.colors.textMuted,
  background: theme.colors.surfaceSoft,
});

export const assetThumbnailFallbackStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  placeItems: 'center',
  padding: theme.space.md,
  textAlign: 'center',
  '& svg': { width: '2.25rem', height: '2.25rem', strokeWidth: 1.5 },
  '& small': {
    color: theme.colors.textFaint,
    fontSize: '0.625rem',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
});

export const assetThumbnailPlayStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  insetBlockStart: '50%',
  insetInlineStart: '50%',
  width: '2.75rem',
  height: '2.75rem',
  display: 'grid',
  placeItems: 'center',
  border: `1px solid color-mix(in srgb, ${theme.colors.text} 30%, transparent)`,
  borderRadius: theme.radii.round,
  color: theme.colors.text,
  background: 'rgba(2, 5, 9, 0.72)',
  transform: 'translate(-50%, -50%)',
  '& svg': { width: '1.35rem', height: '1.35rem', strokeWidth: 1.6 },
});

export const projectAssetMetaStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: theme.space.sm,
});

export const projectAssetActionsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.md,
  marginBlockStart: 'auto',
  '& > button': {
    minWidth: 0,
    minHeight: '2.75rem',
    padding: `${theme.space.xs} 0`,
    border: 0,
    borderRadius: 0,
    color: theme.colors.textMuted,
    background: 'transparent',
    boxShadow: 'none',
    fontSize: theme.fontSizes.caption,
    fontWeight: 650,
    textAlign: 'start',
    '&:hover:not(:disabled):not([aria-disabled="true"])': {
      color: theme.colors.text,
      background: 'transparent',
      textDecoration: 'underline',
      textUnderlineOffset: '0.3em',
      transform: 'none',
    },
  },
  '& > button[data-project-asset-action="open"]': { color: theme.colors.accent },
  '& > button[data-project-asset-action="detach"]': { color: theme.colors.danger },
});

export const projectAssetsEmptyStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  paddingBlock: theme.space.xxl,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  color: theme.colors.textMuted,
  '& strong': { color: theme.colors.text, fontSize: theme.fontSizes.label },
  '& p': { maxWidth: '42rem', margin: 0, lineHeight: 1.55 },
});

export const projectAssetsOwnershipStyles = (theme: Theme): CSSObject => ({
  margin: `${theme.space.xxl} 0 0`,
  paddingBlockStart: theme.space.md,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  color: theme.colors.textFaint,
  fontSize: theme.fontSizes.caption,
  lineHeight: 1.5,
});
