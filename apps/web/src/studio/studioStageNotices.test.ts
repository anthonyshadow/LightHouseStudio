import { describe, expect, it, vi } from 'vitest';
import { deriveStageNotices } from '../features/live-stage';
import { deriveStudioStageNotices } from './studioStageNotices';

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
});
