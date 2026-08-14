import { useTheme } from '@emotion/react';
import type { SavedVideoSummary } from '@studio/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { RefObject } from 'react';
import { listSavedVideos } from '../../adapters/api-client/savedVideosApi';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import { savedVideoQueryKeys } from '../saved-videos/savedVideoQueryKeys';

export const ProjectSavedVideoPicker = ({
  open,
  busy,
  returnFocusRef,
  onClose,
  onSelect,
  title = 'Use Saved Video',
  description = "Choose one exact active Version as this Project's immutable original. The stored bytes are referenced, not copied.",
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
  const query = useInfiniteQuery({
    queryKey: savedVideoQueryKeys.lists,
    queryFn: ({ pageParam, signal }) =>
      listSavedVideos({ sort: 'latest', ...(pageParam ? { cursor: pageParam } : {}), signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: open,
  });
  const videos = query.data?.pages.flatMap((page) => page.videos) ?? [];

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
          {videos.map((video) => (
            <li key={video.id}>
              <Button
                variant="secondary"
                disabled={busy || video.status !== 'ready'}
                onClick={() => onSelect(video)}
                css={{
                  width: '100%',
                  minHeight: '3.5rem',
                  justifyContent: 'space-between',
                  textAlign: 'start',
                }}
              >
                <span>{video.title}</span>
                <small>
                  Version {video.currentVersion.ordinal} · {video.currentVersion.width}×
                  {video.currentVersion.height}
                </small>
              </Button>
            </li>
          ))}
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
