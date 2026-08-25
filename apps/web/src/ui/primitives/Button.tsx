import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { forwardRef, type AnchorHTMLAttributes, type ButtonHTMLAttributes } from 'react';
import { focusRingStyles } from '../theme';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'link' | 'danger';
export type ButtonSize = 'small' | 'regular';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  busy?: boolean;
}

const buttonStyles = (theme: Theme, size: ButtonSize, variant: ButtonVariant): CSSObject => ({
  minHeight: size === 'small' ? '2.75rem' : '2.85rem',
  minWidth: size === 'small' ? '2.75rem' : '3rem',
  padding: size === 'small' ? '0.55rem 0.8rem' : '0.7rem 1rem',
  // A link reads as running text, so it keeps the block metrics but claims no box of its own.
  ...(variant === 'link' ? { minWidth: 0, paddingInline: 0 } : {}),
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

/** The colour recipe for a button variant, shared by `Button` and its anchor form. */
const buttonVariantStyles = (theme: Theme, variant: ButtonVariant): CSSObject => {
  switch (variant) {
    case 'primary':
      return {
        color: theme.colors.onAccent,
        background: `linear-gradient(135deg, ${theme.colors.accentStrong}, ${theme.colors.accent})`,
        boxShadow: theme.shadows.soft,
      };
    case 'secondary':
      return {
        color: theme.colors.text,
        background: theme.colors.surfaceStrong,
        borderColor: theme.colors.borderStrong,
        '&:hover:not(:disabled):not([aria-disabled="true"])': {
          borderColor: theme.colors.accent,
        },
      };
    case 'quiet':
      return {
        color: theme.colors.textMuted,
        background: 'transparent',
        '&:hover:not(:disabled):not([aria-disabled="true"])': {
          color: theme.colors.text,
          background: theme.colors.surfaceStrong,
        },
      };
    case 'link':
      return {
        color: theme.colors.accent,
        background: 'transparent',
        textDecoration: 'underline',
        textDecorationColor: `color-mix(in srgb, ${theme.colors.accent} 48%, transparent)`,
        textUnderlineOffset: '0.22em',
        '&:hover:not(:disabled):not([aria-disabled="true"])': {
          color: theme.colors.accentStrong,
          textDecorationColor: 'currentColor',
        },
      };
    case 'danger':
      return {
        color: theme.colors.danger,
        background: theme.colors.dangerSoft,
        borderColor: theme.colors.danger,
      };
  }
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
      css={[buttonStyles(theme, size, variant), buttonVariantStyles(theme, variant)]}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {children}
    </button>
  );
});

export interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

/**
 * `Button`'s anchor form, for the actions that must be a real link — every `<a download>` in the
 * product, which cannot be a `<button>` because the browser has to own the save. It shares the
 * metrics, the fill and the focus ring, so a Download beside a Save is the same control.
 *
 * The underline is cleared before the variant styles apply, so `variant="link"` still draws its
 * own; every other variant reads as a button rather than as running text.
 */
export const LinkButton = forwardRef<HTMLAnchorElement, LinkButtonProps>(function LinkButton(
  { variant = 'secondary', size = 'regular', children, ...props },
  ref,
) {
  const theme = useTheme();

  return (
    <a
      ref={ref}
      css={[
        buttonStyles(theme, size, variant),
        { textDecoration: 'none' },
        buttonVariantStyles(theme, variant),
      ]}
      {...props}
    >
      {children}
    </a>
  );
});
