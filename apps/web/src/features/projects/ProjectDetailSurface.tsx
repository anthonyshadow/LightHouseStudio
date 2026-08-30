import { useTheme } from '@emotion/react';
import type { CreativeAssetStore } from '@studio/domain';
import { useEffect } from 'react';
import { APP_PATHS } from '../../app/paths';
import { useRouteBack } from '../../app/useRouteBack';
import { Button, StatusNotice } from '../../ui';
import type { ProjectCreateRuntime } from './ProjectCreateTaskPanel';
import { projectProcessingBlockedReason } from './projectProcessingPresentation';
import { ProjectOverviewSurface } from './ProjectOverviewSurface';
import { dialogActionsStyles, workspaceInnerStyles } from './ProjectRouteSurface.styles';
import { detachedSourceRuntime, type ProjectRecordingCandidate } from './ProjectSourceSection';
import type { ProjectWorkingMediaActivity } from './ProjectWorkingMediaSection';
import { ProjectWorkspaceSurface } from './ProjectWorkspaceSurface';
import type { ProjectProcessingController } from './useProjectProcessingController';
import { useProjectSession, type ProjectSessionPort } from './useProjectSession';
import type { ProjectSourceActivity, ProjectSourceRuntime } from './useProjectSourceController';
import { pageShellStyles } from '../../ui/primitives/PageShell.styles';

export interface ProjectRouteSurfaceProps {
  readonly workspaceMode?: boolean;
  readonly ownerUserId?: string;
  readonly createRuntime?: ProjectCreateRuntime;
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

/**
 * Owns the Project session and nothing else: once the session resolves, the surface that the route
 * actually mounts owns its own dialogs, task selection and activity state.
 */
export const ProjectDetailSurface = ({
  projectId,
  workspaceMode = false,
  sourceRuntime = detachedSourceRuntime,
  recordingCandidate,
  recordingActive,
  onStartRecording,
  onSourceActivityChange,
  onWorkingMediaActivityChange,
  onSessionChange,
  createRuntime,
  processing,
  ownerUserId,
  creativeStore,
  onCreateProjectCharacter,
  onCreateProjectOutfit,
}: { readonly projectId: string } & ProjectRouteSurfaceProps) => {
  const theme = useTheme();
  const goBack = useRouteBack();
  const session = useProjectSession(projectId);
  const detailContentStyles = workspaceMode ? workspaceInnerStyles : pageShellStyles;

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

  if (workspaceMode) {
    return (
      <ProjectWorkspaceSurface
        current={session.current}
        session={session}
        onSourceActivityChange={onSourceActivityChange}
        onWorkingMediaActivityChange={onWorkingMediaActivityChange}
        sourceRuntime={sourceRuntime}
        recordingCandidate={recordingCandidate}
        recordingActive={recordingActive}
        onStartRecording={onStartRecording}
        createRuntime={createRuntime}
        processing={processing}
        ownerUserId={ownerUserId}
      />
    );
  }

  return (
    <ProjectOverviewSurface
      current={session.current}
      session={session}
      archiveBlockedReason={projectProcessingBlockedReason(processing?.attempt, 'archive')}
      sourceRuntime={sourceRuntime}
      recordingCandidate={recordingCandidate}
      recordingActive={recordingActive}
      onSourceActivityChange={onSourceActivityChange}
      creativeStore={creativeStore}
      onCreateProjectCharacter={onCreateProjectCharacter}
      onCreateProjectOutfit={onCreateProjectOutfit}
    />
  );
};
