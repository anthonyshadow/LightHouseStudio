import { useEffect, useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { useTheme } from '@emotion/react';
import { Button, StatusNotice } from '../../ui';
import { validateReferenceImage } from './imageValidation';
import {
  referenceFieldStyles,
  referenceFileAreaStyles,
  referenceGuidanceStyles,
  referencePickerStyles,
  referencePreviewStyles,
} from './SessionComposer.styles';
import type { ModelMode } from './types';
import type { SessionReferenceImage } from './types';

export interface ReferenceImageFieldProps {
  mode: ModelMode;
  referenceImage: SessionReferenceImage | null;
  disabled?: boolean;
  onChange: (referenceImage: SessionReferenceImage | null) => void;
}

interface ImageFeedback {
  messages: string[];
  blocking: boolean;
}

const emptyFeedback = (): ImageFeedback => ({ messages: [], blocking: false });

const formatFileSize = (bytes: number): string => {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MiB`;
};

export const ReferenceImageField = ({
  mode,
  referenceImage,
  disabled = false,
  onChange,
}: ReferenceImageFieldProps) => {
  const theme = useTheme();
  const feedbackId = useId();
  const inputId = useId();
  const guidanceId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const selectionRef = useRef(0);
  const mountedRef = useRef(false);
  const dragDepthRef = useRef(0);
  const [feedback, setFeedback] = useState<ImageFeedback>(emptyFeedback);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      selectionRef.current += 1;
    };
  }, []);

  const processImage = async (file: File) => {
    if (disabled) return;

    const selection = ++selectionRef.current;
    const validation = await validateReferenceImage(file, mode);
    if (selectionRef.current !== selection || !mountedRef.current) return;

    if (validation.blockingError) {
      if (inputRef.current) inputRef.current.value = '';
      setFeedback({ messages: [validation.blockingError], blocking: true });
      return;
    }

    onChange({ kind: 'ephemeral', file, previewUrl: URL.createObjectURL(file) });
    setFeedback({ messages: validation.warnings, blocking: false });
  };

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) void processImage(file);
  };

  const clearImage = () => {
    selectionRef.current += 1;
    onChange(null);
    if (inputRef.current) inputRef.current.value = '';
    setFeedback(emptyFeedback());
    setDragging(false);
    dragDepthRef.current = 0;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const startDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    dragDepthRef.current += 1;
    setDragging(true);
  };

  const continueDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    event.dataTransfer.dropEffect = 'copy';
  };

  const endDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  };

  const dropImage = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    if (disabled) return;

    const file = event.dataTransfer.files[0];
    if (!file) return;
    if (inputRef.current) inputRef.current.value = '';
    void processImage(file);
  };

  const referenceLabel =
    mode === 'lucy-2.5' ? 'Optional portrait reference' : 'Garment reference image';
  const guidance =
    mode === 'lucy-2.5'
      ? 'Use a clear, well-lit portrait for the most consistent character.'
      : 'Use one clearly visible, centered garment on a simple background.';
  const image = referenceImage?.file ?? null;
  const previewUrl = referenceImage
    ? referenceImage.kind === 'persisted'
      ? referenceImage.contentUrl
      : referenceImage.previewUrl
    : null;

  return (
    <div css={referenceFieldStyles(theme)}>
      <div id={guidanceId} css={referenceGuidanceStyles(theme)}>
        <label htmlFor={inputId}>{referenceLabel}</label>
        <span>JPEG, PNG, or WebP up to 10 MiB. {guidance}</span>
      </div>

      <div
        css={referenceFileAreaStyles(theme, dragging, disabled)}
        onDragEnter={startDrag}
        onDragOver={continueDrag}
        onDragLeave={endDrag}
        onDrop={dropImage}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={disabled}
          aria-invalid={feedback.blocking}
          aria-describedby={
            feedback.messages.length > 0 ? `${guidanceId} ${feedbackId}` : guidanceId
          }
          onChange={chooseImage}
        />
        <label htmlFor={inputId} css={referencePickerStyles(theme, disabled)}>
          <strong>{dragging ? 'Drop image here' : image ? 'Replace image' : 'Upload image'}</strong>
          <span>{dragging ? 'Release to validate the file' : 'Drag & drop or choose a file'}</span>
        </label>
      </div>

      {image && previewUrl ? (
        <div aria-live="polite" css={referencePreviewStyles(theme)}>
          <img
            src={previewUrl}
            alt={
              referenceImage?.kind === 'persisted'
                ? 'Current persisted reference preview'
                : 'Current ephemeral reference preview'
            }
          />
          <div>
            <strong title={image.name}>{image.name}</strong>
            <span>{formatFileSize(image.size)}</span>
            <small>
              {referenceImage?.kind === 'persisted'
                ? 'This immutable local asset can be restored with its saved recipe.'
                : 'This manual upload stays in memory and is never saved to the recipe shelf.'}
            </small>
          </div>
          <Button
            size="small"
            variant="quiet"
            disabled={disabled}
            aria-label="Clear image"
            title="Remove reference image"
            onClick={clearImage}
          >
            Remove
          </Button>
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
    </div>
  );
};
