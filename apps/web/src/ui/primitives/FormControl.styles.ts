import type { CSSObject, Theme } from '@emotion/react';
import { focusRingStyles } from '../theme';

export const fieldRootStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  minWidth: 0,
});

export const labelStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: theme.space.xs,
  color: theme.colors.text,
  fontSize: '0.87rem',
  fontWeight: 720,
});

export const controlStyles = (theme: Theme, invalid: boolean): CSSObject => ({
  width: '100%',
  minHeight: '2.85rem',
  padding: '0.7rem 0.8rem',
  border: `1px solid ${invalid ? theme.colors.danger : theme.colors.borderStrong}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.text,
  background: theme.colors.canvasRaised,
  caretColor: theme.colors.accent,
  transition: `border-color ${theme.motion.quick}, box-shadow ${theme.motion.quick}`,
  '&::placeholder': { color: theme.colors.textFaint },
  '&:hover:not(:disabled)': { borderColor: invalid ? theme.colors.danger : theme.colors.textFaint },
  '&:focus-visible': focusRingStyles(theme),
  '&:disabled': { cursor: 'not-allowed', opacity: 0.6 },
});

export const messageStyles = (theme: Theme, invalid: boolean): CSSObject => ({
  margin: 0,
  color: invalid ? theme.colors.danger : theme.colors.textMuted,
  fontSize: '0.78rem',
  lineHeight: 1.45,
});
