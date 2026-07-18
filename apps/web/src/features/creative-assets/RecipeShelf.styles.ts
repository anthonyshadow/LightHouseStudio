import type { CSSObject, Theme } from '@emotion/react';

export const shelfSurfaceStyles = (theme: Theme, embedded = false): CSSObject => ({
  width: '100%',
  height: '100%',
  maxHeight: '100%',
  minWidth: 0,
  minHeight: embedded ? 0 : '18rem',
  padding: 0,
  overflow: 'hidden',
  background: theme.gradients.shellAmbient,
  '@media (max-width: 40rem)': {
    minHeight: embedded ? 0 : '20rem',
    borderRadius: theme.radii.medium,
  },
  '@media (max-height: 38rem)': {
    minHeight: embedded ? 0 : '15rem',
  },
});

export const shelfStyles = (embedded = false): CSSObject => ({
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  gridTemplateRows: embedded ? 'minmax(0, 1fr) auto' : 'auto minmax(0, 1fr) auto',
  overflow: 'hidden',
});

export const controlsRegionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  background: theme.colors.surfaceSoft,
});

export const shelfHeaderStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: theme.space.md,
  padding: `clamp(${theme.space.md}, 2vw, ${theme.space.lg})`,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  background: theme.colors.overlaySurface,
  '@media (max-width: 38rem)': {
    display: 'grid',
    padding: theme.space.md,
  },
  '@media (max-height: 38rem)': {
    padding: theme.space.sm,
  },
});

export const headerCopyStyles = (): CSSObject => ({
  minWidth: 0,
});

export const headerActionsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  justifyItems: 'end',
  gap: theme.space.xs,
  '@media (max-width: 38rem)': {
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    justifyItems: 'stretch',
  },
});

export const eyebrowStyles = (theme: Theme): CSSObject => ({
  margin: `0 0 ${theme.space.xs}`,
  color: theme.colors.accent,
  fontSize: theme.fontSizes.caption,
  fontWeight: 820,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
});

export const titleStyles = (theme: Theme): CSSObject => ({
  margin: `0 0 ${theme.space.xs}`,
  color: theme.colors.text,
  fontFamily: theme.type.display,
  fontSize: 'clamp(1.25rem, 2vw, 1.7rem)',
  lineHeight: 1.2,
  letterSpacing: '-0.025em',
  overflowWrap: 'anywhere',
});

export const introStyles = (theme: Theme): CSSObject => ({
  maxWidth: '60ch',
  margin: 0,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.body,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
  '@media (max-height: 38rem)': {
    display: 'none',
  },
});

export const modePillStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  maxWidth: '100%',
  padding: `${theme.space.xs} ${theme.space.sm}`,
  overflow: 'hidden',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.round,
  color: theme.colors.accentStrong,
  background: theme.colors.accentSoft,
  fontSize: theme.fontSizes.caption,
  fontWeight: 760,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const noticeRegionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  padding: `${theme.space.sm} clamp(${theme.space.md}, 2vw, ${theme.space.lg}) 0`,
});

export const toolbarStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(12rem, 1fr) minmax(10rem, 14rem)',
  alignItems: 'end',
  gap: theme.space.sm,
  padding: theme.space.md,
  borderBlockEnd: `1px solid ${theme.colors.border}`,
  background: theme.colors.surfaceSoft,
  '@media (max-width: 40rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
});

export const categoryStyles = (theme: Theme): CSSObject => ({
  gridColumn: '1 / -1',
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 8rem), 1fr))',
  gap: theme.space.xxs,
  padding: theme.space.xxs,
  overflow: 'hidden',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
});

export const categoryButtonStyles = (theme: Theme, selected: boolean): CSSObject => ({
  minWidth: 0,
  minHeight: '2.75rem',
  padding: `${theme.space.xs} ${theme.space.sm}`,
  overflow: 'hidden',
  border: `1px solid ${selected ? theme.colors.accent : 'transparent'}`,
  borderRadius: `calc(${theme.radii.medium} - 0.2rem)`,
  color: selected ? theme.colors.onAccent : theme.colors.textMuted,
  background: selected ? theme.colors.accent : 'transparent',
  fontSize: theme.fontSizes.body,
  fontWeight: 760,
  lineHeight: 1.2,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  transition: `color ${theme.motion.quick}, border-color ${theme.motion.quick}, background ${theme.motion.quick}`,
  '&:hover:not(:disabled)': {
    color: selected ? theme.colors.onAccent : theme.colors.text,
    background: selected ? theme.colors.accentStrong : theme.colors.surfaceStrong,
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
  '&:disabled': { cursor: 'not-allowed', opacity: 0.55 },
});

export const countStyles = (theme: Theme): CSSObject => ({
  opacity: 0.74,
  fontFamily: theme.type.mono,
  fontSize: theme.fontSizes.caption,
});

export const shelfBodyStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.md,
  padding: theme.space.md,
  overflow: 'auto',
  overscrollBehavior: 'contain',
  scrollbarGutter: 'stable',
  scrollbarColor: `${theme.colors.borderStrong} transparent`,
});

export const listStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  margin: 0,
  padding: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 15rem), 1fr))',
  alignItems: 'stretch',
  gap: theme.space.sm,
  listStyle: 'none',
  '@media (max-width: 38rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
});

export const listItemStyles = (): CSSObject => ({
  minWidth: 0,
});

export const cardStyles = (theme: Theme, selected = false): CSSObject => ({
  height: '100%',
  minWidth: 0,
  padding: theme.space.md,
  display: 'grid',
  gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
  gap: theme.space.sm,
  overflow: 'hidden',
  border: `1px solid ${selected ? theme.colors.accent : theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: selected
    ? `linear-gradient(145deg, ${theme.colors.accentSoft}, ${theme.colors.surface})`
    : theme.colors.surface,
  boxShadow: selected ? theme.shadows.focus : theme.shadows.soft,
  transition: `border-color ${theme.motion.quick}, transform ${theme.motion.quick}, box-shadow ${theme.motion.quick}`,
  '&:hover': {
    borderColor: selected ? theme.colors.accentStrong : theme.colors.borderStrong,
    transform: 'translateY(-1px)',
  },
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
    '&:hover': { transform: 'none' },
  },
});

export const cardHeaderStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
  gap: theme.space.sm,
});

export const cardTitleStyles = (): CSSObject => ({
  minWidth: 0,
  margin: 0,
  fontSize: '0.98rem',
  lineHeight: 1.35,
  overflowWrap: 'anywhere',
});

export const cardSelectButtonStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: '2.75rem',
  margin: '-0.55rem 0',
  padding: '0.55rem 0',
  border: 0,
  color: theme.colors.text,
  background: 'transparent',
  font: 'inherit',
  fontWeight: 760,
  lineHeight: 'inherit',
  textAlign: 'start',
  overflowWrap: 'anywhere',
  cursor: 'pointer',
  '&:hover': { color: theme.colors.accentStrong },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
    borderRadius: theme.radii.small,
  },
});

export const cardBadgeGroupStyles = (theme: Theme): CSSObject => ({
  flex: '0 1 auto',
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: theme.space.xxs,
});

export const metadataStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.xs,
  color: theme.colors.textFaint,
  fontSize: theme.fontSizes.caption,
  lineHeight: 1.4,
  overflowWrap: 'anywhere',
});

export const badgeStyles = (
  theme: Theme,
  tone: 'accent' | 'signal' | 'neutral' = 'neutral',
): CSSObject => ({
  maxWidth: '100%',
  padding: '0.2rem 0.45rem',
  overflow: 'hidden',
  borderRadius: theme.radii.round,
  color:
    tone === 'accent'
      ? theme.colors.accentStrong
      : tone === 'signal'
        ? theme.colors.signal
        : theme.colors.textMuted,
  background:
    tone === 'accent'
      ? theme.colors.accentSoft
      : tone === 'signal'
        ? theme.colors.signalSoft
        : theme.colors.surfaceStrong,
  fontSize: '0.67rem',
  fontWeight: 760,
  letterSpacing: '0.025em',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const promptStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  display: '-webkit-box',
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 4,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.body,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
});

export const notesStyles = (theme: Theme): CSSObject => ({
  margin: `${theme.space.xs} 0 0`,
  display: '-webkit-box',
  overflow: 'hidden',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: 2,
  color: theme.colors.textFaint,
  fontSize: theme.fontSizes.caption,
  lineHeight: 1.45,
  overflowWrap: 'anywhere',
});

export const tagsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  marginBlockStart: theme.space.sm,
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.xxs,
  overflow: 'hidden',
});

export const tagStyles = (theme: Theme): CSSObject => ({
  maxWidth: '100%',
  padding: '0.18rem 0.42rem',
  overflow: 'hidden',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.round,
  color: theme.colors.textFaint,
  fontSize: '0.66rem',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const actionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.xs,
  paddingBlockStart: theme.space.xxs,
  '& > button': {
    flex: '1 1 auto',
    minWidth: '4.75rem',
  },
});

export const emptyStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  padding: `clamp(${theme.space.lg}, 5vw, ${theme.space.xxl})`,
  border: `1px dashed ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.textMuted,
  background: theme.colors.surfaceSoft,
  textAlign: 'center',
});

export const emptyTitleStyles = (theme: Theme): CSSObject => ({
  margin: `0 0 ${theme.space.xs}`,
  color: theme.colors.text,
  fontSize: '1rem',
});

export const emptyBodyStyles = (): CSSObject => ({
  maxWidth: '46ch',
  margin: '0 auto',
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
});

export const shelfFooterStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.md,
  padding: `${theme.space.sm} ${theme.space.md} max(${theme.space.sm}, env(safe-area-inset-bottom))`,
  borderBlockStart: `1px solid ${theme.colors.border}`,
  background: theme.colors.overlaySurface,
});

export const footerMetadataStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  margin: 0,
  overflow: 'hidden',
  color: theme.colors.textFaint,
  fontSize: theme.fontSizes.caption,
  lineHeight: 1.35,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const formPanelStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  padding: theme.space.md,
  display: 'grid',
  gap: theme.space.md,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surfaceSoft,
  boxShadow: theme.shadows.soft,
});

export const formGridStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: theme.space.md,
  '@media (max-width: 42rem)': { gridTemplateColumns: 'minmax(0, 1fr)' },
});

export const formFullWidthStyles = (): CSSObject => ({ gridColumn: '1 / -1', minWidth: 0 });

export const formTitleStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.text,
  fontSize: '1rem',
  overflowWrap: 'anywhere',
});

export const dialogStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  padding: theme.space.md,
  display: 'grid',
  gap: theme.space.sm,
  border: `1px solid ${theme.colors.danger}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.dangerSoft,
});

export const dialogTextStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.textMuted,
  lineHeight: 1.5,
  overflowWrap: 'anywhere',
});
