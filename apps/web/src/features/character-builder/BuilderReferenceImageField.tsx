import { REFERENCE_IMAGE_ACCEPT } from '../../adapters/browser-media/imageValidation';
import { ImagePickerDropField, StatusNotice } from '../../ui';
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
  const pickerDisabled = disabled || pending;

  return (
    <ImagePickerDropField
      accept={REFERENCE_IMAGE_ACCEPT}
      disabled={pickerDisabled}
      guidance={{
        kind: 'heading',
        text: 'Optional character reference',
        description:
          'JPEG, PNG, or WebP up to 10 MiB and 40 megapixels. The file is stored as an immutable local asset for draft restore and saved characters.',
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
              description: 'This immutable local asset will be restored with this builder draft.',
              removeLabel: 'Remove uploaded character reference',
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
  );
};
