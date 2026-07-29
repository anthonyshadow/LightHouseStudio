import { describe, expect, it, vi } from 'vitest';
import { deriveStageNotices } from '../features/live-stage';
import { deriveRecordingDurationNotices, deriveStudioStageNotices } from './studioStageNotices';

const callbacks = () => ({
  onRetryProviderAvailability: vi.fn(),
  onDismissCharacterBuilderLaunchError: vi.fn(),
  onOpenCaptureSettings: vi.fn(),
  onClearSessionError: vi.fn(),
  onDismissNotice: vi.fn(),
});

describe('deriveStudioStageNotices', () => {
  it('preserves the Studio notice priority presented by the persistent stage', () => {
    const handlers = callbacks();
    const notices = deriveStudioStageNotices({
      localCaptureAvailable: false,
      capabilityState: 'error',
      dismissedNoticeIds: new Set(),
      characterBuilderLaunchError: 'Draft storage could not be opened.',
      sessionError: {
        code: 'permission-denied',
        message: 'Camera access was denied.',
        recovery: 'Allow camera access, then retry.',
      },
      recordingError: 'The recording could not be finalized.',
      sidecarError: 'The microphone sidecar stopped unexpectedly.',
      ...handlers,
    });

    expect(notices.map(({ id, priority }) => [id, priority])).toEqual([
      ['local-capture-unavailable', 950],
      ['provider-broker', undefined],
      ['character-builder-launch', 925],
      ['session-permission-denied', 900],
      ['recording-error', 1_000],
      ['recording-sidecar', undefined],
    ]);
    expect(deriveStageNotices(notices).map(({ id }) => id)).toEqual([
      'recording-error',
      'local-capture-unavailable',
    ]);
  });

  it('keeps form errors local and honors dismissed warning state', () => {
    const handlers = callbacks();
    const notices = deriveStudioStageNotices({
      localCaptureAvailable: true,
      capabilityState: 'error',
      dismissedNoticeIds: new Set(['provider-broker', 'recording-sidecar']),
      characterBuilderLaunchError: null,
      sessionError: {
        code: 'model-input-required',
        message: 'Add a prompt before starting.',
      },
      recordingError: null,
      sidecarError: 'Sidecar unavailable.',
      ...handlers,
    });

    expect(notices).toEqual([]);
  });

  it('wires recovery and dismissal actions to the owning controllers', () => {
    const handlers = callbacks();
    const notices = deriveStudioStageNotices({
      localCaptureAvailable: true,
      capabilityState: 'error',
      dismissedNoticeIds: new Set(),
      characterBuilderLaunchError: 'Builder failed.',
      sessionError: {
        code: 'device-busy',
        message: 'Camera is busy.',
      },
      recordingError: null,
      sidecarError: 'Sidecar unavailable.',
      ...handlers,
    });

    notices.find(({ id }) => id === 'provider-broker')?.action?.onAction();
    notices.find(({ id }) => id === 'provider-broker')?.onDismiss?.();
    notices.find(({ id }) => id === 'character-builder-launch')?.onDismiss?.();
    notices.find(({ id }) => id === 'session-device-busy')?.action?.onAction();
    notices.find(({ id }) => id === 'session-device-busy')?.onDismiss?.();
    notices.find(({ id }) => id === 'recording-sidecar')?.onDismiss?.();

    expect(handlers.onRetryProviderAvailability).toHaveBeenCalledOnce();
    expect(handlers.onDismissCharacterBuilderLaunchError).toHaveBeenCalledOnce();
    expect(handlers.onOpenCaptureSettings).toHaveBeenCalledOnce();
    expect(handlers.onClearSessionError).toHaveBeenCalledOnce();
    expect(handlers.onDismissNotice.mock.calls).toEqual([
      ['provider-broker'],
      ['recording-sidecar'],
    ]);
  });

  it('routes the app-owned camera-denied code to Capture Settings', () => {
    const handlers = callbacks();
    const [notice] = deriveStudioStageNotices({
      localCaptureAvailable: true,
      capabilityState: 'ready',
      dismissedNoticeIds: new Set(),
      characterBuilderLaunchError: null,
      sessionError: {
        code: 'camera-denied',
        message: 'Camera or microphone access was not allowed.',
        recovery: 'Allow access in browser settings, then try again.',
      },
      recordingError: null,
      sidecarError: null,
      ...handlers,
    });

    expect(notice).toMatchObject({
      id: 'session-camera-denied',
      action: { label: 'Capture settings' },
    });
    notice?.action?.onAction();
    expect(handlers.onOpenCaptureSettings).toHaveBeenCalledOnce();
    expect(handlers.onClearSessionError).not.toHaveBeenCalled();
  });
});

describe('deriveRecordingDurationNotices', () => {
  it('announces the independent recording warning at 270 seconds', () => {
    expect(
      deriveRecordingDurationNotices({
        lifecycle: 'recording',
        elapsedSeconds: 269,
        automaticStopEvent: null,
        playableTakeId: null,
      }),
    ).toEqual([]);

    expect(
      deriveRecordingDurationNotices({
        lifecycle: 'recording',
        elapsedSeconds: 270,
        automaticStopEvent: null,
        playableTakeId: null,
      }),
    ).toEqual([
      expect.objectContaining({
        id: 'recording-duration-warning',
        severity: 'warning',
        title: 'Recording ends in 30 seconds or less',
      }),
    ]);
  });

  it('explains a safely finalized maximum-duration take without masking failures', () => {
    expect(
      deriveRecordingDurationNotices({
        lifecycle: 'recorded',
        elapsedSeconds: 300,
        automaticStopEvent: {
          mode: 'lucy-vton-3',
          reason: 'maximum-duration',
          artifactId: 'take-at-maximum',
        },
        playableTakeId: 'take-at-maximum',
      }),
    ).toEqual([
      expect.objectContaining({
        id: 'recording-duration-complete',
        title: 'Recording ended at the 5:00 maximum',
      }),
    ]);

    expect(
      deriveRecordingDurationNotices({
        lifecycle: 'error',
        elapsedSeconds: 300,
        automaticStopEvent: { mode: 'local', reason: 'maximum-duration' },
        playableTakeId: null,
      }),
    ).toEqual([]);
  });

  it('does not attach a stale maximum explanation to a different restored take', () => {
    expect(
      deriveRecordingDurationNotices({
        lifecycle: 'recorded',
        elapsedSeconds: 120,
        automaticStopEvent: {
          mode: 'local',
          reason: 'maximum-duration',
          artifactId: 'old-take',
        },
        playableTakeId: 'restored-take',
      }),
    ).toEqual([]);
  });
});
