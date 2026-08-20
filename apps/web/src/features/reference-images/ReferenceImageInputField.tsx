import { useState } from 'react';
import { REFERENCE_IMAGE_ACCEPT } from '../../adapters/browser-media/imageValidation';
import { useObjectUrlPreview } from '../../adapters/browser-media/useObjectUrlPreview';
import { ImagePickerDropField } from '../../ui';
import { RemoteReferenceImageUrlInput } from './RemoteReferenceImageUrlInput';

export interface ReferenceImageInputFieldProps {
  readonly kind: 'character' | 'garment';
  readonly file: File | null;
  readonly disabled: boolean;
  readonly onSelectFile: (file: File) => void;
  readonly onRemove: () => void;
  readonly allowUrlImport?: boolean;
  readonly label?: string;
}

/** Shared, browser-validated image input. HTTPS imports remain server-mediated. */
export const ReferenceImageInputField = ({
  kind,
  file,
  disabled,
  onSelectFile,
  onRemove,
  allowUrlImport = false,
  label = 'Reference image',
}: ReferenceImageInputFieldProps) => {
  const [urlImporting, setUrlImporting] = useState(false);
  const visiblePreview = useObjectUrlPreview(file);
  const guidance =
    kind === 'character'
      ? 'Use a clear portrait or character reference.'
      : 'Use one clearly visible garment on a simple background.';

  return (
    <div css={{ display: 'grid', gap: '0.75rem' }}>
      <ImagePickerDropField
        accept={REFERENCE_IMAGE_ACCEPT}
        disabled={disabled || urlImporting}
        guidance={{
          kind: 'input-label',
          text: label,
          description: `JPEG, PNG, or WebP. ${guidance}`,
        }}
        picker={{
          action: file
            ? `Replace ${label.toLocaleLowerCase()}`
            : `Attach ${label.toLocaleLowerCase()}`,
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
                description: 'This image is submitted only from the explicit action for this flow.',
                removeLabel: `Remove ${label.toLocaleLowerCase()}`,
                removeTitle: `Remove ${label.toLocaleLowerCase()}`,
                onRemove,
              },
            }
          : {})}
        onSelectFile={onSelectFile}
      />
      {allowUrlImport ? (
        <RemoteReferenceImageUrlInput
          disabled={disabled}
          onSelectFile={onSelectFile}
          onBusyChange={setUrlImporting}
        />
      ) : null}
    </div>
  );
};
