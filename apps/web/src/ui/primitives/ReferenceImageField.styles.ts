import type { CSSObject, Theme } from '@emotion/react';

export const referenceFieldStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xs,
});

export const referenceFileAreaStyles = (
  theme: Theme,
  dragging = false,
  disabled = false,
): CSSObject => ({
  position: 'relative',
  minWidth: 0,
  display: 'grid',
  placeItems: 'stretch',
  minHeight: '6.25rem',
  border: `1px dashed ${dragging ? theme.colors.accent : theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.textMuted,
  background: dragging ? theme.colors.accentSoft : theme.colors.canvasRaised,
  transition: `border-color ${theme.motion.quick}, background ${theme.motion.quick}`,
  opacity: disabled ? 0.55 : 1,
  '&:focus-within': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
  '& input': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
});

export const referencePickerStyles = (theme: Theme, disabled = false): CSSObject => ({
  minWidth: 0,
  minHeight: '6.25rem',
  display: 'grid',
  placeContent: 'center',
  gap: theme.space.xxs,
  padding: theme.space.md,
  textAlign: 'center',
  cursor: disabled ? 'not-allowed' : 'pointer',
  '& strong': { color: theme.colors.text, fontSize: theme.fontSizes.body },
  '& span': { color: theme.colors.textMuted, fontSize: theme.fontSizes.caption, lineHeight: 1.4 },
});

export const referenceGuidanceStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xxs,
  '& label': { color: theme.colors.text, fontWeight: 760, fontSize: theme.fontSizes.body },
  '& span': {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.45,
    overflowWrap: 'anywhere',
  },
});

export const referencePreviewStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: '4rem minmax(0, 1fr) auto',
  gap: theme.space.sm,
  alignItems: 'center',
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  '& img': {
    width: '4rem',
    height: '4rem',
    borderRadius: theme.radii.small,
    objectFit: 'cover',
    border: `1px solid ${theme.colors.border}`,
  },
  '& > div': {
    minWidth: 0,
    display: 'grid',
    gap: theme.space.xxs,
  },
  '& strong': {
    minWidth: 0,
    display: '-webkit-box',
    overflow: 'hidden',
    color: theme.colors.text,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  },
  '& span': { color: theme.colors.textMuted, fontSize: theme.fontSizes.caption },
  '& small': {
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
  },
  '& button': { minWidth: '2.75rem', minHeight: '2.75rem', paddingInline: theme.space.sm },
  '@media (max-width: 22rem)': {
    gridTemplateColumns: '3.25rem minmax(0, 1fr) auto',
    '& img': { width: '3.25rem', height: '3.25rem' },
    '& small': { display: 'none' },
  },
});
