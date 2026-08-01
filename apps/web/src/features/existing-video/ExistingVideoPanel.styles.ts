import type { CSSObject, Theme } from '@emotion/react';

export const panelStackStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.md,
  '& h2, & h3, & p': { margin: 0 },
});

export const dropZoneStyles = (theme: Theme): CSSObject => ({
  minHeight: 'min(28rem, 68dvh)',
  display: 'grid',
  placeItems: 'center',
  gap: theme.space.lg,
  padding: `clamp(${theme.space.lg}, 6vw, ${theme.space.xxl})`,
  border: `1px dashed ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surface,
  textAlign: 'center',
  '& > div:first-of-type': { maxWidth: '32rem' },
  '& h2': { fontFamily: theme.type.display, fontSize: 'clamp(1.35rem, 4vw, 1.9rem)' },
  '& p': { marginBlockStart: theme.space.xs, color: theme.colors.textMuted, lineHeight: 1.5 },
  '@media (max-height: 36rem)': {
    minHeight: '18rem',
    padding: theme.space.lg,
    gap: theme.space.md,
  },
});

export const dropActionStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'center',
  gap: theme.space.xs,
  '& > *': { flex: '1 1 11rem' },
  '@media (max-width: 24rem)': {
    width: '100%',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
});

export const phaseNavStyles = (theme: Theme): CSSObject => ({
  position: 'sticky',
  top: `calc(-1 * ${theme.space.md})`,
  zIndex: 4,
  minWidth: 0,
  padding: `${theme.space.sm} 0`,
  background: theme.colors.overlaySurface,
  '& ol': {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: theme.space.xs,
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  '@media (max-height: 36rem)': {
    position: 'static',
    paddingBlockStart: 0,
  },
});

export const phaseItemStyles = (
  theme: Theme,
  state: 'current' | 'complete' | 'upcoming',
): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  gap: theme.space.xs,
  padding: `${theme.space.xs} ${theme.space.sm}`,
  border: `1px solid ${state === 'current' ? theme.colors.accent : theme.colors.border}`,
  borderRadius: theme.radii.round,
  color:
    state === 'current'
      ? theme.colors.accentStrong
      : state === 'complete'
        ? theme.colors.text
        : theme.colors.textFaint,
  background: state === 'current' ? theme.colors.accentSoft : theme.colors.surfaceSoft,
  fontSize: theme.fontSizes.metadata,
  fontWeight: 760,
  '& span:first-of-type': {
    width: '1.35rem',
    height: '1.35rem',
    flex: '0 0 auto',
    display: 'grid',
    placeItems: 'center',
    borderRadius: theme.radii.round,
    color: state === 'current' ? theme.colors.onAccent : 'inherit',
    background: state === 'current' ? theme.colors.accent : theme.colors.surfaceStrong,
    fontSize: theme.fontSizes.caption,
  },
  '& span:last-of-type': {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '@media (max-width: 22rem)': {
    justifyContent: 'center',
    paddingInline: theme.space.xs,
    '& span:last-of-type': {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
    },
  },
});

export const workspaceStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignItems: 'start',
  gap: theme.space.lg,
  '@media (min-width: 64rem)': {
    gridTemplateColumns: 'minmax(17rem, 0.9fr) minmax(22rem, 1.1fr)',
  },
});

export const sourceColumnStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.sm,
  '@media (min-width: 64rem)': {
    position: 'sticky',
    top: '4.5rem',
  },
});

export const sourceCardStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surfaceSoft,
  boxShadow: theme.shadows.soft,
});

export const sourceHeadingStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'start',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  '& > div': { minWidth: 0 },
  '& h2': { fontFamily: theme.type.display, fontSize: theme.fontSizes.section },
  '& p': {
    marginBlockStart: theme.space.xxs,
    overflow: 'hidden',
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& > span': {
    flex: '0 0 auto',
    padding: `0.2rem ${theme.space.xs}`,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.round,
    color: theme.colors.textMuted,
    background: theme.colors.surfaceStrong,
    fontSize: theme.fontSizes.caption,
  },
});

export const sourceFactsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  '& span': {
    padding: `0.25rem ${theme.space.xs}`,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.round,
    color: theme.colors.textMuted,
    background: theme.colors.surfaceStrong,
    fontSize: theme.fontSizes.caption,
  },
});

export const sourceDetailsStyles = (theme: Theme): CSSObject => ({
  borderBlockStart: `1px solid ${theme.colors.border}`,
  '& summary': {
    minHeight: '2.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    color: theme.colors.textMuted,
    cursor: 'pointer',
    fontSize: theme.fontSizes.metadata,
    fontWeight: 720,
    listStyle: 'none',
    '&::-webkit-details-marker': { display: 'none' },
    '&::after': { content: '"+"', color: theme.colors.accent },
  },
  '&[open] summary::after': { content: '"−"' },
});

export const sourceManagementStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.space.xs,
  paddingBlockStart: theme.space.xs,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  '& > *': { minWidth: 0, minHeight: '2.75rem' },
  '@media (max-width: 22rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

export const metadataStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.space.xs,
  margin: 0,
  paddingBlockEnd: theme.space.xs,
  '& div': {
    minWidth: 0,
    padding: theme.space.xs,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.small,
    background: theme.colors.surfaceStrong,
  },
  '& dt': { color: theme.colors.textMuted, fontSize: theme.fontSizes.caption, fontWeight: 760 },
  '& dd': {
    margin: `${theme.space.xxs} 0 0`,
    overflowWrap: 'anywhere',
    fontSize: theme.fontSizes.caption,
  },
  '@media (max-width: 22rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

export const comparisonStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.space.xs,
  '& > *': { width: '100%' },
});

export const editorColumnStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.md,
});

export const sectionHeadingStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xxs,
  '& h2': { fontFamily: theme.type.display, fontSize: '1.3rem' },
  '& p': { color: theme.colors.textMuted, lineHeight: 1.5 },
});

export const toolGroupsStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
  gap: theme.space.xs,
  '@media (max-width: 34rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

export const toolGroupStyles = (theme: Theme, columns: number): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateRows: 'auto 1fr',
  gap: theme.space.xxs,
  '& > p': {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.35,
  },
  '& > p strong': { color: theme.colors.text, fontSize: theme.fontSizes.metadata },
  '& > div': {
    minWidth: 0,
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
    gap: theme.space.xs,
  },
  '& > div > button': { height: '100%' },
  '@media (max-width: 34rem)': {
    '& > div': { gridTemplateColumns: 'minmax(0, 1fr)' },
  },
});

export const toolCardStyles = (theme: Theme, active: boolean, unavailable: boolean): CSSObject => ({
  minWidth: 0,
  minHeight: '6.25rem',
  display: 'grid',
  alignContent: 'space-between',
  gap: theme.space.sm,
  padding: theme.space.sm,
  border: `1px solid ${active ? theme.colors.accent : theme.colors.border}`,
  borderRadius: theme.radii.medium,
  color: unavailable ? theme.colors.textFaint : theme.colors.text,
  background: active ? theme.colors.accentSoft : theme.colors.surface,
  textAlign: 'start',
  cursor: unavailable ? 'not-allowed' : 'pointer',
  opacity: unavailable ? 0.66 : 1,
  scrollMarginBlock: '8rem',
  '&:hover:not(:disabled)': { borderColor: theme.colors.accent },
  '&:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '3px' },
  '& strong': { display: 'block', fontSize: theme.fontSizes.body },
  '& small': {
    display: 'block',
    marginBlockStart: theme.space.xxs,
    color: active ? theme.colors.accentStrong : theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.35,
  },
});

export const toolStatusStyles = (theme: Theme, active: boolean): CSSObject => ({
  justifySelf: 'start',
  padding: `0.18rem ${theme.space.xs}`,
  borderRadius: theme.radii.round,
  color: active ? theme.colors.onAccent : theme.colors.textMuted,
  background: active ? theme.colors.accent : theme.colors.surfaceStrong,
  fontSize: theme.fontSizes.caption,
  fontWeight: 760,
});

export const activeConfigurationStyles = (): CSSObject => ({
  scrollMarginBlockStart: '7rem',
});

export const configCardStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surface,
  '& textarea': {
    width: '100%',
    minHeight: '6rem',
    resize: 'vertical',
    padding: theme.space.sm,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.small,
    color: theme.colors.text,
    background: theme.colors.surfaceStrong,
    font: 'inherit',
  },
  '& select, & input[type="url"]': {
    width: '100%',
    minHeight: '2.75rem',
    padding: theme.space.xs,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.small,
    color: theme.colors.text,
    background: theme.colors.surfaceStrong,
    font: 'inherit',
  },
  '& label': { display: 'grid', gap: theme.space.xxs },
  '& input[type="checkbox"]': { width: '1.2rem', height: '1.2rem' },
});

export const configHeaderStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'start',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  '& h3': { fontFamily: theme.type.display, fontSize: theme.fontSizes.section },
  '& span': {
    flex: '0 0 auto',
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
  },
});

export const rowStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  alignItems: 'stretch',
  '& > *': { minHeight: '2.75rem' },
});

export const inputModeStyles = (theme: Theme): CSSObject => ({
  ...rowStyles(theme),
  '& > *': { flex: '1 1 9rem' },
});

export const advancedStyles = (theme: Theme): CSSObject => ({
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surfaceSoft,
  '& summary': {
    minHeight: '2.75rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: `0 ${theme.space.sm}`,
    color: theme.colors.textMuted,
    cursor: 'pointer',
    fontWeight: 720,
    listStyle: 'none',
    '&::-webkit-details-marker': { display: 'none' },
    '&::after': { content: '"+"', color: theme.colors.accent },
  },
  '&[open] summary::after': { content: '"−"' },
  '& > div': { padding: `0 ${theme.space.sm} ${theme.space.sm}` },
});

export const localEffectGridStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: theme.space.xs,
  '@media (max-width: 34rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
  '& button': {
    minHeight: '4.5rem',
    display: 'grid',
    alignContent: 'center',
    gap: theme.space.xxs,
    textAlign: 'start',
  },
  '& small': { color: theme.colors.textMuted, lineHeight: 1.35 },
});

export const processingStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
  padding: theme.space.lg,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surface,
  textAlign: 'center',
  '& [data-processing-mark]': {
    width: '3rem',
    height: '3rem',
    display: 'grid',
    placeItems: 'center',
    justifySelf: 'center',
    border: `1px solid ${theme.colors.accent}`,
    borderRadius: theme.radii.round,
    color: theme.colors.accent,
    background: theme.colors.accentSoft,
    fontWeight: 800,
  },
  '& p': { color: theme.colors.textMuted, lineHeight: 1.5 },
});

export const resultStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.md,
  padding: theme.space.lg,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.large,
  background: theme.colors.surface,
  '& h2': { fontFamily: theme.type.display, fontSize: '1.4rem' },
  '& p': { color: theme.colors.textMuted, lineHeight: 1.5 },
});

export const appliedSummaryStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  '& span': {
    padding: `0.28rem ${theme.space.sm}`,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.round,
    color: theme.colors.textMuted,
    background: theme.colors.surfaceStrong,
    fontSize: theme.fontSizes.caption,
  },
});

export const actionBarStyles = (theme: Theme): CSSObject => ({
  position: 'sticky',
  bottom: `calc(-1 * ${theme.space.md})`,
  zIndex: 5,
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  marginInline: `calc(-1 * ${theme.space.md})`,
  padding: `${theme.space.sm} max(${theme.space.md}, env(safe-area-inset-right)) max(${theme.space.md}, env(safe-area-inset-bottom)) max(${theme.space.md}, env(safe-area-inset-left))`,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  background: theme.colors.overlaySurface,
  boxShadow: '0 -18px 34px rgba(2, 4, 5, 0.22)',
  '&[aria-label="Result actions"]': {
    '@media (max-height: 36rem)': {
      position: 'static',
      marginBlockEnd: `calc(-1 * ${theme.space.md})`,
      boxShadow: 'none',
    },
  },
  '&[aria-label="Editing actions"]': {
    '@media (max-width: 32rem)': {
      '& > div:first-of-type span': { display: 'none' },
    },
  },
  '@media (max-height: 28rem)': {
    position: 'static',
    marginBlockEnd: `calc(-1 * ${theme.space.md})`,
    boxShadow: 'none',
  },
});

export const actionSummaryStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xxs,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.caption,
  lineHeight: 1.4,
  '& strong': { color: theme.colors.text, fontSize: theme.fontSizes.metadata },
});

export const actionButtonsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xs,
  alignItems: 'stretch',
  '& > *': { flex: '1 1 9rem', minWidth: 0, minHeight: '2.85rem' },
  '@media (max-width: 32rem)': {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    '& > *': { width: '100%' },
  },
});

export const downloadButtonStyles = (theme: Theme): CSSObject => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.7rem 1rem',
  border: '1px solid transparent',
  borderRadius: theme.radii.medium,
  color: theme.colors.onAccent,
  background: `linear-gradient(135deg, ${theme.colors.accentStrong}, ${theme.colors.accent})`,
  boxShadow: theme.shadows.soft,
  fontWeight: 720,
  lineHeight: 1.1,
  textDecoration: 'none',
  WebkitTapHighlightColor: 'transparent',
  '&:hover': { transform: 'translateY(-1px)' },
  '&:active': { transform: 'translateY(0)' },
  '&:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '3px' },
});
