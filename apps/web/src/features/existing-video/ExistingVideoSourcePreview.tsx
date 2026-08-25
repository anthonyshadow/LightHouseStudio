import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { PresentedRecordingArtifact } from '../recording/types';
import { VideoPlayer } from '../video-player/VideoPlayer';

const playerStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  width: '100%',
  minWidth: 0,
  display: 'grid',
  /*
   * The frame, not the picture, holds the 16:9 box: the transport lives inside it and the video
   * letterboxes into what is left, so adopting the shared player did not make this card taller
   * than the native-controls one it replaced. The player fills whatever box it is given, so the
   * ratio belongs here rather than reaching into it.
   */
  aspectRatio: '16 / 9',
  maxHeight: 'min(56vh, 30rem)',
  overflow: 'hidden',
  margin: 0,
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.medium,
  background: theme.colors.canvas,
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
