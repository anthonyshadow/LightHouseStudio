import { useCallback, useEffect, useRef, useState } from 'react';
import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { fetchVoicePreview } from '../../adapters/api-client/voicesApi';
import { Button } from '../../ui';
import type { VoiceLibraryItem } from './types';

const stackStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  marginBlockStart: theme.space.xs,
});

const audioStyles = (): CSSObject => ({ width: '100%', maxWidth: '100%' });

export type VoicePreviewProps = {
  item: VoiceLibraryItem;
  onError: (item: VoiceLibraryItem) => void;
};

export const VoicePreview = ({ item, onError }: VoicePreviewProps) => {
  const theme = useTheme();
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const releaseObjectUrl = useCallback(() => {
    if (!objectUrlRef.current) return;
    URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  useEffect(
    () => () => {
      requestRef.current?.abort();
      requestRef.current = null;
      releaseObjectUrl();
    },
    [releaseObjectUrl],
  );

  if (!item.voice.previewAvailable) return null;

  const loadPreview = async () => {
    requestRef.current?.abort();
    releaseObjectUrl();
    setObjectUrl(null);
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const preview = await fetchVoicePreview(item, controller.signal);
      controller.signal.throwIfAborted();
      if (requestRef.current !== controller) return;
      const nextUrl = URL.createObjectURL(preview);
      objectUrlRef.current = nextUrl;
      setObjectUrl(nextUrl);
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) onError(item);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  };

  return (
    <div css={stackStyles(theme)}>
      <Button
        size="small"
        variant="quiet"
        busy={loading}
        disabled={loading}
        onClick={() => void loadPreview()}
      >
        {objectUrl
          ? `Reload ${item.voice.name} preview · contacts provider`
          : `Load ${item.voice.name} preview · contacts provider`}
      </Button>
      {objectUrl ? (
        <audio
          controls
          preload="metadata"
          src={objectUrl}
          aria-label={`Listen to ${item.voice.name} preview`}
          css={audioStyles()}
          onError={() => onError(item)}
        />
      ) : null}
    </div>
  );
};
