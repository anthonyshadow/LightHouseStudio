import { useEffect, useState } from 'react';
import { ImagePickerDropField } from '../../ui';
import { REFERENCE_IMAGE_ACCEPT } from '../../adapters/browser-media/imageValidation';
import type { ExistingVideoStep } from './useExistingVideoWorkflow';

export interface ExistingVideoReferenceFieldProps {
  readonly modelId: ExistingVideoStep['modelId'];
  readonly file: File | null;
  readonly disabled: boolean;
  readonly onSelectFile: (file: File) => void;
  readonly onRemove: () => void;
}

export const ExistingVideoReferenceField = ({
  modelId,
  file,
  disabled,
  onSelectFile,
  onRemove,
}: ExistingVideoReferenceFieldProps) => {
  const [preview, setPreview] = useState<{
    readonly file: File;
    readonly url: string;
  } | null>(null);

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') return;

    const url = URL.createObjectURL(file);
    let active = true;
    queueMicrotask(() => {
      if (active) setPreview({ file, url });
    });
    return () => {
      active = false;
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const visiblePreview = preview?.file === file ? preview : null;
  const guidance =
    modelId === 'lucy-2.5'
      ? 'Use a clear portrait or character reference.'
      : 'Use one clearly visible garment on a simple background.';

  return (
    <ImagePickerDropField
      accept={REFERENCE_IMAGE_ACCEPT}
      disabled={disabled}
      guidance={{
        kind: 'input-label',
        text: 'Reference image',
        description: `JPEG, PNG, or WebP. ${guidance}`,
      }}
      picker={{
        action: file ? 'Replace reference image' : 'Attach reference image',
        helper: 'Drag & drop or choose a file',
        dragHelper: 'Release to validate the image',
        resetInputOn: 'picker-open',
      }}
      {...(file && visiblePreview
        ? {
            preview: {
              src: visiblePreview.url,
              alt: `Attached reference preview: ${file.name}`,
              name: file.name,
              byteSize: file.size,
              description: 'This reference stays in this tab and is submitted only with this step.',
              removeLabel: 'Remove attached reference image',
              removeTitle: 'Remove reference image',
              onRemove,
            },
          }
        : {})}
      onSelectFile={onSelectFile}
    />
  );
};
