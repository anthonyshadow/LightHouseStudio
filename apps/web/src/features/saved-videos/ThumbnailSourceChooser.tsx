import { validateImageDescriptor } from '@studio/domain';
import { useEffect, useRef, useState } from 'react';
import { REFERENCE_IMAGE_ACCEPT } from '../../adapters/browser-media/imageValidation';
import { ImagePickerDropField, SegmentedControl, StatusNotice } from '../../ui';
import type { SavedVideoThumbnailChoice } from './thumbnailSource';

type ThumbnailSourceKind = SavedVideoThumbnailChoice['kind'];

const SOURCE_OPTIONS = [
  { value: 'auto', label: 'Choose for me', shortLabel: 'Auto' },
  { value: 'first-frame', label: 'First frame', shortLabel: 'First' },
  { value: 'image', label: 'Upload image', shortLabel: 'Upload' },
] as const satisfies readonly {
  value: ThumbnailSourceKind;
  label: string;
  shortLabel: string;
}[];

const SOURCE_HINTS: Readonly<Record<ThumbnailSourceKind, string>> = {
  auto: 'An early frame from the video becomes the preview. This is what happens if you decide nothing.',
  'first-frame': 'The very first frame of the video becomes the preview.',
  image:
    'Your image is resized and stored as the preview, keeping its shape. Leave it empty and an early frame is used instead.',
};

/**
 * The one place a poster frame's source is chosen — shared by the save dialog and the Videos
 * library repair action, so both offer the same three answers and the same validation.
 *
 * The reported choice is always one that can be acted on: choosing Upload without attaching an
 * image reports the automatic frame rather than a half-made decision.
 */
export const ThumbnailSourceChooser = ({
  value,
  disabled = false,
  onChange,
}: {
  readonly value: SavedVideoThumbnailChoice;
  readonly disabled?: boolean;
  readonly onChange: (choice: SavedVideoThumbnailChoice) => void;
}) => {
  const file = value.kind === 'image' ? value.file : null;
  const [kind, setKind] = useState<ThumbnailSourceKind>(value.kind);
  // Switching to a frame source and back should not silently discard an attached image.
  const attached = useRef<File | null>(file);
  const [rejected, setRejected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ readonly file: File; readonly url: string } | null>(
    null,
  );

  useEffect(() => {
    if (file) attached.current = file;
    if (!file || typeof URL.createObjectURL !== 'function') return;
    const objectUrl = URL.createObjectURL(file);
    let active = true;
    queueMicrotask(() => {
      if (active) setPreview({ file, url: objectUrl });
    });
    return () => {
      active = false;
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  const chooseKind = (next: ThumbnailSourceKind) => {
    setKind(next);
    setRejected(null);
    const restored = attached.current;
    if (next === 'image') onChange(restored ? { kind: 'image', file: restored } : { kind: 'auto' });
    else onChange({ kind: next });
  };

  const selectFile = (candidate: File) => {
    const issue = validateImageDescriptor({
      mimeType: candidate.type,
      sizeBytes: candidate.size,
    })[0];
    if (issue) {
      setRejected(issue.message);
      return;
    }
    setRejected(null);
    onChange({ kind: 'image', file: candidate });
  };

  const visiblePreview = preview?.file === file ? preview : null;

  return (
    <div css={{ display: 'grid', gap: '0.75rem' }}>
      <SegmentedControl
        label="Preview image"
        value={kind}
        options={SOURCE_OPTIONS}
        disabled={disabled}
        onChange={chooseKind}
      />
      <p css={{ margin: 0, fontSize: '0.85rem' }}>{SOURCE_HINTS[kind]}</p>
      {kind === 'image' ? (
        <ImagePickerDropField
          accept={REFERENCE_IMAGE_ACCEPT}
          disabled={disabled}
          guidance={{
            kind: 'input-label',
            text: 'Preview image (optional)',
            description: 'JPEG, PNG, or WebP, up to 10 MiB.',
          }}
          picker={{
            action: file ? 'Replace preview image' : 'Attach preview image',
            helper: 'Drag & drop or choose a file',
            dragHelper: 'Release to use this image',
            resetInputOn: 'picker-open',
          }}
          {...(file && visiblePreview
            ? {
                preview: {
                  src: visiblePreview.url,
                  alt: `Chosen preview image: ${file.name}`,
                  name: file.name,
                  byteSize: file.size,
                  description: 'Stored as this video’s preview.',
                  removeLabel: 'Remove preview image',
                  removeTitle: 'Remove preview image',
                  onRemove: () => {
                    setRejected(null);
                    attached.current = null;
                    onChange({ kind: 'auto' });
                  },
                },
              }
            : {})}
          {...(rejected
            ? {
                feedback: {
                  invalid: true,
                  content: (
                    <StatusNotice role="alert" tone="danger" title="Preview image not used">
                      {rejected}
                    </StatusNotice>
                  ),
                },
              }
            : {})}
          onSelectFile={selectFile}
        />
      ) : null}
    </div>
  );
};
