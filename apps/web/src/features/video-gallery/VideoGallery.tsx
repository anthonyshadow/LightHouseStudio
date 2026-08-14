import { useTheme } from '@emotion/react';
import type {
  SavedVideoFormat,
  SavedVideoSort,
  SavedVideoSummary,
  SavedVideosResponse,
} from '@studio/contracts';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  deleteSavedVideo,
  downloadSavedVideoUrl,
  listSavedVideos,
  renameSavedVideo,
  savedVideoContentUrl,
  savedVideoThumbnailUrl,
} from '../../adapters/api-client/savedVideosApi';
import { Button, OverlayPanel, SelectField, StatusNotice } from '../../ui';
import { savedVideoQueryKeys } from '../saved-videos/savedVideoQueryKeys';
import {
  actionMenuPopoverStyles,
  actionMenuStyles,
  actionsStyles,
  cardBodyStyles,
  cardCopyStyles,
  cardStyles,
  chipRowStyles,
  chipStyles,
  durationBadgeStyles,
  filterControlsStyles,
  galleryStyles,
  gallerySummaryStyles,
  gridStyles,
  paginationStyles,
  playBadgeStyles,
  posterButtonStyles,
  posterStyles,
  previewContentStyles,
  previewFooterStyles,
  previewMetadataStyles,
  previewPlayerStyles,
  thumbnailPlaceholderStyles,
  thumbnailStyles,
} from './VideoGallery.styles';

const PlayIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5.4v13.2L18.5 12 8 5.4Z" />
  </svg>
);

const VideoPlaceholderIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="m10 9 5 3-5 3Z" />
  </svg>
);

const MoreIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.8" />
    <circle cx="12" cy="12" r="1.8" />
    <circle cx="19" cy="12" r="1.8" />
  </svg>
);

const duration = (milliseconds: number): string => {
  const seconds = Math.round(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const FORMAT_LABELS: Readonly<Record<SavedVideoFormat, string>> = {
  landscape: 'Landscape',
  portrait: 'Portrait',
  square: 'Square',
};

const SORT_OPTIONS = [
  { value: 'latest', label: 'Latest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'shortest', label: 'Shortest' },
  { value: 'longest', label: 'Longest' },
] satisfies ReadonlyArray<{ value: SavedVideoSort; label: string }>;

const formatForVideo = (video: SavedVideoSummary): SavedVideoFormat => {
  const { width, height } = video.currentVersion;
  return width === height ? 'square' : width > height ? 'landscape' : 'portrait';
};

const VideoGalleryGrid = ({
  videos,
  busyId,
  brokenThumbnails,
  onThumbnailError,
  onOpenPreview,
  onUse,
  onRename,
  onRemove,
}: {
  videos: readonly SavedVideoSummary[];
  busyId: string | null;
  brokenThumbnails: ReadonlySet<string>;
  onThumbnailError: (videoId: string) => void;
  onOpenPreview: (video: SavedVideoSummary, trigger: HTMLButtonElement) => void;
  onUse: (video: SavedVideoSummary, intent: 'play' | 'edit') => Promise<void>;
  onRename: (video: SavedVideoSummary) => Promise<void>;
  onRemove: (video: SavedVideoSummary) => Promise<void>;
}) => {
  'use memo';

  const theme = useTheme();
  return (
    <div css={gridStyles(theme)} aria-label="Saved videos">
      {videos.map((video) => {
        const version = video.currentVersion;
        const busy = busyId === video.id;
        return (
          <article key={video.id} css={cardStyles(theme)} aria-busy={busy || undefined}>
            <button
              type="button"
              css={posterButtonStyles(theme)}
              disabled={busy || video.status !== 'ready'}
              aria-label={`Preview ${video.title}`}
              onClick={(event) => onOpenPreview(video, event.currentTarget)}
            >
              <span css={posterStyles(theme)}>
                {video.thumbnailAvailable && !brokenThumbnails.has(video.id) ? (
                  <img
                    css={thumbnailStyles(theme)}
                    data-gallery-thumbnail=""
                    src={savedVideoThumbnailUrl(video.id)}
                    alt=""
                    loading="lazy"
                    onError={() => onThumbnailError(video.id)}
                  />
                ) : (
                  <span
                    css={thumbnailPlaceholderStyles(theme)}
                    aria-label={
                      video.thumbnailAvailable
                        ? 'Thumbnail could not load'
                        : 'Thumbnail unavailable'
                    }
                  >
                    <VideoPlaceholderIcon />
                    <span>Preview available</span>
                  </span>
                )}
                <span data-gallery-play="" css={playBadgeStyles(theme)}>
                  <PlayIcon />
                </span>
                <span css={durationBadgeStyles(theme)}>{duration(version.durationMs)}</span>
              </span>
            </button>
            <div css={cardBodyStyles(theme)}>
              <div css={cardCopyStyles(theme)}>
                <h3>{video.title}</h3>
                <p>
                  {version.width}×{version.height} ·{' '}
                  <time dateTime={video.createdAt}>
                    {new Date(video.createdAt).toLocaleDateString()}
                  </time>
                </p>
              </div>
              <div css={chipRowStyles(theme)} aria-label="Video details">
                <span css={chipStyles(theme)}>
                  {video.versionCount} version{video.versionCount === 1 ? '' : 's'}
                </span>
                <span css={chipStyles(theme)}>{version.origin}</span>
                <span css={chipStyles(theme)}>{FORMAT_LABELS[formatForVideo(video)]}</span>
                {version.characterName ? (
                  <span css={chipStyles(theme)}>{version.characterName}</span>
                ) : null}
                {version.characterVariantName ? (
                  <span css={chipStyles(theme)}>Variant: {version.characterVariantName}</span>
                ) : null}
                {video.status !== 'ready' ? (
                  <span css={chipStyles(theme)}>{video.status}</span>
                ) : null}
              </div>
              <div css={actionsStyles(theme)}>
                <Button
                  variant="primary"
                  disabled={busy || video.status !== 'ready'}
                  busy={busy}
                  onClick={() => void onUse(video, 'play')}
                >
                  Load in Studio
                </Button>
                <details css={actionMenuStyles(theme)}>
                  <summary aria-label={`More actions for ${video.title}`}>
                    <MoreIcon />
                  </summary>
                  <div css={actionMenuPopoverStyles(theme)}>
                    <button
                      type="button"
                      disabled={busy || video.status !== 'ready'}
                      onClick={() => void onUse(video, 'edit')}
                    >
                      Edit video
                    </button>
                    <a href={downloadSavedVideoUrl(video.id)} download={version.filename}>
                      Download
                    </a>
                    <button type="button" disabled={busy} onClick={() => void onRename(video)}>
                      Rename
                    </button>
                    <button
                      type="button"
                      data-danger=""
                      disabled={busy}
                      onClick={() => void onRemove(video)}
                    >
                      Delete
                    </button>
                  </div>
                </details>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
};

export const VideoGallery = ({
  onUse,
}: {
  onUse: (video: SavedVideoSummary, intent: 'play' | 'edit') => Promise<void>;
}) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [characterName, setCharacterName] = useState('');
  const [format, setFormat] = useState<SavedVideoFormat | ''>('');
  const [sort, setSort] = useState<SavedVideoSort>('latest');
  const [message, setMessage] = useState<string | null>(null);
  const [useBusyId, setUseBusyId] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<SavedVideoSummary | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [brokenThumbnails, setBrokenThumbnails] = useState<ReadonlySet<string>>(() => new Set());
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const previewPlayerRef = useRef<HTMLVideoElement | null>(null);

  const videosQuery = useInfiniteQuery({
    queryKey: [
      ...savedVideoQueryKeys.lists,
      {
        characterName: characterName || null,
        format: format || null,
        sort,
      },
    ],
    queryFn: ({ pageParam, signal }) =>
      listSavedVideos({
        ...(pageParam ? { cursor: pageParam } : {}),
        ...(characterName ? { characterName } : {}),
        ...(format ? { format } : {}),
        sort,
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    placeholderData: keepPreviousData,
  });

  const renameMutation = useMutation({
    mutationFn: ({ videoId, title }: { readonly videoId: string; readonly title: string }) =>
      renameSavedVideo(videoId, title),
    onSuccess: (updated) => {
      queryClient.setQueriesData<InfiniteData<SavedVideosResponse>>(
        { queryKey: savedVideoQueryKeys.lists },
        (current) =>
          current
            ? {
                ...current,
                pages: current.pages.map((page) => ({
                  ...page,
                  videos: page.videos.map((video) => (video.id === updated.id ? updated : video)),
                })),
              }
            : current,
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (videoId: string) => deleteSavedVideo(videoId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: savedVideoQueryKeys.lists });
    },
  });

  const pages = videosQuery.data?.pages ?? [];
  const latestPage = pages[pages.length - 1];
  const videos = pages.flatMap((page) => page.videos);
  const total = latestPage?.total ?? 0;
  const characterNames = latestPage?.facets.characterNames ?? [];
  const availableFormats = latestPage?.facets.formats ?? [];
  const busyId =
    useBusyId ??
    (renameMutation.isPending ? renameMutation.variables.videoId : null) ??
    (deleteMutation.isPending ? deleteMutation.variables : null);

  useEffect(() => {
    if (!previewVideo) return;
    const player = previewPlayerRef.current;
    return () => {
      player?.pause();
      player?.removeAttribute('src');
    };
  }, [previewVideo]);

  const rename = async (video: SavedVideoSummary) => {
    const title = window.prompt('Rename saved video', video.title)?.trim();
    if (!title || title === video.title) return;
    try {
      await renameMutation.mutateAsync({ videoId: video.id, title });
      setMessage('Video renamed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The video could not be renamed.');
    }
  };

  const remove = async (video: SavedVideoSummary) => {
    if (
      !window.confirm(
        `Remove “${video.title}” from Saved Videos? This hides it from the global library. Exact Versions and bytes remain available from any Project history that references them.`,
      )
    )
      return;
    try {
      await deleteMutation.mutateAsync(video.id);
      setMessage('Video removed from Saved Videos. Referenced Project history remains preserved.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The video could not be deleted.');
    }
  };

  const handleUseVideo = async (video: SavedVideoSummary, intent: 'play' | 'edit') => {
    setUseBusyId(video.id);
    try {
      await onUse(video, intent);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The video could not be loaded.');
    } finally {
      setUseBusyId(null);
    }
  };

  const openPreview = (video: SavedVideoSummary, trigger: HTMLButtonElement) => {
    previewTriggerRef.current = trigger;
    setPreviewError(false);
    setPreviewVideo(video);
  };

  const closePreview = () => {
    const player = previewPlayerRef.current;
    player?.pause();
    player?.removeAttribute('src');
    try {
      player?.load();
    } catch {
      // Some test environments do not implement media loading.
    }
    setPreviewVideo(null);
    setPreviewError(false);
  };

  if (videosQuery.isPending) {
    return <p role="status">Loading saved videos…</p>;
  }
  if (videosQuery.isError && !videosQuery.data) {
    return (
      <StatusNotice tone="danger" role="alert">
        {videosQuery.error instanceof Error
          ? videosQuery.error.message
          : 'Saved videos could not be loaded.'}{' '}
        <Button onClick={() => void videosQuery.refetch()}>Retry</Button>
      </StatusNotice>
    );
  }
  const libraryHasVideos = availableFormats.length > 0;
  const filtersActive = Boolean(characterName || format);

  if (!libraryHasVideos) {
    return (
      <div>
        <h2>No saved videos yet</h2>
        <p>Record or upload a video, then choose Save Video. Downloads start from this gallery.</p>
      </div>
    );
  }

  return (
    <div css={galleryStyles(theme)}>
      {message ? <StatusNotice role="status">{message}</StatusNotice> : null}
      <div css={filterControlsStyles(theme)} aria-label="Filter and sort saved videos">
        <SelectField
          label="Character used"
          value={characterName}
          options={[
            { value: '', label: 'All characters' },
            ...characterNames.map((name) => ({ value: name, label: name })),
          ]}
          {...(characterNames.length === 0
            ? { hint: 'No saved videos have character attribution yet.' }
            : {})}
          onValueChange={setCharacterName}
        />
        <SelectField
          label="Video format"
          value={format}
          options={[
            { value: '', label: 'All formats' },
            ...availableFormats.map((value) => ({ value, label: FORMAT_LABELS[value] })),
          ]}
          onValueChange={(value) => setFormat(value as SavedVideoFormat | '')}
        />
        <SelectField
          label="Sort by"
          value={sort}
          options={SORT_OPTIONS}
          onValueChange={(value) => setSort(value as SavedVideoSort)}
        />
        <Button
          variant="secondary"
          disabled={!filtersActive}
          onClick={() => {
            setCharacterName('');
            setFormat('');
          }}
        >
          Clear filters
        </Button>
      </div>
      <div css={gallerySummaryStyles(theme)}>
        <span>
          <strong>{total}</strong> matching {total === 1 ? 'video' : 'videos'}
        </span>
        {videos.length < total ? <span>{videos.length} loaded</span> : null}
      </div>
      {videos.length === 0 ? (
        <div>
          <h2>No saved videos match these filters</h2>
          <p>Choose a different character or video format, or clear the filters.</p>
        </div>
      ) : (
        <VideoGalleryGrid
          videos={videos}
          busyId={busyId}
          brokenThumbnails={brokenThumbnails}
          onThumbnailError={(videoId) =>
            setBrokenThumbnails((current) => new Set(current).add(videoId))
          }
          onOpenPreview={openPreview}
          onUse={handleUseVideo}
          onRename={rename}
          onRemove={remove}
        />
      )}
      {videosQuery.hasNextPage ? (
        <div css={paginationStyles(theme)}>
          <Button
            variant="secondary"
            busy={videosQuery.isFetchingNextPage}
            disabled={videosQuery.isFetchingNextPage}
            onClick={() => void videosQuery.fetchNextPage()}
          >
            Load more videos
          </Button>
        </div>
      ) : null}
      <OverlayPanel
        open={previewVideo !== null}
        onClose={closePreview}
        title={previewVideo?.title ?? 'Video preview'}
        description="Preview this saved version before loading it into Studio."
        placement="fullscreen"
        size="wide"
        height="tall"
        centered
        initialFocus="heading"
        returnFocusRef={previewTriggerRef}
        bodyMode="scroll"
        footer={
          previewVideo ? (
            <div css={previewFooterStyles(theme)}>
              <a
                href={downloadSavedVideoUrl(previewVideo.id)}
                download={previewVideo.currentVersion.filename}
              >
                Download
              </a>
              <Button
                variant="secondary"
                disabled={busyId === previewVideo.id}
                onClick={() => void handleUseVideo(previewVideo, 'edit')}
              >
                Edit video
              </Button>
              <Button
                variant="primary"
                busy={busyId === previewVideo.id}
                onClick={() => void handleUseVideo(previewVideo, 'play')}
              >
                Load in Studio
              </Button>
            </div>
          ) : null
        }
      >
        {previewVideo ? (
          <div css={previewContentStyles(theme)}>
            <div css={previewPlayerStyles(theme)}>
              {/* Saved local videos may not include a captions track. */}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={previewPlayerRef}
                src={savedVideoContentUrl(previewVideo.id)}
                controls
                playsInline
                preload="metadata"
                aria-label={`Preview of ${previewVideo.title}`}
                onLoadedData={() => setPreviewError(false)}
                onError={() => setPreviewError(true)}
              />
            </div>
            {previewError ? (
              <StatusNotice tone="danger" role="alert">
                This saved video could not be previewed. You can still try loading or downloading
                it.
              </StatusNotice>
            ) : null}
            <div css={previewMetadataStyles(theme)}>
              <span>{duration(previewVideo.currentVersion.durationMs)} duration</span>
              <span>
                {previewVideo.currentVersion.width}×{previewVideo.currentVersion.height}
              </span>
              <span>{previewVideo.currentVersion.origin}</span>
              <span>{FORMAT_LABELS[formatForVideo(previewVideo)]}</span>
              {previewVideo.currentVersion.characterName ? (
                <span>Character: {previewVideo.currentVersion.characterName}</span>
              ) : null}
              {previewVideo.currentVersion.characterVariantName ? (
                <span>Variant: {previewVideo.currentVersion.characterVariantName}</span>
              ) : null}
              <span>
                {previewVideo.versionCount} version
                {previewVideo.versionCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        ) : null}
      </OverlayPanel>
    </div>
  );
};
