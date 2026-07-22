import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { focusRingStyles } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'small' | 'regular';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
}

const buttonStyles = (theme: Theme, size: ButtonSize): CSSObject => ({
  minHeight: size === 'small' ? '2.75rem' : '2.85rem',
  minWidth: size === 'small' ? '2.75rem' : '3rem',
  padding: size === 'small' ? '0.55rem 0.8rem' : '0.7rem 1rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.space.xs,
  border: '1px solid transparent',
  borderRadius: theme.radii.medium,
  color: theme.colors.text,
  fontWeight: 720,
  lineHeight: 1.1,
  cursor: 'pointer',
  transition: `transform ${theme.motion.quick}, border-color ${theme.motion.quick}, background ${theme.motion.quick}`,
  WebkitTapHighlightColor: 'transparent',
  '&:hover:not(:disabled):not([aria-disabled="true"])': {
    transform: 'translateY(-1px)',
  },
  '&:active:not(:disabled):not([aria-disabled="true"])': {
    transform: 'translateY(0)',
  },
  '&:focus-visible': focusRingStyles(theme),
  '&:disabled, &[aria-disabled="true"]': {
    cursor: 'not-allowed',
    opacity: 0.48,
  },
});

const variantStyles = (theme: Theme, variant: ButtonVariant): CSSObject => {
  const variants: Record<ButtonVariant, CSSObject> = {
    primary: {
      color: theme.colors.onAccent,
      background: `linear-gradient(135deg, ${theme.colors.accentStrong}, ${theme.colors.accent})`,
      boxShadow: theme.shadows.soft,
    },
    secondary: {
      color: theme.colors.text,
      background: theme.colors.surfaceStrong,
      borderColor: theme.colors.borderStrong,
      '&:hover:not(:disabled):not([aria-disabled="true"])': {
        borderColor: theme.colors.accent,
      },
    },
    quiet: {
      color: theme.colors.textMuted,
      background: 'transparent',
      '&:hover:not(:disabled):not([aria-disabled="true"])': {
        color: theme.colors.text,
        background: theme.colors.surfaceStrong,
      },
    },
    danger: {
      color: theme.colors.danger,
      background: theme.colors.dangerSoft,
      borderColor: theme.colors.danger,
    },
  };

  return variants[variant];
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'regular',
    busy = false,
    disabled,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  const theme = useTheme();

  return (
    <button
      ref={ref}
      type={type}
      css={[buttonStyles(theme, size), variantStyles(theme, variant)]}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {children}
    </button>
  );
});
