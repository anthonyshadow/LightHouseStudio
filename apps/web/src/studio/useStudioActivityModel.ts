import { isModelSessionActive } from '../features/media-session/sessionComposerModel';
import type { useStudioSession } from '../orchestration/session';
import {
  captureBlockedReason as resolveCaptureBlockedReason,
  captureSettingsDisabledReason as resolveCaptureSettingsDisabledReason,
  characterBuilderBlockedReasons,
  characterRemovalBlockedReason as resolveCharacterRemovalBlockedReason,
} from './studioActivityPolicy';
import type { useTakeReviewFlow } from './useTakeReviewFlow';

interface UseStudioActivityModelOptions {
  readonly session: ReturnType<typeof useStudioSession>;
  readonly takeReview: ReturnType<typeof useTakeReviewFlow>;
  readonly projectContextActive: boolean;
}

/**
 * Applies `studioActivityPolicy` to the live session and take-review state: what the Studio is
 * currently doing, and therefore what it must refuse.
 *
 * A Project context locks less than standalone capture does. Its creative configuration is a saved,
 * recoverable proposal rather than an in-memory draft, so only an active recording can invalidate
 * it — a model session or a paused review cannot.
 */
export const useStudioActivityModel = ({
  session,
  takeReview,
  projectContextActive,
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
  });

  return {
    aiSessionActive,
    sessionModeLocked,
    finalizing,
    creativeConfigurationMediaLocked: projectContextActive ? recordingActive : mediaLocked,
    creativeConfigurationSessionModeLocked: projectContextActive
      ? recordingActive || aiSessionActive || sessionDisconnected
      : sessionModeLocked,
    characterBuilderActivityBlockedReason: characterBuilderBlocked.activity,
    characterBuilderOpenBlockedReason: characterBuilderBlocked.open,
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
