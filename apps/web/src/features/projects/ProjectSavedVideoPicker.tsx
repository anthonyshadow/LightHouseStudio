import { useTheme, type Theme } from '@emotion/react';
import type { SavedVideoSummary } from '@studio/contracts';
import { formatDuration } from '@studio/domain';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useState, type RefObject } from 'react';
import {
  listSavedVideos,
  savedVideoContentUrl,
  savedVideoThumbnailUrl,
} from '../../adapters/api-client/savedVideosApi';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import { savedVideoQueryKeys } from '../saved-videos/savedVideoQueryKeys';
import { durationBadgeStyles as galleryDurationBadgeStyles } from '../video-gallery/VideoGallery.styles';
import { ProjectAssetThumbnail } from './ProjectAssetThumbnail';
import { ProjectVideoPreviewPlayer } from './ProjectVideoPreviewPlayer';

const rowStyles = (theme: Theme) => ({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.sm,
});

const selectStyles = (theme: Theme) => ({
  display: 'grid',
  gridTemplateColumns: 'clamp(4.5rem, 18vw, 7rem) minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.sm,
  width: '100%',
  minWidth: 0,
  padding: theme.space.xs,
  textAlign: 'start' as const,
});

const copyStyles = (theme: Theme) => ({
  display: 'grid',
  gap: theme.space.xxs,
  minWidth: 0,
  '& > span': {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  '& > small': { color: theme.colors.textMuted },
});

// The Videos gallery owns the badge treatment; only the density changes on this smaller tile, so
// the two poster surfaces cannot drift apart on colour, radius or type.
const durationBadgeStyles = (theme: Theme) => ({
  ...galleryDurationBadgeStyles(theme),
  insetBlockEnd: theme.space.xxs,
  insetInlineEnd: theme.space.xxs,
  padding: '0.15rem 0.35rem',
});

const previewStyles = (theme: Theme) => ({
  marginBlockStart: theme.space.xs,
  height: 'clamp(11rem, 32vh, 18rem)',
});

export const ProjectSavedVideoPicker = ({
  open,
  busy,
  returnFocusRef,
  onClose,
  onSelect,
  title = 'Use Saved Video',
  description = 'Choose one exact active Version. The stored bytes are referenced, not copied.',
  emptyTitle = 'No Saved Videos yet',
  emptyBody = 'Save a video in Studio first, or use Upload or Record for this Project.',
  listLabel = 'Saved Videos available as a Project source',
}: {
  readonly open: boolean;
  readonly busy: boolean;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onSelect: (video: SavedVideoSummary) => void;
  readonly title?: string;
  readonly description?: string;
  readonly emptyTitle?: string;
  readonly emptyBody?: string;
  readonly listLabel?: string;
}) => {
  const theme = useTheme();
  // One preview at a time: every open player holds its own ranged request against the local API,
  // and the panel scrolls through unbounded pages.
  const [previewVideoId, setPreviewVideoId] = useState<string | null>(null);
  // Adjusted during render rather than in an effect: reopening the panel must not flash the
  // previously expanded row, and remounting a player mid-transition is worse than not showing one.
  if (!open && previewVideoId !== null) setPreviewVideoId(null);
  const query = useInfiniteQuery({
    queryKey: savedVideoQueryKeys.lists,
    queryFn: ({ pageParam, signal }) =>
      listSavedVideos({ sort: 'latest', ...(pageParam ? { cursor: pageParam } : {}), signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: open,
  });
  // A disabled query still serves cached pages, so a closed picker would otherwise build the whole
  // row tree — thumbnails, badges and preview controls included — only for `OverlayPanel` to
  // discard it. Two pickers share this query key on the Project overview.
  const videos = open ? (query.data?.pages.flatMap((page) => page.videos) ?? []) : [];
  const rowCss = rowStyles(theme);
  const selectCss = selectStyles(theme);
  const copyCss = copyStyles(theme);
  const badgeCss = durationBadgeStyles(theme);
  const previewCss = previewStyles(theme);

  return (
    <OverlayPanel
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      placement="bottom"
      size="wide"
      bodyMode="scroll"
      closeDisabled={busy}
      closeOnBackdrop={!busy}
      returnFocusRef={returnFocusRef}
    >
      {query.isPending ? <p role="status">Loading Saved Videos…</p> : null}
      {query.isError ? (
        <StatusNotice role="alert" tone="danger" title="Saved Videos unavailable">
          <p>Saved Videos could not be loaded from the local API.</p>
          <Button size="small" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </StatusNotice>
      ) : null}
      {!query.isPending && !query.isError && videos.length === 0 ? (
        <StatusNotice tone="neutral" title={emptyTitle}>
          {emptyBody}
        </StatusNotice>
      ) : null}
      {videos.length > 0 ? (
        <ul
          aria-label={listLabel}
          css={{
            display: 'grid',
            gap: theme.space.sm,
            margin: 0,
            padding: 0,
            listStyle: 'none',
          }}
        >
          {videos.map((video) => {
            const unavailable = video.status !== 'ready';
            const disabled = busy || unavailable;
            const previewOpen = previewVideoId === video.id;
            const thumbnailUrl = video.thumbnailAvailable ? savedVideoThumbnailUrl(video.id) : null;
            const duration = formatDuration(video.currentVersion.durationMs);
            return (
              <li key={video.id}>
                <div css={rowCss}>
                  <Button
                    variant="secondary"
                    data-saved-video-action="select"
                    disabled={disabled}
                    onClick={() => onSelect(video)}
                    css={selectCss}
                  >
                    <ProjectAssetThumbnail
                      kind="video"
                      label={video.title}
                      thumbnailUrl={thumbnailUrl}
                      unavailable={unavailable}
                      decorative
                    >
                      <span css={badgeCss}>{duration}</span>
                    </ProjectAssetThumbnail>
                    <span css={copyCss}>
                      <span>{video.title}</span>
                      <small>
                        Version {video.currentVersion.ordinal} · {video.currentVersion.width}×
                        {video.currentVersion.height} · {duration}
                      </small>
                    </span>
                  </Button>
                  <Button
                    size="small"
                    variant="quiet"
                    data-saved-video-action="preview"
                    disabled={disabled}
                    aria-expanded={previewOpen}
                    aria-controls={`saved-video-preview-${video.id}`}
                    onClick={() => setPreviewVideoId(previewOpen ? null : video.id)}
                  >
                    {previewOpen ? 'Hide preview' : 'Preview'}
                  </Button>
                </div>
                {previewOpen ? (
                  <div id={`saved-video-preview-${video.id}`} css={previewCss}>
                    <ProjectVideoPreviewPlayer
                      src={savedVideoContentUrl(video.id, video.currentVersion.id)}
                      title={video.title}
                      poster={thumbnailUrl ?? undefined}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="quiet"
          busy={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more Saved Videos
        </Button>
      ) : null}
    </OverlayPanel>
  );
};
