import type { CSSObject, Theme } from '@emotion/react';

/**
 * The trigger is a square `secondary` Button carrying only the overflow glyph. Its footprint is set
 * from here — a child selector outranks the class Button emits, so the override is deterministic
 * rather than dependent on which `css` prop Emotion happens to serialize last.
 */
export const actionMenuStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  flex: '0 0 auto',
  display: 'inline-flex',
  '& > button': {
    width: '2.75rem',
    minWidth: '2.75rem',
    height: '2.75rem',
    padding: 0,
    color: theme.colors.textMuted,
    '& svg': { width: '1.2rem', height: '1.2rem' },
  },
  '& > button[aria-expanded="true"]': {
    color: theme.colors.text,
    borderColor: theme.colors.accent,
  },
});

export const actionMenuPopoverStyles = (theme: Theme, placement: 'above' | 'below'): CSSObject => ({
  position: 'absolute',
  zIndex: 3,
  insetInlineEnd: 0,
  ...(placement === 'above'
    ? { insetBlockEnd: `calc(100% + ${theme.space.xs})` }
    : { insetBlockStart: `calc(100% + ${theme.space.xs})` }),
  width: '13rem',
  display: 'grid',
  gap: theme.space.xxs,
  padding: theme.space.xs,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.overlaySurface,
  boxShadow: theme.shadows.lifted,
  '& > button': {
    width: '100%',
    minHeight: '2.75rem',
    display: 'grid',
    justifyItems: 'start',
    gap: '0.15rem',
    padding: `${theme.space.xs} ${theme.space.sm}`,
    border: 0,
    borderRadius: theme.radii.small,
    color: theme.colors.text,
    background: 'transparent',
    fontWeight: 700,
    textAlign: 'start',
    '&:hover:not([aria-disabled="true"])': { background: theme.colors.surfaceStrong },
  },
  '& > button[data-danger]': { color: theme.colors.danger },
  '& > button[aria-disabled="true"]': { cursor: 'not-allowed', opacity: 0.48 },
  '& [data-action-menu-reason]': {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.metadata,
    fontWeight: 500,
    lineHeight: 1.25,
    whiteSpace: 'normal',
  },
});
