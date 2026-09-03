import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { SavedVideoDetail } from '@studio/contracts';
import type { RefObject } from 'react';
import { Button, OverlayPanel } from '../../ui';
import { SavedVideoSuccessActions } from './SavedVideoSuccessActions';

const summaryStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gap: theme.space.xs,
  '& p': { margin: 0 },
  '& [data-saved-video-title]': {
    fontFamily: theme.type.display,
    fontSize: theme.fontSizes.section,
    color: theme.colors.text,
  },
  '& [data-saved-video-meta]': {
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
  },
});

export interface SaveVideoSuccessPanelProps {
  readonly video: SavedVideoDetail | null;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly onDismiss: () => void;
  readonly onOpenInAssets: () => void;
  readonly onCreateAnother: () => void;
}

export const SaveVideoSuccessPanel = ({
  video,
  returnFocusRef,
  onDismiss,
  onOpenInAssets,
  onCreateAnother,
}: SaveVideoSuccessPanelProps) => {
  const theme = useTheme();
  const versionAdded = video !== null && video.currentVersion.ordinal > 1;

  return (
    <OverlayPanel
      open={video !== null}
      onClose={onDismiss}
      title={versionAdded ? 'Version added to Assets' : 'Saved to Assets'}
      description="Your video is retained in Assets. Studio still holds the temporary take until you close it."
      placement="bottom"
      size="standard"
      initialFocus="heading"
      {...(returnFocusRef ? { returnFocusRef } : {})}
      footer={
        video ? (
          <div
            css={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: theme.space.sm,
            }}
          >
            <SavedVideoSuccessActions
              video={video}
              onOpenInAssets={onOpenInAssets}
              onCreateAnother={onCreateAnother}
            />
            <Button variant="primary" onClick={onDismiss}>
              Stay in Studio
            </Button>
          </div>
        ) : null
      }
    >
      {video ? (
        <div css={summaryStyles(theme)}>
          <p data-saved-video-title>{video.title}</p>
          <p data-saved-video-meta>
            Version {video.currentVersion.ordinal} · {video.currentVersion.width}×
            {video.currentVersion.height} · {video.currentVersion.filename}
          </p>
        </div>
      ) : null}
    </OverlayPanel>
  );
};
