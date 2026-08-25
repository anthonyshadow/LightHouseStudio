import { APP_PATHS, projectPath } from '../app/paths';
import type { StageNotice } from '../features/live-stage';
import type { DirectVideoLoadState } from './useDirectSavedVideoRoute';
import type { ProjectVideoAttachmentState } from './useProjectVideoAttachment';

export type StudioContextualNoticeInputs = Readonly<{
  directVideoLoad: DirectVideoLoadState;
  /** A gallery hand-off that failed after the shell had already navigated into Studio. */
  savedVideoLoadFailure: string | null;
  /** Name of a Voice chosen before a video existed, held until a source is ready. */
  pendingVoiceName: string | null;
  projectVideoAttachment: ProjectVideoAttachmentState;
  /** Project the operator arrived from, so an unavailable Video can return where it came from. */
  routeOriginProjectId: string | null;
  onLeaveUnavailableVideo: (fallbackPath: string) => void;
  onDismissSavedVideoLoadFailure: () => void;
  onRetryProjectVideoAttachment: () => void;
}>;

/**
 * Stage notices for the surrounding route context — what the Studio is loading, holding or
 * attaching on the operator's behalf. Distinct from `studioStageNotices`, which reports on the
 * capture session itself.
 */
export const deriveStudioContextualNotices = ({
  directVideoLoad,
  savedVideoLoadFailure,
  pendingVoiceName,
  projectVideoAttachment,
  routeOriginProjectId,
  onLeaveUnavailableVideo,
  onDismissSavedVideoLoadFailure,
  onRetryProjectVideoAttachment,
}: StudioContextualNoticeInputs): readonly StageNotice[] => {
  const notices: StageNotice[] = [];

  if (savedVideoLoadFailure !== null) {
    notices.push({
      id: 'saved-video-handoff-error',
      severity: 'error',
      title: 'Video not opened',
      message: savedVideoLoadFailure,
      priority: 500,
      action: {
        label: 'Back to Videos',
        onAction: () => onLeaveUnavailableVideo(APP_PATHS.videos),
      },
      onDismiss: onDismissSavedVideoLoadFailure,
    });
  }

  if (directVideoLoad.status === 'loading') {
    notices.push({
      id: 'saved-video-route-loading',
      severity: 'info',
      title: 'Loading video',
      message: 'Validating the current Version before opening review.',
      priority: 250,
    });
  } else if (directVideoLoad.status === 'error') {
    notices.push({
      id: 'saved-video-route-error',
      severity: 'error',
      title: 'Video unavailable',
      message: directVideoLoad.message,
      priority: 500,
      action: {
        label: routeOriginProjectId ? 'Back to Project' : 'Back to Assets',
        onAction: () =>
          onLeaveUnavailableVideo(
            routeOriginProjectId ? projectPath(routeOriginProjectId) : APP_PATHS.videos,
          ),
      },
    });
  }

  if (pendingVoiceName !== null) {
    notices.push({
      id: 'pending-voice-handoff',
      severity: 'info',
      title: 'Voice ready',
      message: `${pendingVoiceName} will be applied once you record or upload a video.`,
      priority: 200,
    });
  }

  if (projectVideoAttachment.status === 'attaching') {
    notices.push({
      id: 'project-video-attachment',
      severity: 'info',
      title: 'Video saved',
      message: 'Attaching it to the Project…',
      priority: 350,
    });
  } else if (projectVideoAttachment.status === 'error') {
    notices.push({
      id: 'project-video-attachment',
      severity: 'error',
      title: 'Project attachment needs attention',
      message: projectVideoAttachment.message,
      priority: 550,
      action: {
        label: 'Retry attachment',
        onAction: onRetryProjectVideoAttachment,
      },
    });
  }

  return notices;
};
