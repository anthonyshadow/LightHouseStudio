import { useId, useRef, useState, type ChangeEvent } from 'react';
import { useTheme } from '@emotion/react';
import { Button, StatusNotice } from '../../ui';
import { validateReferenceImage } from './imageValidation';
import {
  referenceFileAreaStyles,
  referenceGuidanceStyles,
  referencePreviewStyles,
} from './SessionComposer.styles';
import type { ModelMode } from './types';

export interface ReferenceImageFieldProps {
  mode: ModelMode;
  image: File | null;
  previewUrl: string | null;
  onChange: (image: File | null, previewUrl: string | null) => void;
}

interface ImageFeedback {
  messages: string[];
  blocking: boolean;
}

const emptyFeedback = (): ImageFeedback => ({ messages: [], blocking: false });

export const ReferenceImageField = ({
  mode,
  image,
  previewUrl,
  onChange,
}: ReferenceImageFieldProps) => {
  const theme = useTheme();
  const feedbackId = useId();
  const inputId = useId();
  const guidanceId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef(0);
  const [feedback, setFeedback] = useState<ImageFeedback>(emptyFeedback);

  const chooseImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    const selection = ++selectionRef.current;
    const validation = await validateReferenceImage(file, mode);
    if (selectionRef.current !== selection || !input.isConnected) return;

    if (validation.blockingError) {
      input.value = '';
      onChange(null, null);
      setFeedback({ messages: [validation.blockingError], blocking: true });
      return;
    }

    onChange(file, URL.createObjectURL(file));
    setFeedback({ messages: validation.warnings, blocking: false });
  };

  const clearImage = () => {
    selectionRef.current += 1;
    onChange(null, null);
    if (inputRef.current) inputRef.current.value = '';
    setFeedback(emptyFeedback());
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const referenceLabel =
    mode === 'lucy-2.5' ? 'Optional portrait reference' : 'Garment reference image';
  const guidance =
    mode === 'lucy-2.5'
      ? 'Use a clear, well-lit portrait for the most consistent character.'
      : 'Use one clearly visible, centered garment on a simple background.';

  return (
    <>
      <div css={referenceFileAreaStyles(theme)}>
        <div id={guidanceId} css={referenceGuidanceStyles(theme)}>
          <label htmlFor={inputId}>{referenceLabel}</label>
          <span>JPEG, PNG, or WebP up to 10 MiB. {guidance}</span>
        </div>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-invalid={feedback.blocking}
          aria-describedby={
            feedback.messages.length > 0 ? `${guidanceId} ${feedbackId}` : guidanceId
          }
          onChange={(event) => void chooseImage(event)}
        />
        {image ? (
          <Button size="small" variant="quiet" onClick={clearImage}>
            Clear image
          </Button>
        ) : null}
      </div>

      {image && previewUrl ? (
        <div css={referencePreviewStyles(theme)}>
          <img src={previewUrl} alt="Current ephemeral reference preview" />
          <p>
            {image.name}
            <br />
            This image stays in memory and is never saved to the recipe shelf.
          </p>
        </div>
      ) : null}

      {feedback.messages.length > 0 ? (
        <div id={feedbackId}>
          {feedback.messages.map((message) => (
            <StatusNotice
              key={message}
              tone={feedback.blocking ? 'danger' : 'warning'}
              role={feedback.blocking ? 'alert' : 'status'}
            >
              {message}
            </StatusNotice>
          ))}
        </div>
      ) : null}
    </>
  );
};
