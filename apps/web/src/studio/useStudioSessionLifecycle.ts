import { useCallback, useEffect, useMemo } from 'react';
import {
  NO_STUDIO_RUNTIME_WORK,
  type StudioRuntimeRegistry,
  type StudioRuntimeWork,
} from '../app/shell/studioRuntimeWork';
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
import { useStudioSessionCleanup } from './useStudioSessionCleanup';
import type { useTakeReviewFlow } from './useTakeReviewFlow';

interface UseStudioSessionLifecycleOptions {
  /** The shell's teardown coordinator and work channel. */
  readonly registry: StudioRuntimeRegistry;
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
 * What the Studio runtime is holding, and how to let go of it.
 *
 * The decisions — whether to warn, block, or finalize — belong to the shell, which outlives this
 * runtime; the runtime's job is to say truthfully what would be lost and to register the ordered
 * teardown that releases it. Unregistering on unmount is deliberate: a runtime that has gone away
 * is holding nothing, and the shell must not offer to discard work that no longer exists.
 *
 * The individual work signals are reported rather than only the two roll-ups because the exit guard
 * has to name what is at risk, while logout and expiry only need to know whether anything is.
 */
export const useStudioSessionLifecycle = ({
  registry,
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

  const cleanupTemporaryState = useCallback(async () => {
    const cleanup = existingVideo.cleanup();
    discardLocalTemporaryWork();
    await cleanup;
  }, [discardLocalTemporaryWork, existingVideo]);
  const releaseMedia = useCallback(async () => {
    await session.stopCamera();
  }, [session]);
  useStudioSessionCleanup({ cleanup: registry.cleanup, cleanupTemporaryState, releaseMedia });

  const work = useMemo<StudioRuntimeWork>(
    () => ({
      hasTemporaryTake,
      voiceProcessingActive,
      creativeWorkDirty,
      recordingOrFinalizing,
      videoRenderingActive,
      projectSourceActivity,
      projectSession,
    }),
    [
      creativeWorkDirty,
      hasTemporaryTake,
      projectSession,
      projectSourceActivity,
      recordingOrFinalizing,
      videoRenderingActive,
      voiceProcessingActive,
    ],
  );

  const reportWork = registry.reportWork;
  useEffect(() => {
    reportWork(work);
  }, [reportWork, work]);
  // A runtime that has gone away is holding nothing. Without this the shell would keep offering to
  // discard a take whose artifacts were already revoked by this runtime's own unmount.
  useEffect(() => () => reportWork(NO_STUDIO_RUNTIME_WORK), [reportWork]);

  return { discardTemporaryWork, work } as const;
};
