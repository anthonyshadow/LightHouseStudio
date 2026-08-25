import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { PresentedRecordingArtifact } from '../recording/types';
import { VideoPlayer } from '../video-player/VideoPlayer';

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
  /*
   * The frame, not the picture, holds the 16:9 box: the transport lives inside it and the video
   * letterboxes into what is left, so adopting the shared player did not make this card taller
   * than the native-controls one it replaced.
   */
  '& [data-video-player]': {
    aspectRatio: '16 / 9',
    maxHeight: 'min(56vh, 30rem)',
  },
  '& video': {
    width: '100%',
    height: '100%',
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
  readonly artifact: PresentedRecordingArtifact | null;
  readonly displayName: string;
}

/**
 * Secondary upload-panel player. It borrows an existing source/result artifact
 * URL and never participates in live preview, recording, or finalization.
 *
 * The transport is {@link VideoPlayer}, the product's one player, so a borrowed source wears the
 * same chrome here as a saved video does in the library; this only supplies the frame around it.
 */
export const ExistingVideoSourcePreview = ({
  artifact,
  displayName,
}: ExistingVideoSourcePreviewProps) => {
  const theme = useTheme();

  return (
    <figure css={playerStyles(theme)}>
      <VideoPlayer src={artifact?.objectUrl ?? null} title={displayName} />
      <figcaption>{displayName}</figcaption>
    </figure>
  );
};
