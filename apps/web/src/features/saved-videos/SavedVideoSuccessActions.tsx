import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { SavedVideoDetail } from '@studio/contracts';
import { downloadSavedVideoUrl } from '../../adapters/api-client/savedVideosApi';
import { Button } from '../../ui';

const actionRowStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.xs,
  '@media (max-width: 34rem)': {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr)',
    '& > *': { width: '100%' },
  },
});

// Download is a server-served anchor rather than a Button so the browser owns the transfer, matching
// the Videos gallery and Project history affordances.
const downloadLinkStyles = (theme: Theme): CSSObject => ({
  minWidth: '2.75rem',
  minHeight: '2.75rem',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '0.55rem 0.8rem',
  border: `1px solid ${theme.colors.accent}`,
  borderRadius: theme.radii.medium,
  color: theme.colors.text,
  background: theme.colors.surfaceStrong,
  fontWeight: 720,
  lineHeight: 1.1,
  textDecoration: 'none',
  '&:hover': { borderColor: theme.colors.accentStrong },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
});

export interface SavedVideoSuccessActionsProps {
  readonly video: SavedVideoDetail;
  readonly onOpenInAssets: () => void;
  readonly onCreateAnother?: (() => void) | undefined;
  readonly createAnotherLabel?: string;
}

export const SavedVideoSuccessActions = ({
  video,
  onOpenInAssets,
  onCreateAnother,
  createAnotherLabel = 'Create another',
}: SavedVideoSuccessActionsProps) => {
  const theme = useTheme();
  return (
    <div css={actionRowStyles(theme)} data-saved-video-success-actions="">
      <a
        href={downloadSavedVideoUrl(video.id, video.currentVersion.id)}
        download={video.currentVersion.filename}
        aria-label={`Download ${video.title}, Version ${video.currentVersion.ordinal}`}
        css={downloadLinkStyles(theme)}
      >
        Download
      </a>
      <Button variant="secondary" onClick={onOpenInAssets}>
        View in Assets
      </Button>
      {onCreateAnother ? (
        <Button variant="quiet" onClick={onCreateAnother}>
          {createAnotherLabel}
        </Button>
      ) : null}
    </div>
  );
};
