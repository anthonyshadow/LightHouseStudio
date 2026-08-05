import { useTheme, type CSSObject } from '@emotion/react';
import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
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

interface FieldFrameProps extends SharedFieldProps {
  providedId?: string | undefined;
  required?: boolean | undefined;
  renderControl: (options: {
    id: string;
    messageId: string | undefined;
    invalid: boolean;
    controlCss: CSSObject;
  }) => ReactNode;
}

const FieldFrame = ({
  providedId,
  label,
  hint,
  error,
  required,
  renderControl,
}: FieldFrameProps) => {
  const theme = useTheme();
  const generatedId = useId();
  const { id, messageId } = resolveFieldIds(providedId, generatedId, Boolean(error || hint));
  const invalid = Boolean(error);

  return (
    <div css={fieldRootStyles(theme)}>
      <label htmlFor={id} css={labelStyles(theme)}>
        <span>{label}</span>
        {required ? <span aria-hidden="true">Required</span> : null}
      </label>
      {renderControl({ id, messageId, invalid, controlCss: controlStyles(theme, invalid) })}
      {error || hint ? (
        <p id={messageId} role={error ? 'alert' : undefined} css={messageStyles(theme, invalid)}>
          {error ?? hint}
        </p>
      ) : null}
    </div>
  );
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { id: providedId, label, hint, error, required, ...props },
  ref,
) {
  return (
    <FieldFrame
      providedId={providedId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      renderControl={({ id, messageId, invalid, controlCss }) => (
        <input
          ref={ref}
          id={id}
          required={required}
          aria-invalid={invalid}
          aria-describedby={messageId}
          css={controlCss}
          {...props}
        />
      )}
    />
  );
});

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField({ id: providedId, label, hint, error, required, ...props }, ref) {
    return (
      <FieldFrame
        providedId={providedId}
        label={label}
        hint={hint}
        error={error}
        required={required}
        renderControl={({ id, messageId, invalid, controlCss }) => (
          <textarea
            ref={ref}
            id={id}
            required={required}
            aria-invalid={invalid}
            aria-describedby={messageId}
            css={[controlCss, textareaStyles()]}
            {...props}
          />
        )}
      />
    );
  },
);
