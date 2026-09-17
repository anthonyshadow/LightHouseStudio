import { useTheme } from '@emotion/react';
import type { ProjectCurrentResponse } from '@studio/contracts';
import { projectOriginalIsRemovable } from '@studio/domain';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { projectPath, projectWorkspacePath } from '../../app/paths';
import { useRouteBack } from '../../app/useRouteBack';
import { AppIcon, Button } from '../../ui';
import { ProjectCreateTaskPanel, type ProjectCreateRuntime } from './ProjectCreateTaskPanel';
import type { ProjectRecordingLaunchRefusal } from './projectRecordingLaunch';
import { ProjectRunOverlay, projectRunInFlight } from './ProjectRunOverlay';
import { projectProcessingBlockedReason } from './projectProcessingPresentation';
import { ProjectHistorySection } from './ProjectHistorySection';
import { ProjectOutputSaveSection } from './ProjectOutputSaveSection';
import { saveTaskPanelStyles } from './ProjectOutputSaveSection.styles';
import { ProjectSessionNotice, projectWorkspaceSaveStatus } from './projectSaveStatus';
import { ProjectMediaSection, type ProjectMediaActivity } from './ProjectMediaSection';
import { ProjectSourceSection, type ProjectRecordingCandidate } from './ProjectSourceSection';
import { projectStatusLabel } from './projectStatusPresentation';
import {
  taskBodyStyles,
  taskInspectorStyles,
  taskNavigationStyles,
  taskPanelStyles,
  workspaceMastheadStyles,
} from './ProjectWorkspaceSurface.styles';
import type { ProjectWorkingMediaActivity } from './ProjectWorkingMediaSection';
import {
  PROJECT_WORKFLOW_STEPS,
  ProjectWorkflowProgress,
  entryTaskForSnapshot,
  type ProjectWorkflowStepId,
} from './ProjectWorkflowProgress';
import { useProjectHeldSourceCount } from './useProjectMediaController';
import type { ProjectProcessingController } from './useProjectProcessingController';
import type { useProjectSession } from './useProjectSession';
import {
  busyProjectSourceActivity,
  type ProjectSourceActivity,
  type ProjectSourceRuntime,
} from './useProjectSourceController';

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

interface ProjectWorkspaceSurfaceProps {
  readonly current: ProjectCurrentResponse;
  readonly session: ReturnType<typeof useProjectSession>;
  readonly onSourceActivityChange?: ((activity: ProjectSourceActivity) => void) | undefined;
  readonly onWorkingMediaActivityChange?:
    ((activity: ProjectWorkingMediaActivity) => void) | undefined;
  readonly sourceRuntime: ProjectSourceRuntime;
  readonly recordingCandidate?: ProjectRecordingCandidate | null | undefined;
  readonly stageHoldsSource?: boolean | undefined;
  readonly recordingActive?: boolean | undefined;
  readonly recordingSupported?: boolean | undefined;
  /** Answers a refusal, or nothing, so the section holding the button can speak for a dead press. */
  readonly onStartRecording?: (() => ProjectRecordingLaunchRefusal | null) | undefined;
  /** Opens the arrangement editor, where a caller owns a surface for it to take over. */
  readonly onArrangeComposition?: (() => void) | undefined;
  readonly createRuntime?: ProjectCreateRuntime | undefined;
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
  stageHoldsSource,
  recordingActive,
  recordingSupported,
  onStartRecording,
  onArrangeComposition,
  createRuntime,
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
  const [mediaActivity, setMediaActivity] = useState<ProjectMediaActivity | null>(null);
  const mediaBusy = mediaActivity?.busy ?? false;
  // The collection the Media area works on, observed here too rather than relayed up out of it:
  // the control below applies a domain rule to the count, and the two share one cache entry. Read
  // only where that section exists, so a Project with no original still asks for nothing.
  const heldSourceCount = useProjectHeldSourceCount(
    current.project.id,
    current.revision.snapshot.sourceAssetId !== null,
  );
  /*
   * One report upward for both surfaces that hold this Project's media.
   *
   * The shell's exit guard, logout and expiry read a single activity, and until the Media area
   * existed a single section produced it. Reporting only the original-video section's own work
   * meant a multi-minute conversion or a 300 MB upload started in the Media area was invisible to
   * all three: leaving discarded it without asking. Memoised on the facts rather than on the media
   * record, so the shell's own "same work as last time" bail-out still fires while one runs.
   */
  const mediaAbort = mediaActivity?.abort ?? null;
  const reportedSourceActivity = useMemo(
    () =>
      sourceActivity === null || !mediaBusy
        ? sourceActivity
        : busyProjectSourceActivity(sourceActivity, mediaAbort),
    [mediaAbort, mediaBusy, sourceActivity],
  );
  useEffect(() => {
    if (reportedSourceActivity !== null) onSourceActivityChange?.(reportedSourceActivity);
  }, [onSourceActivityChange, reportedSourceActivity]);
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
  // Leaving Create for Original unmounts the button that was pressed, so focus has to be placed
  // deliberately — the same move the tablist's own arrow keys make.
  const openSourceTask = useCallback(() => {
    selectWorkspaceTask('source');
    window.requestAnimationFrame(() => {
      document.getElementById('project-task-source-tab')?.focus();
    });
  }, [selectWorkspaceTask]);
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
    setEnteredWorkspaceTask(entryTaskForSnapshot(current.revision.snapshot));
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
  /*
   * Why the original cannot be let go of right now. First condition wins, so the standing refusal
   * is stated before any passing one — and it is the domain's own rule, read through
   * `projectOriginalIsRemovable` rather than restated here, because a browser that disagrees with
   * it offers a confirmation that can only ever fail.
   */
  const sourceRemovalBlockedReason = ((): string | undefined => {
    const attempt = projectProcessingBlockedReason(processing?.attempt, 'source-removal');
    if (attempt !== undefined) return attempt;
    if (!projectOriginalIsRemovable(heldSourceCount)) {
      return 'This Project works from other videos too. Remove them below first, or keep this one as the original.';
    }
    if (workingMediaActivity?.busy) {
      return 'Finish updating the current cut before removing the original video.';
    }
    if (mediaBusy)
      return 'Finish the change to this Project’s media before removing the original video.';
    return undefined;
  })();
  /*
   * The same hazard from the other side: adding or removing media appends a revision, so it moves
   * the compare-and-set out from under anything else still writing one. The run overlay already
   * covers the workspace while provider work is in flight; this is the window after it, where an
   * attempt is accepted or ambiguous and the operator can still reach these controls.
   */
  const mediaChangeBlockedReason =
    projectProcessingBlockedReason(processing?.attempt, 'media-change') ??
    (sourceActivity?.busy
      ? 'Finish adding the original video before changing this Project’s media.'
      : workingMediaActivity?.busy
        ? 'Finish updating the current cut before changing this Project’s media.'
        : undefined);
  const activeWorkspaceTask =
    pinnedWorkspaceTask ?? enteredWorkspaceTask ?? entryTaskForSnapshot(current.revision.snapshot);
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
          variant="link"
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
        {/*
          Offered only where a caller owns a surface the arrangement can take over — the workspace
          route does, the standalone Project page does not — and only once the Project has media to
          arrange, since the editor's own empty state is the last thing a Project with no video needs.
        */}
        {onArrangeComposition !== undefined && current.revision.snapshot.presentedMedia !== null ? (
          <Button data-project-arrange onClick={onArrangeComposition}>
            {current.revision.snapshot.composition === null ? 'Arrange' : 'Edit arrangement'}
          </Button>
        ) : null}
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
              <h2>Media</h2>
              <p>The one video this Project is built from, and anything else it works with.</p>
            </header>
            <ProjectSourceSection
              key={`source-${current.project.id}`}
              current={current}
              runtime={sourceRuntime}
              stageHoldsSource={stageHoldsSource}
              recordingCandidate={recordingCandidate}
              recordingActive={recordingActive}
              recordingSupported={recordingSupported}
              removalBlockedReason={sourceRemovalBlockedReason}
              onStartRecording={onStartRecording}
              onActivityChange={setSourceActivity}
              onCurrentChange={session.acceptCurrent}
            />
            {/*
              Only once the Project has an original: until then the section above is the single
              owner of "this Project has no video yet", and a second empty state beside it would
              ask the same question twice.
            */}
            {current.revision.snapshot.sourceAssetId === null ? null : (
              <ProjectMediaSection
                key={`media-${current.project.id}`}
                current={current}
                session={session.port}
                archived={archived}
                recordingCandidate={recordingCandidate}
                recordingActive={recordingActive}
                recordingSupported={recordingSupported}
                changeBlockedReason={mediaChangeBlockedReason}
                runtime={sourceRuntime}
                onStartRecording={onStartRecording}
                onActivityChange={setMediaActivity}
              />
            )}
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
              <p>Start an edit from the original video, or reuse a video you already made.</p>
            </header>
            <ProjectCreateTaskPanel
              current={current}
              session={session.port}
              archived={archived}
              processing={processing}
              runtime={createRuntime}
              sourceBusy={sourceActivity?.busy ?? false}
              workingMediaBusy={workingMediaActivity?.busy ?? false}
              mediaBusy={mediaBusy}
              onOpenSource={openSourceTask}
              onOpenTask={selectWorkspaceTask}
              onWorkingMediaActivityChange={handleWorkingMediaActivity}
            />
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

      {/*
        Last in the tree so it paints over everything the workspace stacks inside itself. It covers
        this surface only — the app's own navigation stays live, because an accepted run survives
        leaving and reconnects when the Project is reopened.
      */}
      {processing && projectRunInFlight(processing) ? (
        <ProjectRunOverlay controller={processing} />
      ) : null}
    </>
  );
};
