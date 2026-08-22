import type { CSSObject, Theme } from '@emotion/react';
import { focusRingStyles } from '../theme';
import { controlStyles } from './FormControl.styles';
import { media } from '../media';

export interface SelectPopoverPosition {
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly maxHeight: number;
}

export const triggerWrapStyles = (): CSSObject => ({
  position: 'relative',
  minWidth: 0,
});

export const triggerStyles = (
  theme: Theme,
  invalid: boolean,
  open: boolean,
  placeholder: boolean,
): CSSObject => ({
  ...controlStyles(theme, invalid),
  minHeight: '2.85rem',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.sm,
  padding: `0.65rem ${theme.space.sm}`,
  color: placeholder ? theme.colors.textFaint : theme.colors.text,
  borderColor: open
    ? theme.colors.accent
    : invalid
      ? theme.colors.danger
      : theme.colors.borderStrong,
  boxShadow: open ? `0 0 0 1px ${theme.colors.accentSoft}` : undefined,
  font: 'inherit',
  lineHeight: 1.35,
  textAlign: 'start',
  cursor: 'pointer',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
  '&:hover:not(:disabled)': {
    borderColor: invalid
      ? theme.colors.danger
      : open
        ? theme.colors.accent
        : theme.colors.textFaint,
  },
  '&:focus-visible': focusRingStyles(theme),
  '&:disabled': { cursor: 'not-allowed', opacity: 0.52 },
});

export const triggerValueStyles = (): CSSObject => ({
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const chevronStyles = (theme: Theme, open: boolean): CSSObject => ({
  width: '1.15rem',
  height: '1.15rem',
  color: open ? theme.colors.accent : theme.colors.textFaint,
  transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
  transition: `color ${theme.motion.quick}, transform ${theme.motion.standard}`,
});

export const popoverLayerStyles = (theme: Theme, position: SelectPopoverPosition): CSSObject => ({
  position: 'fixed',
  inset: 'auto',
  top: position.top,
  left: position.left,
  zIndex: theme.layers.overlay + 2,
  width: position.width,
  maxWidth: 'calc(100vw - 1rem)',
  display: 'block',
  margin: 0,
  padding: 0,
  overflow: 'visible',
  border: 0,
  color: theme.colors.text,
  background: 'transparent',
  '&::backdrop': { background: 'transparent' },
  [media.down('tablet')]: {
    inset: 0,
    width: '100%',
    height: '100%',
    maxWidth: 'none',
    display: 'flex',
    alignItems: 'flex-end',
    background: theme.colors.scrim,
    '&::backdrop': { background: theme.colors.scrim },
  },
});

export const menuStyles = (theme: Theme, position: SelectPopoverPosition): CSSObject => ({
  width: '100%',
  maxHeight: position.maxHeight,
  minWidth: 0,
  display: 'grid',
  gridTemplateRows: 'auto minmax(0, 1fr)',
  overflow: 'hidden',
  border: `1px solid ${theme.colors.accent}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.surfaceStrong,
  boxShadow: theme.shadows.lifted,
  [media.down('tablet')]: {
    maxHeight: 'min(80dvh, 34rem)',
    borderInline: 0,
    borderBlockEnd: 0,
    borderRadius: `${theme.radii.large} ${theme.radii.large} 0 0`,
    paddingBlockEnd: 'env(safe-area-inset-bottom)',
  },
  [`${media.down('tablet')} and (max-height: 36rem)`]: {
    maxHeight: '92dvh',
  },
});

export const mobileHeaderStyles = (theme: Theme): CSSObject => ({
  display: 'none',
  [media.down('tablet')]: {
    minWidth: 0,
    minHeight: '3.5rem',
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    alignItems: 'center',
    gap: theme.space.sm,
    padding: `${theme.space.sm} max(${theme.space.md}, env(safe-area-inset-right)) ${theme.space.sm} max(${theme.space.md}, env(safe-area-inset-left))`,
    borderBlockEnd: `1px solid ${theme.colors.border}`,
  },
});

export const mobileHeadingStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  margin: 0,
  overflow: 'hidden',
  color: theme.colors.text,
  fontFamily: theme.type.display,
  fontSize: theme.fontSizes.label,
  lineHeight: 1.25,
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
});

export const closeButtonStyles = (theme: Theme): CSSObject => ({
  minWidth: '2.75rem',
  minHeight: '2.75rem',
  display: 'inline-grid',
  placeItems: 'center',
  padding: 0,
  border: 0,
  borderRadius: theme.radii.round,
  color: theme.colors.textMuted,
  background: theme.colors.canvasRaised,
  fontSize: '1.35rem',
  lineHeight: 1,
  cursor: 'pointer',
  touchAction: 'manipulation',
  '&:hover': { color: theme.colors.text, background: theme.colors.surface },
  '&:focus-visible': focusRingStyles(theme),
});

export const optionListStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.xxs,
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  scrollbarGutter: 'stable',
  margin: 0,
  padding: theme.space.xxs,
  listStyle: 'none',
  [media.down('tablet')]: {
    gap: theme.space.xs,
    padding: `${theme.space.sm} max(${theme.space.sm}, env(safe-area-inset-right)) ${theme.space.sm} max(${theme.space.sm}, env(safe-area-inset-left))`,
  },
});

export const optionStyles = (theme: Theme, selected: boolean, active: boolean): CSSObject => ({
  width: '100%',
  minWidth: 0,
  minHeight: '3rem',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.sm,
  padding: `${theme.space.xs} ${theme.space.sm}`,
  border: 0,
  borderRadius: theme.radii.small,
  color: theme.colors.text,
  background: selected
    ? theme.colors.accentSoft
    : active
      ? theme.colors.canvasRaised
      : 'transparent',
  font: 'inherit',
  lineHeight: 1.35,
  textAlign: 'start',
  cursor: 'pointer',
  touchAction: 'manipulation',
  WebkitTapHighlightColor: 'transparent',
  transition: `color ${theme.motion.quick}, background ${theme.motion.quick}`,
  '&:hover:not(:disabled)': {
    background: selected ? theme.colors.accentSoft : theme.colors.canvasRaised,
  },
  '&:focus-visible': {
    outline: 0,
    boxShadow: `inset 0 0 0 2px ${theme.colors.focus}`,
  },
  '&:disabled': { cursor: 'not-allowed', opacity: 0.45 },
  [media.down('tablet')]: {
    minHeight: '3.5rem',
    padding: `${theme.space.sm} ${theme.space.md}`,
    borderRadius: theme.radii.medium,
  },
});

export const defaultOptionContentStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xxs,
  '& strong': {
    overflow: 'hidden',
    fontSize: theme.fontSizes.body,
    fontWeight: 720,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '& small': {
    display: '-webkit-box',
    overflow: 'hidden',
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  },
});

export const selectedMarkStyles = (theme: Theme, selected: boolean): CSSObject => ({
  width: '1.25rem',
  height: '1.25rem',
  display: 'grid',
  placeItems: 'center',
  flex: '0 0 auto',
  border: `1px solid ${selected ? theme.colors.accent : theme.colors.border}`,
  borderRadius: theme.radii.round,
  color: theme.colors.onAccent,
  background: selected ? theme.colors.accent : 'transparent',
  fontSize: '0.75rem',
  fontWeight: 900,
  opacity: selected ? 1 : 0,
});

export const emptyStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  padding: theme.space.md,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.body,
  lineHeight: 1.5,
});
