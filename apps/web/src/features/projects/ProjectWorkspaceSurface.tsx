import { useTheme } from '@emotion/react';
import type { ProjectCurrentResponse } from '@studio/contracts';
import { useCallback, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { projectPath, projectWorkspacePath } from '../../app/paths';
import { useRouteBack } from '../../app/useRouteBack';
import { AppIcon, Button, StatusNotice } from '../../ui';
import { projectProcessingBlockedReason } from './projectProcessingPresentation';
import { ProjectHistorySection } from './ProjectHistorySection';
import { ProjectOutputSaveSection } from './ProjectOutputSaveSection';
import { saveTaskPanelStyles } from './ProjectOutputSaveSection.styles';
import { ProjectProcessingStatusPanel } from './ProjectProcessingStatusPanel';
import { dialogActionsStyles } from './ProjectRouteSurface.styles';
import { ProjectSourceSection, type ProjectRecordingCandidate } from './ProjectSourceSection';
import { projectStatusLabel } from './projectStatusPresentation';
import {
  taskBodyStyles,
  taskInspectorStyles,
  taskNavigationStyles,
  taskPanelStyles,
  workspaceMastheadStyles,
} from './ProjectWorkspaceSurface.styles';
import { ProjectWorkingMediaSection } from './ProjectWorkingMediaSection';
import type { ProjectWorkingMediaActivity } from './ProjectWorkingMediaSection';
import {
  PROJECT_WORKFLOW_STEPS,
  ProjectWorkflowProgress,
  stepForSnapshot,
  type ProjectWorkflowStepId,
} from './ProjectWorkflowProgress';
import type { ProjectProcessingController } from './useProjectProcessingController';
import type { useProjectSession } from './useProjectSession';
import type { ProjectSourceActivity, ProjectSourceRuntime } from './useProjectSourceController';

export type ProjectWorkspaceTask = ProjectWorkflowStepId;

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

export const isProjectWorkspaceTask = (value: string | null): value is ProjectWorkspaceTask =>
  value !== null && PROJECT_WORKFLOW_STEPS.some(({ id }) => id === value);

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
      return null;
    case 'dirty':
    case 'saving':
      return null;
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
  updatedAt: string,
): {
  readonly label: string;
  readonly tone: 'neutral' | 'warning' | 'danger';
  readonly dateTime?: string;
} => {
  if (sourceBusy || session.phase === 'saving') {
    return { label: 'Autosaving…', tone: 'neutral' };
  }
  if (session.phase === 'dirty') return { label: 'Unsaved changes', tone: 'neutral' };
  if (session.phase === 'hydrating') return { label: 'Checking save…', tone: 'neutral' };
  if (session.phase === 'conflict') return { label: 'Conflict', tone: 'warning' };
  if (session.phase === 'error') return { label: 'Not autosaved', tone: 'danger' };
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(
    new Date(updatedAt),
  );
  return { label: `Autosaved · ${time}`, tone: 'neutral', dateTime: updatedAt };
};

interface ProjectWorkspaceSurfaceProps {
  readonly current: ProjectCurrentResponse;
  readonly session: ReturnType<typeof useProjectSession>;
  readonly onSourceActivityChange?: ((activity: ProjectSourceActivity) => void) | undefined;
  readonly onWorkingMediaActivityChange?:
    ((activity: ProjectWorkingMediaActivity) => void) | undefined;
  readonly sourceRuntime: ProjectSourceRuntime;
  readonly recordingCandidate?: ProjectRecordingCandidate | null | undefined;
  readonly recordingActive?: boolean | undefined;
  readonly onStartRecording?: (() => void) | undefined;
  readonly creativeCheckpoint?: ReactNode;
  readonly processing?: ProjectProcessingController | undefined;
  readonly ownerUserId?: string | undefined;
}

export const ProjectWorkspaceSurface = ({
  current,
  session,
  onSourceActivityChange,
  onWorkingMediaActivityChange,
  sourceRuntime,
  recordingCandidate,
  recordingActive,
  onStartRecording,
  creativeCheckpoint,
  processing,
  ownerUserId,
}: ProjectWorkspaceSurfaceProps) => {
  const theme = useTheme();
  const goBack = useRouteBack();
  const navigate = useNavigate();
  const location = useLocation();
  const project = current.project;
  const archived = project.archivedAt !== null;
  const [sourceActivity, setSourceActivity] = useState<ProjectSourceActivity | null>(null);
  const [workingMediaActivity, setWorkingMediaActivity] =
    useState<ProjectWorkingMediaActivity | null>(null);
  const handleSourceActivity = useCallback(
    (activity: ProjectSourceActivity) => {
      setSourceActivity(activity);
      onSourceActivityChange?.(activity);
    },
    [onSourceActivityChange],
  );
  const handleWorkingMediaActivity = useCallback(
    (activity: ProjectWorkingMediaActivity) => {
      setWorkingMediaActivity(activity);
      onWorkingMediaActivityChange?.(activity);
    },
    [onWorkingMediaActivityChange],
  );
  // Replace rather than push: an entry per tab click would make the masthead's Overview button
  // (useRouteBack) walk back through tasks instead of leaving the workspace.
  const selectWorkspaceTask = useCallback(
    (task: ProjectWorkspaceTask) => {
      void navigate(projectWorkspacePath(project.id, task), { replace: true });
    },
    [navigate, project.id],
  );
  const requestedWorkspaceTask = new URLSearchParams(location.search).get('task');
  const pinnedWorkspaceTask = isProjectWorkspaceTask(requestedWorkspaceTask)
    ? requestedWorkspaceTask
    : null;
  // Latched on entry, deliberately: the workspace should open on the step the Project is up to,
  // but a phase change mid-session must not pull the open panel out from under the user. Their own
  // choice pins itself in the URL and outranks both. Adjusted during render rather than in an
  // effect so the first paint already shows the right task — this component only mounts inside the
  // workspace, so leaving it discards the latch and reopening derives afresh.
  const [enteredWorkspaceTask, setEnteredWorkspaceTask] = useState<ProjectWorkspaceTask | null>(
    null,
  );
  if (enteredWorkspaceTask === null)
    setEnteredWorkspaceTask(stepForSnapshot(current.revision.snapshot));
  const saveStatus = projectWorkspaceSaveStatus(
    session,
    sourceActivity?.busy ?? false,
    current.revision.snapshot.updatedAt,
  );
  // Removing the source moves the Project out from under anything still deriving from it. The
  // server refuses these too; naming the reason here keeps the operator from guessing.
  //
  // Deliberately not gated on `recordingActive`: that stays true for the whole live workspace,
  // not just while a take is capturing, so gating on it would disable removal permanently.
  // Capture writes no Project revision, and the server's CAS settles any genuine race.
  const sourceRemovalBlockedReason =
    projectProcessingBlockedReason(processing?.attempt, 'source-removal') ??
    (workingMediaActivity?.busy
      ? 'Finish updating the current cut before removing the original video.'
      : undefined);
  const activeWorkspaceTask =
    pinnedWorkspaceTask ?? enteredWorkspaceTask ?? stepForSnapshot(current.revision.snapshot);
  const focusWorkspaceTask = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const lastIndex = projectWorkspaceTasks.length - 1;
    const nextIndex: Record<string, number | undefined> = {
      ArrowRight: index === lastIndex ? 0 : index + 1,
      ArrowLeft: index === 0 ? lastIndex : index - 1,
      Home: 0,
      End: lastIndex,
    };
    const target = nextIndex[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const nextTask = projectWorkspaceTasks[target];
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
          <h1 tabIndex={-1}>{project.title}</h1>
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
          <span data-workspace-save-label>
            {saveStatus.dateTime ? (
              <time dateTime={saveStatus.dateTime}>{saveStatus.label}</time>
            ) : (
              saveStatus.label
            )}
          </span>
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
              <h2>Original video</h2>
              <p>Choose the one video this Project works from.</p>
            </header>
            <ProjectSourceSection
              key={current.project.id}
              current={current}
              runtime={sourceRuntime}
              recordingCandidate={recordingCandidate}
              recordingActive={recordingActive}
              removalBlockedReason={sourceRemovalBlockedReason}
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
              <p>Build from the original video and manage the current cut.</p>
            </header>
            {creativeCheckpoint}
            <ProjectWorkingMediaSection
              current={current}
              session={session.port}
              archived={archived}
              onActivityChange={handleWorkingMediaActivity}
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
            css={[taskPanelStyles(theme), saveTaskPanelStyles(theme)]}
            data-project-save-task-panel=""
          >
            <header>
              <h2>Save</h2>
              <p>Choose a placement, then save the exact current cut shown on the stage.</p>
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
              <p>Every change, saved version and AI run for this Project.</p>
            </header>
            {/* Mounted on demand: this section opens three history queries the other tasks never need. */}
            {activeWorkspaceTask === 'history' ? (
              <ProjectHistorySection current={current} session={session.port} archived={archived} />
            ) : null}
          </section>
        </div>
      </aside>
    </>
  );
};
