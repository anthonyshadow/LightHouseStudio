import type { CSSObject, Theme } from '@emotion/react';
import { media } from '../../ui/media';

/**
 * The Save panel is the one task whose final action must remain available while its supporting
 * choices scroll. At laptop sizes the inspector owns the scroll region; below that breakpoint the
 * whole Project workspace scrolls and the action is fixed to the viewport instead.
 */
export const saveTaskPanelStyles = (_theme: Theme): CSSObject => ({
  [media.up('laptop')]: {
    height: '100%',
    maxHeight: '100%',
    gridTemplateRows: 'auto minmax(0, 1fr)',
    alignContent: 'stretch',
    paddingBlockEnd: 0,
    overflow: 'hidden',
  },
  [media.down('laptop')]: {
    paddingBlockEnd: `calc(6.5rem + env(safe-area-inset-bottom))`,
  },
});

export const outputSaveSurfaceStyles = (_theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  height: '100%',
  display: 'grid',
  gridTemplateRows: 'minmax(0, 1fr) auto',
  overflow: 'hidden',
  containerType: 'inline-size',
  [media.down('laptop')]: {
    height: 'auto',
    gridTemplateRows: 'auto auto',
    overflow: 'visible',
  },
});

export const outputSaveContentStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  alignContent: 'start',
  gap: theme.space.lg,
  paddingInlineEnd: theme.space.xs,
  paddingBlockEnd: theme.space.md,
  overflowX: 'hidden',
  overflowY: 'auto',
  overscrollBehavior: 'contain',
  scrollbarGutter: 'stable',
  '&::-webkit-scrollbar': { width: '8px' },
  '&::-webkit-scrollbar-thumb': {
    borderRadius: theme.radii.round,
    background: theme.colors.border,
  },
  '& h3, & p': { marginBlockStart: 0 },
  [media.down('laptop')]: {
    paddingInlineEnd: 0,
    overflow: 'visible',
  },
});

export const currentCutSummaryStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.sm,
  '& [data-current-cut-mark]': {
    position: 'relative',
    width: '100%',
    minWidth: 0,
    aspectRatio: '16 / 9',
    display: 'grid',
    placeItems: 'center',
    overflow: 'hidden',
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    color: theme.colors.accent,
    background: theme.gradients.stageIdle,
  },
  '& [data-current-cut-mark]::after': {
    position: 'absolute',
    inset: 0,
    background: theme.gradients.stageScrim,
    content: '""',
  },
  '& [data-current-cut-mark] svg': {
    position: 'relative',
    zIndex: 1,
    width: '1.5rem',
    height: '1.5rem',
  },
  '& [data-current-cut-copy]': { minWidth: 0, display: 'grid', gap: theme.space.xxs },
  '& strong, & span, & small': {
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  '& strong': { fontSize: theme.fontSizes.body },
  '& span, & small': { color: theme.colors.textMuted, lineHeight: 1.45 },
  '& span': { fontSize: theme.fontSizes.metadata },
  '& small': { color: theme.colors.textFaint, fontSize: theme.fontSizes.caption },
  '@container (min-width: 30rem)': {
    gridTemplateColumns: '9.5rem minmax(0, 1fr)',
    '& [data-current-cut-mark]': { width: '9.5rem' },
  },
});

export const placementSectionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  paddingBlockStart: theme.space.lg,
  borderBlockStart: `1px solid ${theme.colors.divider}`,
});

export const outputSaveNoteStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  paddingBlockStart: theme.space.md,
  borderBlockStart: `1px solid ${theme.colors.divider}`,
  color: theme.colors.textFaint,
  fontSize: theme.fontSizes.caption,
  lineHeight: 1.55,
});

export const destinationChoiceStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.md,
  padding: theme.space.md,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvasRaised,
  '& > header': { display: 'grid', gap: theme.space.xxs },
  '& > header h4, & > header p': { margin: 0 },
  '& > header h4': {
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.label,
  },
  '& > header p': {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    lineHeight: 1.45,
  },
  [media.down('tablet')]: {
    padding: 0,
    border: 0,
    borderRadius: 0,
    background: 'transparent',
    '& > fieldset > legend': {
      position: 'absolute',
      width: '1px',
      height: '1px',
      margin: '-1px',
      padding: 0,
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
      whiteSpace: 'nowrap',
    },
  },
});

export const destinationOptionStyles = (theme: Theme, selected: boolean): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr)',
  alignItems: 'start',
  gap: theme.space.sm,
  padding: theme.space.sm,
  border: `1px solid ${selected ? theme.colors.accent : theme.colors.border}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.text,
  background: selected ? theme.colors.accentSoft : theme.colors.surfaceSoft,
  cursor: 'pointer',
  '&:focus-within': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
  '& input': {
    width: '1rem',
    height: '1rem',
    marginBlockStart: '0.15rem',
    accentColor: theme.colors.accent,
  },
  '& [data-destination-copy]': { minWidth: 0, display: 'grid', gap: theme.space.xxs },
  '& small': { color: theme.colors.textMuted, lineHeight: 1.4 },
});

export const destinationDetailStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.sm,
  paddingInlineStart: `calc(1rem + ${theme.space.sm})`,
  [media.down('tablet')]: { paddingInlineStart: 0 },
});

export const destinationActionsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'flex-end',
  gap: theme.space.sm,
  '& > button': { minWidth: '8rem' },
  [media.down('tablet')]: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.5fr)',
    '& > button': { width: '100%', minWidth: 0 },
  },
  '@media (max-width: 22rem)': {
    gridTemplateColumns: 'minmax(0, 1fr)',
  },
});

export const saveActionBarStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  zIndex: theme.layers.stageChrome,
  minWidth: 0,
  paddingBlock: theme.space.sm,
  borderBlockStart: `1px solid ${theme.colors.divider}`,
  background: theme.colors.canvas,
  '& > button': {
    width: '100%',
    minWidth: 0,
    whiteSpace: 'nowrap',
  },
  [media.down('laptop')]: {
    position: 'fixed',
    insetInlineStart: `calc(var(--studio-shell-rail-width) + ${theme.space.lg})`,
    insetInlineEnd: theme.space.lg,
    insetBlockEnd: theme.space.md,
    padding: theme.space.sm,
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.large,
    background: theme.colors.overlaySurface,
    boxShadow: theme.shadows.lifted,
  },
  [media.down('compact')]: {
    insetInlineStart: `max(${theme.space.md}, env(safe-area-inset-left))`,
    insetInlineEnd: `max(${theme.space.md}, env(safe-area-inset-right))`,
    insetBlockEnd: `calc(4.5rem + env(safe-area-inset-bottom) + ${theme.space.sm})`,
  },
  [media.down('tablet')]: {
    '& [data-placement-label="full"]': { display: 'none' },
  },
  [media.up('tablet')]: {
    '& [data-placement-label="short"]': { display: 'none' },
  },
  '@media (max-width: 22rem)': {
    insetInlineStart: theme.space.sm,
    insetInlineEnd: theme.space.sm,
    insetBlockEnd: `calc(4.5rem + env(safe-area-inset-bottom) + ${theme.space.xxs})`,
    padding: 0,
    border: 0,
    background: 'transparent',
    boxShadow: 'none',
  },
});

export const titleFieldStyles = (theme: Theme): CSSObject => ({
  '& input': { fontSize: theme.fontSizes.section },
});
