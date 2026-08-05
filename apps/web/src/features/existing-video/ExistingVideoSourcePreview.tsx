import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useEffect, useRef } from 'react';
import type { RecordingArtifact } from '../recording/types';

const playerStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  width: '100%',
  minWidth: 0,
  display: 'grid',
  overflow: 'hidden',
  margin: 0,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvas,
  '& video': {
    width: '100%',
    maxHeight: 'min(56vh, 30rem)',
    aspectRatio: '16 / 9',
    display: 'block',
    objectFit: 'contain',
    background: theme.colors.canvas,
  },
  '& figcaption': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  },
});

export interface ExistingVideoSourcePreviewProps {
  readonly artifact: RecordingArtifact | null;
  readonly displayName: string;
}

/**
 * Secondary upload-panel player. It borrows an existing source/result artifact
 * URL and never participates in live preview, recording, or finalization.
 */
export const ExistingVideoSourcePreview = ({
  artifact,
  displayName,
}: ExistingVideoSourcePreviewProps) => {
  const theme = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    video.muted = false;
    if (artifact) video.src = artifact.objectUrl;
    else video.removeAttribute('src');
    video.load();
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [artifact]);

  return (
    <figure css={playerStyles(theme)}>
      {/* User-provided video has no caption asset to attach; native controls remain fully exposed. */}
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        ref={videoRef}
        controls
        playsInline
        preload="metadata"
        aria-label={`Video preview for ${displayName}`}
      />
      <figcaption>{displayName}</figcaption>
    </figure>
  );
};
