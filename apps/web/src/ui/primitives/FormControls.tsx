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
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>, SharedFieldProps {
  /** An action rendered inside the control's trailing edge, such as a search clear button. */
  endAdornment?: ReactNode;
}

export interface TextAreaFieldProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement>, SharedFieldProps {}

const textareaStyles = (): CSSObject => ({
  minHeight: '6rem',
  resize: 'vertical',
  lineHeight: 1.5,
});

const adornedControlStyles = (): CSSObject => ({
  position: 'relative',
  minWidth: 0,
  '& > input': { paddingInlineEnd: '3.2rem' },
  '& > [data-field-end-adornment]': {
    position: 'absolute',
    insetInlineEnd: '0.05rem',
    insetBlockStart: '50%',
    display: 'grid',
    placeItems: 'center',
    transform: 'translateY(-50%)',
  },
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
  { id: providedId, label, hint, error, required, endAdornment, ...props },
  ref,
) {
  // `null` reserves an adornment slot. Search uses that to add/remove its clear action without
  // replacing the input node, which would drop focus and leave assistive technology on stale DOM.
  const hasEndAdornmentSlot = endAdornment !== undefined;
  return (
    <FieldFrame
      providedId={providedId}
      label={label}
      hint={hint}
      error={error}
      required={required}
      renderControl={({ id, messageId, invalid, controlCss }) => {
        const input = (
          <input
            ref={ref}
            id={id}
            required={required}
            aria-invalid={invalid}
            aria-describedby={messageId}
            css={controlCss}
            {...props}
          />
        );
        return hasEndAdornmentSlot ? (
          <div css={adornedControlStyles()}>
            {input}
            {endAdornment ? <span data-field-end-adornment="">{endAdornment}</span> : null}
          </div>
        ) : (
          input
        );
      }}
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
