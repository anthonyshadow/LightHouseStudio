import type { CSSObject, Theme } from '@emotion/react';

export const stageStyles = (theme: Theme, recording: boolean): CSSObject => ({
  position: 'relative',
  isolation: 'isolate',
  display: 'grid',
  width: '100%',
  height: '100%',
  minWidth: 0,
  minHeight: 0,
  aspectRatio: '16 / 9',
  margin: 0,
  overflow: 'hidden',
  border: `1px solid ${recording ? theme.colors.recording : theme.colors.border}`,
  borderRadius: 'clamp(0.9rem, 2vw, 1.6rem)',
  background: theme.gradients.stageIdle,
  boxShadow: recording ? theme.shadows.recording : theme.shadows.lifted,
  transition: `border-color ${theme.motion.quick}, box-shadow ${theme.motion.standard}`,
  '&::before': {
    position: 'absolute',
    zIndex: 0,
    inset: 0,
    background: theme.gradients.stageScrim,
    content: '""',
    pointerEvents: 'none',
  },
  '&::after': {
    position: 'absolute',
    zIndex: 0,
    inset: '54% -12% -22%',
    opacity: 0.32,
    backgroundImage: [
      `linear-gradient(color-mix(in srgb, ${theme.colors.accent} 20%, transparent) 1px, transparent 1px)`,
      `linear-gradient(90deg, color-mix(in srgb, ${theme.colors.accent} 20%, transparent) 1px, transparent 1px)`,
    ].join(', '),
    backgroundSize: '2.1rem 2.1rem',
    maskImage: 'linear-gradient(to bottom, transparent, black 28%, transparent 82%)',
    WebkitMaskImage: 'linear-gradient(to bottom, transparent, black 28%, transparent 82%)',
    transform: 'perspective(18rem) rotateX(64deg)',
    transformOrigin: 'center top',
    content: '""',
    pointerEvents: 'none',
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    borderRadius: theme.radii.large,
  },
});

export const videoStyles = (theme: Theme, visible: boolean, mirrored: boolean): CSSObject => ({
  position: 'absolute',
  zIndex: 1,
  inset: 0,
  width: '100%',
  height: '100%',
  opacity: visible ? 1 : 0,
  objectFit: 'contain',
  transform: mirrored ? 'scaleX(-1)' : 'none',
  background: 'transparent',
  transition: `opacity ${theme.motion.standard}`,
  pointerEvents: 'none',
});

export const emptyStyles = (theme: Theme): CSSObject => ({
  zIndex: 2,
  placeSelf: 'center',
  display: 'grid',
  justifyItems: 'center',
  width: 'min(36rem, calc(100% - 2rem))',
  padding: 'clamp(1rem, 3vw, 2rem)',
  textAlign: 'center',
  color: theme.colors.textMuted,
  textWrap: 'balance',
  '& strong': {
    display: 'block',
    marginBlock: `${theme.space.sm} ${theme.space.xs}`,
    color: theme.colors.text,
    fontFamily: theme.type.display,
    fontSize: 'clamp(1.25rem, 2.5vw, 2rem)',
    lineHeight: 1.12,
  },
  '& p': {
    maxWidth: '31rem',
    margin: 0,
    fontSize: 'clamp(0.78rem, 1.2vw, 0.92rem)',
    lineHeight: 1.55,
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    padding: theme.space.md,
    '& strong': { fontSize: 'clamp(1rem, 6vw, 1.35rem)' },
    '& p': { fontSize: '0.75rem', lineHeight: 1.4 },
  },
});

export const emptyIconStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  width: '3.5rem',
  height: '3.5rem',
  placeItems: 'center',
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.large,
  color: theme.colors.accentStrong,
  background: `linear-gradient(145deg, ${theme.colors.accentSoft}, ${theme.colors.violetSoft})`,
  boxShadow: `0 0 2rem ${theme.colors.accentSoft}`,
  '& svg': { width: '1.65rem', height: '1.65rem' },
  '@media (max-height: 36rem)': {
    width: '2.75rem',
    height: '2.75rem',
  },
});

export const topToolbarStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  zIndex: 5,
  insetBlockStart: 'clamp(0.65rem, 1.4vw, 1rem)',
  insetInline: 'clamp(0.65rem, 1.4vw, 1rem)',
  display: 'flex',
  minWidth: 0,
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: theme.space.xs,
  pointerEvents: 'none',
});

export const toolbarGroupStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  minWidth: 0,
  alignItems: 'center',
  gap: theme.space.xs,
  pointerEvents: 'auto',
});

export const badgeStyles = (
  theme: Theme,
  tone: 'neutral' | 'accent' | 'recording' = 'neutral',
): CSSObject => ({
  display: 'inline-flex',
  minWidth: 0,
  minHeight: '2rem',
  alignItems: 'center',
  gap: theme.space.xxs,
  padding: '0.38rem 0.68rem',
  overflow: 'hidden',
  border: `1px solid ${tone === 'recording' ? theme.colors.recording : tone === 'accent' ? theme.colors.accent : theme.colors.borderStrong}`,
  borderRadius: theme.radii.round,
  color:
    tone === 'recording'
      ? theme.colors.recording
      : tone === 'accent'
        ? theme.colors.accentStrong
        : theme.colors.text,
  background:
    tone === 'recording'
      ? theme.colors.recordingSoft
      : tone === 'accent'
        ? theme.colors.accentSoft
        : theme.colors.overlaySurface,
  boxShadow: tone === 'recording' ? theme.shadows.recording : theme.shadows.soft,
  backdropFilter: 'blur(10px)',
  fontFamily: tone === 'recording' ? theme.type.mono : theme.type.sans,
  fontSize: theme.fontSizes.caption,
  fontWeight: 760,
  lineHeight: 1,
  whiteSpace: 'nowrap',
  '& svg': {
    width: '1rem',
    height: '1rem',
    flex: '0 0 auto',
  },
  '& > span:last-of-type': {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    minHeight: '1.8rem',
    padding: '0.3rem 0.5rem',
    fontSize: '0.68rem',
  },
});

export const iconButtonStyles = (theme: Theme): CSSObject => ({
  display: 'inline-grid',
  width: '2.5rem',
  height: '2.5rem',
  flex: '0 0 auto',
  placeItems: 'center',
  padding: 0,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.round,
  color: theme.colors.text,
  background: theme.colors.overlaySurface,
  boxShadow: theme.shadows.soft,
  cursor: 'pointer',
  backdropFilter: 'blur(10px)',
  transition: `border-color ${theme.motion.quick}, color ${theme.motion.quick}, background ${theme.motion.quick}`,
  '&:hover': {
    borderColor: theme.colors.accent,
    color: theme.colors.accentStrong,
    background: theme.colors.accentSoft,
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
  '& svg': { width: '1.1rem', height: '1.1rem' },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    width: '2.25rem',
    height: '2.25rem',
  },
});

export const framingGuideStyles = (theme: Theme, visible: boolean): CSSObject => ({
  position: 'absolute',
  zIndex: 3,
  inset: 'clamp(3.75rem, 10%, 5.5rem) clamp(1.5rem, 12%, 7rem)',
  opacity: visible ? 0.82 : 0.5,
  color: theme.colors.text,
  pointerEvents: 'none',
  transition: `opacity ${theme.motion.standard}`,
  '&::before, &::after': {
    position: 'absolute',
    insetBlockStart: '50%',
    insetInlineStart: '50%',
    background: 'currentColor',
    content: '""',
    transform: 'translate(-50%, -50%)',
  },
  '&::before': { width: '1.5rem', height: '1px' },
  '&::after': { width: '1px', height: '1.5rem' },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    inset: '3.25rem 1.25rem 3.75rem',
    opacity: visible ? 0.72 : 0.36,
  },
});

export const guideCornerStyles = (position: 'tl' | 'tr' | 'bl' | 'br'): CSSObject => ({
  position: 'absolute',
  width: '1.1rem',
  height: '1.1rem',
  ...(position.includes('t') ? { insetBlockStart: 0 } : { insetBlockEnd: 0 }),
  ...(position.includes('l') ? { insetInlineStart: 0 } : { insetInlineEnd: 0 }),
  borderBlockStart: position.includes('t') ? '2px solid currentColor' : undefined,
  borderBlockEnd: position.includes('b') ? '2px solid currentColor' : undefined,
  borderInlineStart: position.includes('l') ? '2px solid currentColor' : undefined,
  borderInlineEnd: position.includes('r') ? '2px solid currentColor' : undefined,
});

export const bottomOverlayStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  zIndex: 5,
  insetInline: 'clamp(0.65rem, 1.4vw, 1rem)',
  insetBlockEnd: 'clamp(0.65rem, 1.4vw, 1rem)',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
  minWidth: 0,
  alignItems: 'end',
  gap: theme.space.xs,
  margin: 0,
  pointerEvents: 'none',
  '& > *': { pointerEvents: 'auto' },
  '& > :first-of-type': {
    maxWidth: 'min(16rem, 100%)',
    justifySelf: 'start',
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
    gap: theme.space.xxs,
    '& [data-live-timer]': { display: 'none' },
  },
});

export const endStatusStyles: CSSObject = {
  display: 'flex',
  minWidth: 0,
  justifyContent: 'flex-end',
  alignItems: 'center',
  gap: '0.5rem',
};

export const statusDotStyles = (
  theme: Theme,
  tone: 'neutral' | 'accent' | 'recording',
): CSSObject => ({
  width: '0.5rem',
  height: '0.5rem',
  flex: '0 0 auto',
  borderRadius: '50%',
  background:
    tone === 'recording'
      ? theme.colors.recording
      : tone === 'accent'
        ? theme.colors.accent
        : theme.colors.textFaint,
  boxShadow:
    tone === 'recording'
      ? `0 0 0 0.22rem ${theme.colors.recordingSoft}`
      : tone === 'accent'
        ? `0 0 0 0.18rem ${theme.colors.accentSoft}`
        : 'none',
});

export const audioMeterStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'auto minmax(3.5rem, 7rem)',
  minHeight: '2.25rem',
  minWidth: 0,
  alignItems: 'center',
  gap: theme.space.xs,
  padding: '0.38rem 0.65rem',
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.round,
  color: theme.colors.textMuted,
  background: theme.colors.overlaySurface,
  boxShadow: theme.shadows.soft,
  backdropFilter: 'blur(10px)',
  fontSize: '0.7rem',
  whiteSpace: 'nowrap',
  '& svg': {
    width: '1rem',
    height: '1rem',
    flex: '0 0 auto',
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    gridTemplateColumns: 'auto minmax(2.75rem, 4rem)',
    minHeight: '1.8rem',
    padding: '0.28rem 0.5rem',
  },
});

export const audioTrackStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  height: '0.34rem',
  overflow: 'hidden',
  borderRadius: theme.radii.round,
  background: theme.colors.surfaceStrong,
  '&::after': {
    position: 'absolute',
    inset: 0,
    width: 'var(--audio-level, 0%)',
    borderRadius: 'inherit',
    background: `linear-gradient(90deg, ${theme.colors.accent}, ${theme.colors.violet})`,
    boxShadow: `0 0 0.7rem ${theme.colors.accent}`,
    content: '""',
    transition: 'width 80ms linear',
  },
});

export const visuallyHiddenTextStyles: CSSObject = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};
