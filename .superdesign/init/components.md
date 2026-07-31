# Shared UI components

Framework: React 19 with Emotion. The component library is custom and lives in
`apps/web/src/ui/primitives`.

## Button

- Source: `apps/web/src/ui/primitives/Button.tsx`
- Reusable action primitive with primary, secondary, quiet, and danger variants.
- Key props: `variant`, `size`, `busy`, and native button attributes.

```tsx
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
  '&:hover:not(:disabled):not([aria-disabled="true"])': { transform: 'translateY(-1px)' },
  '&:active:not(:disabled):not([aria-disabled="true"])': { transform: 'translateY(0)' },
  '&:focus-visible': focusRingStyles(theme),
  '&:disabled, &[aria-disabled="true"]': { cursor: 'not-allowed', opacity: 0.48 },
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
      '&:hover:not(:disabled):not([aria-disabled="true"])': { borderColor: theme.colors.accent },
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
```

## StatusNotice

- Source: `apps/web/src/ui/primitives/StatusNotice.tsx`
- Reusable neutral/success/warning/danger status surface.
- Key props: `tone`, `title`, and native div attributes.

```tsx
import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { HTMLAttributes, PropsWithChildren } from 'react';

export type NoticeTone = 'neutral' | 'success' | 'warning' | 'danger';
export interface StatusNoticeProps extends HTMLAttributes<HTMLDivElement> {
  tone?: NoticeTone;
  title?: string;
}

const noticeStyles = (theme: Theme, tone: NoticeTone): CSSObject => {
  const palette = {
    neutral: { foreground: theme.colors.textMuted, background: theme.colors.surfaceStrong },
    success: { foreground: theme.colors.success, background: theme.colors.successSoft },
    warning: { foreground: theme.colors.warning, background: theme.colors.warningSoft },
    danger: { foreground: theme.colors.danger, background: theme.colors.dangerSoft },
  }[tone];
  return {
    padding: `${theme.space.sm} ${theme.space.md}`,
    border: `1px solid color-mix(in srgb, ${palette.foreground} 35%, transparent)`,
    borderRadius: theme.radii.medium,
    color: palette.foreground,
    background: palette.background,
    fontSize: '0.86rem',
    lineHeight: 1.5,
  };
};

export const StatusNotice = ({
  tone = 'neutral',
  title,
  children,
  ...props
}: PropsWithChildren<StatusNoticeProps>) => {
  const theme = useTheme();
  return (
    <div css={noticeStyles(theme, tone)} {...props}>
      {title ? (
        <strong css={{ display: 'block', marginBlockEnd: theme.space.xxs }}>{title}</strong>
      ) : null}
      {children}
    </div>
  );
};
```

## Other shared primitives

- `apps/web/src/ui/primitives/FormControls.tsx`: full-width `TextField`, `TextAreaField`, and
  `SelectField`, all with native labels, hints/errors, 2.85rem minimum controls, and visible focus.
- `apps/web/src/ui/primitives/SegmentedControl.tsx`: responsive pressed-button group.
- `apps/web/src/ui/primitives/ImagePickerDropField.tsx`: keyboard and drag/drop image picker.
- `apps/web/src/ui/primitives/ConfirmationDialog.tsx`: destructive confirmation dialog.
- `apps/web/src/ui/primitives/VisuallyHidden.tsx`: accessible visually-hidden text.
