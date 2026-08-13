import { useTheme } from '@emotion/react';
import type { ProjectContract, ProjectCurrentResponse } from '@studio/contracts';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { APP_PATHS, projectIdFromPath, projectPath } from '../../app/paths';
import { Button, StatusNotice } from '../../ui';
import {
  ProjectCampaignDialog,
  ProjectLifecycleDialog,
  RenameProjectDialog,
  safeProjectError,
  type ProjectLifecycleAction as LifecycleAction,
} from './ProjectDialogs';
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
import { useProjectList, useProjectsController } from './useProjectsController';
import { ProjectSavedVideoPicker } from './ProjectSavedVideoPicker';
import { useProjectSession, type ProjectSessionPort } from './useProjectSession';
import {
  useProjectSourceController,
  type ProjectSourceActivity,
  type ProjectSourcePhase,
  type ProjectSourceRuntime,
} from './useProjectSourceController';

const projectStatusLabel = (status: ProjectContract['status']): string =>
  status === 'needs-attention'
    ? 'Needs attention'
    : status.charAt(0).toUpperCase() + status.slice(1);

const formatUpdatedAt = (value: string): string =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

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
            Create and manage focused video work. Each Project can retain one inspected immutable
            video original; creative-session autosave and output saving arrive later.
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

export interface ProjectRecordingCandidate {
  readonly file: File;
  readonly ready: boolean;
}

export interface ProjectRouteSurfaceProps {
  readonly sourceRuntime?: ProjectSourceRuntime;
  readonly recordingCandidate?: ProjectRecordingCandidate | null;
  readonly recordingActive?: boolean;
  readonly onStartRecording?: () => void;
  readonly onSourceActivityChange?: (activity: ProjectSourceActivity) => void;
  readonly onSessionChange?: (session: ProjectSessionPort | null) => void;
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
        body: 'Restoring the durable Project source into the media stage.',
      };
    case 'preparing':
      return {
        title: 'Preparing source',
        tone: 'neutral',
        body: 'Transferring and inspecting source media. This Project is not resumable until acceptance completes.',
      };
    case 'saving':
      return {
        title: 'Saving changes',
        tone: 'neutral',
        body: 'Committing the immutable original and Project revision.',
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
            {controller.accepted ? 'Immutable original' : 'No source yet'}
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
                  : 'The accepted original is retained by this Project and cannot be replaced. Start a new Project for a different original.'}
              </p>
            </>
          ) : (
            <>
              <p>
                Choose one video as this Project&apos;s immutable original. Upload and finalized
                recording previews stay local while the server stores and inspects the source.
              </p>
              <p>
                A failed or cancelled staging attempt can be replaced. After acceptance, a different
                original always starts a new Project.
              </p>
            </>
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
          <small>
            No provider starts from source selection, hydration, recording acceptance, or resume.
          </small>
        </div>
      </section>
      <ProjectSavedVideoPicker
        open={pickerOpen}
        busy={controller.busy}
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
          Checking the current Project revision with server authority.
        </StatusNotice>
      );
    case 'dirty':
      return (
        <StatusNotice role="status" tone="neutral" title="Saving changes">
          A semantic Project checkpoint is queued for the bounded autosave interval.
        </StatusNotice>
      );
    case 'saving':
      return (
        <StatusNotice role="status" tone="neutral" title="Saving changes">
          Committing one coalesced semantic Project revision.
        </StatusNotice>
      );
    case 'conflict':
      return (
        <StatusNotice role="alert" tone="warning" title="Conflict">
          <p>
            {session.message ??
              'The Project changed in another session. Your local proposal was preserved.'}
          </p>
          {actions}
        </StatusNotice>
      );
    case 'error':
      return (
        <StatusNotice role="alert" tone="danger" title="Changes not saved">
          <p>
            {session.message ?? 'Project authority is unavailable. Your proposal was preserved.'}
          </p>
          {actions}
        </StatusNotice>
      );
    case 'saved':
      return (
        <StatusNotice role="status" tone="success" title="All changes saved">
          Project identity, durable source references, workflow phase, and session metadata match
          server authority.
        </StatusNotice>
      );
  }
};

const ProjectDetail = ({
  projectId,
  sourceRuntime = unavailableSourceRuntime,
  recordingCandidate,
  recordingActive,
  onStartRecording,
  onSourceActivityChange,
  onSessionChange,
}: { readonly projectId: string } & ProjectRouteSurfaceProps) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const session = useProjectSession(projectId);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogReturnRef = useRef<HTMLElement | null>(null);
  const [renameTarget, setRenameTarget] = useState<ProjectContract | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    readonly action: LifecycleAction;
    readonly project: ProjectContract;
  } | null>(null);
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [sourceActivity, setSourceActivity] = useState<ProjectSourceActivity | null>(null);
  const handleSourceActivity = useCallback(
    (activity: ProjectSourceActivity) => {
      setSourceActivity(activity);
      onSourceActivityChange?.(activity);
    },
    [onSourceActivityChange],
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
      <div css={workspaceInnerStyles(theme)}>
        <p role="status">Loading Project…</p>
      </div>
    );
  }
  if (session.current === null) {
    return (
      <div css={workspaceInnerStyles(theme)}>
        <StatusNotice role="alert" tone="danger" title="Project unavailable">
          <p>
            {session.message ?? 'Projects could not be loaded. Check the local API and try again.'}
          </p>
          <div css={dialogActionsStyles(theme)}>
            <Button variant="quiet" onClick={() => void navigate(APP_PATHS.projects)}>
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

      <ProjectSessionNotice session={session} sourceBusy={sourceActivity?.busy ?? false} />

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
    </div>
  );
};

export const ProjectRouteSurface = (props: ProjectRouteSurfaceProps = {}) => {
  const theme = useTheme();
  const location = useLocation();
  const projectId = projectIdFromPath(location.pathname);
  const routeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (routeRef.current) routeRef.current.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div ref={routeRef} css={workspaceStyles(theme)} data-project-route="">
      {projectId === null ? (
        <ProjectsWorkspace />
      ) : (
        <ProjectDetail projectId={projectId} {...props} />
      )}
    </div>
  );
};
