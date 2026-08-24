import { getVideoEditOutputGeometry } from '@studio/domain';
import { useCallback, useMemo, useState } from 'react';
import type { BrowserCapabilities } from '../application/types';
import type { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import type { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import type { useStudioSession } from '../orchestration/session';
import {
  deriveRecordingDurationNotices,
  deriveRealtimeSessionNotices,
  deriveStudioStageNotices,
} from './studioStageNotices';
import type { ActiveOverlay } from './useStudioOverlayController';
import type { useProviderAvailability } from './useProviderAvailability';
import type { useTakeReviewFlow } from './useTakeReviewFlow';

interface UseStudioStageModelOptions {
  readonly activeOverlay: ActiveOverlay;
  readonly session: ReturnType<typeof useStudioSession>;
  readonly takeReview: ReturnType<typeof useTakeReviewFlow>;
  readonly existingVideo: ReturnType<typeof useExistingVideoWorkflow>;
  readonly videoEditor: ReturnType<typeof useVideoEditSession>;
  readonly browser: BrowserCapabilities;
  readonly capabilityState: ReturnType<typeof useProviderAvailability>['state'];
  readonly characterBuilderLaunchError: string | null;
  readonly onRetryProviderAvailability: () => void;
  readonly onDismissCharacterBuilderLaunchError: () => void;
  readonly onOpenCaptureSettings: () => void;
}

export const useStudioStageModel = ({
  activeOverlay,
  session,
  takeReview,
  existingVideo,
  videoEditor,
  browser,
  capabilityState,
  characterBuilderLaunchError,
  onRetryProviderAvailability,
  onDismissCharacterBuilderLaunchError,
  onOpenCaptureSettings,
}: UseStudioStageModelOptions) => {
  const [dismissedNoticeIds, setDismissedNoticeIds] = useState<ReadonlySet<string>>(new Set());
  const dismissNotice = useCallback((id: string) => {
    setDismissedNoticeIds((current) => new Set([...current, id]));
  }, []);

  const {
    recording,
    automaticRecordingStopEvent,
    stagePresentation: takeStagePresentation,
  } = takeReview;
  const videoEditing = videoEditor.phase !== 'closed';
  const comparedExistingVideoArtifact =
    existingVideo.comparison === 'original'
      ? recording.original
      : (recording.processed ?? recording.visual);

  let stagePresentation = takeStagePresentation;
  if (videoEditing && videoEditor.source && takeStagePresentation.kind === 'playback') {
    stagePresentation = {
      ...takeStagePresentation,
      artifact: videoEditor.source.artifact,
      controlsLocked: false,
    };
  } else if (
    activeOverlay === 'video-upload' &&
    existingVideo.selection !== null &&
    takeStagePresentation.kind === 'playback' &&
    comparedExistingVideoArtifact
  ) {
    stagePresentation = { ...takeStagePresentation, artifact: comparedExistingVideoArtifact };
  }

  const videoEditPreview = useMemo(
    () =>
      videoEditing && videoEditor.source
        ? {
            spec: videoEditor.draft,
            sourceWidth: videoEditor.source.metadata.width,
            sourceHeight: videoEditor.source.metadata.height,
            activeTool: videoEditor.activeTool,
            showingBefore: videoEditor.showingBefore,
            splitComparison: videoEditor.splitComparison,
            playheadMs: videoEditor.playheadMs,
            onPlayheadChange: videoEditor.setPlayheadMs,
            onApplySpec: videoEditor.applySpec,
            onCropStart: videoEditor.beginTransaction,
            onCropChange: videoEditor.previewSpec,
            onCropCommit: videoEditor.commitTransaction,
          }
        : null,
    [
      videoEditing,
      videoEditor.source,
      videoEditor.draft,
      videoEditor.activeTool,
      videoEditor.showingBefore,
      videoEditor.splitComparison,
      videoEditor.playheadMs,
      videoEditor.setPlayheadMs,
      videoEditor.applySpec,
      videoEditor.beginTransaction,
      videoEditor.previewSpec,
      videoEditor.commitTransaction,
    ],
  );

  const editedStageGeometry =
    videoEditing && videoEditor.source
      ? getVideoEditOutputGeometry(
          {
            width: videoEditor.source.metadata.width,
            height: videoEditor.source.metadata.height,
            durationMs: videoEditor.source.metadata.durationMs,
          },
          videoEditor.draft,
        )
      : null;
  const playbackWidth = editedStageGeometry?.width ?? recording.metadata?.width;
  const playbackHeight = editedStageGeometry?.height ?? recording.metadata?.height;
  const stageAspectRatio =
    stagePresentation.kind === 'playback' && playbackWidth && playbackHeight
      ? playbackHeight > playbackWidth
        ? ('9:16' as const)
        : ('16:9' as const)
      : session.draft.mode === 'local'
        ? session.capturePreferences.applied.aspectRatio
        : ('16:9' as const);

  const stageNotices = useMemo(
    () => [
      ...deriveStudioStageNotices({
        localCaptureAvailable: browser.mediaDevices && browser.secureContext,
        capabilityState,
        dismissedNoticeIds,
        characterBuilderLaunchError,
        sessionError: session.error,
        recordingError: recording.recordingError,
        sidecarError: recording.sidecar.state === 'error' ? recording.sidecar.error : null,
        onRetryProviderAvailability,
        onDismissCharacterBuilderLaunchError,
        onOpenCaptureSettings,
        onClearSessionError: session.clearError,
        onDismissNotice: dismissNotice,
      }),
      ...deriveRecordingDurationNotices({
        lifecycle: recording.lifecycle,
        elapsedSeconds: recording.elapsedSeconds,
        automaticStopEvent: automaticRecordingStopEvent,
        playableTakeId: recording.presented?.id ?? null,
      }),
      ...deriveRealtimeSessionNotices(session.realtimeSessionTiming),
    ],
    [
      automaticRecordingStopEvent,
      browser.mediaDevices,
      browser.secureContext,
      capabilityState,
      characterBuilderLaunchError,
      dismissNotice,
      dismissedNoticeIds,
      onDismissCharacterBuilderLaunchError,
      onOpenCaptureSettings,
      onRetryProviderAvailability,
      recording.elapsedSeconds,
      recording.lifecycle,
      recording.presented,
      recording.recordingError,
      recording.sidecar.error,
      recording.sidecar.state,
      session.clearError,
      session.error,
      session.realtimeSessionTiming,
    ],
  );

  return {
    videoEditing,
    comparedExistingVideoArtifact,
    stagePresentation,
    videoEditPreview,
    stageAspectRatio,
    stageNotices,
  } as const;
};
