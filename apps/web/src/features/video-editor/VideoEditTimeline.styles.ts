import type { CSSObject, Theme } from '@emotion/react';
import { media } from '../../ui/media';

export const timelineStyles = (theme: Theme): CSSObject => ({
  gridArea: 'timeline',
  minWidth: 0,
  padding: theme.space.sm,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  '& > header': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.space.sm,
    marginBlockEnd: theme.space.xs,
  },
  '& > header h2': {
    margin: 0,
    color: theme.colors.textFaint,
    fontSize: theme.fontSizes.caption,
    fontWeight: 760,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
  },
  '& > header output': {
    color: theme.colors.textMuted,
    fontFamily: theme.type.mono,
    fontSize: theme.fontSizes.caption,
  },
  [media.down('compact')]: { padding: theme.space.xs },
});

export const timelineBodyStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: '2.75rem minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.sm,
  minWidth: 0,
  '& > button': {
    width: '2.75rem',
    height: '2.75rem',
    minWidth: '2.75rem',
    padding: 0,
    borderRadius: theme.radii.round,
  },
  [media.down('compact')]: { gap: theme.space.xs },
});

export const timelineLabelsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  justifyContent: 'space-between',
  gap: theme.space.sm,
  marginBlockEnd: theme.space.xxs,
  color: theme.colors.textMuted,
  fontFamily: theme.type.mono,
  fontSize: '0.7rem',
});

export const timelineTrackStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  height: '2.75rem',
  minWidth: 0,
  '&::before': {
    position: 'absolute',
    insetInline: 0,
    insetBlockStart: '1rem',
    height: '0.75rem',
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.round,
    background: theme.colors.surface,
    content: '""',
  },
  '&:has(input:focus-visible)': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
    borderRadius: theme.radii.small,
  },
  '& input': {
    position: 'absolute',
    zIndex: 2,
    inset: 0,
    width: '100%',
    height: '2.75rem',
    margin: 0,
    opacity: 0,
    cursor: 'pointer',
  },
});

export const timelineSelectionStyles = (
  theme: Theme,
  startPercent: number,
  endPercent: number,
): CSSObject => ({
  position: 'absolute',
  zIndex: 1,
  insetBlockStart: '1rem',
  insetInlineStart: `${startPercent}%`,
  width: `${Math.max(0, endPercent - startPercent)}%`,
  height: '0.75rem',
  borderRadius: theme.radii.round,
  background: theme.colors.accentSoft,
  pointerEvents: 'none',
});

export const trimHandleStyles = (theme: Theme, percent: number, edge: 'in' | 'out'): CSSObject => ({
  position: 'absolute',
  zIndex: 4,
  insetBlockStart: 0,
  insetInlineStart: `calc(${percent}% - 1.375rem)`,
  width: '2.75rem',
  height: '2.75rem',
  padding: 0,
  border: 0,
  borderRadius: theme.radii.small,
  background: 'transparent',
  cursor: 'ew-resize',
  touchAction: 'none',
  '&::after': {
    position: 'absolute',
    insetBlockStart: '0.5rem',
    [edge === 'in' ? 'insetInlineStart' : 'insetInlineEnd']: '1.05rem',
    width: '0.5rem',
    height: '1.75rem',
    border: `1px solid ${theme.colors.accent}`,
    borderRadius: '0.15rem',
    background: theme.colors.onAccent,
    content: '""',
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '-0.1rem',
  },
});

export const playheadStyles = (theme: Theme, percent: number): CSSObject => ({
  position: 'absolute',
  zIndex: 3,
  insetBlockStart: '0.25rem',
  insetBlockEnd: '0.25rem',
  insetInlineStart: `${percent}%`,
  width: '1px',
  background: theme.colors.accent,
  pointerEvents: 'none',
  '& output': {
    position: 'absolute',
    insetInlineStart: '50%',
    insetBlockEnd: 'calc(100% + 0.15rem)',
    padding: `0.2rem ${theme.space.xs}`,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.small,
    color: theme.colors.accent,
    background: theme.colors.surfaceStrong,
    boxShadow: theme.shadows.soft,
    fontFamily: theme.type.mono,
    fontSize: '0.65rem',
    whiteSpace: 'nowrap',
    transform: 'translateX(-50%)',
  },
});

/** One lane row; the cue blocks position themselves inline in multiples of this. */
export const SUBTITLE_ROW_HEIGHT = '1.4rem';

/** A lane under the trim track, one row per set of overlapping cues, so simultaneous text stacks. */
export const subtitleLaneStyles = (theme: Theme, rows: number): CSSObject => ({
  position: 'relative',
  height: `calc(${Math.max(1, rows)} * ${SUBTITLE_ROW_HEIGHT} + 0.25rem)`,
  marginBlockStart: theme.space.xs,
  border: `1px dashed ${theme.colors.divider}`,
  borderRadius: theme.radii.small,
  background: theme.colors.surface,
});

/** Every cue block's look; its place on the lane is inline, because it changes with every drag. */
export const subtitleCueStyles = (theme: Theme): CSSObject => ({
  position: 'absolute',
  height: '1.25rem',
  padding: `0 ${theme.space.xs}`,
  border: `1px solid ${theme.colors.accent}`,
  borderRadius: theme.radii.small,
  color: theme.colors.accentStrong,
  background: theme.colors.accentSoft,
  fontSize: '0.7rem',
  fontWeight: 700,
  lineHeight: 1,
  textAlign: 'left',
  overflow: 'hidden',
  cursor: 'grab',
  touchAction: 'none',
  '& > span': {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '&[aria-pressed="true"]': { color: theme.colors.onAccent, background: theme.colors.accent },
  '&:focus-visible': { outline: `2px solid ${theme.colors.focus}`, outlineOffset: '2px' },
});

export const timelineHintStyles = (theme: Theme): CSSObject => ({
  margin: `${theme.space.xxs} 0 0`,
  color: theme.colors.textFaint,
  fontSize: '0.7rem',
  [media.down('compact')]: { display: 'none' },
});
