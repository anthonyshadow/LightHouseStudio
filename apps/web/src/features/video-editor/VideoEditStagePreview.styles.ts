import type { CSSObject, Theme } from '@emotion/react';

export const previewLayerStyles = (): CSSObject => ({
  position: 'absolute',
  zIndex: 2,
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  pointerEvents: 'none',
});

export const canvasFrameStyles = (theme: Theme, aspectRatio: number): CSSObject => ({
  position: 'relative',
  width: aspectRatio >= 1 ? '100%' : 'auto',
  height: aspectRatio >= 1 ? 'auto' : '100%',
  maxWidth: '100%',
  maxHeight: '100%',
  aspectRatio: `${aspectRatio}`,
  overflow: 'hidden',
  background: theme.colors.shadow,
  boxShadow: theme.shadows.soft,
  '& canvas': {
    width: '100%',
    height: '100%',
  },
});

export const cropSelectionStyles = (
  theme: Theme,
  crop: Readonly<{ x: number; y: number; width: number; height: number }>,
): CSSObject => ({
  position: 'absolute',
  zIndex: 6,
  insetInlineStart: `${crop.x * 100}%`,
  insetBlockStart: `${crop.y * 100}%`,
  width: `${crop.width * 100}%`,
  height: `${crop.height * 100}%`,
  border: `2px solid ${theme.colors.accent}`,
  boxShadow: '0 0 0 100vmax rgba(2, 5, 9, 0.58)',
  pointerEvents: 'none',
  touchAction: 'none',
  cursor: 'move',
  '& button': { pointerEvents: 'auto' },
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
  border: 0,
  borderRadius: theme.radii.round,
  background: 'transparent',
  transform: 'translate(-50%, -50%)',
  cursor: 'move',
  touchAction: 'none',
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
    background: 'rgba(255,255,255,.08)',
  },
});

export const playbackControlsStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  zIndex: 5,
  insetInline: 'max(0.5rem, 5%)',
  insetBlockEnd: theme.space.sm,
  display: 'grid',
  gridTemplateColumns: '2.75rem minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.sm,
  padding: theme.space.xs,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.overlaySurface,
  boxShadow: theme.shadows.soft,
  pointerEvents: 'auto',
  backdropFilter: 'blur(12px)',
  '& button': {
    width: '2.75rem',
    height: '2.75rem',
    padding: 0,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.round,
    color: theme.colors.onAccent,
    background: theme.colors.accent,
    cursor: 'pointer',
  },
  '& button:focus-visible, & input:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
  '& label': { minWidth: 0, display: 'grid', gap: '0.2rem' },
  '& label > span': {
    display: 'flex',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    color: theme.colors.textMuted,
    fontFamily: theme.type.mono,
    fontSize: theme.fontSizes.caption,
  },
  '& input': { width: '100%', accentColor: theme.colors.accent },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    insetInline: theme.space.xxs,
    insetBlockEnd: theme.space.xxs,
    gap: theme.space.xs,
    padding: theme.space.xxs,
  },
});
