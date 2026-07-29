import { useTheme } from '@emotion/react';
import { formatFileSize } from '@studio/domain';
import { useEffect, useId, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Button } from './Button';
import {
  imagePickerDropFieldStyles,
  imagePickerDropFileAreaStyles,
  imagePickerDropGuidanceStyles,
  imagePickerDropLabelStyles,
  imagePickerDropPreviewStyles,
} from './ImagePickerDropField.styles';

export type ImagePickerDropGuidance =
  | {
      readonly kind: 'input-label';
      readonly text: string;
      readonly description: string;
    }
  | {
      readonly kind: 'heading';
      readonly text: string;
      readonly description: string;
    };

export interface ImagePickerDropPicker {
  readonly action: string;
  readonly helper: string;
  readonly dragHelper: string;
  readonly resetInputOn: 'picker-open' | 'drop';
  readonly inputResetVersion?: number;
}

export interface ImagePickerDropPreview {
  readonly src: string;
  readonly alt: string;
  readonly name: string;
  readonly byteSize: number;
  readonly description: string;
  readonly removeLabel: string;
  readonly removeText?: string;
  readonly removeTitle?: string;
  readonly onRemove: () => void;
}

export interface ImagePickerDropFeedback {
  readonly invalid: boolean;
  readonly content: ReactNode;
}

export interface ImagePickerDropFieldProps {
  readonly accept: string;
  readonly disabled: boolean;
  readonly guidance: ImagePickerDropGuidance;
  readonly picker: ImagePickerDropPicker;
  readonly preview?: ImagePickerDropPreview;
  readonly feedback?: ImagePickerDropFeedback;
  readonly onSelectFile: (file: File) => void;
}

export const ImagePickerDropField = ({
  accept,
  disabled,
  guidance,
  picker,
  preview,
  feedback,
  onSelectFile,
}: ImagePickerDropFieldProps) => {
  const theme = useTheme();
  const inputId = useId();
  const guidanceId = useId();
  const feedbackId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (inputRef.current) inputRef.current.value = '';
  }, [picker.inputResetVersion]);

  const startDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (disabled) return;
    dragDepthRef.current += 1;
    setDragging(true);
  };

  const continueDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!disabled) event.dataTransfer.dropEffect = 'copy';
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
    if (picker.resetInputOn === 'drop' && inputRef.current) inputRef.current.value = '';
    onSelectFile(file);
  };

  return (
    <div css={imagePickerDropFieldStyles(theme)}>
      <div id={guidanceId} css={imagePickerDropGuidanceStyles(theme)}>
        {guidance.kind === 'input-label' ? (
          <label htmlFor={inputId}>{guidance.text}</label>
        ) : (
          <span>{guidance.text}</span>
        )}
        <span>{guidance.description}</span>
      </div>

      <div
        css={imagePickerDropFileAreaStyles(theme, dragging, disabled)}
        onDragEnter={startDrag}
        onDragOver={continueDrag}
        onDragLeave={endDrag}
        onDrop={dropImage}
      >
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          aria-invalid={feedback?.invalid ?? false}
          aria-describedby={feedback ? `${guidanceId} ${feedbackId}` : guidanceId}
          onClick={
            picker.resetInputOn === 'picker-open'
              ? (event) => {
                  event.currentTarget.value = '';
                }
              : undefined
          }
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) onSelectFile(file);
          }}
        />
        <label htmlFor={inputId} css={imagePickerDropLabelStyles(theme, disabled)}>
          <strong>{dragging ? 'Drop image here' : picker.action}</strong>
          <span>{dragging ? picker.dragHelper : picker.helper}</span>
        </label>
      </div>

      {preview ? (
        <div aria-live="polite" css={imagePickerDropPreviewStyles(theme)}>
          <img src={preview.src} alt={preview.alt} />
          <div>
            <strong title={preview.name}>{preview.name}</strong>
            <span>{formatFileSize(preview.byteSize)}</span>
            <small>{preview.description}</small>
          </div>
          <Button
            size="small"
            variant="quiet"
            disabled={disabled}
            aria-label={preview.removeLabel}
            {...(preview.removeTitle ? { title: preview.removeTitle } : {})}
            onClick={() => {
              preview.onRemove();
              if (inputRef.current) inputRef.current.value = '';
              setDragging(false);
              dragDepthRef.current = 0;
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            {preview.removeText ?? 'Remove'}
          </Button>
        </div>
      ) : null}

      {feedback ? <div id={feedbackId}>{feedback.content}</div> : null}
    </div>
  );
};
