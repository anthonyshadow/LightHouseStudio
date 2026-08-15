import { useTheme } from '@emotion/react';
import type { CampaignContract, ProjectContract, SavedVideoSummary } from '@studio/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { listSavedVideos } from '../../adapters/api-client/savedVideosApi';
import { Button, StatusNotice } from '../../ui';
import { useCampaignList } from '../campaigns/useCampaignsController';
import { useProjectList } from '../projects/useProjectsController';
import { savedVideoQueryKeys } from '../saved-videos/savedVideoQueryKeys';
import {
  loadDashboardOnboardingDismissed,
  persistDashboardOnboardingDismissed,
} from './dashboardOnboarding';
import {
  dashboardBodyStyles,
  dashboardHeroStyles,
  dashboardSectionStyles,
  dashboardStyles,
  onboardingStyles,
  quickActionsStyles,
  recentGridStyles,
  recentListStyles,
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

type RecentSectionProps<T> = Readonly<{
  title: string;
  items: readonly T[];
  loading: boolean;
  error: boolean;
  emptyCopy: string;
  allLabel: string;
  onOpenAll: () => void;
  onRetry: () => void;
  itemKey: (item: T) => string;
  itemTitle: (item: T) => string;
  itemMeta: (item: T) => string;
  itemUpdatedAt: (item: T) => string;
  onOpenItem: (item: T) => void;
}>;

const RecentSection = <T,>({
  title,
  items,
  loading,
  error,
  emptyCopy,
  allLabel,
  onOpenAll,
  onRetry,
  itemKey,
  itemTitle,
  itemMeta,
  itemUpdatedAt,
  onOpenItem,
}: RecentSectionProps<T>) => {
  const theme = useTheme();
  const headingId = `dashboard-${title.toLowerCase().replaceAll(' ', '-')}-heading`;
  return (
    <section css={dashboardSectionStyles(theme)} aria-labelledby={headingId}>
      <header>
        <h2 id={headingId}>{title}</h2>
        <Button size="small" variant="quiet" onClick={onOpenAll}>
          {allLabel}
        </Button>
      </header>
      {loading ? <p role="status">Loading {title.toLowerCase()}…</p> : null}
      {error ? (
        <StatusNotice role="alert" tone="danger" title={`${title} unavailable`}>
          <Button size="small" variant="quiet" onClick={onRetry}>
            Retry
          </Button>
        </StatusNotice>
      ) : null}
      {!loading && !error && items.length === 0 ? <p data-section-copy>{emptyCopy}</p> : null}
      {items.length > 0 ? (
        <ul css={recentListStyles(theme)}>
          {items.map((item) => {
            const updatedAt = itemUpdatedAt(item);
            return (
              <li key={itemKey(item)}>
                <button type="button" onClick={() => onOpenItem(item)}>
                  <span data-recent-title>
                    <strong>{itemTitle(item)}</strong>
                    <span>{itemMeta(item)}</span>
                  </span>
                  <time dateTime={updatedAt}>{formatUpdatedAt(updatedAt)}</time>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
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

  const dismissOnboarding = () => {
    const persisted = persistDashboardOnboardingDismissed(ownerUserId);
    setOnboardingVisible(false);
    setOnboardingStorageWarning(!persisted);
  };

  return (
    <section css={dashboardStyles(theme)} aria-labelledby="dashboard-heading">
      <header css={dashboardHeroStyles(theme)}>
        <div>
          <span data-dashboard-eyebrow>Welcome back, {displayName}</span>
          <h1 id="dashboard-heading" tabIndex={-1}>
            Dashboard
          </h1>
          <p>Create a video now, resume focused Project work, or organize Projects in Campaigns.</p>
        </div>
        <div data-hero-actions>
          <Button variant="primary" onClick={onCreateVideo}>
            Create video
          </Button>
          <Button variant="secondary" onClick={onOpenAssets}>
            Browse Assets
          </Button>
        </div>
      </header>

      {onboardingVisible ? (
        <aside css={onboardingStyles(theme)} aria-labelledby="dashboard-getting-started-heading">
          <div data-onboarding-copy>
            <h2 id="dashboard-getting-started-heading">Start with the outcome you need</h2>
            <p>
              Organization is optional. You can create first and decide where work belongs later.
            </p>
            <div data-onboarding-steps>
              <span data-onboarding-step>
                <strong>Create</strong>
                <span>Record or upload one video, edit it, then save it to Assets.</span>
              </span>
              <span data-onboarding-step>
                <strong>Project</strong>
                <span>
                  Keep a focused video workflow, its working state, resources, and outputs.
                </span>
              </span>
              <span data-onboarding-step>
                <strong>Campaign</strong>
                <span>Optionally group related Projects around one initiative.</span>
              </span>
            </div>
          </div>
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
        <section css={dashboardSectionStyles(theme)} aria-labelledby="continue-heading">
          <header>
            <h2 id="continue-heading">Continue</h2>
          </header>
          {projectsQuery.isLoading ? <p role="status">Finding recent work…</p> : null}
          {continueProject ? (
            <>
              <p data-section-copy>
                Resume your most recently updated active Project without changing its saved state.
              </p>
              <Button variant="primary" onClick={() => onOpenProject(continueProject.id)}>
                Continue {continueProject.title}
              </Button>
            </>
          ) : !projectsQuery.isLoading && !projectsQuery.isError ? (
            <>
              <p data-section-copy>
                No active Project yet. Create one only when resumable context helps.
              </p>
              <Button variant="secondary" onClick={onCreateProject}>
                New Project
              </Button>
            </>
          ) : null}
        </section>

        <section css={dashboardSectionStyles(theme)} aria-labelledby="quick-actions-heading">
          <header>
            <h2 id="quick-actions-heading">Start something</h2>
          </header>
          <div css={quickActionsStyles(theme)}>
            <Button variant="secondary" onClick={onCreateProject}>
              New Project
            </Button>
            <Button variant="secondary" onClick={onCreateCampaign}>
              New Campaign
            </Button>
          </div>
        </section>
      </div>

      <div css={recentGridStyles(theme)}>
        <RecentSection<ProjectContract>
          title="Projects"
          items={projects}
          loading={projectsQuery.isLoading}
          error={projectsQuery.isError}
          emptyCopy="No active Projects yet."
          allLabel="All Projects"
          onOpenAll={onOpenProjects}
          onRetry={() => void projectsQuery.refetch()}
          itemKey={(project) => project.id}
          itemTitle={(project) => project.title}
          itemMeta={(project) => (project.campaignId === null ? 'No Campaign' : 'Campaign Project')}
          itemUpdatedAt={(project) => project.updatedAt}
          onOpenItem={(project) => onOpenProject(project.id)}
        />
        <RecentSection<SavedVideoSummary>
          title="Videos"
          items={videos}
          loading={videosQuery.isLoading}
          error={videosQuery.isError}
          emptyCopy="No saved videos yet. Create or upload one when you are ready."
          allLabel="All Videos"
          onOpenAll={onOpenVideos}
          onRetry={() => void videosQuery.refetch()}
          itemKey={(video) => video.id}
          itemTitle={(video) => video.title}
          itemMeta={(video) =>
            `${video.versionCount} Version${video.versionCount === 1 ? '' : 's'}`
          }
          itemUpdatedAt={(video) => video.updatedAt}
          onOpenItem={onOpenVideos}
        />
        <RecentSection<CampaignContract>
          title="Campaigns"
          items={campaigns}
          loading={campaignsQuery.isLoading}
          error={campaignsQuery.isError}
          emptyCopy="No Campaigns yet. They are optional organizers for related Projects."
          allLabel="All Campaigns"
          onOpenAll={onOpenCampaigns}
          onRetry={() => void campaignsQuery.refetch()}
          itemKey={(campaign) => campaign.id}
          itemTitle={(campaign) => campaign.name}
          itemMeta={(campaign) => campaign.brief ?? 'No brief yet'}
          itemUpdatedAt={(campaign) => campaign.updatedAt}
          onOpenItem={(campaign) => onOpenCampaign(campaign.id)}
        />
      </div>
    </section>
  );
};
