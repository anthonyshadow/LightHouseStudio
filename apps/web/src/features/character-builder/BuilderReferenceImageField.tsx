import { useState } from 'react';
import { REFERENCE_IMAGE_ACCEPT } from '../../adapters/browser-media/imageValidation';
import { ImagePickerDropField, StatusNotice } from '../../ui';
import { RemoteReferenceImageUrlInput } from '../reference-images/RemoteReferenceImageUrlInput';
import type { CharacterBuilderUploadedReference } from './machine';

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
  const [urlImporting, setUrlImporting] = useState(false);
  const pickerDisabled = disabled || pending || urlImporting;

  return (
    <div css={{ display: 'grid', gap: '0.75rem' }}>
      <ImagePickerDropField
        accept={REFERENCE_IMAGE_ACCEPT}
        disabled={pickerDisabled}
        guidance={{
          kind: 'heading',
          text: 'Optional character reference',
          description:
            'JPEG, PNG, or WebP up to 10 MiB and 40 megapixels. Choosing a file stores it in your local data directory. Detaching it later removes the link, not the stored file.',
        }}
        picker={{
          action: pending ? 'Uploading image…' : reference ? 'Replace image' : 'Upload image',
          helper: pending
            ? 'Your current reference remains active until this finishes'
            : 'Drag & drop or choose a file',
          dragHelper: 'Drag & drop or choose a file',
          resetInputOn: 'picker-open',
        }}
        {...(reference
          ? {
              preview: {
                src: reference.asset.contentUrl,
                alt: 'Current uploaded character reference',
                name: reference.displayName,
                byteSize: reference.asset.byteSize,
                description:
                  'This stored image is restored with this draft. Detach removes the link, not the stored file.',
                removeLabel: 'Detach uploaded character reference',
                removeText: 'Detach',
                removeTitle: 'Detach reference without deleting the stored file',
                onRemove,
              },
            }
          : {})}
        {...(error
          ? {
              feedback: {
                invalid: true,
                content: (
                  <StatusNotice tone="danger" role="alert">
                    {error}
                  </StatusNotice>
                ),
              },
            }
          : {})}
        onSelectFile={onSelect}
      />
      <RemoteReferenceImageUrlInput
        disabled={disabled || pending}
        onSelectFile={onSelect}
        onBusyChange={setUrlImporting}
      />
    </div>
  );
};
