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
  configurationIsDurable = false,
}: FinalizationState & {
  readonly reviewLocked: boolean;
  /**
   * Whether the media on the stage is a saved, recoverable thing rather than an unsaved take —
   * a Project's own source video, for instance.
   */
  readonly configurationIsDurable?: boolean;
}) => {
  const activity = recordingActive
    ? 'Finish recording and finalization before building a character.'
    : finalizing
      ? 'Wait for the current take to finish finalizing before building a character.'
      : undefined;

  return {
    activity,
    // A durable configuration has nothing to save or discard: asking a Project to release its own
    // source before building a character names an action that does not exist there, and blocked
    // creating an outfit from the very panel that offers it. The same rule
    // `creativeConfigurationLocks` states — only work that would make the saved value wrong locks
    // it — so only an active recording or a finalizing take still applies.
    open:
      activity ??
      (reviewLocked && !configurationIsDurable
        ? 'Save and release or discard the current take before building a character.'
        : undefined),
  };
};

/**
 * Why a creative-tool rail entry cannot act, in the same words the rest of the Studio uses.
 *
 * The conditions mirror the rail's own disabled states, so a greyed tool always has a sentence to
 * go with it. The live tools reuse the Character Builder's reasons rather than inventing a second
 * vocabulary for locks that are already named; only the editor, which simply has nothing to open
 * until media exists, needs words of its own.
 */
export const creativeToolBlockedReasons = ({
  recordingActive,
  finalizing,
  reviewLocked,
  liveToolsAvailableDuringPlayback,
}: FinalizationState & {
  readonly reviewLocked: boolean;
  readonly liveToolsAvailableDuringPlayback: boolean;
}): {
  readonly editVideo: string | undefined;
  readonly liveTools: string | undefined;
} => ({
  editVideo: recordingActive
    ? 'Finish the current take before editing.'
    : reviewLocked
      ? undefined
      : 'Record or upload a video to edit it.',
  liveTools:
    recordingActive || (reviewLocked && !liveToolsAvailableDuringPlayback)
      ? characterBuilderBlockedReasons({ recordingActive, finalizing, reviewLocked }).open
      : undefined,
});

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
