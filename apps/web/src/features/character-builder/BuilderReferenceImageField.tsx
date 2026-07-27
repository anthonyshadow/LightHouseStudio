import { useTheme } from '@emotion/react';
import { useId, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { Button, StatusNotice } from '../../ui';
import {
  referenceFieldStyles,
  referenceFileAreaStyles,
  referenceGuidanceStyles,
  referencePickerStyles,
  referencePreviewStyles,
} from '../media-session/SessionComposer.styles';
import type { CharacterBuilderUploadedReference } from './machine';

const formatFileSize = (bytes: number): string => {
  if (bytes < 1_024) return `${bytes} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KiB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MiB`;
};

export const BuilderReferenceImageField = ({
  reference,
  pending,
  error,
  disabled,
  onSelect,
  onRemove,
}: {
  readonly reference: CharacterBuilderUploadedReference | null;
  readonly pending: boolean;
  readonly error: string | null;
  readonly disabled: boolean;
  readonly onSelect: (file: File) => void;
  readonly onRemove: () => void;
}) => {
  const theme = useTheme();
  const inputId = useId();
  const guidanceId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const pickerDisabled = disabled || pending;

  const chooseImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (file) onSelect(file);
  };
  const startDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (pickerDisabled) return;
    dragDepthRef.current += 1;
    setDragging(true);
  };
  const continueDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!pickerDisabled) event.dataTransfer.dropEffect = 'copy';
  };
  const endDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (pickerDisabled) return;
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragging(false);
  };
  const dropImage = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepthRef.current = 0;
    setDragging(false);
    if (pickerDisabled) return;
    const file = event.dataTransfer.files[0];
    if (file) onSelect(file);
  };

  return (
    <div css={referenceFieldStyles(theme)}>
      <div id={guidanceId} css={referenceGuidanceStyles(theme)}>
        <span>Optional character reference</span>
        <span>
          JPEG, PNG, or WebP up to 10 MiB and 40 megapixels. The file is stored as an immutable
          local asset for draft restore and saved characters.
        </span>
      </div>
      <div
        css={referenceFileAreaStyles(theme, dragging, pickerDisabled)}
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
          disabled={pickerDisabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${guidanceId} ${errorId}` : guidanceId}
          onClick={(event) => {
            event.currentTarget.value = '';
          }}
          onChange={chooseImage}
        />
        <label htmlFor={inputId} css={referencePickerStyles(theme, pickerDisabled)}>
          <strong>
            {pending
              ? 'Uploading image…'
              : dragging
                ? 'Drop image here'
                : reference
                  ? 'Replace image'
                  : 'Upload image'}
          </strong>
          <span>
            {pending
              ? 'Your current reference remains active until this finishes'
              : 'Drag & drop or choose a file'}
          </span>
        </label>
      </div>

      {reference ? (
        <div aria-live="polite" css={referencePreviewStyles(theme)}>
          <img src={reference.asset.contentUrl} alt="Current uploaded character reference" />
          <div>
            <strong title={reference.displayName}>{reference.displayName}</strong>
            <span>{formatFileSize(reference.asset.byteSize)}</span>
            <small>This immutable local asset will be restored with this builder draft.</small>
          </div>
          <Button
            size="small"
            variant="quiet"
            disabled={pickerDisabled}
            aria-label="Remove uploaded character reference"
            onClick={() => {
              onRemove();
              window.requestAnimationFrame(() => inputRef.current?.focus());
            }}
          >
            Remove
          </Button>
        </div>
      ) : null}
      {error ? (
        <div id={errorId}>
          <StatusNotice tone="danger" role="alert">
            {error}
          </StatusNotice>
        </div>
      ) : null}
    </div>
  );
};
