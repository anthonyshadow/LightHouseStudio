import { useTheme } from '@emotion/react';
import type {
  CampaignContract,
  ProjectContract,
  SavedVideoSummary,
  VideoJobQueueItem,
} from '@studio/contracts';
import { formatDate, formatDateTime } from '@studio/domain';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { listSavedVideos, savedVideoThumbnailUrl } from '../../adapters/api-client/savedVideosApi';
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
  PageHeader,
  PageShell,
  StatusNotice,
} from '../../ui';
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
  dashboardBodyStyles,
  dashboardHeaderStyles,
  dashboardStyles,
  emptyRecentStyles,
  onboardingStyles,
  processingQueueStyles,
  recentFilterStyles,
  recentListStyles,
  recentWorkStyles,
  sectionEyebrowStyles,
} from './DashboardRouteSurface.styles';

const RECENT_LIMIT = 4;

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

/**
 * What a row says when it has no poster.
 *
 * A Campaign never has one — it organizes Projects rather than producing video — so saying "no
 * preview yet" there would describe a wait that is never coming.
 */
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
  const [onboardingVisible, setOnboardingVisible] = useState(
    () => !loadDashboardOnboardingDismissed(ownerUserId),
  );
  const [onboardingStorageWarning, setOnboardingStorageWarning] = useState(false);
  const [recentKind, setRecentKind] = useState<RecentKind>('all');
  const [selectedJob, setSelectedJob] = useState<VideoJobQueueItem | null>(null);
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
  const recentItems = useMemo<readonly RecentWorkItem[]>(
    () =>
      [
        ...projects.map((project: ProjectContract) => ({
          id: project.id,
          kind: 'projects' as const,
          title: project.title,
          meta: project.campaignId === null ? 'No Campaign' : 'Campaign Project',
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
          // The list response already says whether a poster exists, so no row asks for one blindly.
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
    [campaigns, onOpenCampaign, onOpenProject, onOpenVideo, projectPosters, projects, videos],
  );
  const visibleItems = recentItems
    .filter((item) => recentKind === 'all' || item.kind === recentKind)
    .slice(0, RECENT_LIMIT);
  const visibleKinds: readonly ItemKind[] =
    recentKind === 'all' ? ['projects', 'videos', 'campaigns'] : [recentKind];
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
  const queueJobs = processingQueueQuery.data?.jobs ?? [];
  const queueActive = queueJobs.length > 0;

  const dismissOnboarding = () => {
    const persisted = persistDashboardOnboardingDismissed(ownerUserId);
    setOnboardingVisible(false);
    setOnboardingStorageWarning(!persisted);
  };

  // One entry per filter so a new kind cannot update its message without its example and action.
  const emptyRecent = {
    all: {
      message: 'No recent work yet. Start with a standalone video and organize it later if needed.',
      example:
        'Your latest Videos, Projects and Campaigns will line up here once you make something.',
      action: { label: 'Create video', run: onCreateVideo },
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
  }[recentKind];

  return (
    <section css={dashboardStyles(theme)} aria-labelledby="dashboard-heading">
      <PageShell css={dashboardHeaderStyles(theme)}>
        <PageHeader
          eyebrow={`Welcome back, ${displayName}`}
          title="Dashboard"
          headingId="dashboard-heading"
          description="Resume focused Project work or start a standalone video."
          actions={
            <div data-dashboard-actions>
              <Button variant="primary" onClick={onCreateVideo}>
                Create video
              </Button>
              <Button variant="quiet" onClick={onOpenAssets}>
                Browse Assets
              </Button>
            </div>
          }
        />

        {onboardingVisible ? (
          <aside css={onboardingStyles(theme)} aria-labelledby="dashboard-getting-started-heading">
            <h2 id="dashboard-getting-started-heading" data-onboarding-heading>
              Start with the outcome you need
            </h2>
            <AppIcon name="info" data-onboarding-icon />
            <p>
              Organization is optional. Use <strong>Projects</strong> for focused workflows and{' '}
              <strong>Campaigns</strong> to group initiatives.
            </p>
            <Button size="small" variant="quiet" onClick={dismissOnboarding}>
              Got it
            </Button>
          </aside>
        ) : null}
        {onboardingStorageWarning ? (
          <StatusNotice role="status" tone="warning" title="Preference not retained">
            Lightframe could not save this account-scoped onboarding preference in this browser.
          </StatusNotice>
        ) : null}

        <div css={dashboardBodyStyles(theme)}>
          <div data-dashboard-primary-column>
            <section aria-labelledby="continue-heading">
              <h2 id="continue-heading" css={sectionEyebrowStyles(theme)}>
                Continue Work
              </h2>
              {projectsQuery.isLoading ? <p role="status">Finding recent work…</p> : null}
              {projectsQuery.isError ? (
                <StatusNotice role="alert" tone="danger" title="Projects unavailable">
                  <Button size="small" variant="quiet" onClick={() => void projectsQuery.refetch()}>
                    Retry
                  </Button>
                </StatusNotice>
              ) : null}
              {continueProject ? (
                <article css={continuePanelStyles(theme)}>
                  <span data-project-context>
                    {continueProject.campaignId === null ? 'No Campaign' : 'Campaign Project'}
                  </span>
                  <h3>{continueProject.title}</h3>
                  <time dateTime={continueProject.updatedAt}>
                    Updated {formatDate(continueProject.updatedAt)}
                  </time>
                  <Button
                    variant="primary"
                    aria-label={`Continue ${continueProject.title}`}
                    onClick={() => onOpenProject(continueProject.id)}
                  >
                    Continue Project
                    <AppIcon name="chevronRight" width="1rem" height="1rem" />
                  </Button>
                </article>
              ) : !projectsQuery.isLoading && !projectsQuery.isError ? (
                <div css={continuePanelStyles(theme)} data-empty="true">
                  <h3>No active Project yet</h3>
                  <p>Create one only when resumable context will help.</p>
                  <Button variant="secondary" onClick={onCreateProject}>
                    New Project
                  </Button>
                </div>
              ) : null}
            </section>
          </div>

          <section css={recentWorkStyles(theme)} aria-labelledby="recent-work-heading">
            <header>
              <h2 id="recent-work-heading" css={sectionEyebrowStyles(theme)}>
                Recent Work
              </h2>
              <div role="group" aria-label="Filter recent work" css={recentFilterStyles(theme)}>
                {(['all', 'videos', 'projects', 'campaigns'] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={recentKind === kind}
                    onClick={() => setRecentKind(kind)}
                  >
                    {kind === 'all' ? 'All' : `${kind[0]?.toUpperCase()}${kind.slice(1)}`}
                  </button>
                ))}
              </div>
            </header>

            {visibleLoading ? <p role="status">Loading recent work…</p> : null}
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

            {visibleItems.length > 0 ? (
              <ul css={recentListStyles(theme)}>
                {visibleItems.map((item) => (
                  <li key={`${item.kind}-${item.id}`}>
                    <button type="button" onClick={item.open}>
                      <span data-recent-poster="">
                        {/* Decorative: the button's own text already names the work. */}
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
                      <time dateTime={item.updatedAt}>{formatDate(item.updatedAt)}</time>
                    </button>
                  </li>
                ))}
              </ul>
            ) : !visibleLoading && visibleErrors.length === 0 ? (
              <div css={emptyRecentStyles(theme)}>
                <EmptyStatePreview variant="rows" />
                <p>{emptyRecent.message}</p>
                <p data-empty-example css={emptyExampleStyles(theme)}>
                  {emptyRecent.example}
                </p>
                <Button size="small" variant="quiet" onClick={emptyRecent.action.run}>
                  {emptyRecent.action.label}
                </Button>
              </div>
            ) : null}

            <footer css={allDestinationsStyles(theme)}>
              <Button size="small" variant="quiet" onClick={onOpenProjects}>
                All Projects
              </Button>
              <Button size="small" variant="quiet" onClick={onOpenVideos}>
                All Videos
              </Button>
              <Button size="small" variant="quiet" onClick={onOpenCampaigns}>
                All Campaigns
              </Button>
            </footer>
          </section>
        </div>

        <section
          css={processingQueueStyles(theme)}
          data-queue-state={queueActive ? 'active' : 'idle'}
          aria-labelledby="processing-queue-heading"
        >
          <header>
            <div data-queue-summary>
              <h2 id="processing-queue-heading">Processing Queue</h2>
              {queueActive ? <p>Queued and active provider video edits for this account.</p> : null}
              {processingQueueQuery.isLoading ? (
                <p role="status">Checking processing jobs…</p>
              ) : null}
              {!queueActive && !processingQueueQuery.isLoading && !processingQueueQuery.isError ? (
                <p data-empty-queue>No queued or active video jobs.</p>
              ) : null}
            </div>
            <Button
              size="small"
              variant="quiet"
              disabled={processingQueueQuery.isFetching}
              onClick={() => void processingQueueQuery.refetch()}
            >
              Refresh
            </Button>
          </header>
          {processingQueueQuery.isError ? (
            <StatusNotice role="alert" tone="danger" title="Processing queue unavailable">
              <Button
                size="small"
                variant="quiet"
                onClick={() => void processingQueueQuery.refetch()}
              >
                Retry
              </Button>
            </StatusNotice>
          ) : null}
          {queueNotice ? (
            <StatusNotice role="status" tone="success" title="Processing slot released">
              {queueNotice}
            </StatusNotice>
          ) : null}
          {queueActive ? (
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
          ) : null}
        </section>
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
