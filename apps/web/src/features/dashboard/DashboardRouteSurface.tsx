import { useTheme } from '@emotion/react';
import type {
  CampaignContract,
  ProjectContract,
  SavedVideoSummary,
  VideoJobQueueItem,
} from '@studio/contracts';
import { formatDateTime, formatDuration } from '@studio/domain';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { listSavedVideos, savedVideoThumbnailUrl } from '../../adapters/api-client/savedVideosApi';
import { useRouteViewState } from '../../app/useRouteViewState';
import {
  abandonVideoJob,
  activeVideoJobsQueryOptions,
} from '../../adapters/api-client/videoJobsApi';
import {
  AppIcon,
  Button,
  ConfirmationDialog,
  emptyExampleStyles,
  EmptyStatePreview,
  listTotalLabel,
  SegmentedControl,
  Skeleton,
  StatusNotice,
  VisuallyHidden,
} from '../../ui';
import { PageHeader, PageShell } from '../../ui/primitives/PageShell';
import { useCampaignList } from '../campaigns/useCampaignsController';
import { VIDEO_TRANSFORM_OPERATION_LABELS } from '../existing-video/videoTransformLabels';
import { KIND_ICONS } from '../projects/ProjectAssetThumbnail';
import { projectPosterUrls } from '../projects/projectPosterPresentation';
import { useProjectList } from '../projects/useProjectsController';
import { WorkPosterTile } from '../projects/WorkPosterTile';
import { savedVideoQueryKeys } from '../saved-videos/savedVideoQueryKeys';
import {
  loadDashboardOnboardingDismissed,
  persistDashboardOnboardingDismissed,
} from './dashboardOnboarding';
import {
  allDestinationsStyles,
  continuePanelStyles,
  continueSkeletonStyles,
  dashboardBodyStyles,
  dashboardHeaderStyles,
  dashboardShellStyles,
  dashboardStyles,
  emptyRecentStyles,
  firstRunStyles,
  processingNoticeStyles,
  processingPanelStyles,
  processingStatusSkeletonStyles,
  processingTriggerStyles,
  recentCountStyles,
  recentFilterStyles,
  recentListStyles,
  recentSkeletonStyles,
  recentWorkStyles,
  sectionEyebrowStyles,
} from './DashboardRouteSurface.styles';

const RECENT_LIMIT = 4;
const DASHBOARD_VIEW_STATE_KEY = 'lightframeDashboardView';

const jobOperationLabel = (operation: VideoJobQueueItem['operation']): string =>
  VIDEO_TRANSFORM_OPERATION_LABELS[operation];

const jobStatusLabel = (status: VideoJobQueueItem['status']): string => {
  if (status === 'validating' || status === 'submitting' || status === 'queued') return 'Queued';
  if (status === 'retrieving') return 'Finalizing';
  return 'Active';
};

const jobActionLabel = (status: VideoJobQueueItem['status']): string =>
  status === 'validating' || status === 'submitting' || status === 'queued'
    ? 'Remove from queue'
    : 'Stop tracking';

/**
 * Owns the one-second elapsed tick, so a live job re-renders this control rather than the whole
 * route. Mounted only while work is active, which is also the interval's lifetime.
 */
const ProcessingQueueTrigger = ({
  jobCount,
  startedAtMs,
  expanded,
  onToggle,
}: Readonly<{
  jobCount: number;
  startedAtMs: number | null;
  expanded: boolean;
  onToggle: () => void;
}>) => {
  const theme = useTheme();
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const elapsed = formatDuration(startedAtMs === null ? 0 : Math.max(0, nowMs - startedAtMs));

  return (
    <Button
      size="small"
      variant="secondary"
      css={processingTriggerStyles(theme, 'active')}
      aria-label={`${jobCount} processing job${jobCount === 1 ? '' : 's'}, elapsed ${elapsed}`}
      aria-expanded={expanded}
      aria-controls="processing-queue-panel"
      onClick={onToggle}
    >
      <span data-processing-count>{jobCount}</span>
      <span data-processing-label>Processing · {elapsed}</span>
    </Button>
  );
};

type DashboardRouteSurfaceProps = Readonly<{
  ownerUserId: string;
  displayName: string;
  onCreateVideo: () => void;
  onCreateProject: () => void;
  onCreateCampaign: () => void;
  onOpenAssets: () => void;
  onOpenProjects: () => void;
  onOpenCampaigns: () => void;
  onOpenProject: (projectId: string) => void;
  onOpenCampaign: (campaignId: string) => void;
  /** The whole Videos library — "All Videos", not a specific record. */
  onOpenVideos: () => void;
  onOpenVideo: (videoId: string) => void;
}>;

type RecentKind = 'all' | 'projects' | 'videos' | 'campaigns';
type ItemKind = Exclude<RecentKind, 'all'>;

const ALL_ITEM_KINDS: readonly ItemKind[] = ['projects', 'videos', 'campaigns'];

type RecentWorkItem = Readonly<{
  id: string;
  kind: ItemKind;
  title: string;
  meta: string;
  updatedAt: string;
  /** Resolved from data these lists already carry, so a row costs no request of its own. */
  posterUrl: string | null;
  open: () => void;
}>;

const RECENT_KIND_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'videos', label: 'Videos', shortLabel: 'Video' },
  { value: 'projects', label: 'Projects' },
  { value: 'campaigns', label: 'Campaigns' },
] as const;

const isRecentKind = (value: unknown): value is RecentKind =>
  RECENT_KIND_OPTIONS.some((option) => option.value === value);

const recentKindLabel: Record<ItemKind, string> = {
  projects: 'Project',
  videos: 'Video',
  campaigns: 'Campaign',
};

const recentKindIcon = (kind: ItemKind) => {
  switch (kind) {
    case 'projects':
      return 'projects' as const;
    case 'videos':
      return 'video' as const;
    case 'campaigns':
      return 'campaigns' as const;
  }
};

/** Campaigns never produce a poster, so their empty tile must not imply one is still loading. */
const recentEmptyCaption = (kind: ItemKind): string =>
  kind === 'campaigns' ? 'Campaign' : 'No preview yet';

export const DashboardRouteSurface = ({
  ownerUserId,
  displayName,
  onCreateVideo,
  onCreateProject,
  onCreateCampaign,
  onOpenAssets,
  onOpenProjects,
  onOpenCampaigns,
  onOpenProject,
  onOpenCampaign,
  onOpenVideos,
  onOpenVideo,
}: DashboardRouteSurfaceProps) => {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const { routeRef, initialView, rememberView, onScroll } = useRouteViewState<
    HTMLElement,
    RecentKind
  >({
    storageKey: DASHBOARD_VIEW_STATE_KEY,
    owner: ownerUserId,
    isView: isRecentKind,
  });
  const [onboardingVisible, setOnboardingVisible] = useState(
    () => !loadDashboardOnboardingDismissed(ownerUserId),
  );
  const [onboardingStorageWarning, setOnboardingStorageWarning] = useState(false);
  const [recentKind, setRecentKind] = useState<RecentKind>(initialView ?? 'all');
  const [selectedJob, setSelectedJob] = useState<VideoJobQueueItem | null>(null);
  const [expandedQueueKey, setExpandedQueueKey] = useState<string | null>(null);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);

  const projectsQuery = useProjectList('active');
  const campaignsQuery = useCampaignList('active');
  const videosQuery = useInfiniteQuery({
    queryKey: [...savedVideoQueryKeys.lists, { dashboard: true, sort: 'latest' }],
    queryFn: ({ pageParam, signal }) =>
      listSavedVideos({
        ...(pageParam ? { cursor: pageParam } : {}),
        sort: 'latest',
        pageSize: RECENT_LIMIT,
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });
  const activeJobsQuery = activeVideoJobsQueryOptions(ownerUserId);
  const processingQueueQuery = useQuery({
    ...activeJobsQuery,
    refetchInterval: (query) => (query.state.data?.jobs.length ? 3_000 : false),
  });
  const abandonMutation = useMutation({
    mutationFn: (jobId: string) => abandonVideoJob(jobId),
    onSuccess: async () => {
      setSelectedJob(null);
      setExpandedQueueKey(null);
      setQueueNotice('The job was removed from Lightframe and the processing slot is available.');
      await queryClient.invalidateQueries({ queryKey: activeJobsQuery.queryKey });
    },
  });

  const projects = useMemo(
    () => (projectsQuery.data?.pages.flatMap((page) => page.projects) ?? []).slice(0, RECENT_LIMIT),
    [projectsQuery.data],
  );
  const campaigns = useMemo(
    () =>
      (campaignsQuery.data?.pages.flatMap((page) => page.campaigns) ?? []).slice(0, RECENT_LIMIT),
    [campaignsQuery.data],
  );
  const videos = useMemo(
    () => (videosQuery.data?.pages.flatMap((page) => page.videos) ?? []).slice(0, RECENT_LIMIT),
    [videosQuery.data],
  );
  const continueProject = projects[0] ?? null;
  const projectPosters = useMemo(
    () => projectPosterUrls(projectsQuery.data?.pages),
    [projectsQuery.data],
  );
  const campaignNames = useMemo(
    () => new Map(campaigns.map((campaign) => [campaign.id, campaign.name])),
    [campaigns],
  );
  const recentItems = useMemo<readonly RecentWorkItem[]>(
    () =>
      [
        ...projects.map((project: ProjectContract) => ({
          id: project.id,
          kind: 'projects' as const,
          title: project.title,
          meta:
            project.campaignId === null
              ? 'No Campaign'
              : (campaignNames.get(project.campaignId) ?? 'Campaign Project'),
          updatedAt: project.updatedAt,
          posterUrl: projectPosters.get(project.id) ?? null,
          open: () => onOpenProject(project.id),
        })),
        ...videos.map((video: SavedVideoSummary) => ({
          id: video.id,
          kind: 'videos' as const,
          title: video.title,
          meta: `${video.versionCount} Version${video.versionCount === 1 ? '' : 's'}`,
          updatedAt: video.updatedAt,
          posterUrl: video.thumbnailAvailable
            ? savedVideoThumbnailUrl(video.id, video.currentVersion.id)
            : null,
          open: () => onOpenVideo(video.id),
        })),
        ...campaigns.map((campaign: CampaignContract) => ({
          id: campaign.id,
          kind: 'campaigns' as const,
          title: campaign.name,
          meta: campaign.brief ?? 'No brief yet',
          updatedAt: campaign.updatedAt,
          posterUrl: null,
          open: () => onOpenCampaign(campaign.id),
        })),
      ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [
      campaignNames,
      campaigns,
      onOpenCampaign,
      onOpenProject,
      onOpenVideo,
      projectPosters,
      projects,
      videos,
    ],
  );

  const visibleItems = recentItems
    .filter((item) => recentKind === 'all' || item.kind === recentKind)
    .slice(0, RECENT_LIMIT);
  const visibleKinds: readonly ItemKind[] = recentKind === 'all' ? ALL_ITEM_KINDS : [recentKind];
  const queryState = {
    projects: {
      loading: projectsQuery.isLoading,
      error: projectsQuery.isError,
      retry: () => void projectsQuery.refetch(),
    },
    videos: {
      loading: videosQuery.isLoading,
      error: videosQuery.isError,
      retry: () => void videosQuery.refetch(),
    },
    campaigns: {
      loading: campaignsQuery.isLoading,
      error: campaignsQuery.isError,
      retry: () => void campaignsQuery.refetch(),
    },
  } as const;
  const visibleLoading = visibleKinds.some((kind) => queryState[kind].loading);
  const visibleErrors = visibleKinds.filter((kind) => queryState[kind].error);
  const firstRun =
    ALL_ITEM_KINDS.every((kind) => !queryState[kind].loading && !queryState[kind].error) &&
    recentItems.length === 0;
  const queueJobs = processingQueueQuery.data?.jobs ?? [];
  const queueActive = queueJobs.length > 0;
  const queueKey = queueJobs
    .map((job) => job.jobId)
    .sort()
    .join(':');
  const queueExpanded = queueActive && expandedQueueKey === queueKey;
  const earliestQueueStart = queueJobs.reduce<number | null>((earliest, job) => {
    const createdAt = Date.parse(job.createdAt);
    if (!Number.isFinite(createdAt)) return earliest;
    return earliest === null ? createdAt : Math.min(earliest, createdAt);
  }, null);

  const updateRecentKind = (kind: RecentKind) => {
    setRecentKind(kind);
    rememberView(kind);
  };

  const dismissOnboarding = () => {
    const persisted = persistDashboardOnboardingDismissed(ownerUserId);
    setOnboardingVisible(false);
    setOnboardingStorageWarning(!persisted);
  };

  const emptyRecent: Record<
    RecentKind,
    Readonly<{
      message: string;
      example: string;
      action: Readonly<{ label: string; run: () => void }> | null;
    }>
  > = {
    all: {
      message: 'No recent work yet. Start with a standalone video and organize it later if needed.',
      example:
        'Your latest Videos, Projects and Campaigns will line up here once you make something.',
      action: null,
    },
    videos: {
      message: 'No saved Videos yet. Create or upload one when you are ready.',
      example: 'For example: record a take in Studio and save it — it appears here with a preview.',
      action: { label: 'Create video', run: onCreateVideo },
    },
    projects: {
      message: 'No active Projects yet. Create one when resumable context will help.',
      example:
        'For example: a “Product demo” Project holding one video, its AI runs, and every saved cut.',
      action: { label: 'New Project', run: onCreateProject },
    },
    campaigns: {
      message: 'No Campaigns yet. They are optional organizers for related Projects.',
      example: 'For example: a “Spring launch” Campaign holding one Project per ad placement.',
      action: { label: 'New Campaign', run: onCreateCampaign },
    },
  };
  const activeEmptyRecent = emptyRecent[recentKind];
  const recentCountLabel = visibleLoading
    ? 'Loading recent work'
    : visibleErrors.length > 0
      ? 'Recent work count unavailable'
      : listTotalLabel(
          { count: visibleItems.length, exceedsCeiling: recentItems.length > visibleItems.length },
          'recent item',
          'recent items',
        );

  const processingAction = processingQueueQuery.isLoading ? (
    <span css={processingStatusSkeletonStyles(theme)} role="status">
      Checking jobs
    </span>
  ) : processingQueueQuery.isError ? (
    <Button
      size="small"
      variant="secondary"
      css={processingTriggerStyles(theme, 'error')}
      aria-label="Processing queue unavailable. Retry"
      onClick={() => void processingQueueQuery.refetch()}
    >
      <AppIcon name="info" width="1rem" height="1rem" />
      <span data-processing-label>Queue unavailable</span>
    </Button>
  ) : queueActive ? (
    <ProcessingQueueTrigger
      jobCount={queueJobs.length}
      startedAtMs={earliestQueueStart}
      expanded={queueExpanded}
      onToggle={() =>
        setExpandedQueueKey((expandedKey) => (expandedKey === queueKey ? null : queueKey))
      }
    />
  ) : null;

  return (
    <section
      ref={routeRef}
      css={dashboardStyles(theme)}
      aria-labelledby="dashboard-heading"
      onScroll={onScroll}
    >
      <PageShell css={dashboardShellStyles(theme)}>
        <PageHeader
          css={dashboardHeaderStyles(theme)}
          eyebrow={`Welcome back, ${displayName}`}
          title="Dashboard"
          headingId="dashboard-heading"
          description="Resume focused Project work or start a standalone video."
          actions={
            <>
              <Button data-create-video variant="primary" onClick={onCreateVideo}>
                <AppIcon name="plus" width="1rem" height="1rem" />
                Create video
              </Button>
              <Button
                data-browse-assets
                variant="secondary"
                aria-label="Browse Assets"
                onClick={onOpenAssets}
              >
                <AppIcon name="assets" width="1rem" height="1rem" />
                {/*
                  The verb form where there is room, the destination's own name where there is
                  not — the pattern the Studio tool rail already uses. The accessible name is
                  "Browse Assets" either way.
                */}
                <span data-browse-label="long">Browse Assets</span>
                <span data-browse-label="short">Assets</span>
              </Button>
              {processingAction}
            </>
          }
        />

        {queueExpanded ? (
          <section
            id="processing-queue-panel"
            css={processingPanelStyles(theme)}
            aria-labelledby="processing-queue-heading"
          >
            <header>
              <div>
                <h2 id="processing-queue-heading">Processing Queue</h2>
                <p>Provider video edits active for this account.</p>
              </div>
              <Button
                size="small"
                variant="link"
                disabled={processingQueueQuery.isFetching}
                onClick={() => void processingQueueQuery.refetch()}
              >
                Refresh
              </Button>
            </header>
            <ul>
              {queueJobs.map((job) => (
                <li key={job.jobId}>
                  <span data-job-status>{jobStatusLabel(job.status)}</span>
                  <span data-job-details>
                    <strong>{jobOperationLabel(job.operation)}</strong>
                    <span>
                      {job.provider} · Started {formatDateTime(job.createdAt)}
                    </span>
                  </span>
                  <Button
                    size="small"
                    variant="danger"
                    onClick={() => {
                      abandonMutation.reset();
                      setQueueNotice(null);
                      setSelectedJob(job);
                    }}
                  >
                    {jobActionLabel(job.status)}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {queueNotice ? (
          <div css={processingNoticeStyles(theme)}>
            <StatusNotice role="status" tone="success" title="Processing slot released">
              {queueNotice}
            </StatusNotice>
          </div>
        ) : null}

        {firstRun && onboardingVisible ? (
          <aside
            data-first-run
            css={firstRunStyles(theme)}
            aria-labelledby="dashboard-getting-started-heading"
          >
            <span data-first-run-icon>
              <AppIcon name="wand" width="1.25rem" height="1.25rem" />
            </span>
            <div data-first-run-copy>
              <h2 id="dashboard-getting-started-heading">Make your first reusable video</h2>
              <p>
                Record in Studio or upload a source, edit and save versions, then reuse the result.
                Projects keep focused work together; Campaigns are optional organizers.
              </p>
            </div>
            <Button size="small" variant="link" onClick={dismissOnboarding}>
              Got it
            </Button>
          </aside>
        ) : null}
        {onboardingStorageWarning ? (
          <StatusNotice role="status" tone="warning" title="Preference not retained">
            Lightframe could not save this account-scoped onboarding preference in this browser.
          </StatusNotice>
        ) : null}

        <div data-dashboard-body css={dashboardBodyStyles(theme)}>
          <section data-continue-section aria-labelledby="continue-heading">
            <h2 id="continue-heading" css={sectionEyebrowStyles(theme)}>
              Continue Work
            </h2>
            {projectsQuery.isLoading ? (
              <div css={continueSkeletonStyles(theme)} role="status">
                <VisuallyHidden>Finding recent Project work…</VisuallyHidden>
                <Skeleton width="42%" />
                <Skeleton width="78%" height="1.45rem" />
                <Skeleton width="56%" />
              </div>
            ) : null}
            {projectsQuery.isError ? (
              <StatusNotice role="alert" tone="danger" title="Projects unavailable">
                <Button size="small" variant="quiet" onClick={() => void projectsQuery.refetch()}>
                  Retry
                </Button>
              </StatusNotice>
            ) : null}
            {continueProject ? (
              <article css={continuePanelStyles(theme)}>
                <div data-continue-copy>
                  <span data-project-context>
                    {continueProject.campaignId === null
                      ? 'No Campaign'
                      : (campaignNames.get(continueProject.campaignId) ?? 'Campaign Project')}
                  </span>
                  <h3>{continueProject.title}</h3>
                  <time dateTime={continueProject.updatedAt}>
                    Updated {formatDateTime(continueProject.updatedAt)}
                  </time>
                </div>
                <Button
                  variant="secondary"
                  aria-label={`Continue ${continueProject.title}`}
                  onClick={() => onOpenProject(continueProject.id)}
                >
                  Continue Project
                  <AppIcon name="chevronRight" width="1rem" height="1rem" />
                </Button>
              </article>
            ) : !projectsQuery.isLoading && !projectsQuery.isError ? (
              <div css={continuePanelStyles(theme)}>
                <div data-continue-copy>
                  <h3>No active Project yet</h3>
                  <p>Create one only when resumable context will help.</p>
                </div>
                <Button variant="secondary" onClick={onCreateProject}>
                  New Project
                </Button>
              </div>
            ) : null}
          </section>

          <section
            data-recent-section
            css={recentWorkStyles(theme)}
            aria-labelledby="recent-work-heading"
          >
            <header>
              <div>
                <h2 id="recent-work-heading" css={sectionEyebrowStyles(theme)}>
                  Recent Work
                </h2>
                <span css={recentCountStyles(theme)} role="status" aria-live="polite">
                  {recentCountLabel}
                </span>
              </div>
              <div css={recentFilterStyles()}>
                <SegmentedControl
                  columns={RECENT_KIND_OPTIONS.length}
                  label="Filter recent work"
                  value={recentKind}
                  options={RECENT_KIND_OPTIONS}
                  onChange={updateRecentKind}
                />
              </div>
            </header>

            {visibleErrors.map((kind) => (
              <StatusNotice
                key={kind}
                role="alert"
                tone="danger"
                title={`${recentKindLabel[kind]}s unavailable`}
              >
                <Button size="small" variant="quiet" onClick={queryState[kind].retry}>
                  Retry
                </Button>
              </StatusNotice>
            ))}

            {/*
              The skeleton list is hand-written rather than `LoadingPlaceholder`, which announces
              the load itself: this section already owns a polite region — the recent count beside
              its heading — and a second one would say the same thing twice.
            */}
            {visibleLoading ? (
              <ul css={recentSkeletonStyles(theme)} aria-hidden="true">
                {Array.from({ length: RECENT_LIMIT }, (_, index) => (
                  <li key={index}>
                    <Skeleton />
                    <Skeleton />
                    <Skeleton />
                  </li>
                ))}
              </ul>
            ) : visibleItems.length > 0 && visibleErrors.length === 0 ? (
              <ul css={recentListStyles(theme)}>
                {visibleItems.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <button type="button" onClick={item.open}>
                      <span data-recent-poster="">
                        <WorkPosterTile
                          decorative
                          playBadge={item.kind !== 'campaigns'}
                          icon={
                            item.kind === 'campaigns' ? (
                              <AppIcon name={recentKindIcon(item.kind)} />
                            ) : (
                              KIND_ICONS.video
                            )
                          }
                          thumbnailUrl={item.posterUrl}
                          emptyCaption={recentEmptyCaption(item.kind)}
                          failedCaption="Preview didn’t load"
                          label={item.title}
                          kindNoun={recentKindLabel[item.kind]}
                          unavailable={false}
                        />
                      </span>
                      <span data-recent-title>
                        <strong>{item.title}</strong>
                        <span>
                          {recentKindLabel[item.kind]} · {item.meta}
                        </span>
                      </span>
                      <time dateTime={item.updatedAt}>{formatDateTime(item.updatedAt)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            ) : !visibleLoading && visibleErrors.length === 0 ? (
              <div css={emptyRecentStyles(theme)}>
                <EmptyStatePreview variant="rows" />
                <p>{activeEmptyRecent.message}</p>
                <p data-empty-example css={emptyExampleStyles(theme)}>
                  {activeEmptyRecent.example}
                </p>
                {activeEmptyRecent.action ? (
                  <Button size="small" variant="link" onClick={activeEmptyRecent.action.run}>
                    {activeEmptyRecent.action.label}
                  </Button>
                ) : null}
              </div>
            ) : null}

            <footer css={allDestinationsStyles(theme)} aria-label="Work collections">
              <Button size="small" variant="link" onClick={onOpenProjects}>
                <AppIcon name="projects" />
                All Projects
              </Button>
              <Button size="small" variant="link" onClick={onOpenVideos}>
                <AppIcon name="video" />
                All Videos
              </Button>
              <Button size="small" variant="link" onClick={onOpenCampaigns}>
                <AppIcon name="campaigns" />
                All Campaigns
              </Button>
            </footer>
          </section>
        </div>
      </PageShell>

      <ConfirmationDialog
        open={selectedJob !== null}
        title={selectedJob ? `${jobActionLabel(selectedJob.status)}?` : 'Remove job?'}
        description="This releases Lightframe's processing slot and discards any result that arrives later."
        alert={
          abandonMutation.isError
            ? abandonMutation.error instanceof Error
              ? abandonMutation.error.message
              : 'The job could not be removed.'
            : 'The configured provider has no verified cancellation API. Provider work and cost may continue after removal.'
        }
        confirmLabel={selectedJob ? jobActionLabel(selectedJob.status) : 'Remove job'}
        cancelLabel="Keep job"
        danger
        busy={abandonMutation.isPending}
        onCancel={() => {
          if (abandonMutation.isPending) return;
          abandonMutation.reset();
          setSelectedJob(null);
        }}
        onConfirm={() => {
          if (selectedJob) abandonMutation.mutate(selectedJob.jobId);
        }}
      />
    </section>
  );
};
