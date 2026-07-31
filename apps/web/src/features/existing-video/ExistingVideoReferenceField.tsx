import { useEffect, useRef, useState } from 'react';
import { importRemoteReferenceImage } from '../../adapters/api-client/apiClient';
import { Button, ImagePickerDropField, StatusNotice, TextField } from '../../ui';
import { REFERENCE_IMAGE_ACCEPT } from '../../adapters/browser-media/imageValidation';
import type { ExistingVideoStep } from './useExistingVideoWorkflow';

export interface ExistingVideoReferenceFieldProps {
  readonly modelId: ExistingVideoStep['modelId'];
  readonly file: File | null;
  readonly disabled: boolean;
  readonly onSelectFile: (file: File) => void;
  readonly onRemove: () => void;
  readonly allowUrlImport?: boolean;
}

export const ExistingVideoReferenceField = ({
  modelId,
  file,
  disabled,
  onSelectFile,
  onRemove,
  allowUrlImport = false,
}: ExistingVideoReferenceFieldProps) => {
  const [preview, setPreview] = useState<{
    readonly file: File;
    readonly url: string;
  } | null>(null);
  const [showUrl, setShowUrl] = useState(false);
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const importControllerRef = useRef<AbortController | null>(null);

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

  useEffect(
    () => () => {
      importControllerRef.current?.abort();
    },
    [],
  );

  const visiblePreview = preview?.file === file ? preview : null;
  const guidance =
    modelId === 'lucy-latest'
      ? 'Use a clear portrait or character reference.'
      : 'Use one clearly visible garment on a simple background.';

  return (
    <div css={{ display: 'grid', gap: '0.75rem' }}>
      <ImagePickerDropField
        accept={REFERENCE_IMAGE_ACCEPT}
        disabled={disabled || importing}
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
                description:
                  'This reference stays in this tab and is submitted only with this step.',
                removeLabel: 'Remove attached reference image',
                removeTitle: 'Remove reference image',
                onRemove,
              },
            }
          : {})}
        onSelectFile={onSelectFile}
      />
      {allowUrlImport ? (
        <>
          <Button
            variant="quiet"
            disabled={disabled}
            aria-expanded={showUrl}
            onClick={() => setShowUrl((visible) => !visible)}
          >
            {showUrl ? 'Hide image URL' : 'Use an image URL instead'}
          </Button>
          {showUrl ? (
            <div css={{ display: 'grid', gap: '0.5rem' }}>
              <TextField
                label="Public HTTPS image URL"
                type="url"
                value={url}
                disabled={disabled || importing}
                placeholder="https://example.com/outfit.jpg"
                onChange={(event) => setUrl(event.currentTarget.value)}
              />
              <Button
                variant="secondary"
                busy={importing}
                disabled={disabled || !url.trim()}
                onClick={() => {
                  importControllerRef.current?.abort();
                  const controller = new AbortController();
                  importControllerRef.current = controller;
                  setImporting(true);
                  setImportError(null);
                  void importRemoteReferenceImage(url.trim(), controller.signal)
                    .then((imported) => {
                      if (!controller.signal.aborted) onSelectFile(imported);
                    })
                    .catch((error: unknown) => {
                      if (!controller.signal.aborted) {
                        setImportError(
                          error instanceof Error
                            ? error.message
                            : 'The remote image could not be imported safely.',
                        );
                      }
                    })
                    .finally(() => {
                      if (importControllerRef.current === controller) {
                        importControllerRef.current = null;
                        setImporting(false);
                      }
                    });
                }}
              >
                Import image
              </Button>
              {importError ? (
                <StatusNotice tone="danger" role="alert">
                  {importError}
                </StatusNotice>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
};
