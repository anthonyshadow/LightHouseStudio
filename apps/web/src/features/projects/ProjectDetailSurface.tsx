import { useTheme } from '@emotion/react';
import type { ProjectContract, ProjectCurrentResponse } from '@studio/contracts';
import type { CreativeAssetStore } from '@studio/domain';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { APP_PATHS, projectWorkspacePath } from '../../app/paths';
import { useRouteBack } from '../../app/useRouteBack';
import { Button, StatusNotice } from '../../ui';
import { useCampaignDetail } from '../campaigns/useCampaignsController';
import { projectProcessingBlockedReason } from './projectProcessingPresentation';
import {
  ProjectOverviewSurface,
  type ProjectLifecycleDialogTarget,
} from './ProjectOverviewSurface';
import { projectOverviewInnerStyles } from './ProjectOverviewSurface.styles';
import { dialogActionsStyles, workspaceInnerStyles } from './ProjectRouteSurface.styles';
import { unavailableSourceRuntime, type ProjectRecordingCandidate } from './ProjectSourceSection';
import { stepForSnapshot } from './ProjectWorkflowProgress';
import type { ProjectWorkingMediaActivity } from './ProjectWorkingMediaSection';
import {
  isProjectWorkspaceTask,
  ProjectWorkspaceSurface,
  type ProjectWorkspaceTask,
} from './ProjectWorkspaceSurface';
import type { ProjectProcessingController } from './useProjectProcessingController';
import { useProjectSession, type ProjectSessionPort } from './useProjectSession';
import type { ProjectSourceActivity, ProjectSourceRuntime } from './useProjectSourceController';

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

export const ProjectDetailSurface = ({
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
  const [lifecycleDialog, setLifecycleDialog] = useState<ProjectLifecycleDialogTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectContract | null>(null);
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [sourceActivity, setSourceActivity] = useState<ProjectSourceActivity | null>(null);
  const [workingMediaActivity, setWorkingMediaActivity] =
    useState<ProjectWorkingMediaActivity | null>(null);
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
  const handleWorkingMediaActivity = useCallback(
    (activity: ProjectWorkingMediaActivity) => {
      setWorkingMediaActivity(activity);
      onWorkingMediaActivityChange?.(activity);
    },
    [onWorkingMediaActivityChange],
  );
  const archiveBlockedReason = projectProcessingBlockedReason(processing?.attempt, 'archive');
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
    return (
      <ProjectWorkspaceSurface
        current={current}
        session={session}
        archived={archived}
        announcement={announcement}
        headingRef={headingRef}
        sourceActivity={sourceActivity}
        workingMediaActivity={workingMediaActivity}
        pinnedWorkspaceTask={pinnedWorkspaceTask}
        enteredWorkspaceTask={enteredWorkspaceTask}
        selectWorkspaceTask={selectWorkspaceTask}
        handleSourceActivity={handleSourceActivity}
        handleWorkingMediaActivity={handleWorkingMediaActivity}
        sourceRuntime={sourceRuntime}
        recordingCandidate={recordingCandidate}
        recordingActive={recordingActive}
        onStartRecording={onStartRecording}
        creativeCheckpoint={creativeCheckpoint}
        processing={processing}
        ownerUserId={ownerUserId}
      />
    );
  }

  return (
    <ProjectOverviewSurface
      current={current}
      session={session}
      campaign={campaign}
      campaignName={campaignName}
      archived={archived}
      overviewHasSource={overviewHasSource}
      announcement={announcement}
      setAnnouncement={setAnnouncement}
      headingRef={headingRef}
      dialogReturnRef={dialogReturnRef}
      renameTarget={renameTarget}
      setRenameTarget={setRenameTarget}
      lifecycleDialog={lifecycleDialog}
      setLifecycleDialog={setLifecycleDialog}
      deleteTarget={deleteTarget}
      setDeleteTarget={setDeleteTarget}
      campaignDialog={campaignDialog}
      setCampaignDialog={setCampaignDialog}
      closeDialog={closeDialog}
      archiveBlockedReason={archiveBlockedReason}
      acceptOverviewSource={acceptOverviewSource}
      sourceRuntime={sourceRuntime}
      recordingCandidate={recordingCandidate}
      recordingActive={recordingActive}
      onStartRecording={onStartRecording}
      onSourceActivityChange={onSourceActivityChange}
      creativeStore={creativeStore}
      onCreateProjectCharacter={onCreateProjectCharacter}
      onCreateProjectOutfit={onCreateProjectOutfit}
    />
  );
};
