import { useTheme } from '@emotion/react';
import type { CampaignContract, ProjectContract } from '@studio/contracts';
import { useLayoutEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import { APP_PATHS, campaignIdFromPath, campaignPath, projectPath } from '../../app/paths';
import {
  Button,
  OverlayPanel,
  SelectField,
  StatusNotice,
  TextAreaField,
  TextField,
} from '../../ui';
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
import { useProjectList, useProjectsController } from '../projects/useProjectsController';
import {
  campaignBriefStyles,
  campaignCardStyles,
  campaignGridStyles,
  projectGroupStyles,
} from './CampaignRouteSurface.styles';
import { CampaignApiConflictError } from './campaignsApi';
import {
  useCampaignDetail,
  useCampaignList,
  useCampaignsController,
} from './useCampaignsController';

const safeError = (error: unknown): string =>
  error instanceof ApiClientError
    ? error.message
    : 'Campaigns could not be loaded. Check the local API and try again.';

interface CampaignFormDialogProps {
  readonly campaign?: CampaignContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onSaved: (campaign: CampaignContract) => void;
}

const CampaignFormDialog = ({
  campaign,
  returnFocusRef,
  onClose,
  onSaved,
}: CampaignFormDialogProps) => {
  const theme = useTheme();
  const controller = useCampaignsController();
  const [name, setName] = useState(campaign?.name ?? '');
  const [brief, setBrief] = useState(campaign?.brief ?? '');
  const [error, setError] = useState<string | null>(null);
  const editing = campaign !== undefined;
  const mutation = editing ? controller.editMutation : controller.createMutation;
  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    try {
      const saved = editing
        ? await controller.editMutation.mutateAsync({
            campaignId: campaign.id,
            name,
            brief: brief.trim() || null,
            expectedVersion: campaign.version,
          })
        : await controller.createMutation.mutateAsync({
            name,
            brief: brief.trim() || null,
          });
      onSaved(saved);
    } catch (caught) {
      setError(safeError(caught));
    }
  };
  return (
    <OverlayPanel
      open
      onClose={onClose}
      title={editing ? 'Edit Campaign' : 'Create Campaign'}
      description="Campaigns are lightweight organizers. Only a name is required."
      placement="bottom"
      size="standard"
      closeDisabled={mutation.isPending}
      closeOnBackdrop={false}
      initialFocus="heading"
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button variant="quiet" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={mutation.isPending}
            disabled={name.trim().length === 0 || name.trim().length > 120 || brief.length > 1_000}
            onClick={() => void submit()}
          >
            {editing ? 'Save Campaign' : 'Create Campaign'}
          </Button>
        </div>
      }
    >
      <form onSubmit={(event) => void submit(event)} css={{ display: 'grid', gap: theme.space.md }}>
        <TextField
          label="Campaign name"
          value={name}
          required
          maxLength={120}
          disabled={mutation.isPending}
          onChange={(event) => setName(event.target.value)}
        />
        <TextAreaField
          label="Brief (optional)"
          value={brief}
          maxLength={1_000}
          disabled={mutation.isPending}
          hint={`${brief.length}/1000 characters`}
          error={error ?? undefined}
          onChange={(event) => setBrief(event.target.value)}
        />
      </form>
    </OverlayPanel>
  );
};

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
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div css={workspaceInnerStyles(theme)}>
      <header css={workspaceHeaderStyles(theme)}>
        <div>
          <h2 tabIndex={-1}>Campaigns</h2>
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
      {creating ? (
        <CampaignFormDialog
          returnFocusRef={returnFocusRef}
          onClose={() => setCreating(false)}
          onSaved={(campaign) => void navigate(campaignPath(campaign.id))}
        />
      ) : null}
    </div>
  );
};

interface MoveProjectDialogProps {
  readonly project: ProjectContract;
  readonly currentCampaign: CampaignContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onMoved: (message: string) => void;
}

const MoveProjectDialog = ({
  project,
  currentCampaign,
  returnFocusRef,
  onClose,
  onMoved,
}: MoveProjectDialogProps) => {
  const theme = useTheme();
  const campaignsQuery = useCampaignList('active');
  const projects = useProjectsController();
  const campaigns = useMemo(
    () => campaignsQuery.data?.pages.flatMap((page) => page.campaigns) ?? [],
    [campaignsQuery.data],
  );
  const [target, setTarget] = useState('none');
  const [error, setError] = useState<string | null>(null);
  const options = [
    { value: 'none', label: 'No Campaign', description: 'Keep this Project standalone.' },
    ...campaigns
      .filter(({ id }) => id !== currentCampaign.id)
      .map((campaign) => ({ value: campaign.id, label: campaign.name })),
  ];
  const submit = async () => {
    setError(null);
    try {
      await projects.moveMutation.mutateAsync({
        projectId: project.id,
        campaignId: target === 'none' ? null : target,
        expectedVersion: project.version,
      });
      const targetName =
        target === 'none' ? 'No Campaign' : options.find(({ value }) => value === target)?.label;
      onMoved(`${project.title} moved to ${targetName ?? 'the selected Campaign'}.`);
    } catch (caught) {
      setError(safeError(caught));
    }
  };
  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="Move Project"
      description="Membership changes use the Project version so concurrent work is never overwritten."
      placement="bottom"
      size="standard"
      closeDisabled={projects.moveMutation.isPending}
      closeOnBackdrop={false}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button variant="quiet" disabled={projects.moveMutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={projects.moveMutation.isPending}
            disabled={campaignsQuery.isPending || options.length === 0}
            onClick={() => void submit()}
          >
            Move Project
          </Button>
        </div>
      }
    >
      <SelectField
        label="New location"
        value={target}
        options={options}
        busy={campaignsQuery.isPending}
        error={error ?? undefined}
        onValueChange={setTarget}
      />
      {campaignsQuery.hasNextPage ? (
        <Button
          variant="quiet"
          busy={campaignsQuery.isFetchingNextPage}
          onClick={() => void campaignsQuery.fetchNextPage()}
        >
          Load more Campaigns
        </Button>
      ) : null}
    </OverlayPanel>
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
  const query = useCampaignDetail(campaignId);
  const campaigns = useCampaignsController();
  const projects = useProjectsController();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [dialog, setDialog] = useState<CampaignDialog | null>(null);
  const [moveProject, setMoveProject] = useState<ProjectContract | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
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
  const quickStart = async () => {
    setActionError(null);
    try {
      const current = await projects.createMutation.mutateAsync(campaign.id);
      void navigate(projectPath(current.project.id));
    } catch (caught) {
      setActionError(safeError(caught));
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
            <h2 ref={headingRef} tabIndex={-1}>
              {campaign.name}
            </h2>
            <div data-detail-meta>
              <span css={statusPillStyles(theme, archived)}>
                {archived ? 'Archived' : 'Active'}
              </span>
              <span>Version {campaign.version}</span>
            </div>
            <p css={campaignBriefStyles(theme)}>{campaign.brief ?? 'No brief yet.'}</p>
          </div>
          <div data-detail-actions>
            {!archived ? (
              <Button
                variant="primary"
                busy={projects.createMutation.isPending}
                onClick={() => void quickStart()}
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
