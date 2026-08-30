import { isModelSessionActive } from '../features/media-session/sessionComposerModel';
import type { useStudioSession } from '../orchestration/session';
import {
  captureBlockedReason as resolveCaptureBlockedReason,
  captureSettingsDisabledReason as resolveCaptureSettingsDisabledReason,
  characterBuilderBlockedReasons,
  creativeConfigurationLocks,
  creativeToolBlockedReasons,
  characterRemovalBlockedReason as resolveCharacterRemovalBlockedReason,
} from './studioActivityPolicy';
import type { useTakeReviewFlow } from './useTakeReviewFlow';

interface UseStudioActivityModelOptions {
  readonly session: ReturnType<typeof useStudioSession>;
  readonly takeReview: ReturnType<typeof useTakeReviewFlow>;
  /** Whether the creative configuration is a saved, recoverable proposal rather than a draft. */
  readonly creativeConfigurationIsDurable: boolean;
}

/**
 * Applies `studioActivityPolicy` to the live session and take-review state: what the Studio is
 * currently doing, and therefore what it must refuse.
 *
 * A surface whose creative configuration is durable locks less than standalone capture does: the
 * configuration survives as a saved, recoverable proposal, so a paused review cannot invalidate it.
 */
export const useStudioActivityModel = ({
  session,
  takeReview,
  creativeConfigurationIsDurable,
}: UseStudioActivityModelOptions) => {
  const { recordingActive, reviewLocked, mediaLocked, finalizingStartedAt, finalizingStream } =
    takeReview;
  const aiSessionActive = isModelSessionActive(session);
  const sessionDisconnected = session.lifecycle === 'disconnected';
  const sessionModeLocked = mediaLocked || aiSessionActive || sessionDisconnected;
  const finalizing = finalizingStartedAt !== null || finalizingStream !== null;
  const characterBuilderBlocked = characterBuilderBlockedReasons({
    recordingActive,
    finalizing,
    reviewLocked,
    configurationIsDurable: creativeConfigurationIsDurable,
  });

  const creativeConfigurationLockState = creativeConfigurationLocks({
    configurationIsDurable: creativeConfigurationIsDurable,
    recordingActive,
    mediaLocked,
    sessionModeLocked,
    aiSessionActive,
    sessionDisconnected,
  });

  return {
    aiSessionActive,
    sessionModeLocked,
    finalizing,
    creativeConfigurationMediaLocked: creativeConfigurationLockState.mediaLocked,
    creativeConfigurationSessionModeLocked: creativeConfigurationLockState.sessionModeLocked,
    characterBuilderActivityBlockedReason: characterBuilderBlocked.activity,
    characterBuilderOpenBlockedReason: characterBuilderBlocked.open,
    creativeToolBlockedReasons: creativeToolBlockedReasons({
      recordingActive,
      finalizing,
      reviewLocked,
      liveToolsAvailableDuringPlayback: creativeConfigurationIsDurable,
    }),
    characterRemovalBlockedReason: resolveCharacterRemovalBlockedReason({
      recordingActive,
      finalizing,
      reviewLocked,
      aiSessionActive,
      sessionDisconnected,
    }),
    captureBlockedReason: resolveCaptureBlockedReason({ reviewLocked }),
    captureSettingsDisabledReason: resolveCaptureSettingsDisabledReason({
      reviewLocked,
      recordingActive,
      aiSessionActive,
    }),
  } as const;
};
