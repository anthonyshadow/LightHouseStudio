import { getRecordingDurationTiming } from '@studio/domain';
import type { StageNotice } from '../features/live-stage';
import type { RealtimeSessionTiming } from '../features/media-session';
import type { AutomaticRecordingStopEvent, RecordingLifecycle } from '../features/recording';
import type { CapabilityState } from './StudioHeader';

const formErrorCodes = new Set(['model-input-required', 'apply-failed']);
const deviceErrorCodes = new Set([
  'camera-denied',
  'permission-denied',
  'device-missing',
  'device-busy',
  'media-unavailable',
]);

export type StudioStageSessionError = Readonly<{
  code: string;
  message: string;
  recovery?: string;
}>;

export type StudioStageNoticeInputs = Readonly<{
  localCaptureAvailable: boolean;
  capabilityState: CapabilityState;
  dismissedNoticeIds: ReadonlySet<string>;
  characterBuilderLaunchError: string | null;
  sessionError: StudioStageSessionError | null;
  recordingError: string | null;
  sidecarError: string | null;
  onRetryProviderAvailability: () => void;
  onDismissCharacterBuilderLaunchError: () => void;
  onOpenCaptureSettings: () => void;
  onClearSessionError: () => void;
  onDismissNotice: (id: string) => void;
}>;

export const isStudioFormError = (error: StudioStageSessionError | null): boolean =>
  Boolean(error && formErrorCodes.has(error.code));

export type RecordingDurationNoticeInputs = Readonly<{
  lifecycle: RecordingLifecycle;
  elapsedSeconds: number;
  automaticStopEvent: AutomaticRecordingStopEvent | null;
  playableTakeId: string | null;
}>;

export const deriveRecordingDurationNotices = ({
  lifecycle,
  elapsedSeconds,
  automaticStopEvent,
  playableTakeId,
}: RecordingDurationNoticeInputs): readonly StageNotice[] => {
  const timing = getRecordingDurationTiming(elapsedSeconds);

  if (lifecycle === 'recording' && timing.warning) {
    return [
      {
        id: 'recording-duration-warning',
        severity: 'warning',
        title: 'Recording ends in 30 seconds or less',
        message: 'Studio will stop and safely finalize this take at the supported 5:00 maximum.',
        priority: 975,
      },
    ];
  }

  if (
    automaticStopEvent?.reason === 'maximum-duration' &&
    automaticStopEvent.artifactId === playableTakeId
  ) {
    return [
      {
        id: 'recording-duration-complete',
        severity: 'info',
        title: 'Recording ended at the 5:00 maximum',
        message:
          'The original take was finalized safely. Playback, Voice, Save, Close, and Discard remain available.',
        priority: 925,
      },
    ];
  }

  return [];
};

export const deriveRealtimeSessionNotices = (
  timing: RealtimeSessionTiming | null,
): readonly StageNotice[] => {
  if (timing?.warning) {
    return [
      {
        id: 'realtime-session-warning',
        severity: 'warning',
        title: 'AI session ending soon',
        message:
          '30 seconds or less remain. This provider limit is independent of the take limit; an active take will finalize safely at the boundary.',
        priority: 875,
      },
    ];
  }

  if (timing?.status !== 'limit-reached' && timing?.status !== 'completed') return [];
  return [
    {
      id: 'realtime-session-complete',
      severity: 'info',
      title: 'AI session maximum reached',
      message:
        'The expected provider session completed. Local preview and the current settings remain available.',
      priority: 850,
    },
  ];
};

export const deriveStudioStageNotices = ({
  localCaptureAvailable,
  capabilityState,
  dismissedNoticeIds,
  characterBuilderLaunchError,
  sessionError,
  recordingError,
  sidecarError,
  onRetryProviderAvailability,
  onDismissCharacterBuilderLaunchError,
  onOpenCaptureSettings,
  onClearSessionError,
  onDismissNotice,
}: StudioStageNoticeInputs): readonly StageNotice[] => {
  const notices: StageNotice[] = [];

  if (!localCaptureAvailable) {
    notices.push({
      id: 'local-capture-unavailable',
      severity: 'error',
      title: 'Camera capture needs a secure supported browser',
      message:
        'Open the studio on localhost or HTTPS in a current browser with camera and microphone APIs.',
      priority: 950,
    });
  }

  if (capabilityState === 'error' && !dismissedNoticeIds.has('provider-broker')) {
    notices.push({
      id: 'provider-broker',
      severity: 'warning',
      title: 'Integration broker is unreachable',
      message: 'Local preparation still works, but provider availability could not be checked.',
      action: { label: 'Retry check', onAction: onRetryProviderAvailability },
      onDismiss: () => onDismissNotice('provider-broker'),
    });
  }

  if (characterBuilderLaunchError) {
    notices.push({
      id: 'character-builder-launch',
      severity: 'error',
      title: 'Character Builder could not open',
      message: characterBuilderLaunchError,
      priority: 925,
      onDismiss: onDismissCharacterBuilderLaunchError,
    });
  }

  if (sessionError && !isStudioFormError(sessionError)) {
    notices.push({
      id: `session-${sessionError.code}`,
      severity: 'error',
      title: sessionError.message,
      message: sessionError.recovery ?? 'Review the setup and try again.',
      priority: 900,
      action: deviceErrorCodes.has(sessionError.code)
        ? { label: 'Capture settings', onAction: onOpenCaptureSettings }
        : { label: 'Dismiss', onAction: onClearSessionError },
      onDismiss: onClearSessionError,
    });
  }

  if (recordingError) {
    notices.push({
      id: 'recording-error',
      severity: 'error',
      title: 'Recording stopped',
      message: recordingError,
      priority: 1_000,
    });
  }

  if (sidecarError && !dismissedNoticeIds.has('recording-sidecar')) {
    notices.push({
      id: 'recording-sidecar',
      severity: 'warning',
      title: 'Video preserved without separate voice audio',
      message: sidecarError,
      onDismiss: () => onDismissNotice('recording-sidecar'),
    });
  }

  return notices;
};
