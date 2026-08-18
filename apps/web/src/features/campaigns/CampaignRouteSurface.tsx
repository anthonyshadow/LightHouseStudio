import { useTheme } from '@emotion/react';
import type { CampaignContract, ProjectContract } from '@studio/contracts';
import { formatDate } from '@studio/domain';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { APP_PATHS, campaignIdFromPath, campaignPath, projectPath } from '../../app/paths';
import { useRouteBack } from '../../app/useRouteBack';
import { Button, StatusNotice } from '../../ui';
import {
  detailHeaderStyles,
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
  campaignCardMetaStyles,
  campaignCardStyles,
  campaignGridStyles,
  projectGroupStyles,
} from './CampaignRouteSurface.styles';
import {
  CampaignFormDialog,
  CampaignLifecycleDialog,
  DeleteCampaignDialog,
  MoveProjectDialog,
  safeCampaignError as safeError,
  type CampaignLifecycleAction,
} from './CampaignDialogs';
import { useCampaignDetail, useCampaignList } from './useCampaignsController';

interface CampaignListSectionProps {
  readonly lifecycle: 'active' | 'archived';
  readonly onOpen: (campaign: CampaignContract) => void;
  readonly onEdit: (campaign: CampaignContract, trigger: HTMLButtonElement) => void;
  readonly onLifecycle: (
    action: CampaignLifecycleAction,
    campaign: CampaignContract,
    trigger: HTMLButtonElement,
  ) => void;
  readonly onDelete: (campaign: CampaignContract, trigger: HTMLButtonElement) => void;
}

const CampaignListSection = ({
  lifecycle,
  onOpen,
  onEdit,
  onLifecycle,
  onDelete,
}: CampaignListSectionProps) => {
  const theme = useTheme();
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
                  {/* Status is metadata, not an action — and the action row now holds up to four
                      buttons, which must stay reflowable at 200% text on a small screen. A span,
                      not a p: the card's `& p` rule would otherwise line-clamp and mute the pill. */}
                  <div css={campaignCardMetaStyles(theme)}>
                    <small>
                      Updated{' '}
                      <time dateTime={campaign.updatedAt}>{formatDate(campaign.updatedAt)}</time>
                    </small>
                    <span css={statusPillStyles(theme, archived)}>
                      {archived ? 'Archived' : 'Active'}
                    </span>
                  </div>
                </div>
                <div data-campaign-actions>
                  <Button
                    size="small"
                    variant="primary"
                    data-campaign-action="open"
                    onClick={() => onOpen(campaign)}
                  >
                    Open
                  </Button>
                  {!archived ? (
                    <Button
                      size="small"
                      data-campaign-action="edit"
                      onClick={(event) => onEdit(campaign, event.currentTarget)}
                    >
                      Edit
                    </Button>
                  ) : null}
                  <Button
                    size="small"
                    variant={archived ? 'secondary' : 'quiet'}
                    data-campaign-action={archived ? 'restore' : 'archive'}
                    onClick={(event) =>
                      onLifecycle(archived ? 'restore' : 'archive', campaign, event.currentTarget)
                    }
                  >
                    {archived ? 'Restore' : 'Archive'}
                  </Button>
                  {archived ? (
                    <Button
                      size="small"
                      variant="danger"
                      data-campaign-action="delete"
                      onClick={(event) => onDelete(campaign, event.currentTarget)}
                    >
                      Delete
                    </Button>
                  ) : null}
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
  const [editCampaign, setEditCampaign] = useState<CampaignContract | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    readonly action: CampaignLifecycleAction;
    readonly campaign: CampaignContract;
  } | null>(null);
  const [deleteCampaign, setDeleteCampaign] = useState<CampaignContract | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const routeCreateRequested =
    (location.state as { readonly createIntent?: string } | null)?.createIntent === 'campaign';
  const setHeadingRef = useCallback(
    (node: HTMLHeadingElement | null) => {
      headingRef.current = node;
      if (routeCreateRequested) returnFocusRef.current = node;
    },
    [routeCreateRequested],
  );
  /**
   * Drops `createIntent` from this history entry. Every path that closes the dialog must call it —
   * a successful create used to skip it, so Back from the new Campaign re-opened the dialog over a
   * list that already contained it.
   */
  const clearRouteCreateIntent = () => {
    if (routeCreateRequested) void navigate(location.pathname, { replace: true, state: null });
  };
  const closeCreateDialog = () => {
    setCreating(false);
    clearRouteCreateIntent();
  };
  const closeDialog = () => {
    setEditCampaign(null);
    setLifecycleDialog(null);
    setDeleteCampaign(null);
  };
  const finishDialog = (message: string) => {
    closeDialog();
    setAnnouncement(message);
    window.requestAnimationFrame(() => headingRef.current?.focus());
  };
  const openWithReturnFocus = (trigger: HTMLButtonElement, open: () => void) => {
    returnFocusRef.current = trigger;
    open();
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
      <div role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      {(['active', 'archived'] as const).map((lifecycle) => (
        <CampaignListSection
          key={lifecycle}
          lifecycle={lifecycle}
          onOpen={(campaign) => void navigate(campaignPath(campaign.id))}
          onEdit={(campaign, trigger) =>
            openWithReturnFocus(trigger, () => setEditCampaign(campaign))
          }
          onLifecycle={(action, campaign, trigger) =>
            openWithReturnFocus(trigger, () => setLifecycleDialog({ action, campaign }))
          }
          onDelete={(campaign, trigger) =>
            openWithReturnFocus(trigger, () => setDeleteCampaign(campaign))
          }
        />
      ))}
      {creating || routeCreateRequested ? (
        <CampaignFormDialog
          returnFocusRef={returnFocusRef}
          onClose={closeCreateDialog}
          onSaved={(campaign) => {
            clearRouteCreateIntent();
            void navigate(campaignPath(campaign.id), {
              state: { campaignCreated: campaign.id },
            });
          }}
        />
      ) : null}
      {editCampaign ? (
        <CampaignFormDialog
          campaign={editCampaign}
          returnFocusRef={returnFocusRef}
          onClose={closeDialog}
          onSaved={(saved) => finishDialog(`${saved.name} updated.`)}
        />
      ) : null}
      {lifecycleDialog ? (
        <CampaignLifecycleDialog
          action={lifecycleDialog.action}
          campaign={lifecycleDialog.campaign}
          returnFocusRef={returnFocusRef}
          onClose={closeDialog}
          onChanged={(updated, action) =>
            finishDialog(
              `${updated.name} ${action === 'archive' ? 'archived' : 'restored'}. Projects remain intact.`,
            )
          }
        />
      ) : null}
      {deleteCampaign ? (
        <DeleteCampaignDialog
          campaign={deleteCampaign}
          returnFocusRef={returnFocusRef}
          onClose={closeDialog}
          onDeleted={(name) => finishDialog(`${name} deleted.`)}
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
  const goBack = useRouteBack();
  const location = useLocation();
  const query = useCampaignDetail(campaignId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<CampaignDialog | null>(null);
  const [moveProject, setMoveProject] = useState<ProjectContract | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [creatingProject, setCreatingProject] = useState(false);
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
          <Button variant="quiet" onClick={() => goBack(APP_PATHS.campaigns)}>
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
    setDialog(next);
  };
  const finishDialog = (message: string) => {
    setDialog(null);
    setAnnouncement(message);
    window.requestAnimationFrame(() => headingRef.current?.focus());
  };
  return (
    <div css={workspaceInnerStyles(theme)}>
      <header css={detailHeaderStyles(theme)}>
        <Button data-detail-breadcrumb variant="quiet" onClick={() => goBack(APP_PATHS.campaigns)}>
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
                Updated <time dateTime={campaign.updatedAt}>{formatDate(campaign.updatedAt)}</time>
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
          onSaved={(updated) => finishDialog(`${updated.name} updated.`)}
        />
      ) : null}
      {dialog === 'archive' || dialog === 'restore' ? (
        <CampaignLifecycleDialog
          action={dialog}
          campaign={campaign}
          returnFocusRef={returnFocusRef}
          onClose={() => setDialog(null)}
          onChanged={(updated, action) =>
            finishDialog(
              `${updated.name} ${action === 'archive' ? 'archived' : 'restored'}. Projects remain intact.`,
            )
          }
        />
      ) : null}
      {dialog === 'tombstone' ? (
        <DeleteCampaignDialog
          campaign={campaign}
          returnFocusRef={returnFocusRef}
          onClose={() => setDialog(null)}
          // The list variant refreshes in place; the detail page has to leave the record it shows.
          onDeleted={() => void navigate(APP_PATHS.campaigns, { replace: true })}
        />
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
