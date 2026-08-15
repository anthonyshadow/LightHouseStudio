import { useTheme } from '@emotion/react';
import type { CampaignContract, ProjectContract } from '@studio/contracts';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { APP_PATHS, campaignIdFromPath, campaignPath, projectPath } from '../../app/paths';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import {
  detailHeaderStyles,
  dialogActionsStyles,
  emptyListStyles,
  listSectionStyles,
  statusPillStyles,
  workspaceHeaderStyles,
  workspaceInnerStyles,
  workspaceStyles,
} from '../projects/ProjectRouteSurface.styles';
import { NewProjectDialog } from '../projects/ProjectDialogs';
import { useProjectList } from '../projects/useProjectsController';
import {
  campaignBriefStyles,
  campaignCardStyles,
  campaignGridStyles,
  projectGroupStyles,
} from './CampaignRouteSurface.styles';
import {
  CampaignFormDialog,
  MoveProjectDialog,
  safeCampaignError as safeError,
} from './CampaignDialogs';
import { CampaignApiConflictError } from './campaignsApi';
import {
  useCampaignDetail,
  useCampaignList,
  useCampaignsController,
} from './useCampaignsController';

const formatUpdatedAt = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));

const CampaignListSection = ({ lifecycle }: { readonly lifecycle: 'active' | 'archived' }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const query = useCampaignList(lifecycle);
  const campaigns = useMemo(
    () => query.data?.pages.flatMap((page) => page.campaigns) ?? [],
    [query.data],
  );
  const archived = lifecycle === 'archived';
  return (
    <section css={listSectionStyles(theme)} aria-labelledby={`${lifecycle}-campaigns-heading`}>
      <header>
        <h3 id={`${lifecycle}-campaigns-heading`}>{archived ? 'Archived' : 'Active Campaigns'}</h3>
        <span>{campaigns.length} loaded</span>
      </header>
      {query.isPending ? <p role="status">Loading {lifecycle} Campaigns…</p> : null}
      {query.isError ? (
        <StatusNotice role="alert" tone="danger" title="Campaigns unavailable">
          <p>{safeError(query.error)}</p>
          <Button size="small" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </StatusNotice>
      ) : null}
      {!query.isPending && !query.isError && campaigns.length === 0 ? (
        <div css={emptyListStyles(theme)}>
          <strong>{archived ? 'No archived Campaigns' : 'No Campaigns yet'}</strong>
          <p>
            {archived
              ? 'Archived Campaigns remain available here until explicitly deleted.'
              : 'Create a lightweight organizer, or keep using standalone Projects.'}
          </p>
        </div>
      ) : null}
      {campaigns.length > 0 ? (
        <ul
          css={campaignGridStyles(theme)}
          aria-label={`${archived ? 'Archived' : 'Active'} Campaigns`}
        >
          {campaigns.map((campaign) => (
            <li key={campaign.id}>
              <article css={campaignCardStyles(theme)}>
                <div>
                  <h4>{campaign.name}</h4>
                  <p>{campaign.brief ?? 'No brief yet.'}</p>
                  <small>
                    Updated{' '}
                    <time dateTime={campaign.updatedAt}>{formatUpdatedAt(campaign.updatedAt)}</time>
                  </small>
                </div>
                <div data-campaign-actions>
                  <Button
                    size="small"
                    variant="primary"
                    onClick={() => void navigate(campaignPath(campaign.id))}
                  >
                    Open
                  </Button>
                  <span css={statusPillStyles(theme, archived)}>
                    {archived ? 'Archived' : 'Active'}
                  </span>
                </div>
              </article>
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
          Load more {lifecycle} Campaigns
        </Button>
      ) : null}
    </section>
  );
};

const CampaignsWorkspace = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [creating, setCreating] = useState(false);
  const routeCreateRequested =
    (location.state as { readonly createIntent?: string } | null)?.createIntent === 'campaign';
  const setHeadingRef = useCallback(
    (node: HTMLHeadingElement | null) => {
      headingRef.current = node;
      if (routeCreateRequested) returnFocusRef.current = node;
    },
    [routeCreateRequested],
  );
  const closeCreateDialog = () => {
    setCreating(false);
    if (routeCreateRequested) {
      void navigate(location.pathname, { replace: true, state: null });
    }
  };

  return (
    <div css={workspaceInnerStyles(theme)}>
      <header css={workspaceHeaderStyles(theme)}>
        <div>
          <h1 ref={setHeadingRef} tabIndex={-1}>
            Campaigns
          </h1>
          <p>
            Group related Projects around an initiative with only a name and optional brief.
            Campaigns stay optional, so standalone Quick Start remains available in Projects.
          </p>
        </div>
        <Button
          variant="primary"
          onClick={(event) => {
            returnFocusRef.current = event.currentTarget;
            setCreating(true);
          }}
        >
          Create Campaign
        </Button>
      </header>
      <CampaignListSection lifecycle="active" />
      <CampaignListSection lifecycle="archived" />
      {creating || routeCreateRequested ? (
        <CampaignFormDialog
          returnFocusRef={returnFocusRef}
          onClose={closeCreateDialog}
          onSaved={(campaign) =>
            void navigate(campaignPath(campaign.id), {
              state: { campaignCreated: campaign.id },
            })
          }
        />
      ) : null}
    </div>
  );
};

const CampaignProjectGroup = ({
  campaign,
  lifecycle,
  onMove,
}: {
  readonly campaign: CampaignContract;
  readonly lifecycle: 'active' | 'archived';
  readonly onMove: (project: ProjectContract, trigger: HTMLButtonElement) => void;
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const query = useProjectList(lifecycle, campaign.id);
  const projects = useMemo(
    () => query.data?.pages.flatMap((page) => page.projects) ?? [],
    [query.data],
  );
  return (
    <section css={projectGroupStyles(theme)} aria-labelledby={`${lifecycle}-campaign-projects`}>
      <header>
        <h3 id={`${lifecycle}-campaign-projects`}>
          {lifecycle === 'active' ? 'Active Projects' : 'Archived Projects'}
        </h3>
        <span>{projects.length} loaded</span>
      </header>
      {query.isPending ? <p role="status">Loading {lifecycle} Projects…</p> : null}
      {query.isError ? (
        <StatusNotice role="alert" tone="danger" title="Projects unavailable">
          {safeError(query.error)}
        </StatusNotice>
      ) : null}
      {!query.isPending && !query.isError && projects.length === 0 ? (
        <div css={emptyListStyles(theme)}>
          <strong>No {lifecycle} Projects</strong>
          <p>
            Projects added to this Campaign appear here without changing their creative history.
          </p>
        </div>
      ) : null}
      {projects.length > 0 ? (
        <ul
          aria-label={`${lifecycle === 'active' ? 'Active' : 'Archived'} Projects in ${campaign.name}`}
        >
          {projects.map((project) => (
            <li key={project.id}>
              <article>
                <h4>{project.title}</h4>
                <div data-project-actions>
                  <Button
                    size="small"
                    variant="primary"
                    onClick={() => void navigate(projectPath(project.id))}
                  >
                    Open
                  </Button>
                  <Button size="small" onClick={(event) => onMove(project, event.currentTarget)}>
                    Move or detach
                  </Button>
                </div>
              </article>
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
          Load more {lifecycle} Projects
        </Button>
      ) : null}
    </section>
  );
};

type CampaignDialog = 'edit' | 'archive' | 'restore' | 'tombstone';

const CampaignDetail = ({ campaignId }: { readonly campaignId: string }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const query = useCampaignDetail(campaignId);
  const campaigns = useCampaignsController();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<CampaignDialog | null>(null);
  const [moveProject, setMoveProject] = useState<ProjectContract | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creatingCampaign, setCreatingCampaign] = useState(false);
  const createdCampaignId = (location.state as { readonly campaignCreated?: unknown } | null)
    ?.campaignCreated;
  const showCreatedNextStep = createdCampaignId === campaignId;
  const dismissCreatedNextStep = () => {
    void navigate(location.pathname, { replace: true, state: null });
  };
  if (query.isPending)
    return (
      <div css={workspaceInnerStyles(theme)}>
        <p role="status">Loading Campaign…</p>
      </div>
    );
  if (query.isError) {
    return (
      <div css={workspaceInnerStyles(theme)}>
        <StatusNotice role="alert" tone="danger" title="Campaign unavailable">
          <p>{safeError(query.error)}</p>
          <Button variant="quiet" onClick={() => void navigate(APP_PATHS.campaigns)}>
            Back to Campaigns
          </Button>
        </StatusNotice>
      </div>
    );
  }
  const campaign = query.data;
  const archived = campaign.status === 'archived';
  const openDialog = (next: CampaignDialog, trigger: HTMLButtonElement) => {
    returnFocusRef.current = trigger;
    setActionError(null);
    setDialog(next);
  };
  const changeLifecycle = async () => {
    if (dialog !== 'archive' && dialog !== 'restore') return;
    setActionError(null);
    try {
      const updated = await (dialog === 'archive'
        ? campaigns.archiveMutation.mutateAsync({ campaignId, expectedVersion: campaign.version })
        : campaigns.restoreMutation.mutateAsync({ campaignId, expectedVersion: campaign.version }));
      setAnnouncement(
        `${updated.name} ${dialog === 'archive' ? 'archived' : 'restored'}. Projects remain intact.`,
      );
      setDialog(null);
      window.requestAnimationFrame(() => headingRef.current?.focus());
    } catch (caught) {
      setActionError(safeError(caught));
    }
  };
  const tombstone = async () => {
    setActionError(null);
    try {
      await campaigns.tombstoneMutation.mutateAsync({
        campaignId,
        expectedVersion: campaign.version,
      });
      void navigate(APP_PATHS.campaigns, { replace: true });
    } catch (caught) {
      const blocked =
        caught instanceof CampaignApiConflictError && caught.conflict.kind === 'campaign-not-empty';
      setActionError(
        blocked
          ? 'Move or detach every active and archived Project before deleting this Campaign.'
          : safeError(caught),
      );
    }
  };
  return (
    <div css={workspaceInnerStyles(theme)}>
      <header css={detailHeaderStyles(theme)}>
        <Button
          data-detail-breadcrumb
          variant="quiet"
          onClick={() => void navigate(APP_PATHS.campaigns)}
        >
          ← All Campaigns
        </Button>
        <div data-detail-identity>
          <div>
            <h1 ref={headingRef} tabIndex={-1}>
              {campaign.name}
            </h1>
            <div data-detail-meta>
              <span css={statusPillStyles(theme, archived)}>
                {archived ? 'Archived' : 'Active'}
              </span>
              <span>
                Updated{' '}
                <time dateTime={campaign.updatedAt}>{formatUpdatedAt(campaign.updatedAt)}</time>
              </span>
            </div>
            <p css={campaignBriefStyles(theme)}>{campaign.brief ?? 'No brief yet.'}</p>
          </div>
          <div data-detail-actions>
            {!archived ? (
              <Button
                variant="primary"
                onClick={(event) => {
                  returnFocusRef.current = event.currentTarget;
                  setCreatingProject(true);
                }}
              >
                New Project
              </Button>
            ) : null}
            <Button
              onClick={(event) => {
                returnFocusRef.current = event.currentTarget;
                setCreatingCampaign(true);
              }}
            >
              Create another Campaign
            </Button>
            <Button onClick={(event) => openDialog('edit', event.currentTarget)}>Edit</Button>
            <Button
              variant={archived ? 'primary' : 'danger'}
              onClick={(event) => openDialog(archived ? 'restore' : 'archive', event.currentTarget)}
            >
              {archived ? 'Restore' : 'Archive'}
            </Button>
            {archived ? (
              <Button
                variant="danger"
                onClick={(event) => openDialog('tombstone', event.currentTarget)}
              >
                Delete Campaign
              </Button>
            ) : null}
          </div>
        </div>
      </header>
      <div role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {showCreatedNextStep && !archived ? (
        <StatusNotice tone="success" title="Campaign created">
          <p>Create the first Project in {campaign.name}, or continue organizing later.</p>
          <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.sm }}>
            <Button
              variant="primary"
              onClick={(event) => {
                returnFocusRef.current = event.currentTarget;
                dismissCreatedNextStep();
                setCreatingProject(true);
              }}
            >
              Create Project in Campaign
            </Button>
            <Button variant="quiet" onClick={dismissCreatedNextStep}>
              Not now
            </Button>
          </div>
        </StatusNotice>
      ) : null}
      {actionError && dialog === null ? (
        <StatusNotice role="alert" tone="danger" title="Action not completed">
          {actionError}
        </StatusNotice>
      ) : null}
      {archived ? (
        <StatusNotice tone="warning" title="Campaign archived">
          Its Projects remain intact and openable. Restore this Campaign before adding or moving
          Projects into it.
        </StatusNotice>
      ) : null}
      <CampaignProjectGroup
        campaign={campaign}
        lifecycle="active"
        onMove={(project, trigger) => {
          returnFocusRef.current = trigger;
          setMoveProject(project);
        }}
      />
      <CampaignProjectGroup
        campaign={campaign}
        lifecycle="archived"
        onMove={(project, trigger) => {
          returnFocusRef.current = trigger;
          setMoveProject(project);
        }}
      />
      {dialog === 'edit' ? (
        <CampaignFormDialog
          campaign={campaign}
          returnFocusRef={returnFocusRef}
          onClose={() => setDialog(null)}
          onSaved={(updated) => {
            setAnnouncement(`${updated.name} updated.`);
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === 'archive' || dialog === 'restore' ? (
        <OverlayPanel
          open
          onClose={() => setDialog(null)}
          title={`${dialog === 'archive' ? 'Archive' : 'Restore'} Campaign`}
          description={
            dialog === 'archive'
              ? 'Archiving only changes Campaign visibility. It does not archive or move Projects.'
              : 'Restoring allows new and moved Project membership again.'
          }
          placement="bottom"
          size="standard"
          closeDisabled={campaigns.archiveMutation.isPending || campaigns.restoreMutation.isPending}
          closeOnBackdrop={false}
          returnFocusRef={returnFocusRef}
          footer={
            <div css={dialogActionsStyles(theme)}>
              <Button variant="quiet" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant={dialog === 'archive' ? 'danger' : 'primary'}
                busy={campaigns.archiveMutation.isPending || campaigns.restoreMutation.isPending}
                onClick={() => void changeLifecycle()}
              >
                {dialog === 'archive' ? 'Archive Campaign' : 'Restore Campaign'}
              </Button>
            </div>
          }
        >
          <p>
            {dialog === 'archive'
              ? `Archive “${campaign.name}”? Its Projects remain intact.`
              : `Restore “${campaign.name}”?`}
          </p>
          {actionError ? (
            <StatusNotice role="alert" tone="danger" title="Change not applied">
              {actionError}
            </StatusNotice>
          ) : null}
        </OverlayPanel>
      ) : null}
      {dialog === 'tombstone' ? (
        <OverlayPanel
          open
          onClose={() => setDialog(null)}
          title="Delete Campaign"
          description="Only an archived empty Campaign can be deleted. No Project or content bytes are erased."
          placement="bottom"
          size="standard"
          closeDisabled={campaigns.tombstoneMutation.isPending}
          closeOnBackdrop={false}
          returnFocusRef={returnFocusRef}
          footer={
            <div css={dialogActionsStyles(theme)}>
              <Button variant="quiet" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant="danger"
                busy={campaigns.tombstoneMutation.isPending}
                onClick={() => void tombstone()}
              >
                Confirm Delete Campaign
              </Button>
            </div>
          }
        >
          <p>
            Delete “{campaign.name}” as an organizer? This does not erase Project or content bytes.
          </p>
          {actionError ? (
            <StatusNotice role="alert" tone="warning" title="Campaign not deleted">
              {actionError}
            </StatusNotice>
          ) : null}
        </OverlayPanel>
      ) : null}
      {moveProject ? (
        <MoveProjectDialog
          project={moveProject}
          currentCampaign={campaign}
          returnFocusRef={returnFocusRef}
          onClose={() => setMoveProject(null)}
          onMoved={(message) => {
            setAnnouncement(message);
            setMoveProject(null);
          }}
        />
      ) : null}
      {creatingProject ? (
        <NewProjectDialog
          defaultCampaignId={campaign.id}
          campaignLocked
          returnFocusRef={returnFocusRef}
          onClose={() => setCreatingProject(false)}
          onCreated={(current) => void navigate(projectPath(current.project.id))}
        />
      ) : null}
      {creatingCampaign ? (
        <CampaignFormDialog
          returnFocusRef={returnFocusRef}
          onClose={() => setCreatingCampaign(false)}
          onSaved={(created) =>
            void navigate(campaignPath(created.id), {
              state: { campaignCreated: created.id },
            })
          }
        />
      ) : null}
    </div>
  );
};

export const CampaignRouteSurface = () => {
  const theme = useTheme();
  const location = useLocation();
  const campaignId = campaignIdFromPath(location.pathname);
  const routeRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (routeRef.current) routeRef.current.scrollTop = 0;
  }, [location.pathname]);
  return (
    <div ref={routeRef} css={workspaceStyles(theme)} data-campaign-route="">
      {campaignId === null ? <CampaignsWorkspace /> : <CampaignDetail campaignId={campaignId} />}
    </div>
  );
};
