import { useEffect, useRef, useState } from 'react';
import { importRemoteReferenceImage } from '../../adapters/api-client/apiClient';
import { Button, StatusNotice, TextField } from '../../ui';

export const RemoteReferenceImageUrlInput = ({
  disabled,
  onSelectFile,
  onBusyChange,
}: {
  readonly disabled: boolean;
  readonly onSelectFile: (file: File) => void;
  readonly onBusyChange?: (busy: boolean) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  return (
    <div css={{ display: 'grid', gap: '0.5rem' }}>
      <Button
        variant="quiet"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? 'Hide image URL' : 'Use an image URL instead'}
      </Button>
      {open ? (
        <div css={{ display: 'grid', gap: '0.5rem' }}>
          <TextField
            label="Public HTTPS image URL"
            type="url"
            value={url}
            disabled={disabled || importing}
            placeholder="https://example.com/image.jpg"
            onChange={(event) => setUrl(event.currentTarget.value)}
          />
          <Button
            variant="secondary"
            busy={importing}
            disabled={disabled || !url.trim()}
            onClick={() => {
              controllerRef.current?.abort();
              const controller = new AbortController();
              controllerRef.current = controller;
              setImporting(true);
              onBusyChange?.(true);
              setError(null);
              void importRemoteReferenceImage(url.trim(), controller.signal)
                .then((file) => {
                  if (!controller.signal.aborted) onSelectFile(file);
                })
                .catch((caught: unknown) => {
                  if (!controller.signal.aborted) {
                    setError(
                      caught instanceof Error
                        ? caught.message
                        : 'The remote image could not be imported safely.',
                    );
                  }
                })
                .finally(() => {
                  if (controllerRef.current === controller) {
                    controllerRef.current = null;
                    setImporting(false);
                    onBusyChange?.(false);
                  }
                });
            }}
          >
            Import image
          </Button>
          {error ? (
            <StatusNotice tone="danger" role="alert">
              {error}
            </StatusNotice>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
