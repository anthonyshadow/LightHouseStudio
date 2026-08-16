import { useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { APP_PATHS } from '../app/paths';
import type { useAuth } from '../application/auth/AuthProvider';
import type { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';
import type { ProjectSourceActivity } from '../features/projects/useProjectSourceController';
import type { ProjectWorkingMediaActivity } from '../features/projects/ProjectWorkingMediaSection';
import type { useProjectWorkingMediaController } from '../features/projects/useProjectWorkingMediaController';
import { isVideoEditBusy } from '../features/video-editor/types';
import type { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import type { useStudioSession } from '../orchestration/session';
import type { useStudioCharacterWorkflow } from './useStudioCharacterWorkflow';
import type { useStudioOutfitWorkflow } from './useStudioOutfitWorkflow';
import type { useStudioOverlayController } from './useStudioOverlayController';
import { useStudioLogoutController } from './useStudioLogoutController';
import { useStudioSessionCleanup } from './useStudioSessionCleanup';
import { useStudioSessionExpiryController } from './useStudioSessionExpiryController';
import type { useTakeReviewFlow } from './useTakeReviewFlow';

interface UseStudioSessionLifecycleOptions {
  readonly auth: ReturnType<typeof useAuth>;
  readonly session: ReturnType<typeof useStudioSession>;
  readonly recording: ReturnType<typeof useTakeReviewFlow>['recording'];
  readonly processing: ReturnType<typeof useTakeReviewFlow>['processing'];
  readonly recordingActive: boolean;
  /** True while a take is being finalized, from either the timer or the stream side. */
  readonly finalizing: boolean;
  readonly existingVideo: ReturnType<typeof useExistingVideoWorkflow>;
  readonly videoEditor: ReturnType<typeof useVideoEditSession>;
  readonly outfit: ReturnType<typeof useStudioOutfitWorkflow>;
  readonly character: ReturnType<typeof useStudioCharacterWorkflow>;
  readonly projectWorkingMedia: ReturnType<typeof useProjectWorkingMediaController>;
  readonly projectSourceActivity: ProjectSourceActivity | null;
  readonly projectWorkingMediaActivity: ProjectWorkingMediaActivity | null;
  readonly projectSession: ProjectSessionPort | null;
  readonly discardSavedVideoWork: () => void;
  readonly discardPendingAdoption: () => void;
  readonly closeOverlay: ReturnType<typeof useStudioOverlayController>['close'];
}

/**
 * Everything that has to happen to in-flight local work when the Studio session ends, voluntarily
 * or not, plus the accounting that decides what the operator is warned about.
 *
 * The individual work signals are returned rather than only the two roll-ups because the exit guard
 * has to name what is at risk, while logout and expiry only need to know whether anything is.
 * Deriving both from one place keeps the warning and the block in agreement.
 */
export const useStudioSessionLifecycle = ({
  auth,
  session,
  recording,
  processing,
  recordingActive,
  finalizing,
  existingVideo,
  videoEditor,
  outfit,
  character,
  projectWorkingMedia,
  projectSourceActivity,
  projectWorkingMediaActivity,
  projectSession,
  discardSavedVideoWork,
  discardPendingAdoption,
  closeOverlay,
}: UseStudioSessionLifecycleOptions) => {
  const navigate = useNavigate();
  const updateOutfitDirty = outfit.updateDirty;
  const discardWardrobeDirty = character.discardWardrobeDirty;

  const discardLocalTemporaryWork = useCallback(() => {
    discardPendingAdoption();
    processing.cancel();
    recording.discard();
    updateOutfitDirty(false);
    discardWardrobeDirty();
    discardSavedVideoWork();
    closeOverlay();
  }, [
    closeOverlay,
    discardPendingAdoption,
    processing,
    recording,
    discardSavedVideoWork,
    discardWardrobeDirty,
    updateOutfitDirty,
  ]);

  const discardTemporaryWork = useCallback(() => {
    existingVideo.reset(false);
    discardLocalTemporaryWork();
  }, [discardLocalTemporaryWork, existingVideo]);

  const hasTemporaryTake = Boolean(recording.presented);
  const voiceProcessingActive = recording.processingState === 'processing';
  const creativeWorkDirty = outfit.dirty || character.wardrobeDirty || videoEditor.dirty;
  const recordingOrFinalizing = recordingActive || finalizing || existingVideo.providerActive;
  const videoRenderingActive =
    isVideoEditBusy(videoEditor.phase) ||
    projectWorkingMedia.busy ||
    (projectWorkingMediaActivity?.busy ?? false);

  const hasTemporaryWork =
    hasTemporaryTake ||
    voiceProcessingActive ||
    creativeWorkDirty ||
    (projectSourceActivity?.busy ?? false);
  const hasActiveWork = recordingOrFinalizing || videoRenderingActive;

  const cleanupTemporaryState = useCallback(async () => {
    const cleanup = existingVideo.cleanup();
    discardLocalTemporaryWork();
    await cleanup;
  }, [discardLocalTemporaryWork, existingVideo]);
  const releaseMedia = useCallback(async () => {
    await session.stopCamera();
  }, [session]);
  const handleLoggedOut = useCallback(() => {
    void navigate(APP_PATHS.entry, { replace: true });
  }, [navigate]);
  const runSessionCleanup = useStudioSessionCleanup({ cleanupTemporaryState, releaseMedia });
  const logout = useStudioLogoutController({
    projectSourceActivity,
    projectSession,
    hasTemporaryWork,
    hasActiveWork,
    runCleanup: runSessionCleanup,
    logout: auth.logout,
    onLoggedOut: handleLoggedOut,
  });
  // Holding session teardown is what keeps this shell — and the in-memory work it owns — mounted
  // long enough to say what is about to be lost. Releasing on unmount is the backstop: if the
  // shell goes away for any other reason, the session finalizes and the redirect proceeds.
  const holdSessionEnd = auth.holdSessionEnd;
  useEffect(() => holdSessionEnd(), [holdSessionEnd]);
  const sessionEnding = auth.status === 'expiring';
  const sessionExpiry = useStudioSessionExpiryController({
    expiring: sessionEnding,
    projectSourceActivity,
    projectSession,
    hasTemporaryWork,
    hasActiveWork,
    runCleanup: runSessionCleanup,
    completeSessionEnd: auth.completeSessionEnd,
  });

  return {
    logout,
    sessionExpiry,
    sessionEnding,
    discardTemporaryWork,
    work: {
      hasTemporaryTake,
      voiceProcessingActive,
      creativeWorkDirty,
      recordingOrFinalizing,
      videoRenderingActive,
    },
  } as const;
};
