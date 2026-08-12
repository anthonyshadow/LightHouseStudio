import { useTheme } from '@emotion/react';
import type { ProjectContract, ProjectCurrentResponse } from '@studio/contracts';
import { useLayoutEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import { APP_PATHS, projectIdFromPath, projectPath } from '../../app/paths';
import { Button, OverlayPanel, SelectField, StatusNotice, TextField } from '../../ui';
import { useCampaignList } from '../campaigns/useCampaignsController';
import { ProjectApiConflictError } from './projectsApi';
import {
  detailHeaderStyles,
  dialogActionsStyles,
  emptyListStyles,
  emptyProjectStyles,
  listLayoutStyles,
  listSectionStyles,
  projectCardStyles,
  projectListStyles,
  statusPillStyles,
  workspaceHeaderStyles,
  workspaceInnerStyles,
  workspaceStyles,
} from './ProjectRouteSurface.styles';
import { useProjectDetail, useProjectList, useProjectsController } from './useProjectsController';

const projectStatusLabel = (status: ProjectContract['status']): string =>
  status === 'needs-attention'
    ? 'Needs attention'
    : status.charAt(0).toUpperCase() + status.slice(1);

const formatUpdatedAt = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

const safeProjectError = (error: unknown): string =>
  error instanceof ApiClientError
    ? error.message
    : 'Projects could not be loaded. Check the local API and try again.';

interface RenameDialogProps {
  readonly project: ProjectContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onRenamed: (current: ProjectCurrentResponse) => void;
}

const RenameProjectDialog = ({
  project,
  returnFocusRef,
  onClose,
  onRenamed,
}: RenameDialogProps) => {
  const theme = useTheme();
  const controller = useProjectsController();
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(project.title);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);

  const finish = (current: ProjectCurrentResponse) => {
    setError(null);
    setStale(false);
    onRenamed(current);
  };

  const fail = (caught: unknown) => {
    const conflict = caught instanceof ProjectApiConflictError;
    setStale(conflict && caught.conflict.kind === 'project-version');
    setError(safeProjectError(caught));
  };

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    setError(null);
    try {
      finish(
        await controller.renameMutation.mutateAsync({
          projectId: project.id,
          title,
          expectedVersion: project.version,
        }),
      );
    } catch (caught) {
      fail(caught);
    }
  };

  const reloadAndRetry = async () => {
    setError(null);
    try {
      finish(await controller.renameLatest(project.id, title));
    } catch (caught) {
      fail(caught);
    }
  };

  const busy = controller.renameMutation.isPending;
  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="Rename Project"
      description="Project names are shared server state. A stale change is never overwritten."
      placement="bottom"
      size="standard"
      closeDisabled={busy}
      closeOnBackdrop={false}
      initialFocusRef={inputRef}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            {stale ? 'Discard change' : 'Cancel'}
          </Button>
          <Button
            variant="primary"
            busy={busy}
            disabled={title.trim().length === 0 || title.trim().length > 120}
            onClick={() => void (stale ? reloadAndRetry() : submit())}
          >
            {stale ? 'Reload and retry rename' : 'Rename Project'}
          </Button>
        </div>
      }
    >
      <form onSubmit={(event) => void submit(event)} css={{ display: 'grid', gap: theme.space.md }}>
        <TextField
          ref={inputRef}
          label="Project name"
          value={title}
          required
          maxLength={120}
          disabled={busy}
          error={error ?? undefined}
          onChange={(event) => setTitle(event.target.value)}
        />
        {stale ? (
          <StatusNotice role="status" tone="warning" title="Project changed">
            Your proposed name is still here. Reload the current Project and explicitly retry, or
            discard this change.
          </StatusNotice>
        ) : null}
      </form>
    </OverlayPanel>
  );
};

type LifecycleAction = 'archive' | 'restore';

interface LifecycleDialogProps {
  readonly action: LifecycleAction;
  readonly project: ProjectContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onChanged: (current: ProjectCurrentResponse, action: LifecycleAction) => void;
}

const ProjectLifecycleDialog = ({
  action,
  project,
  returnFocusRef,
  onClose,
  onChanged,
}: LifecycleDialogProps) => {
  const theme = useTheme();
  const controller = useProjectsController();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryWithLatest, setRetryWithLatest] = useState(false);
  const mutation = action === 'archive' ? controller.archiveMutation : controller.restoreMutation;
  const actionLabel = action === 'archive' ? 'Archive' : 'Restore';

  const change = async () => {
    setError(null);
    try {
      const current = retryWithLatest
        ? await controller.changeLatestLifecycle(
            project.id,
            action === 'archive' ? 'archived' : 'active',
          )
        : await mutation.mutateAsync({
            projectId: project.id,
            expectedVersion: project.version,
          });
      onChanged(current, action);
    } catch (caught) {
      setError(safeProjectError(caught));
      setRetryWithLatest(true);
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title={`${actionLabel} Project`}
      description={
        action === 'archive'
          ? 'Archived Projects leave the active workspace and retain their durable history.'
          : 'Restoring returns this empty Project to the active workspace.'
      }
      placement="bottom"
      size="standard"
      closeDisabled={mutation.isPending}
      closeOnBackdrop={false}
      initialFocusRef={cancelRef}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button ref={cancelRef} variant="quiet" disabled={mutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={action === 'archive' ? 'danger' : 'primary'}
            busy={mutation.isPending}
            onClick={() => void change()}
          >
            {retryWithLatest ? `Reload and retry ${action}` : `${actionLabel} Project`}
          </Button>
        </div>
      }
    >
      <p>
        {action === 'archive'
          ? `Archive “${project.title}”? You can restore it later.`
          : `Restore “${project.title}” to active Projects?`}
      </p>
      {error ? (
        <StatusNotice role="alert" tone="warning" title={`${actionLabel} not applied`}>
          {error}
        </StatusNotice>
      ) : null}
    </OverlayPanel>
  );
};

interface ProjectCampaignDialogProps {
  readonly project: ProjectContract;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
  readonly onChanged: (current: ProjectCurrentResponse, location: string) => void;
}

const ProjectCampaignDialog = ({
  project,
  returnFocusRef,
  onClose,
  onChanged,
}: ProjectCampaignDialogProps) => {
  const theme = useTheme();
  const controller = useProjectsController();
  const campaignQuery = useCampaignList('active');
  const campaigns = useMemo(
    () => campaignQuery.data?.pages.flatMap((page) => page.campaigns) ?? [],
    [campaignQuery.data],
  );
  const [campaignId, setCampaignId] = useState(project.campaignId ?? 'none');
  const [error, setError] = useState<string | null>(null);
  const options = [
    { value: 'none', label: 'No Campaign', description: 'Keep this Project standalone.' },
    ...campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name })),
  ];
  const move = async () => {
    setError(null);
    try {
      const current = await controller.moveMutation.mutateAsync({
        projectId: project.id,
        campaignId: campaignId === 'none' ? null : campaignId,
        expectedVersion: project.version,
      });
      onChanged(
        current,
        campaignId === 'none'
          ? 'No Campaign'
          : (campaigns.find(({ id }) => id === campaignId)?.name ?? 'the selected Campaign'),
      );
    } catch (caught) {
      setError(safeProjectError(caught));
    }
  };
  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="Project Campaign"
      description="Move this Project to one active Campaign, or detach it to No Campaign."
      placement="bottom"
      size="standard"
      closeDisabled={controller.moveMutation.isPending}
      closeOnBackdrop={false}
      returnFocusRef={returnFocusRef}
      footer={
        <div css={dialogActionsStyles(theme)}>
          <Button variant="quiet" disabled={controller.moveMutation.isPending} onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            busy={controller.moveMutation.isPending}
            disabled={campaignQuery.isPending || campaignId === (project.campaignId ?? 'none')}
            onClick={() => void move()}
          >
            Confirm location
          </Button>
        </div>
      }
    >
      <SelectField
        label="Campaign"
        value={campaignId}
        options={options}
        busy={campaignQuery.isPending}
        error={error ?? undefined}
        onValueChange={setCampaignId}
      />
      {campaignQuery.hasNextPage ? (
        <Button
          variant="quiet"
          busy={campaignQuery.isFetchingNextPage}
          onClick={() => void campaignQuery.fetchNextPage()}
        >
          Load more Campaigns
        </Button>
      ) : null}
    </OverlayPanel>
  );
};

interface ProjectListSectionProps {
  readonly lifecycle: 'active' | 'archived';
  readonly campaignId?: string;
  readonly heading?: string;
  readonly onOpen: (project: ProjectContract) => void;
  readonly onRename: (project: ProjectContract, trigger: HTMLButtonElement) => void;
  readonly onLifecycle: (
    action: LifecycleAction,
    project: ProjectContract,
    trigger: HTMLButtonElement,
  ) => void;
}

const ProjectListSection = ({
  lifecycle,
  campaignId,
  heading,
  onOpen,
  onRename,
  onLifecycle,
}: ProjectListSectionProps) => {
  const theme = useTheme();
  const query = useProjectList(lifecycle, campaignId);
  const projects = useMemo(
    () => query.data?.pages.flatMap((page) => page.projects) ?? [],
    [query.data],
  );
  const archived = lifecycle === 'archived';

  return (
    <section
      css={listSectionStyles(theme)}
      aria-labelledby={`${lifecycle}-${campaignId ?? 'all'}-projects-heading`}
    >
      <header>
        <h3 id={`${lifecycle}-${campaignId ?? 'all'}-projects-heading`}>
          {heading ?? (archived ? 'Archived' : 'Active Projects')}
        </h3>
        <span>{projects.length} loaded</span>
      </header>
      {query.isPending ? <p role="status">Loading {lifecycle} Projects…</p> : null}
      {query.isError ? (
        <StatusNotice role="alert" tone="danger" title="Projects unavailable">
          <p>{safeProjectError(query.error)}</p>
          <Button size="small" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </StatusNotice>
      ) : null}
      {!query.isPending && !query.isError && projects.length === 0 ? (
        <div css={emptyListStyles(theme)}>
          <strong>{archived ? 'No archived Projects' : 'No active Projects yet'}</strong>
          <p>
            {archived
              ? 'Archived work appears here and can be restored.'
              : 'Quick Start creates an empty Project without a Campaign or source.'}
          </p>
        </div>
      ) : null}
      {projects.length > 0 ? (
        <ul
          css={projectListStyles(theme)}
          aria-label={heading ?? `${archived ? 'Archived' : 'Active'} Projects`}
        >
          {projects.map((project) => (
            <li key={project.id}>
              <article css={projectCardStyles(theme)}>
                <div>
                  <h4>{project.title}</h4>
                  <div data-project-meta>
                    <span css={statusPillStyles(theme, archived)}>
                      {projectStatusLabel(project.status)}
                    </span>
                    <span>
                      Updated{' '}
                      <time dateTime={project.updatedAt}>{formatUpdatedAt(project.updatedAt)}</time>
                    </span>
                  </div>
                </div>
                <div data-project-actions>
                  <Button size="small" variant="primary" onClick={() => onOpen(project)}>
                    Open
                  </Button>
                  {!archived ? (
                    <Button
                      size="small"
                      onClick={(event) => onRename(project, event.currentTarget)}
                    >
                      Rename
                    </Button>
                  ) : null}
                  <Button
                    size="small"
                    variant={archived ? 'secondary' : 'quiet'}
                    onClick={(event) =>
                      onLifecycle(archived ? 'restore' : 'archive', project, event.currentTarget)
                    }
                  >
                    {archived ? 'Restore' : 'Archive'}
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

const ProjectsWorkspace = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const controller = useProjectsController();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogReturnRef = useRef<HTMLElement | null>(null);
  const [renameProject, setRenameProject] = useState<ProjectContract | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    readonly action: LifecycleAction;
    readonly project: ProjectContract;
  } | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<'all' | 'none'>('all');

  const quickStart = async () => {
    setCreateError(null);
    try {
      const current = await controller.createMutation.mutateAsync(null);
      setAnnouncement('Untitled Project created.');
      void navigate(projectPath(current.project.id));
    } catch (caught) {
      setCreateError(safeProjectError(caught));
    }
  };

  const closeDialog = () => {
    setRenameProject(null);
    setLifecycleDialog(null);
  };
  const openProject = (project: ProjectContract) => {
    void navigate(projectPath(project.id));
  };
  const openRenameDialog = (project: ProjectContract, trigger: HTMLButtonElement) => {
    dialogReturnRef.current = trigger;
    setRenameProject(project);
  };
  const openLifecycleDialog = (
    action: LifecycleAction,
    project: ProjectContract,
    trigger: HTMLButtonElement,
  ) => {
    dialogReturnRef.current = trigger;
    setLifecycleDialog({ action, project });
  };

  return (
    <div css={workspaceInnerStyles(theme)}>
      <header css={workspaceHeaderStyles(theme)}>
        <div>
          <h2 ref={headingRef} tabIndex={-1}>
            Projects
          </h2>
          <p>
            Create and manage focused video work. Source resume and creative tools are added in a
            later step; empty Projects are already durable server-owned records.
          </p>
        </div>
        <Button
          variant="primary"
          busy={controller.createMutation.isPending}
          onClick={() => void quickStart()}
        >
          Quick Start
        </Button>
      </header>

      {createError ? (
        <StatusNotice role="alert" tone="danger" title="Project not created">
          <p>{createError}</p>
          <Button size="small" onClick={() => void quickStart()}>
            Retry Quick Start
          </Button>
        </StatusNotice>
      ) : null}
      <div role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <div css={dialogActionsStyles(theme)} aria-label="Project groups">
        <Button
          variant="quiet"
          aria-pressed={activeGroup === 'all'}
          onClick={() => setActiveGroup('all')}
        >
          All Active
        </Button>
        <Button
          variant="quiet"
          aria-pressed={activeGroup === 'none'}
          onClick={() => setActiveGroup('none')}
        >
          No Campaign
        </Button>
      </div>

      <div css={listLayoutStyles(theme)}>
        <ProjectListSection
          lifecycle="active"
          {...(activeGroup === 'none'
            ? { campaignId: 'none' as const, heading: 'No Campaign' }
            : {})}
          onOpen={openProject}
          onRename={openRenameDialog}
          onLifecycle={openLifecycleDialog}
        />
        <ProjectListSection
          lifecycle="archived"
          onOpen={openProject}
          onRename={openRenameDialog}
          onLifecycle={openLifecycleDialog}
        />
      </div>

      {renameProject ? (
        <RenameProjectDialog
          project={renameProject}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onRenamed={(current) => {
            setAnnouncement(`Project renamed to ${current.project.title}.`);
            closeDialog();
          }}
        />
      ) : null}
      {lifecycleDialog ? (
        <ProjectLifecycleDialog
          action={lifecycleDialog.action}
          project={lifecycleDialog.project}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onChanged={(current, action) => {
            setAnnouncement(
              `${current.project.title} ${action === 'archive' ? 'archived' : 'restored'}.`,
            );
            closeDialog();
            window.requestAnimationFrame(() => headingRef.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
};

const isEmptyProject = (current: ProjectCurrentResponse): boolean => {
  const snapshot = current.revision.snapshot;
  return (
    snapshot.sourceAssetId === null &&
    snapshot.workingMedia === null &&
    snapshot.presentedMedia === null &&
    snapshot.lastSuccessfulOutput === null
  );
};

const ProjectDetail = ({ projectId }: { readonly projectId: string }) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const query = useProjectDetail(projectId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogReturnRef = useRef<HTMLElement | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectContract | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    readonly action: LifecycleAction;
    readonly project: ProjectContract;
  } | null>(null);
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);

  if (query.isPending) {
    return (
      <div css={workspaceInnerStyles(theme)}>
        <p role="status">Loading Project…</p>
      </div>
    );
  }
  if (query.isError) {
    return (
      <div css={workspaceInnerStyles(theme)}>
        <StatusNotice role="alert" tone="danger" title="Project unavailable">
          <p>{safeProjectError(query.error)}</p>
          <div css={dialogActionsStyles(theme)}>
            <Button variant="quiet" onClick={() => void navigate(APP_PATHS.projects)}>
              Back to Projects
            </Button>
            <Button variant="primary" onClick={() => void query.refetch()}>
              Retry
            </Button>
          </div>
        </StatusNotice>
      </div>
    );
  }

  const current = query.data;
  const project = current.project;
  const archived = project.archivedAt !== null;
  const closeDialog = () => {
    setRenameTarget(null);
    setLifecycleDialog(null);
    setCampaignDialog(false);
  };

  return (
    <div css={workspaceInnerStyles(theme)}>
      <header css={detailHeaderStyles(theme)}>
        <Button
          data-detail-breadcrumb
          variant="quiet"
          onClick={() => void navigate(APP_PATHS.projects)}
        >
          ← All Projects
        </Button>
        <div data-detail-identity>
          <div>
            <h2 ref={headingRef} tabIndex={-1}>
              {project.title}
            </h2>
            <div data-detail-meta>
              <span css={statusPillStyles(theme, archived)}>
                {projectStatusLabel(project.status)}
              </span>
              <span>
                Updated{' '}
                <time dateTime={project.updatedAt}>{formatUpdatedAt(project.updatedAt)}</time>
              </span>
              <span>Revision {project.currentRevisionNumber}</span>
              <span>{project.campaignId === null ? 'No Campaign' : 'Campaign assigned'}</span>
            </div>
          </div>
          <div data-detail-actions>
            <Button
              onClick={(event) => {
                dialogReturnRef.current = event.currentTarget;
                setCampaignDialog(true);
              }}
            >
              Move Project
            </Button>
            {!archived ? (
              <Button
                onClick={(event) => {
                  dialogReturnRef.current = event.currentTarget;
                  setRenameTarget(project);
                }}
              >
                Rename
              </Button>
            ) : null}
            <Button
              variant={archived ? 'primary' : 'danger'}
              onClick={(event) => {
                dialogReturnRef.current = event.currentTarget;
                setLifecycleDialog({ action: archived ? 'restore' : 'archive', project });
              }}
            >
              {archived ? 'Restore' : 'Archive'}
            </Button>
          </div>
        </div>
      </header>

      <div role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {isEmptyProject(current) ? (
        <section css={emptyProjectStyles(theme)} aria-labelledby="empty-project-heading">
          <div>
            <h3 id="empty-project-heading">No source yet</h3>
            <p>
              This Project is durable and can be reopened from this URL. Video source acceptance and
              resumable creative state are not available yet, so nothing is claimed as saved media
              or resumable work.
            </p>
            <p>
              Opening Studio or a global saved library explicitly exits this Project context. Return
              to work through this Project URL.
            </p>
          </div>
          <div data-source-actions aria-describedby="future-source-explanation">
            <Button disabled>Record video</Button>
            <Button disabled>Upload video</Button>
            <Button disabled>Use Saved Video</Button>
            <small id="future-source-explanation">
              Source actions arrive after durable source acceptance is implemented. No camera,
              upload, player, or provider work starts from this screen.
            </small>
          </div>
        </section>
      ) : (
        <StatusNotice tone="warning" title="Source session not available yet">
          This Project has durable media references, but this lifecycle workspace does not fetch or
          mount them. Source hydration arrives in the next implementation boundary.
        </StatusNotice>
      )}

      {renameTarget ? (
        <RenameProjectDialog
          project={renameTarget}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onRenamed={(updated) => {
            setAnnouncement(`Project renamed to ${updated.project.title}.`);
            closeDialog();
          }}
        />
      ) : null}
      {campaignDialog ? (
        <ProjectCampaignDialog
          project={project}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onChanged={(updated, location) => {
            setAnnouncement(`${updated.project.title} moved to ${location}.`);
            closeDialog();
          }}
        />
      ) : null}
      {lifecycleDialog ? (
        <ProjectLifecycleDialog
          action={lifecycleDialog.action}
          project={lifecycleDialog.project}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onChanged={(updated, action) => {
            setAnnouncement(
              `${updated.project.title} ${action === 'archive' ? 'archived' : 'restored'}.`,
            );
            closeDialog();
            window.requestAnimationFrame(() => headingRef.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
};

export const ProjectRouteSurface = () => {
  const theme = useTheme();
  const location = useLocation();
  const projectId = projectIdFromPath(location.pathname);
  const routeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (routeRef.current) routeRef.current.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div ref={routeRef} css={workspaceStyles(theme)} data-project-route="">
      {projectId === null ? <ProjectsWorkspace /> : <ProjectDetail projectId={projectId} />}
    </div>
  );
};
