import { useTheme } from '@emotion/react';
import type { CampaignContract, ProjectContract, SavedVideoSummary } from '@studio/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { listSavedVideos } from '../../adapters/api-client/savedVideosApi';
import { AppIcon, Button, StatusNotice } from '../../ui';
import { useCampaignList } from '../campaigns/useCampaignsController';
import { useProjectList } from '../projects/useProjectsController';
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
  quickActionsStyles,
  recentFilterStyles,
  recentListStyles,
  recentWorkStyles,
  sectionEyebrowStyles,
} from './DashboardRouteSurface.styles';

const RECENT_LIMIT = 4;

const formatUpdatedAt = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

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
  onOpenVideos: () => void;
}>;

type RecentKind = 'all' | 'projects' | 'videos' | 'campaigns';
type ItemKind = Exclude<RecentKind, 'all'>;

type RecentWorkItem = Readonly<{
  id: string;
  kind: ItemKind;
  title: string;
  meta: string;
  updatedAt: string;
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
}: DashboardRouteSurfaceProps) => {
  const theme = useTheme();
  const [onboardingVisible, setOnboardingVisible] = useState(
    () => !loadDashboardOnboardingDismissed(ownerUserId),
  );
  const [onboardingStorageWarning, setOnboardingStorageWarning] = useState(false);
  const [recentKind, setRecentKind] = useState<RecentKind>('all');
  const projectsQuery = useProjectList('active');
  const campaignsQuery = useCampaignList('active');
  const videosQuery = useInfiniteQuery({
    queryKey: [...savedVideoQueryKeys.lists, { dashboard: true, sort: 'latest' }],
    queryFn: ({ pageParam, signal }) =>
      listSavedVideos({
        ...(pageParam ? { cursor: pageParam } : {}),
        sort: 'latest',
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
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
  const recentItems = useMemo<readonly RecentWorkItem[]>(
    () =>
      [
        ...projects.map((project: ProjectContract) => ({
          id: project.id,
          kind: 'projects' as const,
          title: project.title,
          meta: project.campaignId === null ? 'No Campaign' : 'Campaign Project',
          updatedAt: project.updatedAt,
          open: () => onOpenProject(project.id),
        })),
        ...videos.map((video: SavedVideoSummary) => ({
          id: video.id,
          kind: 'videos' as const,
          title: video.title,
          meta: `${video.versionCount} Version${video.versionCount === 1 ? '' : 's'}`,
          updatedAt: video.updatedAt,
          open: onOpenVideos,
        })),
        ...campaigns.map((campaign: CampaignContract) => ({
          id: campaign.id,
          kind: 'campaigns' as const,
          title: campaign.name,
          meta: campaign.brief ?? 'No brief yet',
          updatedAt: campaign.updatedAt,
          open: () => onOpenCampaign(campaign.id),
        })),
      ].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
    [campaigns, onOpenCampaign, onOpenProject, onOpenVideos, projects, videos],
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

  const dismissOnboarding = () => {
    const persisted = persistDashboardOnboardingDismissed(ownerUserId);
    setOnboardingVisible(false);
    setOnboardingStorageWarning(!persisted);
  };

  const emptyMessage =
    recentKind === 'projects'
      ? 'No active Projects yet. Create one when resumable context will help.'
      : recentKind === 'videos'
        ? 'No saved Videos yet. Create or upload one when you are ready.'
        : recentKind === 'campaigns'
          ? 'No Campaigns yet. They are optional organizers for related Projects.'
          : 'No recent work yet. Start with a standalone video and organize it later if needed.';
  const emptyAction =
    recentKind === 'projects'
      ? { label: 'New Project', run: onCreateProject }
      : recentKind === 'campaigns'
        ? { label: 'New Campaign', run: onCreateCampaign }
        : { label: 'Create video', run: onCreateVideo };

  return (
    <section css={dashboardStyles(theme)} aria-labelledby="dashboard-heading">
      <header css={dashboardHeaderStyles(theme)}>
        <div>
          <span data-dashboard-eyebrow title={`Welcome back, ${displayName}`}>
            Authenticated Studio
          </span>
          <h1 id="dashboard-heading" aria-label="Dashboard" tabIndex={-1}>
            Momentum Workspace
          </h1>
          <p>Resume focused Project work or start a standalone video.</p>
        </div>
        <div data-dashboard-actions>
          <Button variant="primary" onClick={onCreateVideo}>
            Create video
          </Button>
          <Button variant="quiet" onClick={onOpenAssets}>
            Browse Assets
          </Button>
        </div>
      </header>

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
                  Updated {formatUpdatedAt(continueProject.updatedAt)}
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

          <section aria-labelledby="start-new-heading">
            <h2 id="start-new-heading" css={sectionEyebrowStyles(theme)}>
              Start New
            </h2>
            <div css={quickActionsStyles(theme)}>
              <Button variant="quiet" onClick={onCreateProject}>
                <AppIcon name="projects" />
                New Project
              </Button>
              <Button variant="quiet" onClick={onCreateCampaign}>
                <AppIcon name="campaigns" />
                New Campaign
              </Button>
            </div>
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
                    <AppIcon name={recentKindIcon(item.kind)} data-recent-icon />
                    <span data-recent-title>
                      <strong>{item.title}</strong>
                      <span>
                        {recentKindLabel[item.kind]} · {item.meta}
                      </span>
                    </span>
                    <time dateTime={item.updatedAt}>{formatUpdatedAt(item.updatedAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          ) : !visibleLoading && visibleErrors.length === 0 ? (
            <div css={emptyRecentStyles(theme)}>
              <p>{emptyMessage}</p>
              <Button size="small" variant="quiet" onClick={emptyAction.run}>
                {emptyAction.label}
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
    </section>
  );
};
