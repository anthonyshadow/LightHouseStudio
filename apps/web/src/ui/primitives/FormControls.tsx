import { useTheme, type CSSObject } from '@emotion/react';
import { forwardRef, useId, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { controlStyles, fieldRootStyles, labelStyles, messageStyles } from './FormControl.styles';

interface SharedFieldProps {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
}

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>, SharedFieldProps {}

export interface TextAreaFieldProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>, SharedFieldProps {}

const textareaStyles = (): CSSObject => ({
  minHeight: '6rem',
  resize: 'vertical',
  lineHeight: 1.5,
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
