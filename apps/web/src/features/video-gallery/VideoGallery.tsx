import { useTheme } from '@emotion/react';
import type {
  SavedVideoFormat,
  SavedVideoOrigin,
  SavedVideoSort,
  SavedVideoSummary,
  SavedVideoVersion,
  SavedVideosResponse,
} from '@studio/contracts';
import { formatDateTime } from '@studio/domain';
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
import {
  AppIcon,
  Button,
  emptyExampleStyles,
  EmptyStatePreview,
  LinkButton,
  ListSearchField,
  OverlayPanel,
  SelectField,
  Skeleton,
  StatusNotice,
  TextField,
  useListSearch,
  VisuallyHidden,
} from '../../ui';
import { savedVideoQueryKeys } from '../saved-videos/savedVideoQueryKeys';
import { AddVideoToProjectDialog } from '../projects/AddVideoToProjectDialog';
import { GeneratePreviewDialog } from './GeneratePreviewDialog';
import { VideoExportPanel } from './VideoExportPanel';
import {
  actionsStyles,
  cardBodyStyles,
  cardCopyStyles,
  cardStyles,
  chipRowStyles,
  chipStyles,
  durationBadgeStyles,
  filterControlsStyles,
  filterSheetFieldsStyles,
  filterSheetFooterStyles,
  gallerySearchRowStyles,
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
import { ActionMenu } from '../../ui/primitives/ActionMenu';

const duration = (milliseconds: number): string => {
  const seconds = Math.round(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const FORMAT_LABELS: Readonly<Record<SavedVideoFormat, string>> = {
  landscape: 'Landscape',
  portrait: 'Portrait',
  square: 'Square',
};

const ORIGIN_LABELS: Readonly<Record<SavedVideoOrigin, string>> = {
  recorded: 'Studio recording',
  uploaded: 'Uploaded video',
  'character-swap': 'Character Swap',
  'virtual-try-on': 'Virtual Try-On',
  'voice-treatment': 'Voice treatment',
  editor: 'Edited locally',
  'legacy-import': 'Imported video',
};

const STATUS_LABELS: Readonly<Record<SavedVideoSummary['status'], string>> = {
  ready: 'Ready',
  processing: 'Processing',
  failed: 'Processing failed',
  missing: 'File unavailable',
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

const VideoGallerySkeleton = () => {
  const theme = useTheme();
  return (
    <div css={galleryStyles(theme)} aria-busy="true">
      <VisuallyHidden role="status">Loading saved videos…</VisuallyHidden>
      <div css={gridStyles(theme)} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} variant="card" />
        ))}
      </div>
    </div>
  );
};

interface VideoFilterFieldsProps {
  readonly characterName: string;
  readonly characterNames: readonly string[];
  readonly format: SavedVideoFormat | '';
  readonly availableFormats: readonly SavedVideoFormat[];
  readonly sort: SavedVideoSort;
  readonly setCharacterName: (value: string) => void;
  readonly setFormat: (value: SavedVideoFormat | '') => void;
  readonly setSort: (value: SavedVideoSort) => void;
}

const VideoFilterFields = ({
  characterName,
  characterNames,
  format,
  availableFormats,
  sort,
  setCharacterName,
  setFormat,
  setSort,
}: VideoFilterFieldsProps) => (
  <>
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
  </>
);

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
  /** Keyed by poster URL, so a repaired poster — which has a new URL — is tried again. */
  brokenThumbnails: ReadonlySet<string>;
  onThumbnailError: (thumbnailUrl: string) => void;
  onOpenPreview: (video: SavedVideoSummary, trigger: HTMLButtonElement) => void;
  onGeneratePreview: (video: SavedVideoSummary, trigger: HTMLElement) => void;
  onUse: (video: SavedVideoSummary, intent: 'play' | 'edit') => Promise<void>;
  onAddToProject: (video: SavedVideoSummary, trigger: HTMLElement | null) => void;
  onRename: (video: SavedVideoSummary, trigger: HTMLElement | null) => void;
  onRemove: (video: SavedVideoSummary, trigger: HTMLElement | null) => void;
}) => {
  'use memo';

  const theme = useTheme();
  return (
    <div css={gridStyles(theme)} aria-label="Saved videos">
      {videos.map((video) => {
        const version = video.currentVersion;
        const busy = busyId === video.id;
        const thumbnailUrl = savedVideoThumbnailUrl(video.id, version.id);
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
                {video.thumbnailAvailable && !brokenThumbnails.has(thumbnailUrl) ? (
                  <img
                    css={thumbnailStyles(theme)}
                    data-gallery-thumbnail=""
                    src={thumbnailUrl}
                    alt=""
                    loading="lazy"
                    onError={() => onThumbnailError(thumbnailUrl)}
                  />
                ) : (
                  <span
                    css={thumbnailPlaceholderStyles(theme)}
                    aria-label={
                      video.thumbnailAvailable ? 'Preview could not load' : 'No preview yet'
                    }
                  >
                    <AppIcon name="video" />
                    <span>
                      {video.thumbnailAvailable ? 'Preview didn’t load' : 'No preview yet'}
                    </span>
                  </span>
                )}
                <span data-gallery-play="" css={playBadgeStyles(theme)}>
                  <AppIcon name="play" />
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
                <span css={chipStyles(theme)}>{ORIGIN_LABELS[version.origin]}</span>
                <span css={chipStyles(theme)}>{FORMAT_LABELS[formatForDimensions(version)]}</span>
                {version.characterName ? (
                  <span css={chipStyles(theme)}>{version.characterName}</span>
                ) : null}
                {version.characterVariantName ? (
                  <span css={chipStyles(theme)}>Variant: {version.characterVariantName}</span>
                ) : null}
                {video.status !== 'ready' ? (
                  <span css={chipStyles(theme)}>{STATUS_LABELS[video.status]}</span>
                ) : null}
                {video.assignment === 'unassigned' ? (
                  <span css={chipStyles(theme)}>No Project</span>
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
                <LinkButton
                  variant="primary"
                  href={downloadSavedVideoUrl(video.id, version.id)}
                  download={version.filename}
                  aria-label={`Download ${video.title}`}
                >
                  Download
                </LinkButton>
                <ActionMenu
                  label={`More actions for ${video.title}`}
                  placement="above"
                  items={[
                    {
                      id: 'play',
                      label: 'Open in Studio',
                      disabled: busy || video.status !== 'ready',
                      onSelect: () => void onUse(video, 'play'),
                    },
                    {
                      id: 'edit',
                      label: 'Edit video',
                      disabled: busy || video.status !== 'ready',
                      onSelect: () => void onUse(video, 'edit'),
                    },
                    {
                      id: 'project-source',
                      label: 'Use as Project source',
                      disabled: busy || video.status !== 'ready',
                      onSelect: (trigger) => onAddToProject(video, trigger),
                    },
                    {
                      id: 'rename',
                      label: 'Rename',
                      disabled: busy,
                      onSelect: (trigger) => onRename(video, trigger),
                    },
                    {
                      id: 'remove',
                      label: 'Remove from Assets',
                      danger: true,
                      disabled: busy,
                      onSelect: (trigger) => onRemove(video, trigger),
                    },
                  ]}
                />
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const search = useListSearch();
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
  const [exportOpen, setExportOpen] = useState(false);
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
  const exportTriggerRef = useRef<HTMLButtonElement | null>(null);
  const filtersTriggerRef = useRef<HTMLButtonElement | null>(null);

  const videosQuery = useInfiniteQuery({
    queryKey: [
      ...savedVideoQueryKeys.lists,
      {
        characterName: characterName || null,
        format: format || null,
        search: search.term ?? null,
        sort,
      },
    ],
    queryFn: ({ pageParam, signal }) =>
      listSavedVideos({
        ...(pageParam ? { cursor: pageParam } : {}),
        ...(characterName ? { characterName } : {}),
        ...(format ? { format } : {}),
        ...(search.term === undefined ? {} : { search: search.term }),
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
  //
  // The guard releases on teardown unless the work already settled, because the gallery mounts with
  // the id already set — arriving from the Dashboard opens this overlay for the first time — and
  // React replays a fresh mount's effects. Holding the guard across that replay would abandon the
  // only attempt and leave the requested video unopened.
  useEffect(() => {
    if (focusVideoId === null) {
      consumedFocusVideoIdRef.current = null;
      return;
    }
    if (consumedFocusVideoIdRef.current === focusVideoId) return;
    consumedFocusVideoIdRef.current = focusVideoId;
    let abandoned = false;
    let settled = false;
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
        settled = true;
        if (!abandoned) onFocusVideoConsumed?.();
      });
    return () => {
      abandoned = true;
      if (!settled) consumedFocusVideoIdRef.current = null;
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
    trigger: HTMLElement | null,
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

  // The panel is mounted only while it is open, so it starts clean and needs no reset here.
  const openExport = (trigger: HTMLButtonElement) => {
    exportTriggerRef.current = trigger;
    setExportOpen(true);
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
    setExportOpen(false);
    setPreviewVideo(null);
    setSelectedVersionId(null);
    setPreviewError(false);
  };

  if (videosQuery.isPending) {
    return <VideoGallerySkeleton />;
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
  const activeFilterCount = Number(Boolean(characterName)) + Number(Boolean(format));
  const filtersActive = activeFilterCount > 0;
  const clearFilters = () => {
    setCharacterName('');
    setFormat('');
  };
  const previewDetail = previewDetailQuery.data;
  const selectedVersion: SavedVideoVersion | null =
    previewDetail?.versions.find((version) => version.id === selectedVersionId) ??
    previewVideo?.currentVersion ??
    null;
  const selectedIsCurrent =
    selectedVersion?.id === (previewDetail?.currentVersion.id ?? previewVideo?.currentVersion.id);

  if (!libraryHasVideos) {
    return (
      <div css={{ display: 'grid', justifyItems: 'start', gap: theme.space.sm }}>
        <EmptyStatePreview />
        <h2 css={{ margin: 0 }}>No videos in Assets yet</h2>
        <p css={{ margin: 0 }}>Videos you save to Assets will appear here.</p>
        <p data-empty-example css={emptyExampleStyles(theme)}>
          Each saved video keeps its preview, download and version history together.
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
      <div css={gallerySearchRowStyles(theme)}>
        <ListSearchField label="Search videos by title" placeholder="Video title" search={search} />
        <Button
          ref={filtersTriggerRef}
          variant="secondary"
          data-mobile-filter-trigger=""
          aria-label={`Filters${activeFilterCount > 0 ? `, ${activeFilterCount} active` : ''}`}
          onClick={() => setFiltersOpen(true)}
        >
          Filters
          {activeFilterCount > 0 ? (
            <span data-active-filter-count="">{activeFilterCount} active</span>
          ) : null}
        </Button>
      </div>
      <div css={filterControlsStyles(theme)} aria-label="Filter and sort saved videos">
        <VideoFilterFields
          characterName={characterName}
          characterNames={characterNames}
          format={format}
          availableFormats={availableFormats}
          sort={sort}
          setCharacterName={setCharacterName}
          setFormat={setFormat}
          setSort={setSort}
        />
        <Button variant="secondary" disabled={!filtersActive} onClick={clearFilters}>
          Clear filters
        </Button>
      </div>
      {/* Polite, so a settled search states its result count without interrupting typing. */}
      <div css={gallerySummaryStyles(theme)} role="status" aria-live="polite">
        <span>
          <strong>{total}</strong> matching {total === 1 ? 'video' : 'videos'}
          {search.term === undefined ? '' : ` for “${search.term}”`}
        </span>
        {videos.length < total ? <span>Showing the first {videos.length}</span> : null}
      </div>
      {videos.length === 0 ? (
        <div>
          <h2>
            {search.term === undefined
              ? 'No saved videos match these filters'
              : `No saved videos match “${search.term}”`}
          </h2>
          <p>
            {search.term === undefined
              ? 'Choose a different character or video format, or clear the filters.'
              : 'Try a shorter term, or use the × in the search field to see everything again.'}
          </p>
        </div>
      ) : (
        <VideoGalleryGrid
          videos={videos}
          busyId={busyId}
          brokenThumbnails={brokenThumbnails}
          onThumbnailError={(thumbnailUrl) =>
            setBrokenThumbnails((current) => new Set(current).add(thumbnailUrl))
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
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Filters"
        description="Narrow the Videos library without hiding the title search."
        placement="bottom"
        height="tall"
        closeLabel="Close filters"
        returnFocusRef={filtersTriggerRef}
        footer={
          <div css={filterSheetFooterStyles(theme)} data-filter-sheet-actions="">
            <Button
              size="small"
              variant="secondary"
              disabled={!filtersActive}
              onClick={clearFilters}
            >
              Clear filters
            </Button>
            <Button size="small" variant="primary" onClick={() => setFiltersOpen(false)}>
              Show {total} {total === 1 ? 'video' : 'videos'}
            </Button>
          </div>
        }
      >
        <div css={filterSheetFieldsStyles(theme)} aria-label="Filter and sort saved videos">
          <VideoFilterFields
            characterName={characterName}
            characterNames={characterNames}
            format={format}
            availableFormats={availableFormats}
            sort={sort}
            setCharacterName={setCharacterName}
            setFormat={setFormat}
            setSort={setSort}
          />
        </div>
      </OverlayPanel>
      <OverlayPanel
        open={action?.kind === 'rename'}
        onClose={closeAction}
        title="Rename saved video"
        description="Changes the title in your library. No saved version changes."
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
        description="Hides this video from Assets. Its file is not erased."
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
          Remove “{action?.video.title}” from Assets? Its versions stay available from the history
          of any Project that kept them.
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
        description="Preview any saved version. Choosing one here does not change which version is current."
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
              <LinkButton
                variant="primary"
                href={downloadSavedVideoUrl(previewVideo.id, selectedVersion.id)}
                download={selectedVersion.filename}
              >
                Download
              </LinkButton>
              <ActionMenu
                label={`More actions for ${previewVideo.title}`}
                placement="above"
                items={[
                  {
                    id: 'export',
                    label: 'Export',
                    onSelect: (trigger) => {
                      if (trigger) openExport(trigger);
                    },
                  },
                  ...(selectedIsCurrent
                    ? [
                        {
                          id: 'edit',
                          label: 'Edit video',
                          disabled: busyId === previewVideo.id,
                          onSelect: () => void handleUseVideo(previewVideo, 'edit'),
                        },
                        {
                          id: 'play',
                          label: 'Open in Studio',
                          disabled: busyId === previewVideo.id,
                          onSelect: () => void handleUseVideo(previewVideo, 'play'),
                        },
                      ]
                    : []),
                ]}
              />
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
                <span>{STATUS_LABELS[previewVideo.status]}</span>
                <span>{duration(selectedVersion.durationMs)} duration</span>
                <span>
                  {selectedVersion.width}×{selectedVersion.height}
                </span>
                <span>{ORIGIN_LABELS[selectedVersion.origin]}</span>
                <span>{FORMAT_LABELS[formatForDimensions(selectedVersion)]}</span>
                <span>
                  <time dateTime={selectedVersion.createdAt}>
                    {formatDateTime(selectedVersion.createdAt)}
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
                Use this older version from the history of a Project that kept it. Viewing or
                downloading here does not choose where the Project’s next saved Version goes.
              </p>
            ) : null}
          </div>
        ) : null}
      </OverlayPanel>

      {exportOpen && previewVideo && selectedVersion ? (
        <VideoExportPanel
          video={previewVideo}
          version={selectedVersion}
          returnFocusRef={exportTriggerRef}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </div>
  );
};
