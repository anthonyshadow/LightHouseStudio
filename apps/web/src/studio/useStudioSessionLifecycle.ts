import { useCallback, useEffect, useMemo } from 'react';
import {
  NO_STUDIO_RUNTIME_STATUS,
  type StudioCreativeLocks,
  type StudioRuntimeRegistry,
  type StudioRuntimeWork,
} from '../app/shell/studioRuntimeWork';
import type { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
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
  /** The shell's teardown coordinator and status channel. */
  readonly registry: StudioRuntimeRegistry;
  /** What the live session currently forbids, for the builders the shell hosts. */
  readonly creativeLocks: StudioCreativeLocks;
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
  creativeLocks,
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
  discardSavedVideoWork,
  discardPendingAdoption,
  closeOverlay,
}: UseStudioSessionLifecycleOptions) => {
  const updateOutfitDirty = outfit.updateDirty;
  const discardWardrobeDirty = character.discardWardrobeDirty;

  /**
   * Answers whether the take is gone. The rest of the release runs either way: none of it is the
   * take, and a runtime that stopped halfway would hold creative dirt nobody can reach.
   */
  const discardLocalTemporaryWork = useCallback((): boolean => {
    discardPendingAdoption();
    processing.cancel();
    const takeDiscarded = recording.discard();
    updateOutfitDirty(false);
    discardWardrobeDirty();
    discardSavedVideoWork();
    closeOverlay();
    return takeDiscarded;
  }, [
    closeOverlay,
    discardPendingAdoption,
    processing,
    recording,
    discardSavedVideoWork,
    discardWardrobeDirty,
    updateOutfitDirty,
  ]);

  const discardTemporaryWork = useCallback((): boolean => {
    existingVideo.reset(false);
    return discardLocalTemporaryWork();
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
    // The one place a refused discard is read and deliberately ignored. This is teardown: the
    // runtime is going away, its artifact URLs are revoked on the way out regardless, and the
    // cleanup coordinator awaits its tasks with no per-task rescue — so stopping or throwing here
    // would skip `release-media` and leave the camera running after logout or expiry.
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
    }),
    [
      creativeWorkDirty,
      hasTemporaryTake,
      projectSourceActivity,
      recordingOrFinalizing,
      videoRenderingActive,
      voiceProcessingActive,
    ],
  );

  const report = registry.report;
  useEffect(() => {
    report({ work, creativeLocks });
  }, [creativeLocks, report, work]);
  // A runtime that has gone away is holding nothing and forbidding nothing. Without this the shell
  // would keep offering to discard a take whose artifacts this runtime already revoked on its way
  // out, and would keep a builder locked against a session that no longer exists.
  useEffect(() => () => report(NO_STUDIO_RUNTIME_STATUS), [report]);

  return { discardTemporaryWork, work } as const;
};
