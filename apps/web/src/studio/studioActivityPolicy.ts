import type { StudioMode } from '../features/media-session';
import { REVIEW_LOCK_REASON } from './studioPolicies';

type FinalizationState = {
  readonly recordingActive: boolean;
  readonly finalizing: boolean;
};

export const characterBuilderBlockedReasons = ({
  recordingActive,
  finalizing,
  reviewLocked,
}: FinalizationState & { readonly reviewLocked: boolean }) => {
  const activity = recordingActive
    ? 'Finish recording and finalization before building a character.'
    : finalizing
      ? 'Wait for the current take to finish finalizing before building a character.'
      : undefined;

  return {
    activity,
    open:
      activity ??
      (reviewLocked
        ? 'Save and release or discard the current take before building a character.'
        : undefined),
  };
};

export const captureBlockedReason = ({
  reviewLocked,
}: {
  readonly reviewLocked: boolean;
}): string | undefined => (reviewLocked ? REVIEW_LOCK_REASON : undefined);

export const captureSettingsDisabledReason = ({
  reviewLocked,
  recordingActive,
  aiSessionActive,
}: {
  readonly reviewLocked: boolean;
  readonly recordingActive: boolean;
  readonly aiSessionActive: boolean;
}): string | undefined => {
  if (reviewLocked) return REVIEW_LOCK_REASON;
  if (recordingActive) return 'Finish the current take before changing capture settings.';
  if (aiSessionActive) return 'Stop AI before changing camera or microphone sources.';
  return undefined;
};

export const characterRemovalBlockedReason = ({
  recordingActive,
  finalizing,
  reviewLocked,
  aiSessionActive,
  sessionDisconnected,
}: FinalizationState & {
  readonly reviewLocked: boolean;
  readonly aiSessionActive: boolean;
  readonly sessionDisconnected: boolean;
}): string | undefined => {
  if (recordingActive) return 'Finish recording before changing the selected AI settings.';
  if (finalizing) {
    return 'Wait for the current take to finish finalizing before changing the selected AI settings.';
  }
  if (reviewLocked) {
    return 'Release or discard the current take before changing the selected AI settings.';
  }
  if (aiSessionActive) return 'Stop AI before changing the selected AI settings.';
  if (sessionDisconnected) {
    return 'Wait for the current session cleanup before changing the selected AI settings.';
  }
  return undefined;
};

/**
 * What can invalidate the creative configuration the operator is editing.
 *
 * The answer turns on whether that configuration is *durable*. An in-memory draft is lost to
 * anything that takes over the media pipeline, so it locks on the full media/session state. A
 * durable configuration is a saved, recoverable proposal, so only work that would make the saved
 * value wrong — an active recording, a live model session, a dropped session — can lock it.
 */
export const creativeConfigurationLocks = ({
  configurationIsDurable,
  recordingActive,
  mediaLocked,
  sessionModeLocked,
  aiSessionActive,
  sessionDisconnected,
}: {
  readonly configurationIsDurable: boolean;
  readonly recordingActive: boolean;
  readonly mediaLocked: boolean;
  readonly sessionModeLocked: boolean;
  readonly aiSessionActive: boolean;
  readonly sessionDisconnected: boolean;
}): { readonly mediaLocked: boolean; readonly sessionModeLocked: boolean } =>
  configurationIsDurable
    ? {
        mediaLocked: recordingActive,
        sessionModeLocked: recordingActive || aiSessionActive || sessionDisconnected,
      }
    : { mediaLocked, sessionModeLocked };

export const currentExperienceLabel = ({
  activeCharacterName,
  activeRecipeLabel,
  mode,
  hasDraft,
}: {
  readonly activeCharacterName: string | undefined;
  readonly activeRecipeLabel: string | undefined;
  readonly mode: StudioMode;
  readonly hasDraft: boolean;
}): string | undefined => {
  if (activeCharacterName) return activeCharacterName;
  if (mode !== 'lucy-vton-latest' || !hasDraft) return undefined;
  return activeRecipeLabel ? `Virtual Try-On · ${activeRecipeLabel}` : 'Virtual Try-On';
};
