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
            'JPEG, PNG, or WebP up to 10 MiB and 40 megapixels. Selecting a file stores an immutable local asset in the configured data directory. Detaching it later removes the relationship, not the stored bytes.',
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
                  'This immutable local asset will be restored with this builder draft. Detach removes this draft relationship but does not delete the stored bytes.',
                removeLabel: 'Detach uploaded character reference',
                removeText: 'Detach',
                removeTitle: 'Detach reference without deleting stored bytes',
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
