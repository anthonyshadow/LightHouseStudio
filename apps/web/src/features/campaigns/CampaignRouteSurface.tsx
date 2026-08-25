import { useTheme } from '@emotion/react';
import type { CampaignContract, ProjectContract } from '@studio/contracts';
import { formatDate } from '@studio/domain';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { APP_PATHS, campaignIdFromPath, campaignPath, projectPath } from '../../app/paths';
import { useRouteBack } from '../../app/useRouteBack';
import { useRouteViewState } from '../../app/useRouteViewState';
import {
  AppIcon,
  Button,
  emptyExampleStyles,
  EmptyStatePreview,
  ListSearchField,
  listTotalLabel,
  SearchEmptyState,
  Skeleton,
  StatusNotice,
  useListSearch,
  VisuallyHidden,
} from '../../ui';
import { pageScrollRegionStyles } from '../../ui/primitives/PageShell.styles';
import { NewProjectDialog } from '../projects/ProjectDialogs';
import { KIND_ICONS } from '../projects/ProjectAssetThumbnail';
import { projectPosterUrls } from '../projects/projectPosterPresentation';
import { useProjectList } from '../projects/useProjectsController';
import { projectCountLabel } from '../projects/projectStatusPresentation';
import { WorkPosterTile } from '../projects/WorkPosterTile';
import {
  campaignBriefStyles,
  campaignCardMetaStyles,
  campaignCardStyles,
  campaignGridStyles,
  campaignSearchRowStyles,
  campaignSkeletonCardStyles,
  collapsedSectionStyles,
  detailHeaderStyles,
  emptyListStyles,
  listSectionStyles,
  projectGroupStyles,
  statusPillStyles,
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
import { ActionMenu } from '../../ui/primitives/ActionMenu';
import { PageHeader, PageShell } from '../../ui/primitives/PageShell';

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
  readonly search?: string;
  readonly onClearSearch: () => void;
}

const CampaignListSection = ({
  lifecycle,
  search,
  onClearSearch,
  onOpen,
  onEdit,
  onLifecycle,
  onDelete,
}: CampaignListSectionProps) => {
  const theme = useTheme();
  const query = useCampaignList(lifecycle, search);
  const campaigns = useMemo(
    () => query.data?.pages.flatMap((page) => page.campaigns) ?? [],
    [query.data],
  );
  const archived = lifecycle === 'archived';
  const total = query.data?.pages.at(-1)?.total ?? null;
  /*
   * An empty archive is normal, not a state worth a bordered box and a paragraph. When nothing has
   * been archived and nothing is being searched for, the whole section collapses to its heading
   * and one word, so the page does not open with an empty container under the real work.
   */
  const collapsed = archived && search === undefined && !query.isPending && total?.count === 0;

  if (collapsed) {
    return (
      <section
        css={collapsedSectionStyles(theme)}
        aria-labelledby={`${lifecycle}-campaigns-heading`}
      >
        <h3 id={`${lifecycle}-campaigns-heading`}>Archived</h3>
        <span>None yet</span>
      </section>
    );
  }

  return (
    <section css={listSectionStyles(theme)} aria-labelledby={`${lifecycle}-campaigns-heading`}>
      <header>
        <h3 id={`${lifecycle}-campaigns-heading`}>{archived ? 'Archived' : 'Active Campaigns'}</h3>
        {/* Polite, so a settled search states its result count without interrupting typing. */}
        <span role="status" aria-live="polite">
          {total === null
            ? null
            : listTotalLabel(
                total,
                archived ? 'archived Campaign' : 'Campaign',
                archived ? 'archived Campaigns' : 'Campaigns',
                search,
              )}
        </span>
      </header>
      {query.isPending ? (
        <>
          <VisuallyHidden role="status">Loading {lifecycle} Campaigns…</VisuallyHidden>
          <ul css={campaignGridStyles(theme)} aria-hidden="true">
            {Array.from({ length: 3 }, (_, index) => (
              <li key={index}>
                <div css={campaignSkeletonCardStyles(theme)}>
                  <div data-campaign-identity>
                    <Skeleton variant="poster" />
                    <Skeleton height="1.1rem" width="72%" />
                  </div>
                  <Skeleton width="92%" />
                  <Skeleton width="48%" />
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
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
          {search === undefined ? (
            <>
              {archived ? null : <EmptyStatePreview />}
              <strong>{archived ? 'No archived Campaigns' : 'No Campaigns yet'}</strong>
              <p>
                {archived
                  ? 'Archived Campaigns remain available here until explicitly deleted.'
                  : 'Create a lightweight organizer, or keep using standalone Projects.'}
              </p>
              {archived ? null : (
                <p data-empty-example css={emptyExampleStyles(theme)}>
                  For example: a “Spring launch” Campaign holding one Project per ad placement.
                </p>
              )}
            </>
          ) : (
            <SearchEmptyState
              noun={`${archived ? 'archived ' : ''}Campaigns`}
              term={search}
              onClear={onClearSearch}
            />
          )}
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
                  <div data-campaign-identity>
                    <span data-campaign-cover="">
                      {/*
                       * Deliberately not a poster. A Campaign is an organizer, and its Projects'
                       * posters are not resolvable from the Campaign list response — reaching for
                       * them would cost one request per card, which this surface will not spend.
                       * Its Projects show their own work on the Campaign itself.
                       */}
                      <WorkPosterTile
                        decorative
                        icon={<AppIcon name="campaigns" />}
                        thumbnailUrl={null}
                        emptyCaption="Campaign"
                        failedCaption="Campaign"
                        label={campaign.name}
                        kindNoun="Campaign"
                        unavailable={false}
                      />
                    </span>
                    <h4>{campaign.name}</h4>
                  </div>
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
  const search = useListSearch();
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
    <PageShell>
      <PageHeader
        title="Campaigns"
        headingRef={setHeadingRef}
        description="Group related Projects under one initiative — just a name and an optional brief. Campaigns are optional; you can create a Project without one."
        actions={
          <Button
            variant="primary"
            onClick={(event) => {
              returnFocusRef.current = event.currentTarget;
              setCreating(true);
            }}
          >
            Create Campaign
          </Button>
        }
      />
      <div role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <div css={campaignSearchRowStyles(theme)}>
        <ListSearchField
          label="Search Campaigns by name"
          placeholder="Campaign name"
          search={search}
        />
      </div>
      {(['active', 'archived'] as const).map((lifecycle) => (
        <CampaignListSection
          key={lifecycle}
          lifecycle={lifecycle}
          {...(search.term === undefined ? {} : { search: search.term })}
          onClearSearch={search.clear}
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
    </PageShell>
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
  const posters = useMemo(() => projectPosterUrls(query.data?.pages), [query.data]);
  const projectGroupTotal = query.data?.pages.at(-1)?.total ?? null;
  return (
    <section css={projectGroupStyles(theme)} aria-labelledby={`${lifecycle}-campaign-projects`}>
      <header>
        <h3 id={`${lifecycle}-campaign-projects`}>
          {lifecycle === 'active' ? 'Active Projects' : 'Archived Projects'}
        </h3>
        <span role="status" aria-live="polite">
          {projectGroupTotal === null
            ? null
            : projectCountLabel(projectGroupTotal, lifecycle === 'archived')}
        </span>
      </header>
      {query.isPending ? (
        <>
          <VisuallyHidden role="status">Loading {lifecycle} Projects…</VisuallyHidden>
          <ul aria-hidden="true">
            {Array.from({ length: 2 }, (_, index) => (
              <li key={index}>
                <article>
                  <div data-project-identity>
                    <Skeleton variant="poster" width="min(5rem, 22vw)" />
                    <Skeleton height="1.1rem" width="62%" />
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </>
      ) : null}
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
                <div data-project-identity>
                  <span data-project-poster="">
                    {/* Decorative: the heading beside it already names the Project. */}
                    <WorkPosterTile
                      decorative
                      playBadge
                      icon={KIND_ICONS.video}
                      thumbnailUrl={posters.get(project.id) ?? null}
                      emptyCaption="No preview yet"
                      failedCaption="Preview didn’t load"
                      label={project.title}
                      kindNoun="Project"
                      unavailable={false}
                    />
                  </span>
                  <h4>{project.title}</h4>
                </div>
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
      <PageShell>
        <p role="status">Loading Campaign…</p>
      </PageShell>
    );
  if (query.isError) {
    return (
      <PageShell>
        <StatusNotice role="alert" tone="danger" title="Campaign unavailable">
          <p>{safeError(query.error)}</p>
          <Button variant="quiet" onClick={() => goBack(APP_PATHS.campaigns)}>
            Back to Campaigns
          </Button>
        </StatusNotice>
      </PageShell>
    );
  }
  const campaign = query.data;
  const archived = campaign.status === 'archived';
  const openDialog = (next: CampaignDialog, trigger: HTMLButtonElement | null) => {
    returnFocusRef.current = trigger;
    setDialog(next);
  };
  const finishDialog = (message: string) => {
    setDialog(null);
    setAnnouncement(message);
    window.requestAnimationFrame(() => headingRef.current?.focus());
  };
  return (
    <PageShell>
      <PageHeader
        css={detailHeaderStyles(theme)}
        title={campaign.name}
        headingRef={headingRef}
        breadcrumb={
          <Button data-detail-breadcrumb variant="link" onClick={() => goBack(APP_PATHS.campaigns)}>
            ← All Campaigns
          </Button>
        }
        actions={
          <>
            <Button
              variant="primary"
              onClick={(event) => {
                if (archived) {
                  openDialog('restore', event.currentTarget);
                  return;
                }
                returnFocusRef.current = event.currentTarget;
                setCreatingProject(true);
              }}
            >
              {archived ? 'Restore' : 'New Project'}
            </Button>
            <ActionMenu
              label={`More actions for ${campaign.name}`}
              items={[
                {
                  id: 'edit',
                  label: 'Edit',
                  onSelect: (trigger) => openDialog('edit', trigger),
                },
                ...(archived
                  ? [
                      {
                        id: 'tombstone',
                        label: 'Delete Campaign',
                        danger: true,
                        onSelect: (trigger: HTMLButtonElement | null) =>
                          openDialog('tombstone', trigger),
                      },
                    ]
                  : [
                      {
                        id: 'archive',
                        label: 'Archive',
                        danger: true,
                        onSelect: (trigger: HTMLButtonElement | null) =>
                          openDialog('archive', trigger),
                      },
                    ]),
              ]}
            />
          </>
        }
      >
        <div data-detail-meta>
          <span css={statusPillStyles(theme, archived)}>{archived ? 'Archived' : 'Active'}</span>
          <span>
            Updated <time dateTime={campaign.updatedAt}>{formatDate(campaign.updatedAt)}</time>
          </span>
        </div>
        <p css={campaignBriefStyles(theme)}>{campaign.brief ?? 'No brief yet.'}</p>
      </PageHeader>
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
    </PageShell>
  );
};

export const CampaignRouteSurface = () => {
  const theme = useTheme();
  const location = useLocation();
  const campaignId = campaignIdFromPath(location.pathname);
  const { routeRef, onScroll } = useRouteViewState<HTMLDivElement>({
    storageKey: 'lightframeCampaignRouteView',
  });
  return (
    <div
      ref={routeRef}
      onScroll={onScroll}
      css={pageScrollRegionStyles(theme)}
      data-campaign-route=""
    >
      {campaignId === null ? <CampaignsWorkspace /> : <CampaignDetail campaignId={campaignId} />}
    </div>
  );
};
