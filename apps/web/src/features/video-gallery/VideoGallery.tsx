import { useTheme } from '@emotion/react';
import type {
  SavedVideoFormat,
  SavedVideoSort,
  SavedVideoSummary,
  SavedVideoVersion,
  SavedVideosResponse,
} from '@studio/contracts';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  deleteSavedVideo,
  downloadSavedVideoUrl,
  getSavedVideo,
  listSavedVideos,
  renameSavedVideo,
  savedVideoContentUrl,
  savedVideoThumbnailUrl,
} from '../../adapters/api-client/savedVideosApi';
import { Button, OverlayPanel, SelectField, StatusNotice, TextField } from '../../ui';
import { savedVideoQueryKeys } from '../saved-videos/savedVideoQueryKeys';
import { AddVideoToProjectDialog } from '../projects/AddVideoToProjectDialog';
import { GeneratePreviewDialog } from './GeneratePreviewDialog';
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
  noPreviewActionStyles,
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

const formatForDimensions = ({
  width,
  height,
}: Pick<SavedVideoVersion, 'width' | 'height'>): SavedVideoFormat => {
  return width === height ? 'square' : width > height ? 'landscape' : 'portrait';
};

const VideoGalleryGrid = ({
  videos,
  busyId,
  brokenThumbnails,
  onThumbnailError,
  onOpenPreview,
  onGeneratePreview,
  onUse,
  onAddToProject,
  onRename,
  onRemove,
}: {
  videos: readonly SavedVideoSummary[];
  busyId: string | null;
  brokenThumbnails: ReadonlySet<string>;
  onThumbnailError: (videoId: string) => void;
  onOpenPreview: (video: SavedVideoSummary, trigger: HTMLButtonElement) => void;
  onGeneratePreview: (video: SavedVideoSummary, trigger: HTMLElement) => void;
  onUse: (video: SavedVideoSummary, intent: 'play' | 'edit') => Promise<void>;
  onAddToProject: (video: SavedVideoSummary, trigger: HTMLElement) => void;
  onRename: (video: SavedVideoSummary, trigger: HTMLElement) => void;
  onRemove: (video: SavedVideoSummary, trigger: HTMLElement) => void;
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
                      video.thumbnailAvailable ? 'Preview could not load' : 'No preview yet'
                    }
                  >
                    <VideoPlaceholderIcon />
                    <span>
                      {video.thumbnailAvailable ? 'Preview didn’t load' : 'No preview yet'}
                    </span>
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
                <span css={chipStyles(theme)}>{FORMAT_LABELS[formatForDimensions(version)]}</span>
                {version.characterName ? (
                  <span css={chipStyles(theme)}>{version.characterName}</span>
                ) : null}
                {version.characterVariantName ? (
                  <span css={chipStyles(theme)}>Variant: {version.characterVariantName}</span>
                ) : null}
                {video.status !== 'ready' ? (
                  <span css={chipStyles(theme)}>{video.status}</span>
                ) : null}
                {video.assignment === 'unassigned' ? (
                  <span css={chipStyles(theme)}>Unassigned Content</span>
                ) : null}
              </div>
              {video.thumbnailAvailable ? null : (
                <div css={noPreviewActionStyles(theme)}>
                  <span>This video has no preview image.</span>
                  <Button
                    size="small"
                    variant="secondary"
                    disabled={busy || video.status !== 'ready'}
                    onClick={(event) => onGeneratePreview(video, event.currentTarget)}
                  >
                    Generate preview
                  </Button>
                </div>
              )}
              <div css={actionsStyles(theme)}>
                <Button
                  variant="primary"
                  disabled={busy || video.status !== 'ready'}
                  busy={busy}
                  onClick={() => void onUse(video, 'play')}
                >
                  Open in Studio
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
                    <button
                      type="button"
                      disabled={busy || video.status !== 'ready'}
                      onClick={(event) => {
                        const details = event.currentTarget.closest('details');
                        const trigger = details?.querySelector<HTMLElement>('summary');
                        details?.removeAttribute('open');
                        onAddToProject(video, trigger ?? event.currentTarget);
                      }}
                    >
                      Use as Project source
                    </button>
                    <a
                      href={downloadSavedVideoUrl(video.id, version.id)}
                      download={version.filename}
                    >
                      Download
                    </a>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={(event) => {
                        const details = event.currentTarget.closest('details');
                        const trigger = details?.querySelector<HTMLElement>('summary');
                        details?.removeAttribute('open');
                        onRename(video, trigger ?? event.currentTarget);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      data-danger=""
                      disabled={busy}
                      onClick={(event) => {
                        const details = event.currentTarget.closest('details');
                        const trigger = details?.querySelector<HTMLElement>('summary');
                        details?.removeAttribute('open');
                        onRemove(video, trigger ?? event.currentTarget);
                      }}
                    >
                      Remove from Assets
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
  focusVideoId = null,
  onFocusVideoConsumed,
}: {
  onUse: (video: SavedVideoSummary, intent: 'play' | 'edit') => Promise<void>;
  /** A Saved Video to open directly in preview, addressed by id rather than by loaded row. */
  focusVideoId?: string | null;
  /** Fires once the id has been acted on, so the caller can drop it from the URL. */
  onFocusVideoConsumed?: () => void;
}) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [characterName, setCharacterName] = useState('');
  const [format, setFormat] = useState<SavedVideoFormat | ''>('');
  const [sort, setSort] = useState<SavedVideoSort>('latest');
  const [notice, setNotice] = useState<{
    readonly role: 'status' | 'alert';
    readonly tone: 'neutral' | 'success' | 'danger';
    readonly message: string;
  } | null>(null);
  const [useBusyId, setUseBusyId] = useState<string | null>(null);
  const [previewVideo, setPreviewVideo] = useState<SavedVideoSummary | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState(false);
  const [action, setAction] = useState<{
    readonly kind: 'rename' | 'remove';
    readonly video: SavedVideoSummary;
  } | null>(null);
  const [projectTarget, setProjectTarget] = useState<SavedVideoSummary | null>(null);
  const [previewRepairTarget, setPreviewRepairTarget] = useState<SavedVideoSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [brokenThumbnails, setBrokenThumbnails] = useState<ReadonlySet<string>>(() => new Set());
  const previewTriggerRef = useRef<HTMLButtonElement | null>(null);
  const consumedFocusVideoIdRef = useRef<string | null>(null);
  const previewPlayerRef = useRef<HTMLVideoElement | null>(null);
  const actionTriggerRef = useRef<HTMLElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const actionCancelRef = useRef<HTMLButtonElement | null>(null);
  const projectTriggerRef = useRef<HTMLElement | null>(null);
  const previewRepairTriggerRef = useRef<HTMLElement | null>(null);

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
  const previewDetailQuery = useQuery({
    queryKey: ['saved-videos', 'detail', previewVideo?.id ?? null],
    queryFn: ({ signal }) => getSavedVideo(previewVideo!.id, signal),
    enabled: previewVideo !== null,
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

  // Acted on once per requested id. The fetch uses the key `previewDetailQuery` already reads, so a
  // video on screen resolves from cache and one from a later page costs only the request the
  // preview itself would have made.
  useEffect(() => {
    if (focusVideoId === null) {
      consumedFocusVideoIdRef.current = null;
      return;
    }
    if (consumedFocusVideoIdRef.current === focusVideoId) return;
    consumedFocusVideoIdRef.current = focusVideoId;
    let abandoned = false;
    void queryClient
      .fetchQuery({
        queryKey: ['saved-videos', 'detail', focusVideoId],
        queryFn: ({ signal }) => getSavedVideo(focusVideoId, signal),
      })
      .then((focused) => {
        if (abandoned) return;
        // No trigger element to return to: OverlayPanel falls back to the Videos overlay itself.
        previewTriggerRef.current = null;
        setPreviewError(false);
        setSelectedVersionId(focused.currentVersion.id);
        setPreviewVideo(focused);
      })
      .catch(() => {
        if (abandoned) return;
        setNotice({
          role: 'alert',
          tone: 'danger',
          message: 'That video is no longer in Assets.',
        });
      })
      .finally(() => {
        if (!abandoned) onFocusVideoConsumed?.();
      });
    return () => {
      abandoned = true;
    };
  }, [focusVideoId, onFocusVideoConsumed, queryClient]);

  const closeAction = () => {
    if (renameMutation.isPending || deleteMutation.isPending) return;
    setAction(null);
    setActionError(null);
  };

  const openAction = (
    kind: 'rename' | 'remove',
    video: SavedVideoSummary,
    trigger: HTMLElement,
  ) => {
    actionTriggerRef.current = trigger;
    setRenameTitle(video.title);
    setActionError(null);
    setAction({ kind, video });
  };

  const rename = async (event?: FormEvent) => {
    event?.preventDefault();
    if (action?.kind !== 'rename') return;
    const title = renameTitle.trim();
    if (!title || title === action.video.title) return;
    setActionError(null);
    try {
      await renameMutation.mutateAsync({ videoId: action.video.id, title });
      setNotice({ role: 'status', tone: 'success', message: `Renamed video to “${title}”.` });
      setAction(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The video could not be renamed.');
    }
  };

  const remove = async () => {
    if (action?.kind !== 'remove') return;
    setActionError(null);
    try {
      await deleteMutation.mutateAsync(action.video.id);
      setNotice({
        role: 'status',
        tone: 'success',
        message: 'Video removed from Assets. Referenced Project history remains preserved.',
      });
      setAction(null);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'The video could not be deleted.');
    }
  };

  const handleUseVideo = async (video: SavedVideoSummary, intent: 'play' | 'edit') => {
    setUseBusyId(video.id);
    try {
      await onUse(video, intent);
    } catch (error) {
      setNotice({
        role: 'alert',
        tone: 'danger',
        message: error instanceof Error ? error.message : 'The video could not be loaded.',
      });
    } finally {
      setUseBusyId(null);
    }
  };

  const openPreview = (video: SavedVideoSummary, trigger: HTMLButtonElement) => {
    previewTriggerRef.current = trigger;
    setPreviewError(false);
    setSelectedVersionId(video.currentVersion.id);
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
    setSelectedVersionId(null);
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
  const previewDetail = previewDetailQuery.data;
  const selectedVersion: SavedVideoVersion | null =
    previewDetail?.versions.find((version) => version.id === selectedVersionId) ??
    previewVideo?.currentVersion ??
    null;
  const selectedIsCurrent =
    selectedVersion?.id === (previewDetail?.currentVersion.id ?? previewVideo?.currentVersion.id);

  if (!libraryHasVideos) {
    return (
      <div>
        <h2>No videos in Assets yet</h2>
        <p>
          Finish a Project with Save as New Video or Add Version, or save a standalone Studio video.
          Download always selects one exact ready Version.
        </p>
      </div>
    );
  }

  return (
    <div css={galleryStyles(theme)}>
      {notice ? (
        <StatusNotice role={notice.role} tone={notice.tone}>
          {notice.message}
        </StatusNotice>
      ) : null}
      {videos.some((video) => video.assignment === 'unassigned') ? (
        <StatusNotice role="status" tone="neutral" title="Unassigned Content">
          These legacy or independently saved videos have no trustworthy producing Project. They
          remain fully usable; later source reuse records used-by lineage without inventing a
          producer.
        </StatusNotice>
      ) : null}
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
          onGeneratePreview={(video, trigger) => {
            previewRepairTriggerRef.current = trigger;
            setNotice(null);
            setPreviewRepairTarget(video);
          }}
          onUse={handleUseVideo}
          onAddToProject={(video, trigger) => {
            projectTriggerRef.current = trigger;
            setProjectTarget(video);
          }}
          onRename={(video, trigger) => openAction('rename', video, trigger)}
          onRemove={(video, trigger) => openAction('remove', video, trigger)}
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
        open={action?.kind === 'rename'}
        onClose={closeAction}
        title="Rename saved video"
        description="Change the library title without changing any immutable Video Version."
        placement="bottom"
        size="standard"
        closeDisabled={renameMutation.isPending}
        closeOnBackdrop={false}
        initialFocusRef={renameInputRef}
        returnFocusRef={actionTriggerRef}
        footer={
          <div css={{ display: 'flex', justifyContent: 'flex-end', gap: theme.space.sm }}>
            <Button variant="quiet" disabled={renameMutation.isPending} onClick={closeAction}>
              Cancel
            </Button>
            <Button
              variant="primary"
              busy={renameMutation.isPending}
              disabled={
                renameTitle.trim().length === 0 ||
                renameTitle.trim().length > 120 ||
                renameTitle.trim() === action?.video.title
              }
              onClick={() => void rename()}
            >
              Rename video
            </Button>
          </div>
        }
      >
        <form onSubmit={(event) => void rename(event)}>
          <TextField
            ref={renameInputRef}
            label="Video title"
            required
            maxLength={120}
            disabled={renameMutation.isPending}
            value={renameTitle}
            {...(actionError ? { error: actionError } : {})}
            onChange={(event) => setRenameTitle(event.currentTarget.value)}
          />
          {actionError ? <p>Correct the title or retry when the local API is available.</p> : null}
        </form>
      </OverlayPanel>

      {projectTarget ? (
        <AddVideoToProjectDialog
          video={projectTarget}
          returnFocusRef={projectTriggerRef}
          onClose={() => setProjectTarget(null)}
        />
      ) : null}

      {previewRepairTarget ? (
        <GeneratePreviewDialog
          video={previewRepairTarget}
          returnFocusRef={previewRepairTriggerRef}
          onClose={() => setPreviewRepairTarget(null)}
          onGenerated={(video) => {
            setPreviewRepairTarget(null);
            // A repaired record may still carry a stale broken-image mark from an earlier load.
            setBrokenThumbnails((current) => {
              if (!current.has(video.id)) return current;
              const next = new Set(current);
              next.delete(video.id);
              return next;
            });
            setNotice({
              role: 'status',
              tone: 'success',
              message: `Preview generated for “${video.title}”.`,
            });
          }}
        />
      ) : null}

      <OverlayPanel
        open={action?.kind === 'remove'}
        onClose={closeAction}
        title="Remove video from Assets"
        description="Hide this video from Assets without claiming physical erasure."
        placement="bottom"
        size="standard"
        closeDisabled={deleteMutation.isPending}
        closeOnBackdrop={false}
        initialFocusRef={actionCancelRef}
        returnFocusRef={actionTriggerRef}
        footer={
          <div css={{ display: 'flex', justifyContent: 'flex-end', gap: theme.space.sm }}>
            <Button
              ref={actionCancelRef}
              variant="quiet"
              disabled={deleteMutation.isPending}
              onClick={closeAction}
            >
              Keep video
            </Button>
            <Button variant="danger" busy={deleteMutation.isPending} onClick={() => void remove()}>
              Remove from Assets
            </Button>
          </div>
        }
      >
        <p>
          Remove “{action?.video.title}” from Assets? Exact Versions and bytes remain available from
          any retaining Project history.
        </p>
        {actionError ? (
          <StatusNotice role="alert" tone="danger" title="Video not removed">
            {actionError}
          </StatusNotice>
        ) : null}
      </OverlayPanel>

      <OverlayPanel
        open={previewVideo !== null}
        onClose={closePreview}
        title={previewVideo?.title ?? 'Video preview'}
        description="Select and preview one exact immutable Version. Selection never changes the Saved Video current pointer."
        placement="fullscreen"
        size="wide"
        height="tall"
        centered
        initialFocus="heading"
        returnFocusRef={previewTriggerRef}
        bodyMode="scroll"
        footer={
          previewVideo && selectedVersion ? (
            <div css={previewFooterStyles(theme)}>
              <Button disabled aria-describedby="video-export-unavailable">
                Export
              </Button>
              <a
                href={downloadSavedVideoUrl(previewVideo.id, selectedVersion.id)}
                download={selectedVersion.filename}
              >
                Download
              </a>
              {selectedIsCurrent ? (
                <>
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
                    Open in Studio
                  </Button>
                </>
              ) : null}
              <small id="video-export-unavailable">
                Export formats and channels are not specified yet. Download remains available.
              </small>
            </div>
          ) : null
        }
      >
        {previewVideo ? (
          <div css={previewContentStyles(theme)}>
            {previewDetailQuery.isPending ? <p role="status">Loading Version history…</p> : null}
            {previewDetailQuery.isError ? (
              <StatusNotice tone="danger" role="alert">
                Version history could not be loaded.{' '}
                <Button size="small" onClick={() => void previewDetailQuery.refetch()}>
                  Retry
                </Button>
              </StatusNotice>
            ) : null}
            {previewDetail ? (
              <fieldset
                css={{
                  display: 'grid',
                  gap: theme.space.sm,
                  margin: 0,
                  padding: theme.space.md,
                  border: `1px solid ${theme.colors.border}`,
                  borderRadius: theme.radii.medium,
                }}
              >
                <legend>Versions</legend>
                <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.sm }}>
                  {previewDetail.versions.map((version) => (
                    <Button
                      key={version.id}
                      size="small"
                      variant={version.id === selectedVersion?.id ? 'primary' : 'secondary'}
                      aria-pressed={version.id === selectedVersion?.id}
                      onClick={() => {
                        setPreviewError(false);
                        setSelectedVersionId(version.id);
                      }}
                    >
                      Version {version.ordinal}
                      {version.id === previewDetail.currentVersion.id ? ' · Current' : ''}
                    </Button>
                  ))}
                </div>
              </fieldset>
            ) : null}
            <div css={previewPlayerStyles(theme)}>
              {selectedVersion ? (
                // Saved local videos may not include a captions track.
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video
                  key={selectedVersion.id}
                  ref={previewPlayerRef}
                  src={savedVideoContentUrl(previewVideo.id, selectedVersion.id)}
                  controls
                  playsInline
                  preload="metadata"
                  aria-label={`Preview of ${previewVideo.title}, Version ${selectedVersion.ordinal}`}
                  onLoadedData={() => setPreviewError(false)}
                  onError={() => setPreviewError(true)}
                />
              ) : null}
            </div>
            {previewError ? (
              <StatusNotice tone="danger" role="alert">
                This saved video could not be previewed. You can still try loading or downloading
                it.
              </StatusNotice>
            ) : null}
            {selectedVersion ? (
              <div css={previewMetadataStyles(theme)}>
                <span>Version {selectedVersion.ordinal}</span>
                <span>{selectedIsCurrent ? 'Current Version' : 'Older Version'}</span>
                <span>{previewVideo.status}</span>
                <span>{duration(selectedVersion.durationMs)} duration</span>
                <span>
                  {selectedVersion.width}×{selectedVersion.height}
                </span>
                <span>{selectedVersion.origin}</span>
                <span>{FORMAT_LABELS[formatForDimensions(selectedVersion)]}</span>
                <span>
                  <time dateTime={selectedVersion.createdAt}>
                    {new Date(selectedVersion.createdAt).toLocaleString()}
                  </time>
                </span>
                {selectedVersion.characterName ? (
                  <span>Character: {selectedVersion.characterName}</span>
                ) : null}
                {selectedVersion.characterVariantName ? (
                  <span>Variant: {selectedVersion.characterVariantName}</span>
                ) : null}
                <span>
                  {previewVideo.versionCount} version
                  {previewVideo.versionCount === 1 ? '' : 's'}
                </span>
              </div>
            ) : null}
            {!selectedIsCurrent && selectedVersion ? (
              <p>
                Use this older Version from a retaining Project&apos;s history. Viewing or Download
                here does not select an Add Version target.
              </p>
            ) : null}
          </div>
        ) : null}
      </OverlayPanel>
    </div>
  );
};
