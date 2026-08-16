import { useTheme } from '@emotion/react';
import type { ProjectContract, ProjectCurrentResponse } from '@studio/contracts';
import { formatDateTime, type CreativeAssetStore } from '@studio/domain';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate } from 'react-router';
import {
  APP_PATHS,
  campaignPath,
  isProjectWorkspacePath,
  projectIdFromPath,
  projectPath,
  projectWorkspacePath,
} from '../../app/paths';
import { useRouteBack } from '../../app/useRouteBack';
import { AppIcon, Button, StatusNotice } from '../../ui';
import { useCampaignDetail } from '../campaigns/useCampaignsController';
import {
  NewProjectDialog,
  DeleteProjectDialog,
  ProjectCampaignDialog,
  ProjectLifecycleDialog,
  RenameProjectDialog,
  safeProjectError,
  type ProjectLifecycleAction as LifecycleAction,
} from './ProjectDialogs';
import {
  dialogActionsStyles,
  emptyProjectStyles,
  projectsGroupFilterStyles,
  projectsHeaderActionsStyles,
  projectsIndexRouteStyles,
  projectsLedgerEmptyStyles,
  projectsLedgerLayoutStyles,
  projectsLedgerListStyles,
  projectsLedgerRowStyles,
  projectsLedgerSectionStyles,
  projectsWorkspaceHeaderStyles,
  projectsWorkspaceInnerStyles,
  projectWorkspaceRouteStyles,
  projectOverviewHeaderStyles,
  projectOverviewInnerStyles,
  projectOverviewRouteStyles,
  projectOverviewSourceStyles,
  taskBodyStyles,
  taskInspectorStyles,
  taskNavigationStyles,
  taskPanelStyles,
  workspaceInnerStyles,
  workspaceMastheadStyles,
} from './ProjectRouteSurface.styles';
import { useProjectList, useProjectsController } from './useProjectsController';
import { ProjectSavedVideoPicker } from './ProjectSavedVideoPicker';
import { ProjectWorkingMediaSection } from './ProjectWorkingMediaSection';
import type { ProjectWorkingMediaActivity } from './ProjectWorkingMediaSection';
import { useProjectSession, type ProjectSessionPort } from './useProjectSession';
import {
  useProjectSourceController,
  type ProjectSourceActivity,
  type ProjectSourcePhase,
  type ProjectSourceRuntime,
} from './useProjectSourceController';
import { ProjectProcessingStatusPanel } from './ProjectProcessingStatusPanel';
import type { ProjectProcessingController } from './useProjectProcessingController';
import { ProjectOutputSaveSection } from './ProjectOutputSaveSection';
import { ProjectHistorySection } from './ProjectHistorySection';
import { ProjectAssetsSection } from './ProjectAssetsSection';
import {
  PROJECT_WORKFLOW_STEPS,
  ProjectWorkflowProgress,
  stepForSnapshot,
  type ProjectWorkflowStepId,
} from './ProjectWorkflowProgress';

const projectStatusLabel = (status: ProjectContract['status']): string =>
  status === 'needs-attention'
    ? 'Needs attention'
    : status.charAt(0).toUpperCase() + status.slice(1);

const projectWorkflowLabel = (
  phase: ProjectCurrentResponse['revision']['snapshot']['workflowPhase'],
): string => phase.charAt(0).toUpperCase() + phase.slice(1);

type ProjectWorkspaceTask = ProjectWorkflowStepId;

const projectWorkspaceTaskIcons = {
  source: 'source',
  create: 'wand',
  save: 'save',
  history: 'history',
} as const satisfies Record<ProjectWorkspaceTask, 'source' | 'wand' | 'save' | 'history'>;

// Derived from the workflow steps so the tablist and the progress strip cannot drift apart.
const projectWorkspaceTasks = PROJECT_WORKFLOW_STEPS.map((step) => ({
  ...step,
  icon: projectWorkspaceTaskIcons[step.id],
}));

const isProjectWorkspaceTask = (value: string | null): value is ProjectWorkspaceTask =>
  value !== null && PROJECT_WORKFLOW_STEPS.some(({ id }) => id === value);

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
  readonly onDelete: (project: ProjectContract, trigger: HTMLButtonElement) => void;
}

const ProjectListSection = ({
  lifecycle,
  campaignId,
  heading,
  onOpen,
  onRename,
  onLifecycle,
  onDelete,
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
      css={projectsLedgerSectionStyles(theme)}
      aria-labelledby={`${lifecycle}-${campaignId ?? 'all'}-projects-heading`}
      data-project-ledger-section={lifecycle}
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
        <div css={projectsLedgerEmptyStyles(theme)}>
          <strong>{archived ? 'No archived Projects' : 'No active Projects yet'}</strong>
          <p>
            {archived
              ? 'Archived work appears here and can be restored.'
              : 'Quick project creates an unassigned Project immediately. Name one instead when the work already has a clear purpose.'}
          </p>
        </div>
      ) : null}
      {projects.length > 0 ? (
        <ul
          css={projectsLedgerListStyles()}
          aria-label={heading ?? `${archived ? 'Archived' : 'Active'} Projects`}
        >
          {projects.map((project) => (
            <li key={project.id}>
              <article css={projectsLedgerRowStyles(theme)} data-project-ledger-row="">
                <div data-project-identity>
                  <h4>{project.title}</h4>
                </div>
                <div data-project-meta>
                  <span data-project-status>{projectStatusLabel(project.status)}</span>
                  <span data-project-updated>
                    Updated{' '}
                    <time dateTime={project.updatedAt}>{formatDateTime(project.updatedAt)}</time>
                  </span>
                </div>
                <div data-project-actions>
                  <Button
                    size="small"
                    variant="primary"
                    data-project-action="open"
                    onClick={() => onOpen(project)}
                  >
                    Open
                  </Button>
                  {!archived ? (
                    <Button
                      size="small"
                      data-project-action="rename"
                      onClick={(event) => onRename(project, event.currentTarget)}
                    >
                      Rename
                    </Button>
                  ) : null}
                  <Button
                    size="small"
                    variant={archived ? 'secondary' : 'quiet'}
                    data-project-action={archived ? 'restore' : 'archive'}
                    onClick={(event) =>
                      onLifecycle(archived ? 'restore' : 'archive', project, event.currentTarget)
                    }
                  >
                    {archived ? 'Restore' : 'Archive'}
                  </Button>
                  {archived ? (
                    <Button
                      size="small"
                      variant="danger"
                      data-project-action="delete"
                      onClick={(event) => onDelete(project, event.currentTarget)}
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
          Load more {lifecycle} Projects
        </Button>
      ) : null}
    </section>
  );
};

const ProjectsWorkspace = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const controller = useProjectsController();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogReturnRef = useRef<HTMLElement | null>(null);
  const [renameProject, setRenameProject] = useState<ProjectContract | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    readonly action: LifecycleAction;
    readonly project: ProjectContract;
  } | null>(null);
  const [deleteProject, setDeleteProject] = useState<ProjectContract | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<'all' | 'none'>('all');
  const [creating, setCreating] = useState(false);
  const routeCreateRequested =
    (location.state as { readonly createIntent?: string } | null)?.createIntent === 'project';
  const setHeadingRef = useCallback(
    (node: HTMLHeadingElement | null) => {
      headingRef.current = node;
      if (routeCreateRequested) dialogReturnRef.current = node;
    },
    [routeCreateRequested],
  );

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
    setDeleteProject(null);
  };
  const closeCreateDialog = () => {
    setCreating(false);
    if (routeCreateRequested) {
      void navigate(location.pathname, { replace: true, state: null });
    }
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
  const openDeleteDialog = (project: ProjectContract, trigger: HTMLButtonElement) => {
    dialogReturnRef.current = trigger;
    setDeleteProject(project);
  };

  return (
    <div css={projectsWorkspaceInnerStyles(theme)} data-project-index="">
      <header css={projectsWorkspaceHeaderStyles(theme)}>
        <div>
          <h1 ref={setHeadingRef} tabIndex={-1}>
            Projects
          </h1>
          <p>Keep focused video work together. Start as a collection, become a workspace.</p>
        </div>
        <div css={projectsHeaderActionsStyles(theme)} data-project-header-actions="">
          <Button
            data-project-create="quick"
            busy={controller.createMutation.isPending}
            onClick={() => void quickStart()}
          >
            Quick project
          </Button>
          <Button
            variant="primary"
            data-project-create="named"
            onClick={(event) => {
              dialogReturnRef.current = event.currentTarget;
              setCreating(true);
            }}
          >
            New Project
          </Button>
        </div>
      </header>

      {createError ? (
        <StatusNotice role="alert" tone="danger" title="Project not created">
          <p>{createError}</p>
          <Button size="small" onClick={() => void quickStart()}>
            Retry quick project
          </Button>
        </StatusNotice>
      ) : null}
      <div role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <div css={projectsGroupFilterStyles(theme)} aria-label="Project groups">
        <Button
          variant="quiet"
          data-project-group="all"
          aria-pressed={activeGroup === 'all'}
          onClick={() => setActiveGroup('all')}
        >
          All Active
        </Button>
        <Button
          variant="quiet"
          data-project-group="none"
          aria-pressed={activeGroup === 'none'}
          onClick={() => setActiveGroup('none')}
        >
          No Campaign
        </Button>
      </div>

      <div css={projectsLedgerLayoutStyles(theme)}>
        <ProjectListSection
          lifecycle="active"
          {...(activeGroup === 'none'
            ? { campaignId: 'none' as const, heading: 'No Campaign' }
            : {})}
          onOpen={openProject}
          onRename={openRenameDialog}
          onLifecycle={openLifecycleDialog}
          onDelete={openDeleteDialog}
        />
        <ProjectListSection
          lifecycle="archived"
          onOpen={openProject}
          onRename={openRenameDialog}
          onLifecycle={openLifecycleDialog}
          onDelete={openDeleteDialog}
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
      {creating || routeCreateRequested ? (
        <NewProjectDialog
          returnFocusRef={dialogReturnRef}
          onClose={closeCreateDialog}
          onCreated={(current) => void navigate(projectPath(current.project.id))}
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
      {deleteProject ? (
        <DeleteProjectDialog
          project={deleteProject}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onDeleted={(title) => {
            setAnnouncement(`${title} deleted.`);
            closeDialog();
            window.requestAnimationFrame(() => headingRef.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
};

export interface ProjectRecordingCandidate {
  readonly file: File;
  readonly ready: boolean;
}

export interface ProjectRouteSurfaceProps {
  readonly workspaceMode?: boolean;
  readonly ownerUserId?: string;
  readonly creativeCheckpoint?: ReactNode;
  readonly sourceRuntime?: ProjectSourceRuntime;
  readonly recordingCandidate?: ProjectRecordingCandidate | null;
  readonly recordingActive?: boolean;
  readonly onStartRecording?: () => void;
  readonly onSourceActivityChange?: (activity: ProjectSourceActivity) => void;
  readonly onWorkingMediaActivityChange?: (activity: ProjectWorkingMediaActivity) => void;
  readonly onSessionChange?: (session: ProjectSessionPort | null) => void;
  readonly processing?: ProjectProcessingController;
  readonly creativeStore?: CreativeAssetStore;
  readonly onCreateProjectCharacter?: (projectId: string) => void;
  readonly onCreateProjectOutfit?: (projectId: string) => void;
}

const unavailableSourceRuntime: ProjectSourceRuntime = {
  present: () => undefined,
  clear: () => undefined,
};

interface ProjectSourceNotice {
  readonly title: string;
  readonly tone: 'neutral' | 'success' | 'warning' | 'danger';
  readonly body: string;
}

const projectSourceNotice = (
  phase: ProjectSourcePhase,
  message: string | null,
): ProjectSourceNotice | null => {
  switch (phase) {
    case 'hydrating':
      return {
        title: 'Preparing source',
        tone: 'neutral',
        body: 'Loading this Project’s saved source video onto the stage.',
      };
    case 'preparing':
      return {
        title: 'Preparing source',
        tone: 'neutral',
        body: 'Uploading and checking your video. You can reopen this Project once it is saved.',
      };
    case 'saving':
      return {
        title: 'Saving changes',
        tone: 'neutral',
        body: 'Saving the source video and this change to your Project.',
      };
    case 'saved':
      return null;
    case 'conflict':
      return {
        title: 'Conflict',
        tone: 'warning',
        body: message ?? 'The Project changed. Refresh before trying again.',
      };
    case 'error':
      return {
        title: 'Source not saved',
        tone: 'danger',
        body: message ?? 'The staged source was not accepted.',
      };
    case 'idle':
      return null;
  }
};

const ProjectSourceSection = ({
  current,
  runtime,
  recordingCandidate,
  recordingActive = false,
  onStartRecording,
  onActivityChange,
  onCurrentChange,
}: {
  readonly current: ProjectCurrentResponse;
  readonly runtime: ProjectSourceRuntime;
  readonly recordingCandidate?: ProjectRecordingCandidate | null | undefined;
  readonly recordingActive?: boolean | undefined;
  readonly onStartRecording?: (() => void) | undefined;
  readonly onActivityChange?: ((activity: ProjectSourceActivity) => void) | undefined;
  readonly onCurrentChange?: ((current: ProjectCurrentResponse) => void) | undefined;
}) => {
  const theme = useTheme();
  const inputRef = useRef<HTMLInputElement>(null);
  const savedVideoTriggerRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const controller = useProjectSourceController(
    current.project.id,
    current,
    runtime,
    onActivityChange,
    onCurrentChange,
  );
  const archived = current.project.archivedAt !== null;
  const controlsDisabled = archived || controller.busy || controller.accepted;
  const stateNotice = projectSourceNotice(controller.phase, controller.message);

  return (
    <>
      <section css={emptyProjectStyles(theme)} aria-labelledby="project-source-heading">
        <div>
          <h3 id="project-source-heading">
            {controller.accepted ? 'Source video' : 'No source yet'}
          </h3>
          {controller.accepted && controller.source ? (
            <>
              <p>
                {controller.source.filename} · {controller.source.width}×{controller.source.height}{' '}
                · {Math.round(controller.source.durationMs / 1_000)} seconds
              </p>
              <p>
                {controller.source.kind === 'saved-video-version'
                  ? 'This Project references the exact Saved Video Version and its existing bytes; it does not claim to have produced it.'
                  : 'This Project keeps this video as its source and it cannot be swapped out. Start a new Project to work from a different video.'}
              </p>
            </>
          ) : (
            <p>
              Choose the one video this Project works from. You can try again if an upload fails,
              but once a source is saved it cannot be changed.
            </p>
          )}
          {stateNotice ? (
            <StatusNotice
              role={
                controller.phase === 'error' || controller.phase === 'conflict' ? 'alert' : 'status'
              }
              tone={stateNotice.tone}
              title={stateNotice.title}
              css={{ marginBlockStart: theme.space.md }}
            >
              {stateNotice.body}
            </StatusNotice>
          ) : null}
        </div>
        <div data-source-actions>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm"
            hidden
            disabled={controlsDisabled}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.currentTarget.value = '';
              if (file) void controller.upload(file);
            }}
          />
          {recordingCandidate?.ready && !controller.accepted ? (
            <Button
              variant="primary"
              busy={controller.busy}
              disabled={archived || controller.busy}
              onClick={() => void controller.acceptRecording(recordingCandidate.file)}
            >
              Use finalized recording
            </Button>
          ) : (
            <Button
              disabled={controlsDisabled || onStartRecording === undefined}
              busy={recordingActive}
              onClick={onStartRecording}
            >
              Record
            </Button>
          )}
          <Button
            disabled={controlsDisabled || runtime === unavailableSourceRuntime}
            onClick={() => inputRef.current?.click()}
          >
            Upload
          </Button>
          <Button
            ref={savedVideoTriggerRef}
            disabled={controlsDisabled || runtime === unavailableSourceRuntime}
            onClick={() => setPickerOpen(true)}
          >
            Use Saved Video
          </Button>
          <small>Choosing, recording, or reopening a source never starts paid AI work.</small>
        </div>
      </section>
      <ProjectSavedVideoPicker
        open={pickerOpen}
        busy={controller.busy}
        title="Choose the Project source"
        returnFocusRef={savedVideoTriggerRef}
        onClose={() => setPickerOpen(false)}
        onSelect={(video) => {
          setPickerOpen(false);
          void controller.reuseSavedVideo(video);
        }}
      />
    </>
  );
};

const ProjectSessionNotice = ({
  session,
  sourceBusy,
}: {
  readonly session: ReturnType<typeof useProjectSession>;
  readonly sourceBusy: boolean;
}) => {
  const theme = useTheme();
  if (sourceBusy || session.current === null) return null;
  const actions = session.hasLocalProposal ? (
    <div css={dialogActionsStyles(theme)}>
      <Button onClick={() => void session.retry()}>Reapply changes</Button>
      <Button variant="danger" onClick={session.discard}>
        Discard local changes
      </Button>
    </div>
  ) : null;

  switch (session.phase) {
    case 'hydrating':
      return (
        <StatusNotice role="status" tone="neutral" title="Opening Project">
          Checking for changes saved elsewhere.
        </StatusNotice>
      );
    case 'dirty':
      return (
        <StatusNotice role="status" tone="neutral" title="Saving changes">
          Your changes are queued and save automatically in a moment.
        </StatusNotice>
      );
    case 'saving':
      return (
        <StatusNotice role="status" tone="neutral" title="Saving changes">
          Saving your recent changes together as one change.
        </StatusNotice>
      );
    case 'conflict':
      return (
        <StatusNotice role="alert" tone="warning" title="Conflict">
          <p>
            {session.message ??
              'This Project changed somewhere else. Your unsaved changes are still here.'}
          </p>
          {actions}
        </StatusNotice>
      );
    case 'error':
      return (
        <StatusNotice role="alert" tone="danger" title="Changes not saved">
          <p>
            {session.message ??
              'Lightframe could not be reached. Your unsaved changes are still here.'}
          </p>
          {actions}
        </StatusNotice>
      );
    case 'saved':
      return null;
  }
};

const projectWorkspaceSaveStatus = (
  session: ReturnType<typeof useProjectSession>,
  sourceBusy: boolean,
): { readonly label: string; readonly tone: 'success' | 'warning' | 'danger' } => {
  if (sourceBusy || session.phase === 'dirty' || session.phase === 'saving') {
    return { label: 'Saving changes', tone: 'warning' };
  }
  if (session.phase === 'conflict') return { label: 'Resolve conflict', tone: 'warning' };
  if (session.phase === 'error') return { label: 'Changes not saved', tone: 'danger' };
  return { label: 'All changes saved', tone: 'success' };
};

const ProjectDetail = ({
  projectId,
  workspaceMode = false,
  sourceRuntime = unavailableSourceRuntime,
  recordingCandidate,
  recordingActive,
  onStartRecording,
  onSourceActivityChange,
  onWorkingMediaActivityChange,
  onSessionChange,
  creativeCheckpoint,
  processing,
  ownerUserId,
  creativeStore,
  onCreateProjectCharacter,
  onCreateProjectOutfit,
}: { readonly projectId: string } & ProjectRouteSurfaceProps) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const goBack = useRouteBack();
  const session = useProjectSession(projectId);
  const campaign = useCampaignDetail(session.current?.project.campaignId ?? null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogReturnRef = useRef<HTMLElement | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectContract | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    readonly action: LifecycleAction;
    readonly project: ProjectContract;
  } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectContract | null>(null);
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [sourceActivity, setSourceActivity] = useState<ProjectSourceActivity | null>(null);
  const requestedWorkspaceTask = new URLSearchParams(location.search).get('task');
  const pinnedWorkspaceTask = isProjectWorkspaceTask(requestedWorkspaceTask)
    ? requestedWorkspaceTask
    : null;
  const workspacePhaseTask = session.current
    ? stepForSnapshot(session.current.revision.snapshot)
    : null;
  // Latched on entry, deliberately: the workspace should open on the step the Project is up to,
  // but a phase change mid-session must not pull the open panel out from under the user. Their own
  // choice pins itself in the URL and outranks both. Adjusted during render rather than in an
  // effect so the first paint already shows the right task — the latch resets on leaving the
  // workspace, so reopening derives afresh.
  const [enteredWorkspaceTask, setEnteredWorkspaceTask] = useState<ProjectWorkspaceTask | null>(
    null,
  );
  if (!workspaceMode && enteredWorkspaceTask !== null) setEnteredWorkspaceTask(null);
  else if (workspaceMode && enteredWorkspaceTask === null && workspacePhaseTask !== null)
    setEnteredWorkspaceTask(workspacePhaseTask);
  // Replace rather than push: an entry per tab click would make the masthead's Overview button
  // (useRouteBack) walk back through tasks instead of leaving the workspace.
  const selectWorkspaceTask = useCallback(
    (task: ProjectWorkspaceTask) => {
      void navigate(projectWorkspacePath(projectId, task), { replace: true });
    },
    [navigate, projectId],
  );
  const handleSourceActivity = useCallback(
    (activity: ProjectSourceActivity) => {
      setSourceActivity(activity);
      onSourceActivityChange?.(activity);
    },
    [onSourceActivityChange],
  );
  const detailContentStyles = workspaceMode ? workspaceInnerStyles : projectOverviewInnerStyles;
  const acceptSession = session.acceptCurrent;
  // Accepting a source from the overview lands the operator in the workspace, where the media stage
  // holding the accepted original is visible. The identity must stay stable: the source controller
  // re-runs its hydration effect whenever this callback changes.
  const acceptOverviewSource = useCallback(
    (next: ProjectCurrentResponse) => {
      acceptSession(next);
      if (next.revision.snapshot.sourceAssetId !== null) {
        void navigate(projectWorkspacePath(next.project.id));
      }
    },
    [acceptSession, navigate],
  );

  useEffect(() => {
    onSessionChange?.(session.port);
  }, [onSessionChange, session.port]);
  useEffect(() => {
    return () => {
      onSessionChange?.(null);
    };
  }, [onSessionChange]);

  if (session.current === null && session.phase === 'hydrating') {
    return (
      <div css={detailContentStyles(theme)}>
        <p role="status">Loading Project…</p>
      </div>
    );
  }
  if (session.current === null) {
    return (
      <div css={detailContentStyles(theme)}>
        <StatusNotice role="alert" tone="danger" title="Project unavailable">
          <p>
            {session.message ?? 'Projects could not be loaded. Check the local API and try again.'}
          </p>
          <div css={dialogActionsStyles(theme)}>
            <Button variant="quiet" onClick={() => goBack(APP_PATHS.projects)}>
              Back to Projects
            </Button>
            <Button variant="primary" onClick={() => void session.retry()}>
              Retry
            </Button>
          </div>
        </StatusNotice>
      </div>
    );
  }

  const current = session.current;
  const project = current.project;
  const archived = project.archivedAt !== null;
  const overviewHasSource = current.revision.snapshot.sourceAssetId !== null;
  const campaignName = campaign.data?.name ?? null;
  const closeDialog = () => {
    setRenameTarget(null);
    setLifecycleDialog(null);
    setDeleteTarget(null);
    setCampaignDialog(false);
  };

  if (workspaceMode) {
    const saveStatus = projectWorkspaceSaveStatus(session, sourceActivity?.busy ?? false);
    const activeWorkspaceTask =
      pinnedWorkspaceTask ?? enteredWorkspaceTask ?? stepForSnapshot(current.revision.snapshot);
    const focusWorkspaceTask = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const lastIndex = projectWorkspaceTasks.length - 1;
      const nextIndex =
        event.key === 'ArrowRight'
          ? index === lastIndex
            ? 0
            : index + 1
          : event.key === 'ArrowLeft'
            ? index === 0
              ? lastIndex
              : index - 1
            : event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? lastIndex
                : null;
      if (nextIndex === null) return;
      event.preventDefault();
      const nextTask = projectWorkspaceTasks[nextIndex];
      if (!nextTask) return;
      selectWorkspaceTask(nextTask.id);
      window.requestAnimationFrame(() => {
        document.getElementById(`project-task-${nextTask.id}-tab`)?.focus();
      });
    };

    return (
      <>
        <header css={workspaceMastheadStyles(theme)} data-project-workspace-masthead="">
          <Button
            data-detail-breadcrumb
            variant="quiet"
            aria-label="← Project overview"
            onClick={() => goBack(projectPath(project.id))}
          >
            <AppIcon name="chevronLeft" />
            Overview
          </Button>
          <span data-workspace-divider aria-hidden="true" />
          <div data-workspace-title>
            <h1 ref={headingRef} tabIndex={-1}>
              {project.title}
            </h1>
            <span data-workspace-project-status>{projectStatusLabel(project.status)}</span>
          </div>
          <ProjectWorkflowProgress snapshot={current.revision.snapshot} variant="masthead" />
          <span
            role="status"
            aria-live="polite"
            aria-atomic="true"
            data-workspace-save-status=""
            data-tone={saveStatus.tone}
          >
            <span data-workspace-save-status-dot aria-hidden="true" />
            <span data-workspace-save-label>{saveStatus.label}</span>
          </span>
        </header>

        <aside css={taskInspectorStyles(theme)} aria-label="Guided task inspector">
          <div css={taskNavigationStyles(theme)} role="tablist" aria-label="Project tasks">
            {projectWorkspaceTasks.map((task, index) => (
              <button
                key={task.id}
                id={`project-task-${task.id}-tab`}
                type="button"
                role="tab"
                tabIndex={activeWorkspaceTask === task.id ? 0 : -1}
                aria-selected={activeWorkspaceTask === task.id}
                aria-controls={`project-task-${task.id}-panel`}
                onClick={() => selectWorkspaceTask(task.id)}
                onKeyDown={(event) => focusWorkspaceTask(event, index)}
              >
                <AppIcon name={task.icon} />
                <span>{task.label}</span>
              </button>
            ))}
          </div>

          <div css={taskBodyStyles(theme)}>
            <div role="status" aria-live="polite" aria-atomic="true">
              {announcement}
            </div>
            <ProjectSessionNotice session={session} sourceBusy={sourceActivity?.busy ?? false} />

            <section
              id="project-task-source-panel"
              role="tabpanel"
              tabIndex={0}
              aria-labelledby="project-task-source-tab"
              hidden={activeWorkspaceTask !== 'source'}
              css={taskPanelStyles(theme)}
            >
              <header>
                <h2>Project Source</h2>
                <p>Select the immutable original video.</p>
              </header>
              <ProjectSourceSection
                key={current.project.id}
                current={current}
                runtime={sourceRuntime}
                recordingCandidate={recordingCandidate}
                recordingActive={recordingActive}
                onStartRecording={onStartRecording}
                onActivityChange={handleSourceActivity}
                onCurrentChange={session.acceptCurrent}
              />
            </section>

            <section
              id="project-task-create-panel"
              role="tabpanel"
              tabIndex={0}
              aria-labelledby="project-task-create-tab"
              hidden={activeWorkspaceTask !== 'create'}
              css={taskPanelStyles(theme)}
            >
              <header>
                <h2>Create</h2>
                <p>Build from the current source and manage durable working media.</p>
                <span data-task-revision>Revision {project.currentRevisionNumber}</span>
              </header>
              {creativeCheckpoint}
              <ProjectWorkingMediaSection
                current={current}
                session={session.port}
                archived={archived}
                {...(onWorkingMediaActivityChange
                  ? { onActivityChange: onWorkingMediaActivityChange }
                  : {})}
              />
              {processing ? (
                <ProjectProcessingStatusPanel controller={processing} />
              ) : (
                <StatusNotice role="status" tone="neutral" title="Processing unavailable">
                  No provider work can be submitted from this workspace.
                </StatusNotice>
              )}
            </section>

            <section
              id="project-task-save-panel"
              role="tabpanel"
              tabIndex={0}
              aria-labelledby="project-task-save-tab"
              hidden={activeWorkspaceTask !== 'save'}
              css={taskPanelStyles(theme)}
            >
              <header>
                <h2>Save</h2>
                <p>Retain the current result as a new Video or an explicit Version.</p>
              </header>
              <ProjectOutputSaveSection
                current={current}
                session={session.port}
                archived={archived}
                ownerUserId={ownerUserId}
              />
            </section>

            <section
              id="project-task-history-panel"
              role="tabpanel"
              tabIndex={0}
              aria-labelledby="project-task-history-tab"
              hidden={activeWorkspaceTask !== 'history'}
              css={taskPanelStyles(theme)}
            >
              <header>
                <h2>History</h2>
                <p>Review retained revisions, outputs, and processing activity.</p>
              </header>
              {/* Mounted on demand: this section opens three history queries the other tasks never need. */}
              {activeWorkspaceTask === 'history' ? (
                <ProjectHistorySection
                  current={current}
                  session={session.port}
                  archived={archived}
                />
              ) : null}
            </section>
          </div>
        </aside>
      </>
    );
  }

  return (
    <div css={projectOverviewInnerStyles(theme)} data-project-overview="">
      <header css={projectOverviewHeaderStyles(theme)}>
        <Button
          data-detail-breadcrumb
          variant="quiet"
          onClick={() =>
            goBack(
              project.campaignId === null ? APP_PATHS.projects : campaignPath(project.campaignId),
            )
          }
        >
          {project.campaignId === null
            ? '← All Projects'
            : campaignName === null
              ? '← Campaign'
              : `← ${campaignName}`}
        </Button>
        <div data-detail-identity>
          <div>
            <h1 ref={headingRef} tabIndex={-1}>
              {project.title}
            </h1>
            <div data-detail-meta>
              <span data-project-overview-status>{projectStatusLabel(project.status)}</span>
              <span>
                Updated{' '}
                <time dateTime={project.updatedAt}>{formatDateTime(project.updatedAt)}</time>
              </span>
              <span>Revision {project.currentRevisionNumber}</span>
              {project.campaignId === null ? (
                <span>No Campaign</span>
              ) : (
                <span aria-live="polite">
                  {campaign.isPending
                    ? 'Campaign: loading…'
                    : campaign.isError || campaignName === null
                      ? 'Campaign unavailable'
                      : `Campaign: ${campaignName}`}
                </span>
              )}
            </div>
            <div data-project-workspace-status>
              <AppIcon name="info" />
              <span>
                {overviewHasSource
                  ? `Source ready • ${projectWorkflowLabel(current.revision.snapshot.workflowPhase)} workflow active.`
                  : 'No source yet • Choose the original video below to begin.'}
              </span>
            </div>
            <ProjectWorkflowProgress snapshot={current.revision.snapshot} />
          </div>
          <div data-detail-actions>
            <Button
              variant="primary"
              data-detail-action="continue"
              onClick={() => void navigate(projectWorkspacePath(project.id))}
            >
              {archived ? 'View workspace' : overviewHasSource ? 'Continue editing' : 'Add source'}
            </Button>
            <Button
              data-detail-action="move"
              onClick={(event) => {
                dialogReturnRef.current = event.currentTarget;
                setCampaignDialog(true);
              }}
            >
              Move Project
            </Button>
            {!archived ? (
              <Button
                data-detail-action="rename"
                onClick={(event) => {
                  dialogReturnRef.current = event.currentTarget;
                  setRenameTarget(project);
                }}
              >
                Rename
              </Button>
            ) : null}
            <Button
              variant={archived ? 'secondary' : 'danger'}
              data-detail-action="archive"
              onClick={(event) => {
                dialogReturnRef.current = event.currentTarget;
                setLifecycleDialog({ action: archived ? 'restore' : 'archive', project });
              }}
            >
              {archived ? 'Restore' : 'Archive'}
            </Button>
            {archived ? (
              <Button
                variant="danger"
                data-detail-action="delete"
                onClick={(event) => {
                  dialogReturnRef.current = event.currentTarget;
                  setDeleteTarget(project);
                }}
              >
                Delete Project
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      {!archived && !overviewHasSource ? (
        <section
          css={projectOverviewSourceStyles(theme)}
          aria-labelledby="project-overview-source-heading"
          data-project-overview-source=""
        >
          <header>
            <h2 id="project-overview-source-heading">Project source</h2>
            <p>
              Every Project is built from one original video that never changes. Choose it here, or
              open the workspace to do it later.
            </p>
          </header>
          <ProjectSourceSection
            key={project.id}
            current={current}
            runtime={sourceRuntime}
            recordingCandidate={recordingCandidate}
            recordingActive={recordingActive}
            {...(onStartRecording ? { onStartRecording } : {})}
            {...(onSourceActivityChange ? { onActivityChange: onSourceActivityChange } : {})}
            onCurrentChange={acceptOverviewSource}
          />
        </section>
      ) : null}

      <ProjectAssetsSection
        projectId={project.id}
        archived={archived}
        projectHasSource={overviewHasSource}
        session={session.port}
        {...(creativeStore ? { creativeStore } : {})}
        {...(onCreateProjectCharacter ? { onCreateCharacter: onCreateProjectCharacter } : {})}
        {...(onCreateProjectOutfit ? { onCreateOutfit: onCreateProjectOutfit } : {})}
      />

      {renameTarget ? (
        <RenameProjectDialog
          project={renameTarget}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onRenamed={(updated) => {
            session.acceptCurrent(updated);
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
            session.acceptCurrent(updated);
            setAnnouncement(`${updated.project.title} moved to ${location}.`);
            closeDialog();
          }}
        />
      ) : null}
      {lifecycleDialog ? (
        <ProjectLifecycleDialog
          action={lifecycleDialog.action}
          project={lifecycleDialog.project}
          {...(lifecycleDialog.action === 'archive' && processing?.attempt?.blocksArchive
            ? {
                archiveBlockedReason: processing.attempt.ambiguous
                  ? 'Archive is blocked because submission acceptance is unresolved. Another attempt may duplicate provider cost; use the explicit retry decision first.'
                  : 'Archive is blocked while accepted provider work is active. Leaving or switching does not stop provider work or cost; reopen this Project to reconnect.',
              }
            : {})}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onChanged={(updated, action) => {
            session.acceptCurrent(updated);
            setAnnouncement(
              `${updated.project.title} ${action === 'archive' ? 'archived' : 'restored'}.`,
            );
            closeDialog();
            window.requestAnimationFrame(() => headingRef.current?.focus());
          }}
        />
      ) : null}
      {deleteTarget ? (
        <DeleteProjectDialog
          project={deleteTarget}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onDeleted={() =>
            void navigate(
              project.campaignId === null ? APP_PATHS.projects : campaignPath(project.campaignId),
              { replace: true },
            )
          }
        />
      ) : null}
    </div>
  );
};

export const ProjectRouteSurface = (props: ProjectRouteSurfaceProps = {}) => {
  const theme = useTheme();
  const location = useLocation();
  const projectId = projectIdFromPath(location.pathname);
  const workspaceMode = props.workspaceMode ?? isProjectWorkspacePath(location.pathname);
  const routeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (routeRef.current) routeRef.current.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div
      ref={routeRef}
      css={
        projectId === null
          ? projectsIndexRouteStyles(theme)
          : workspaceMode
            ? projectWorkspaceRouteStyles()
            : projectOverviewRouteStyles(theme)
      }
      data-project-route=""
    >
      {projectId === null ? (
        <ProjectsWorkspace />
      ) : (
        <ProjectDetail projectId={projectId} {...props} workspaceMode={workspaceMode} />
      )}
    </div>
  );
};
