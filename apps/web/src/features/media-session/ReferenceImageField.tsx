import { useEffect, useRef, useState } from 'react';
import { ImagePickerDropField, StatusNotice } from '../../ui';
import {
  REFERENCE_IMAGE_ACCEPT,
  validateReferenceImage,
} from '../../adapters/browser-media/imageValidation';
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

export const ReferenceImageField = ({
  mode,
  referenceImage,
  disabled = false,
  onChange,
}: ReferenceImageFieldProps) => {
  const selectionRef = useRef(0);
  const mountedRef = useRef(false);
  const [feedback, setFeedback] = useState<ImageFeedback>(emptyFeedback);
  const [inputResetVersion, setInputResetVersion] = useState(0);

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
      setInputResetVersion((version) => version + 1);
      setFeedback({ messages: [validation.blockingError], blocking: true });
      return;
    }

    onChange({ kind: 'ephemeral', file, previewUrl: URL.createObjectURL(file) });
    setFeedback({ messages: validation.warnings, blocking: false });
  };

  const clearImage = () => {
    selectionRef.current += 1;
    onChange(null);
    setFeedback(emptyFeedback());
  };

  const referenceLabel =
    mode === 'lucy-latest' ? 'Optional portrait reference' : 'Garment reference image';
  const guidance =
    mode === 'lucy-latest'
      ? 'Use a clear, well-lit portrait for the most consistent character.'
      : 'Use one clearly visible, centered garment on a simple background.';
  const image = referenceImage?.file ?? null;
  const previewUrl = referenceImage
    ? referenceImage.kind === 'persisted'
      ? referenceImage.contentUrl
      : referenceImage.previewUrl
    : null;

  return (
    <ImagePickerDropField
      accept={REFERENCE_IMAGE_ACCEPT}
      disabled={disabled}
      guidance={{
        kind: 'input-label',
        text: referenceLabel,
        description: `JPEG, PNG, or WebP up to 10 MiB. ${guidance}`,
      }}
      picker={{
        action: image ? 'Replace image' : 'Upload image',
        helper: 'Drag & drop or choose a file',
        dragHelper: 'Release to validate the file',
        resetInputOn: 'drop',
        inputResetVersion,
      }}
      {...(image && previewUrl
        ? {
            preview: {
              src: previewUrl,
              alt:
                referenceImage?.kind === 'persisted'
                  ? 'Current persisted reference preview'
                  : 'Current ephemeral reference preview',
              name: image.name,
              byteSize: image.size,
              description:
                referenceImage?.kind === 'persisted'
                  ? 'This immutable local asset can be restored with its saved configuration.'
                  : 'This manual upload stays in memory and is not added to the saved asset library.',
              removeLabel: 'Clear image',
              removeTitle: 'Remove reference image',
              onRemove: clearImage,
            },
          }
        : {})}
      {...(feedback.messages.length > 0
        ? {
            feedback: {
              invalid: feedback.blocking,
              content: feedback.messages.map((message) => (
                <StatusNotice
                  key={message}
                  tone={feedback.blocking ? 'danger' : 'warning'}
                  role={feedback.blocking ? 'alert' : 'status'}
                >
                  {message}
                </StatusNotice>
              )),
            },
          }
        : {})}
      onSelectFile={(file) => {
        void processImage(file);
      }}
    />
  );
};
