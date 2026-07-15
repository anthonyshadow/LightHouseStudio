import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { focusRingStyles } from '../theme';

interface SharedFieldProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>, SharedFieldProps {}

export interface TextAreaFieldProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>, SharedFieldProps {}

export interface SelectFieldProps
  extends SelectHTMLAttributes<HTMLSelectElement>, SharedFieldProps {}

const fieldRootStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  minWidth: 0,
});

const labelStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'baseline',
  justifyContent: 'space-between',
  gap: theme.space.xs,
  color: theme.colors.text,
  fontSize: '0.87rem',
  fontWeight: 720,
});

const controlStyles = (theme: Theme, invalid: boolean): CSSObject => ({
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

const textareaStyles = (): CSSObject => ({
  minHeight: '6rem',
  resize: 'vertical',
  lineHeight: 1.5,
});

const messageStyles = (theme: Theme, invalid: boolean): CSSObject => ({
  margin: 0,
  color: invalid ? theme.colors.danger : theme.colors.textFaint,
  fontSize: '0.78rem',
  lineHeight: 1.45,
});

const resolveFieldIds = (
  providedId: string | undefined,
  generatedId: string,
  hasMessage: boolean,
) => {
  const id = providedId ?? generatedId;
  return { id, messageId: hasMessage ? `${id}-message` : undefined };
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { id: providedId, label, hint, error, required, ...props },
  ref,
) {
  const theme = useTheme();
  const generatedId = useId();
  const { id, messageId } = resolveFieldIds(providedId, generatedId, Boolean(error || hint));

  return (
    <div css={fieldRootStyles(theme)}>
      <label htmlFor={id} css={labelStyles(theme)}>
        <span>{label}</span>
        {required ? <span aria-hidden="true">Required</span> : null}
      </label>
      <input
        ref={ref}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={messageId}
        css={controlStyles(theme, Boolean(error))}
        {...props}
      />
      {error || hint ? (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          css={messageStyles(theme, Boolean(error))}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
});

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ id: providedId, label, hint, error, required, ...props }, ref) {
    const theme = useTheme();
    const generatedId = useId();
    const { id, messageId } = resolveFieldIds(providedId, generatedId, Boolean(error || hint));

    return (
      <div css={fieldRootStyles(theme)}>
        <label htmlFor={id} css={labelStyles(theme)}>
          <span>{label}</span>
          {required ? <span aria-hidden="true">Required</span> : null}
        </label>
        <textarea
          ref={ref}
          id={id}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={messageId}
          css={[controlStyles(theme, Boolean(error)), textareaStyles()]}
          {...props}
        />
        {error || hint ? (
          <p
            id={messageId}
            role={error ? 'alert' : undefined}
            css={messageStyles(theme, Boolean(error))}
          >
            {error ?? hint}
          </p>
        ) : null}
      </div>
    );
  },
);

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(function SelectField(
  { id: providedId, label, hint, error, required, children, ...props },
  ref,
) {
  const theme = useTheme();
  const generatedId = useId();
  const { id, messageId } = resolveFieldIds(providedId, generatedId, Boolean(error || hint));

  return (
    <div css={fieldRootStyles(theme)}>
      <label htmlFor={id} css={labelStyles(theme)}>
        <span>{label}</span>
        {required ? <span aria-hidden="true">Required</span> : null}
      </label>
      <select
        ref={ref}
        id={id}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={messageId}
        css={controlStyles(theme, Boolean(error))}
        {...props}
      >
        {children}
      </select>
      {error || hint ? (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          css={messageStyles(theme, Boolean(error))}
        >
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
});
