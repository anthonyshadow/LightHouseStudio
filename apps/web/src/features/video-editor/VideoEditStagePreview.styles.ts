import type { CSSObject, Theme } from '@emotion/react';
import { media } from '../../ui/media';

export const previewLayerStyles = (): CSSObject => ({
  position: 'absolute',
  zIndex: 2,
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  pointerEvents: 'none',
});

export const canvasFrameStyles = (
  theme: Theme,
  aspectRatio: number,
  splitComparison = false,
): CSSObject => ({
  position: 'relative',
  width: aspectRatio >= 1 ? '100%' : 'auto',
  height: aspectRatio >= 1 ? 'auto' : '100%',
  maxWidth: '100%',
  maxHeight: '100%',
  aspectRatio: `${aspectRatio}`,
  overflow: 'hidden',
  background: theme.colors.shadow,
  boxShadow: theme.shadows.soft,
  clipPath: splitComparison ? 'inset(0 50% 0 0)' : 'none',
  '& canvas': {
    width: '100%',
    height: '100%',
  },
});

export const comparisonBadgeStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  zIndex: 8,
  insetBlockStart: theme.space.sm,
  insetInlineEnd: theme.space.sm,
  minHeight: '2rem',
  display: 'inline-flex',
  alignItems: 'center',
  paddingInline: theme.space.sm,
  border: `1px solid ${theme.colors.accent}`,
  borderRadius: theme.radii.round,
  color: theme.colors.accentStrong,
  background: theme.colors.accentSoft,
  boxShadow: theme.shadows.soft,
  fontSize: theme.fontSizes.caption,
  fontWeight: 760,
});

export const splitDividerStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  zIndex: 7,
  insetBlock: '8%',
  insetInlineStart: '50%',
  width: '1px',
  background: theme.colors.accent,
  boxShadow: theme.shadows.soft,
  pointerEvents: 'none',
});

export const rotateControlsStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  zIndex: 8,
  insetInlineStart: '50%',
  insetBlockEnd: theme.space.md,
  display: 'flex',
  alignItems: 'center',
  gap: theme.space.xs,
  padding: theme.space.xxs,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.overlaySurface,
  boxShadow: theme.shadows.soft,
  transform: 'translateX(-50%)',
  pointerEvents: 'auto',
  '& button': { whiteSpace: 'nowrap' },
  '& output': {
    minWidth: '2.75rem',
    color: theme.colors.accent,
    fontFamily: theme.type.mono,
    fontSize: theme.fontSizes.caption,
    textAlign: 'center',
  },
  [media.down('tablet')]: {
    insetBlockEnd: theme.space.xs,
    '& button': { paddingInline: theme.space.xs },
  },
});

export const cropSelectionStyles = (
  theme: Theme,
  crop: Readonly<{ x: number; y: number; width: number; height: number }>,
): CSSObject => ({
  position: 'absolute',
  zIndex: 4,
  insetInlineStart: `${crop.x * 100}%`,
  insetBlockStart: `${crop.y * 100}%`,
  width: `${crop.width * 100}%`,
  height: `${crop.height * 100}%`,
  border: `2px solid ${theme.colors.accent}`,
  boxShadow: '0 0 0 100vmax rgba(2, 5, 9, 0.58)',
  pointerEvents: 'auto',
  touchAction: 'none',
  cursor: 'move',
  '&::before, &::after': {
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none',
    content: '""',
  },
  '&::before': {
    borderInline: '1px solid rgba(255,255,255,.28)',
    insetInline: '33.333%',
  },
  '&::after': {
    borderBlock: '1px solid rgba(255,255,255,.28)',
    insetBlock: '33.333%',
  },
});

export const cropHandleStyles = (
  theme: Theme,
  horizontal: 'left' | 'right',
  vertical: 'top' | 'bottom',
): CSSObject => ({
  position: 'absolute',
  zIndex: 7,
  [horizontal === 'left' ? 'insetInlineStart' : 'insetInlineEnd']: 0,
  [vertical === 'top' ? 'insetBlockStart' : 'insetBlockEnd']: 0,
  width: '2.75rem',
  height: '2.75rem',
  padding: 0,
  border: 0,
  borderRadius: theme.radii.round,
  background: 'transparent',
  cursor: `${vertical === 'top' ? 'n' : 's'}${horizontal === 'left' ? 'w' : 'e'}-resize`,
  touchAction: 'none',
  '&::after': {
    position: 'absolute',
    [horizontal === 'left' ? 'insetInlineStart' : 'insetInlineEnd']: '0.2rem',
    [vertical === 'top' ? 'insetBlockStart' : 'insetBlockEnd']: '0.2rem',
    width: '0.75rem',
    height: '0.75rem',
    border: `2px solid ${theme.colors.accent}`,
    borderRadius: theme.radii.small,
    background: theme.colors.onAccent,
    content: '""',
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '-0.15rem',
  },
});

export const cropMoveHandleStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  zIndex: 1,
  insetInlineStart: '50%',
  insetBlockStart: '50%',
  width: 'min(2.75rem, 60%)',
  height: 'min(2.75rem, 60%)',
  padding: 0,
  borderRadius: theme.radii.round,
  display: 'grid',
  placeItems: 'center',
  border: `1px solid ${theme.colors.borderStrong}`,
  color: theme.colors.text,
  background: 'rgba(2, 5, 9, 0.62)',
  boxShadow: theme.shadows.soft,
  transform: 'translate(-50%, -50%)',
  cursor: 'move',
  touchAction: 'none',
  '&::after': {
    content: '"✥"',
    fontSize: '1rem',
    lineHeight: 1,
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
    background: 'rgba(255,255,255,.08)',
  },
});
