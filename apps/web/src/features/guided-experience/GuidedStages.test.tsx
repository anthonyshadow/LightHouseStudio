// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import type { RecordingArtifact } from '../recording';
import type { ProjectStorageState } from '../guided-flow';
import { GuidedDownloadStage } from './GuidedDownloadStage';
import { GuidedLiveStage, type GuidedLiveStageProps } from './GuidedLiveStage';
import { GuidedRecordStage } from './GuidedRecordStage';
import { GuidedVoiceStage } from './GuidedVoiceStage';

const storage: ProjectStorageState = { health: 'ready', durable: true, notice: null };
const idleMedia = {
  presentation: { kind: 'idle', mode: 'lucy-2.5' } as const,
  lifecycle: 'idle' as const,
  liveSeconds: 0,
  generationSeconds: 0,
  notices: [],
};

const artifact = (): RecordingArtifact => {
  const media = new Blob(['guided-take'], { type: 'video/webm' });
  return {
    id: 'guided-take',
    media,
    objectUrl: 'blob:guided-take',
    mimeType: media.type,
    filename: 'guided-take.webm',
    sourceModeId: 'lucy-2.5',
    startedAt: '2026-07-20T12:00:00.000Z',
    durationMs: 27_000,
    sizeBytes: media.size,
  };
};

const renderWithTheme = (component: ReactNode) =>
  render(<StudioDesignProvider>{component}</StudioDesignProvider>);

const cameraReadyLiveProps = (
  overrides: Partial<GuidedLiveStageProps> = {},
): GuidedLiveStageProps => ({
  storage,
  ...idleMedia,
  status: 'live.camera-ready',
  characterName: 'Documentary Presenter 01',
  referenceImageUrl: null,
  mediaSupported: true,
  cameraReady: true,
  microphoneReady: true,
  aiAvailable: true,
  aiConnected: false,
  capabilityState: 'ready',
  aiStartQueued: false,
  error: null,
  permissionPrimer: false,
  onRetryCapabilities: vi.fn(),
  onConfirmCameraStart: vi.fn(),
  onCancelPermissionPrimer: vi.fn(),
  onContinueToRecord: vi.fn(),
  onRequestCameraStart: vi.fn(),
  onStartAi: vi.fn(),
  onStopAi: vi.fn(),
  onStopCamera: vi.fn(),
  onEditCharacter: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('guided render-only stages', () => {
  it('separates local camera, AI, stop, and continue actions', async () => {
    const user = userEvent.setup();
    const onRequestCameraStart = vi.fn();
    const onConfirmCameraStart = vi.fn();
    const onStartAi = vi.fn();
    const onStopAi = vi.fn();
    const onStopCamera = vi.fn();
    const onContinueToRecord = vi.fn();
    const common = cameraReadyLiveProps({
      characterName: 'Documentary Presenter 01',
      referenceImageUrl: '/api/reference-images/reference-1/content',
      cameraReady: false,
      microphoneReady: false,
      onConfirmCameraStart,
      onContinueToRecord,
      onRequestCameraStart,
      onStartAi,
      onStopAi,
      onStopCamera,
    });
    const { rerender } = renderWithTheme(
      <GuidedLiveStage {...common} status="live.ready" permissionPrimer={false} />,
    );

    expect(screen.getByText('○ Camera permission pending')).toBeInTheDocument();
    expect(screen.getByText('○ Microphone permission pending')).toBeInTheDocument();
    expect(screen.getByText('○ AI available')).toBeInTheDocument();
    expect(screen.getByAltText('Generated reference for Documentary Presenter 01')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Start Camera Preview' }));
    expect(onRequestCameraStart).toHaveBeenCalledOnce();

    rerender(
      <StudioDesignProvider>
        <GuidedLiveStage {...common} status="live.permission-primer" permissionPrimer />
      </StudioDesignProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Continue & Allow' }));
    expect(onConfirmCameraStart).toHaveBeenCalledOnce();

    rerender(
      <StudioDesignProvider>
        <GuidedLiveStage
          {...common}
          status="live.camera-ready"
          cameraReady
          microphoneReady
          permissionPrimer={false}
        />
      </StudioDesignProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Start AI Session' }));
    expect(onStartAi).toHaveBeenCalledOnce();

    rerender(
      <StudioDesignProvider>
        <GuidedLiveStage {...common} status="live.connected" aiConnected permissionPrimer={false} />
      </StudioDesignProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Continue to Record' }));
    expect(onContinueToRecord).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Stop AI' }));
    await user.click(screen.getByRole('button', { name: 'Stop Camera' }));
    expect(onStopAi).toHaveBeenCalledOnce();
    expect(onStopCamera).toHaveBeenCalledOnce();
  });

  it('keeps the local preview usable while AI availability is loading', async () => {
    const user = userEvent.setup();
    const onStartAi = vi.fn();
    const onStopCamera = vi.fn();
    const props = cameraReadyLiveProps({
      aiAvailable: false,
      capabilityState: 'loading',
      onStartAi,
      onStopCamera,
    });
    const { rerender } = renderWithTheme(<GuidedLiveStage {...props} />);

    expect(screen.getByText('○ Checking AI availability')).toBeVisible();
    const startAi = screen.getByRole('button', { name: 'Start AI Session' });
    expect(startAi).toBeEnabled();
    await user.click(startAi);
    expect(onStartAi).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Stop Camera' })).toBeEnabled();

    rerender(
      <StudioDesignProvider>
        <GuidedLiveStage {...props} aiStartQueued />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('button', { name: 'Checking AI Availability' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Stop Camera' })).toBeEnabled();
  });

  it('uses live camera and microphone tracks when durable status still says camera-off', async () => {
    const user = userEvent.setup();
    const onStartAi = vi.fn();
    const onStopCamera = vi.fn();
    renderWithTheme(
      <GuidedLiveStage
        {...cameraReadyLiveProps({
          status: 'live.ready',
          onStartAi,
          onStopCamera,
        })}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Local preview ready' })).toBeVisible();
    expect(screen.getByText('○ AI available')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Start Camera Preview' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start AI Session' }));
    await user.click(screen.getByRole('button', { name: 'Stop Camera' }));
    expect(onStartAi).toHaveBeenCalledOnce();
    expect(onStopCamera).toHaveBeenCalledOnce();
  });

  it('keeps Stop Camera available while local tracks are still completing startup', async () => {
    const user = userEvent.setup();
    const onStopCamera = vi.fn();
    renderWithTheme(
      <GuidedLiveStage
        {...cameraReadyLiveProps({
          status: 'live.camera-starting',
          cameraReady: false,
          microphoneReady: false,
          onStopCamera,
        })}
      />,
    );

    expect(screen.getByRole('button', { name: 'Starting Camera' })).toBeDisabled();
    const stopCamera = screen.getByRole('button', { name: 'Stop Camera' });
    expect(stopCamera).toBeEnabled();
    await user.click(stopCamera);
    expect(onStopCamera).toHaveBeenCalledOnce();
  });

  it('uses owned track readiness for actionable controls during stale camera-starting state', async () => {
    const user = userEvent.setup();
    const onStartAi = vi.fn();
    const onStopCamera = vi.fn();
    renderWithTheme(
      <GuidedLiveStage
        {...cameraReadyLiveProps({
          status: 'live.camera-starting',
          onStartAi,
          onStopCamera,
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Start Camera Preview' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start AI Session' }));
    await user.click(screen.getByRole('button', { name: 'Stop Camera' }));
    expect(onStartAi).toHaveBeenCalledOnce();
    expect(onStopCamera).toHaveBeenCalledOnce();
  });

  it('never offers Start Camera Preview while any owned local track is live', async () => {
    const user = userEvent.setup();
    const onStopCamera = vi.fn();
    renderWithTheme(
      <GuidedLiveStage
        {...cameraReadyLiveProps({
          status: 'live.ready',
          microphoneReady: false,
          onStopCamera,
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Start Camera Preview' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Starting Camera' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Stop Camera' }));
    expect(onStopCamera).toHaveBeenCalledOnce();
  });

  it('offers Continue to Record as soon as the transformed AI video is usable', async () => {
    const user = userEvent.setup();
    const onContinueToRecord = vi.fn();
    renderWithTheme(
      <GuidedLiveStage
        {...cameraReadyLiveProps({
          status: 'live.connecting',
          aiConnected: true,
          onContinueToRecord,
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Continue to Record' }));
    expect(onContinueToRecord).toHaveBeenCalledOnce();
  });

  it('offers retry and Start AI without dropping a camera-ready preview after a capability error', async () => {
    const user = userEvent.setup();
    const onRetryCapabilities = vi.fn();
    const onStartAi = vi.fn();
    renderWithTheme(
      <GuidedLiveStage
        {...cameraReadyLiveProps({
          aiAvailable: false,
          capabilityState: 'error',
          onRetryCapabilities,
          onStartAi,
        })}
      />,
    );

    expect(screen.getByText('! AI status needs retry')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your local camera preview will stay on while you retry.',
    );
    await user.click(screen.getByRole('button', { name: 'Check Again' }));
    expect(onRetryCapabilities).toHaveBeenCalledOnce();

    const startAi = screen.getByRole('button', { name: 'Start AI Session' });
    expect(startAi).toBeEnabled();
    await user.click(startAi);
    expect(onStartAi).toHaveBeenCalledOnce();
    expect(screen.getByText('✓ Camera ready')).toBeVisible();
    expect(screen.getByText('✓ Microphone ready')).toBeVisible();
  });

  it('explains an unconfigured provider while keeping Start AI actionable for a fresh check', async () => {
    const user = userEvent.setup();
    const onStartAi = vi.fn();
    renderWithTheme(
      <GuidedLiveStage
        {...cameraReadyLiveProps({
          aiAvailable: false,
          capabilityState: 'ready',
          onStartAi,
        })}
      />,
    );

    expect(screen.getByText('! AI is not configured')).toBeVisible();
    expect(
      screen.getByText(
        'Realtime AI is not currently configured. Start AI Session will check again without restarting your camera.',
      ),
    ).toBeVisible();
    const startAi = screen.getByRole('button', { name: 'Start AI Session' });
    expect(startAi).toBeEnabled();
    await user.click(startAi);
    expect(onStartAi).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Stop Camera' })).toBeEnabled();
  });

  it('wires recording controls and announces the final thirty-second warning', async () => {
    const user = userEvent.setup();
    const onStartRecording = vi.fn();
    const onStopRecording = vi.fn();
    const onStopAi = vi.fn();
    const onStopCamera = vi.fn();
    const common = {
      storage,
      ...idleMedia,
      countdownValue: null,
      refreshingForRecord: false,
      error: null,
      sidecar: { state: 'unavailable' as const, error: null },
      original: null,
      recordingSourceAvailable: true,
      transformedVideoUsable: true,
      onUseTake: vi.fn(),
      onReRecord: vi.fn(),
      onStopRecording,
      onStartRecording,
      onPracticeAgain: vi.fn(),
      onStopAi,
      onStopCamera,
    };
    const { rerender } = renderWithTheme(
      <GuidedRecordStage {...common} status="record.ready" recordingSeconds={0} />,
    );

    await user.click(screen.getByRole('button', { name: 'Start Recording' }));
    expect(onStartRecording).toHaveBeenCalledOnce();

    rerender(
      <StudioDesignProvider>
        <GuidedRecordStage {...common} status="record.recording" recordingSeconds={270} />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('30 seconds remaining');
    await user.click(screen.getByRole('button', { name: 'Stop Recording' }));
    expect(onStopRecording).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Stop AI' }));
    await user.click(screen.getByRole('button', { name: 'Stop Camera' }));
    expect(onStopAi).toHaveBeenCalledOnce();
    expect(onStopCamera).toHaveBeenCalledOnce();

    rerender(
      <StudioDesignProvider>
        <GuidedRecordStage {...common} status="record.finalizing" recordingSeconds={270} />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('button', { name: 'Preparing Your Take' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Stop Camera' }));
    expect(onStopCamera).toHaveBeenCalledTimes(2);
  });

  it.each(['record.refreshing', 'record.countdown', 'record.starting'] as const)(
    'keeps owned stop controls reachable during %s without offering Practice Again',
    async (status) => {
      const user = userEvent.setup();
      const onStopAi = vi.fn();
      const onStopCamera = vi.fn();
      renderWithTheme(
        <GuidedRecordStage
          storage={storage}
          {...idleMedia}
          status={status}
          recordingSeconds={0}
          countdownValue={status === 'record.countdown' ? 3 : null}
          refreshingForRecord={status === 'record.refreshing'}
          error={null}
          sidecar={{ state: 'unavailable', error: null }}
          original={null}
          recordingSourceAvailable
          transformedVideoUsable
          onUseTake={vi.fn()}
          onReRecord={vi.fn()}
          onStopRecording={vi.fn()}
          onStartRecording={vi.fn()}
          onPracticeAgain={vi.fn()}
          onStopAi={onStopAi}
          onStopCamera={onStopCamera}
        />,
      );

      expect(screen.queryByRole('button', { name: 'Practice Again' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Start Recording' })).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Stop AI' }));
      await user.click(screen.getByRole('button', { name: 'Stop Camera' }));
      expect(onStopAi).toHaveBeenCalledOnce();
      expect(onStopCamera).toHaveBeenCalledOnce();
    },
  );

  it('keeps the immutable original available when voice service is unavailable', async () => {
    const user = userEvent.setup();
    const onKeepOriginal = vi.fn();
    renderWithTheme(
      <GuidedVoiceStage
        storage={storage}
        status="voice.choosing"
        selectedVoiceName={null}
        previewVariant="original"
        hasAudio={false}
        elevenLabsAvailable={false}
        voiceLibraryLoaded={false}
        processingState="idle"
        original={artifact()}
        processed={null}
        presented={artifact()}
        error={null}
        onPreviewVariantChange={vi.fn()}
        onUseProcessedVoice={vi.fn()}
        onChooseAnotherVoice={vi.fn()}
        onKeepOriginal={onKeepOriginal}
        onCancelProcessing={vi.fn()}
        onLoadVoiceLibrary={vi.fn()}
        onApplyVoice={vi.fn()}
        onRetrySelectedVoice={vi.fn()}
      />,
    );

    expect(screen.getByText(/immutable original remains ready/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Keep Original Voice' }));
    expect(onKeepOriginal).toHaveBeenCalledOnce();
  });

  it('can retry the exact selected voice after processing fails', async () => {
    const user = userEvent.setup();
    const onRetrySelectedVoice = vi.fn();
    renderWithTheme(
      <GuidedVoiceStage
        storage={storage}
        status="voice.choosing"
        selectedVoiceName="Imported Narrator"
        previewVariant="original"
        hasAudio
        elevenLabsAvailable
        voiceLibraryLoaded
        processingState="error"
        original={artifact()}
        processed={null}
        presented={artifact()}
        error="Voice processing could not finish."
        onPreviewVariantChange={vi.fn()}
        onUseProcessedVoice={vi.fn()}
        onChooseAnotherVoice={vi.fn()}
        onKeepOriginal={vi.fn()}
        onCancelProcessing={vi.fn()}
        onLoadVoiceLibrary={vi.fn()}
        onApplyVoice={vi.fn()}
        onRetrySelectedVoice={onRetrySelectedVoice}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Retry Imported Narrator' }));
    expect(onRetrySelectedVoice).toHaveBeenCalledOnce();
  });

  it('dispatches a truthful final download and supports the completed actions', async () => {
    const user = userEvent.setup();
    const take = artifact();
    const onDownload = vi.fn();
    const onDownloadAgain = vi.fn();
    const onCreateAnother = vi.fn();
    const common = {
      storage,
      artifact: take,
      videoHeight: 1_080,
      selectedVoiceName: null,
      characterName: 'Documentary Presenter 01',
      error: null,
      downloadStarted: false,
      onCreateAnother,
      onDownloadAgain,
      onDownload,
    };
    const { rerender } = renderWithTheme(
      <GuidedDownloadStage {...common} status="download.ready" />,
    );

    expect(screen.getByText('1080p')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Download Video' }));
    expect(onDownload).toHaveBeenCalledOnce();

    rerender(
      <StudioDesignProvider>
        <GuidedDownloadStage {...common} status="download.complete" />
      </StudioDesignProvider>,
    );
    await user.click(screen.getByRole('button', { name: 'Create Another Character' }));
    await user.click(screen.getByRole('button', { name: 'Download Again' }));
    expect(onCreateAnother).toHaveBeenCalledOnce();
    expect(onDownloadAgain).toHaveBeenCalledOnce();
  });
});
