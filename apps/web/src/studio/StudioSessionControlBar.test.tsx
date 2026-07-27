// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDraft, type StudioSessionController } from '../features/media-session';
import type {
  RecordingArtifact,
  RecordingController,
  RecordingSource,
} from '../features/recording';
import { StudioDesignProvider } from '../ui';
import {
  SESSION_CONTROL_IDLE_TIMEOUT_MS,
  StudioSessionControlBar,
} from './StudioSessionControlBar';

const createSession = (
  overrides: Partial<StudioSessionController> = {},
): StudioSessionController => ({
  draft: createEmptyDraft('local'),
  applied: null,
  lifecycle: 'idle',
  localStream: null,
  remoteStream: null,
  displayStream: null,
  transformedVideoUsable: false,
  pendingChanges: false,
  error: null,
  applying: false,
  microphoneEnabled: true,
  cameraEnabled: true,
  startLocal: vi.fn().mockResolvedValue(undefined),
  preflight: vi.fn().mockResolvedValue(undefined),
  startModel: vi.fn().mockResolvedValue(undefined),
  applyChanges: vi.fn().mockResolvedValue(undefined),
  revertDraft: vi.fn(),
  stopModel: vi.fn().mockResolvedValue(undefined),
  resetModel: vi.fn(),
  stopCamera: vi.fn().mockResolvedValue(undefined),
  releaseForRecordedReview: vi.fn().mockResolvedValue(undefined),
  toggleMicrophone: vi.fn(),
  toggleCamera: vi.fn(),
  selectMode: vi.fn().mockReturnValue(true),
  canReplaceRecipeDraft: vi.fn().mockReturnValue(true),
  replaceRecipeDraft: vi.fn().mockReturnValue(true),
  updatePrompt: vi.fn(),
  updateEnhancement: vi.fn(),
  updateReferenceImage: vi.fn(),
  clearError: vi.fn(),
  ...overrides,
});

const stream = {
  getTracks: () => [],
  getAudioTracks: () => [],
  getVideoTracks: () => [],
} as unknown as MediaStream;

const createRecording = (
  lifecycle: RecordingController['lifecycle'] = 'idle',
  overrides: Partial<RecordingController> = {},
): RecordingController => ({
  lifecycle,
  activeSource: null,
  metadata: null,
  original: null,
  processed: null,
  presented: null,
  sidecar: { state: 'unavailable', blob: null, mimeType: null, error: null },
  recordingError: null,
  processingState: 'idle',
  processingError: null,
  elapsedSeconds: 0,
  downloaded: false,
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(null),
  restorePersistedOriginal: vi.fn(),
  discard: vi.fn(),
  markDownloaded: vi.fn(),
  beginProcessing: vi.fn(),
  cancelProcessing: vi.fn(),
  completeProcessing: vi.fn(),
  failProcessing: vi.fn(),
  restoreOriginal: vi.fn(),
  ...overrides,
});

const recordingSource: RecordingSource = {
  stream,
  videoSource: 'local',
  audioSource: 'microphone',
};

const takeArtifact = (): RecordingArtifact => {
  const media = new Blob(['take'], { type: 'video/webm' });
  return {
    id: 'take-1',
    media,
    objectUrl: 'blob:take-1',
    mimeType: media.type,
    filename: 'take.webm',
    sourceModeId: 'local',
    startedAt: '2026-07-25T14:00:00.000Z',
    durationMs: 2_000,
    sizeBytes: media.size,
  };
};

const renderBar = (
  session: StudioSessionController,
  onChooseAiExperience = vi.fn(),
  recording = createRecording(),
  onStopRecording = vi.fn().mockResolvedValue(undefined),
  reviewingTake = false,
  onCloseTakeReview = vi.fn(),
  onOpenVoiceTreatments = vi.fn(),
) =>
  render(
    <StudioDesignProvider>
      <StudioSessionControlBar
        session={session}
        recording={recording}
        recordingSource={session.localStream ? recordingSource : null}
        recordingSupported
        reviewingTake={reviewingTake}
        onStopRecording={onStopRecording}
        onCloseTakeReview={onCloseTakeReview}
        onOpenVoiceTreatments={onOpenVoiceTreatments}
        onChooseAiExperience={onChooseAiExperience}
        onChangeExperience={onChooseAiExperience}
      />
    </StudioDesignProvider>,
  );

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StudioSessionControlBar', () => {
  it('starts local media from the persistent idle action and prevents duplicate startup', async () => {
    const user = userEvent.setup();
    const session = createSession();
    const view = renderBar(session);

    await user.click(screen.getByRole('button', { name: 'Start Camera + Mic' }));
    expect(session.startLocal).toHaveBeenCalledOnce();

    view.rerender(
      <StudioDesignProvider>
        <StudioSessionControlBar
          session={createSession({ lifecycle: 'requesting-media' })}
          recording={createRecording()}
          recordingSource={null}
          recordingSupported
          reviewingTake={false}
          onStopRecording={vi.fn().mockResolvedValue(undefined)}
          onCloseTakeReview={vi.fn()}
          onOpenVoiceTreatments={vi.fn()}
          onChooseAiExperience={vi.fn()}
          onChangeExperience={vi.fn()}
        />
      </StudioDesignProvider>,
    );
    expect(screen.getByRole('button', { name: 'Starting camera…' })).toBeDisabled();
  });

  it('keeps AI, track toggles, and full shutdown available during local preview', async () => {
    const user = userEvent.setup();
    const onChooseAiExperience = vi.fn();
    const session = createSession({ lifecycle: 'ready', localStream: stream });
    renderBar(session, onChooseAiExperience);

    await user.click(screen.getByRole('button', { name: 'Start AI' }));
    const microphone = screen.getByRole('button', { name: 'Mute microphone' });
    const camera = screen.getByRole('button', { name: 'Turn camera off' });
    expect(microphone).toHaveTextContent('');
    expect(camera).toHaveTextContent('');
    await user.click(microphone);
    await user.click(camera);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onChooseAiExperience).toHaveBeenCalledOnce();
    expect(session.toggleMicrophone).toHaveBeenCalledOnce();
    expect(session.toggleCamera).toHaveBeenCalledOnce();
    expect(session.stopCamera).toHaveBeenCalledOnce();
  });

  it('stops only AI while preserving the separate end-session action', async () => {
    const user = userEvent.setup();
    const session = createSession({
      draft: { ...createEmptyDraft('lucy-2.5'), prompt: 'A neon samurai' },
      lifecycle: 'generating',
      localStream: stream,
      remoteStream: stream,
      displayStream: stream,
      transformedVideoUsable: true,
    });
    renderBar(session);

    await user.click(screen.getByRole('button', { name: 'Stop AI' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(session.stopModel).toHaveBeenCalledOnce();
    expect(session.stopCamera).toHaveBeenCalledOnce();
  });

  it('starts and stops recording from the stage control bar', async () => {
    const user = userEvent.setup();
    const session = createSession({ lifecycle: 'ready', localStream: stream });
    const recording = createRecording();
    const onStopRecording = vi.fn().mockResolvedValue(undefined);
    const view = renderBar(session, vi.fn(), recording, onStopRecording);

    await user.click(screen.getByRole('button', { name: 'Record' }));
    expect(recording.start).toHaveBeenCalledWith(recordingSource, 'local');

    view.rerender(
      <StudioDesignProvider>
        <StudioSessionControlBar
          session={session}
          recording={createRecording('recording', { activeSource: recordingSource })}
          recordingSource={recordingSource}
          recordingSupported
          reviewingTake={false}
          onStopRecording={onStopRecording}
          onCloseTakeReview={vi.fn()}
          onOpenVoiceTreatments={vi.fn()}
          onChooseAiExperience={vi.fn()}
          onChangeExperience={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Stop recording' }));
    expect(onStopRecording).toHaveBeenCalledOnce();
  });

  it('replaces live controls with take actions and restores them after close', async () => {
    const user = userEvent.setup();
    const artifact = takeArtifact();
    const onCloseTakeReview = vi.fn();
    const onOpenVoiceTreatments = vi.fn();
    const reviewedRecording = createRecording('recorded', {
      original: artifact,
      presented: artifact,
    });
    const idleSession = createSession();
    const view = renderBar(
      idleSession,
      vi.fn(),
      reviewedRecording,
      vi.fn().mockResolvedValue(undefined),
      true,
      onCloseTakeReview,
      onOpenVoiceTreatments,
    );

    const controls = screen.getByRole('region', { name: 'Studio session controls' });
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
    expect(screen.getByRole('group', { name: 'Recorded take controls' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Download' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voice' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Start Camera + Mic' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voice' }));
    expect(onOpenVoiceTreatments).toHaveBeenCalledOnce();
    const download = screen.getByRole('link', { name: 'Download' });
    download.addEventListener('click', (event) => event.preventDefault(), { once: true });
    fireEvent.click(download);
    expect(reviewedRecording.markDownloaded).toHaveBeenCalledOnce();

    const downloadedRecording = createRecording('recorded', {
      original: artifact,
      presented: artifact,
      downloaded: true,
    });
    view.rerender(
      <StudioDesignProvider>
        <StudioSessionControlBar
          session={idleSession}
          recording={downloadedRecording}
          recordingSource={null}
          recordingSupported
          reviewingTake
          onStopRecording={vi.fn().mockResolvedValue(undefined)}
          onCloseTakeReview={onCloseTakeReview}
          onOpenVoiceTreatments={onOpenVoiceTreatments}
          onChooseAiExperience={vi.fn()}
          onChangeExperience={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(downloadedRecording.discard).toHaveBeenCalledOnce();
    expect(onCloseTakeReview).toHaveBeenCalledOnce();

    view.rerender(
      <StudioDesignProvider>
        <StudioSessionControlBar
          session={createSession({ lifecycle: 'ready', localStream: stream })}
          recording={createRecording()}
          recordingSource={recordingSource}
          recordingSupported
          reviewingTake={false}
          onStopRecording={vi.fn().mockResolvedValue(undefined)}
          onCloseTakeReview={vi.fn()}
          onOpenVoiceTreatments={vi.fn()}
          onChooseAiExperience={vi.fn()}
          onChangeExperience={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Start AI' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Recorded take controls' })).not.toBeInTheDocument();
  });

  it('hides after three idle seconds and returns on mouse or keyboard activity', () => {
    vi.useFakeTimers();
    const session = createSession({ lifecycle: 'ready', localStream: stream });
    renderBar(session);
    const controls = screen.getByRole('region', { name: 'Studio session controls' });

    expect(controls).toHaveAttribute('data-control-visibility', 'visible');

    act(() => {
      vi.advanceTimersByTime(SESSION_CONTROL_IDLE_TIMEOUT_MS - 1);
    });
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(controls).toHaveAttribute('data-control-visibility', 'hidden');
    expect(controls).toHaveAttribute('aria-hidden', 'true');

    fireEvent.mouseMove(window);
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
    expect(controls).not.toHaveAttribute('aria-hidden', 'true');

    act(() => {
      vi.advanceTimersByTime(SESSION_CONTROL_IDLE_TIMEOUT_MS);
    });
    expect(controls).toHaveAttribute('data-control-visibility', 'hidden');

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');

    act(() => {
      vi.advanceTimersByTime(SESSION_CONTROL_IDLE_TIMEOUT_MS);
    });
    expect(controls).toHaveAttribute('data-control-visibility', 'hidden');
  });

  it('applies the same idle visibility behavior to recorded playback controls', () => {
    vi.useFakeTimers();
    const artifact = takeArtifact();
    renderBar(
      createSession(),
      vi.fn(),
      createRecording('recorded', {
        original: artifact,
        presented: artifact,
      }),
      vi.fn().mockResolvedValue(undefined),
      true,
    );
    const controls = screen.getByRole('region', { name: 'Studio session controls' });

    expect(controls).toHaveAttribute('data-control-visibility', 'visible');

    act(() => {
      vi.advanceTimersByTime(SESSION_CONTROL_IDLE_TIMEOUT_MS);
    });
    expect(controls).toHaveAttribute('data-control-visibility', 'hidden');

    fireEvent.mouseMove(window);
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');

    act(() => {
      vi.advanceTimersByTime(SESSION_CONTROL_IDLE_TIMEOUT_MS);
    });
    expect(controls).toHaveAttribute('data-control-visibility', 'hidden');

    fireEvent.keyDown(window, { key: 'Tab' });
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
  });

  it('stays visible while the camera is not running', () => {
    vi.useFakeTimers();
    renderBar(createSession());
    const controls = screen.getByRole('region', { name: 'Studio session controls' });

    act(() => {
      vi.advanceTimersByTime(SESSION_CONTROL_IDLE_TIMEOUT_MS * 2);
    });

    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
  });
});
