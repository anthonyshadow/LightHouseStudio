// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyDraft, type StudioSessionController } from '../features/media-session';
import type {
  RecordingArtifact,
  RecordingController,
  RecordingSource,
} from '../features/recording';
import { StudioDesignProvider } from '../ui';
import { StudioSessionControlBar } from './StudioSessionControlBar';

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
  realtimeSessionTiming: null,
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
  completeExpectedModelSession: vi.fn().mockResolvedValue(undefined),
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
  visual: null,
  processed: null,
  presented: null,
  sidecar: { state: 'unavailable', blob: null, mimeType: null, error: null },
  recordingError: null,
  processingState: 'idle',
  processingOperation: null,
  processingError: null,
  elapsedSeconds: 0,
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(null),
  restorePersistedOriginal: vi.fn(),
  presentRemoteOriginal: vi.fn(),
  replaceSource: vi.fn(),
  discard: vi.fn(),
  beginProcessing: vi.fn(),
  cancelProcessing: vi.fn(),
  completeVisualProcessing: vi.fn(),
  completeProcessing: vi.fn(),
  failProcessing: vi.fn(),
  repairPresentedObjectUrl: vi.fn().mockReturnValue(false),
  clearVisualProcessing: vi.fn(),
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
  options: {
    experienceLabel?: string;
    onDiscardTake?: () => void;
    onStartLocalRecording?: () => void;
    onSaveVideo?: () => void;
    saveVideoState?: Parameters<typeof StudioSessionControlBar>[0]['saveVideoState'];
    recordingMode?: StudioSessionController['draft']['mode'];
    hasUnsavedChanges?: boolean;
  } = {},
) =>
  render(
    <StudioDesignProvider>
      <StudioSessionControlBar
        session={session}
        {...(options.experienceLabel ? { experienceLabel: options.experienceLabel } : {})}
        recording={recording}
        recordingMode={options.recordingMode ?? session.draft.mode}
        recordingSource={session.localStream ? recordingSource : null}
        recordingSupported
        reviewingTake={reviewingTake}
        onStopRecording={onStopRecording}
        {...(options.onStartLocalRecording
          ? { onStartLocalRecording: options.onStartLocalRecording }
          : {})}
        onCloseTakeReview={onCloseTakeReview}
        {...(options.onDiscardTake ? { onDiscardTake: options.onDiscardTake } : {})}
        {...(options.onSaveVideo ? { onSaveVideo: options.onSaveVideo } : {})}
        {...(options.saveVideoState ? { saveVideoState: options.saveVideoState } : {})}
        {...(options.hasUnsavedChanges !== undefined
          ? { hasUnsavedChanges: options.hasUnsavedChanges }
          : {})}
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

    expect(screen.getByRole('button', { name: 'Upload Video' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Record New Video' }));
    expect(session.startLocal).toHaveBeenCalledOnce();

    view.rerender(
      <StudioDesignProvider>
        <StudioSessionControlBar
          session={createSession({ lifecycle: 'requesting-media' })}
          recording={createRecording()}
          recordingMode="local"
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

  it('delegates the primary record intent without starting media independently', async () => {
    const user = userEvent.setup();
    const session = createSession();
    const onStartLocalRecording = vi.fn();
    renderBar(session, vi.fn(), createRecording(), vi.fn(), false, vi.fn(), vi.fn(), {
      onStartLocalRecording,
    });

    await user.click(screen.getByRole('button', { name: 'Record New Video' }));

    expect(onStartLocalRecording).toHaveBeenCalledOnce();
    expect(session.startLocal).not.toHaveBeenCalled();
  });

  it('keeps AI, track toggles, and full shutdown available for a selected experience', async () => {
    const user = userEvent.setup();
    const onChooseAiExperience = vi.fn();
    const session = createSession({
      draft: { ...createEmptyDraft('lucy-latest'), prompt: 'Business host' },
      lifecycle: 'ready',
      localStream: stream,
    });
    renderBar(
      session,
      onChooseAiExperience,
      createRecording(),
      vi.fn().mockResolvedValue(undefined),
      false,
      vi.fn(),
      vi.fn(),
      { experienceLabel: 'Business host' },
    );

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

  it('uses local Record as the primary action when no AI experience is selected', async () => {
    const user = userEvent.setup();
    const recording = createRecording();
    const session = createSession({
      draft: createEmptyDraft('lucy-vton-latest'),
      lifecycle: 'ready',
      localStream: stream,
    });
    renderBar(
      session,
      vi.fn(),
      recording,
      vi.fn().mockResolvedValue(undefined),
      false,
      vi.fn(),
      vi.fn(),
      { recordingMode: 'local' },
    );

    expect(screen.queryByRole('button', { name: 'Start AI' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Record' }));
    expect(recording.start).toHaveBeenCalledWith(recordingSource, 'local');
  });

  it('offers capability-gated camera switching and zoom in the stage control bar', async () => {
    const user = userEvent.setup();
    const switchCamera = vi.fn().mockResolvedValue(undefined);
    const setZoom = vi.fn().mockResolvedValue(undefined);
    const session = createSession({
      lifecycle: 'ready',
      localStream: stream,
      cameraControls: {
        facingMode: 'user',
        nextFacingMode: 'environment',
        switching: false,
        zoom: { min: 1, max: 3, step: 0.5, value: 1.5 },
        error: null,
        switchCamera,
        setZoom,
      },
    });
    renderBar(session);

    await user.click(screen.getByRole('button', { name: 'Switch to rear camera' }));
    await user.click(screen.getByRole('button', { name: 'Zoom camera in' }));
    await user.click(screen.getByRole('button', { name: 'Zoom camera out' }));

    expect(switchCamera).toHaveBeenCalledOnce();
    expect(setZoom).toHaveBeenNthCalledWith(1, 2);
    expect(setZoom).toHaveBeenNthCalledWith(2, 1);
    expect(screen.getByText('Zoom 1.5×')).toBeVisible();
  });

  it('omits facing-mode switching when the browser exposes no opposite-facing camera', () => {
    const session = createSession({
      lifecycle: 'ready',
      localStream: stream,
      cameraControls: {
        facingMode: 'user',
        nextFacingMode: null,
        switching: false,
        zoom: { min: 1, max: 3, step: 0.5, value: 1 },
        error: null,
        switchCamera: vi.fn().mockResolvedValue(undefined),
        setZoom: vi.fn().mockResolvedValue(undefined),
      },
    });
    renderBar(session);

    expect(screen.queryByRole('button', { name: /switch to .* camera/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom camera in' })).toBeVisible();
  });

  it('stops only AI while preserving the separate end-session action', async () => {
    const user = userEvent.setup();
    const session = createSession({
      draft: { ...createEmptyDraft('lucy-latest'), prompt: 'A neon samurai' },
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
          recordingMode="local"
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

    const stopRecording = screen.getByRole('button', { name: 'Stop recording' });
    expect(stopRecording).toHaveFocus();
    await user.click(stopRecording);
    expect(onStopRecording).toHaveBeenCalledOnce();
  });

  it('replaces live controls with take actions and restores them after release', async () => {
    const user = userEvent.setup();
    const artifact = takeArtifact();
    const onCloseTakeReview = vi.fn();
    const onOpenVoiceTreatments = vi.fn();
    const onSaveVideo = vi.fn();
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
      { onSaveVideo },
    );

    const controls = screen.getByRole('region', { name: 'Studio session controls' });
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
    expect(screen.getByRole('group', { name: 'Recorded take controls' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit video' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Voice' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Release' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Record New Video' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voice' }));
    expect(onOpenVoiceTreatments).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSaveVideo).toHaveBeenCalledOnce();

    const savedRecording = createRecording('recorded', {
      original: artifact,
      presented: artifact,
    });
    view.rerender(
      <StudioDesignProvider>
        <StudioSessionControlBar
          session={idleSession}
          recording={savedRecording}
          recordingMode="local"
          recordingSource={null}
          recordingSupported
          reviewingTake
          onStopRecording={vi.fn().mockResolvedValue(undefined)}
          onCloseTakeReview={onCloseTakeReview}
          onSaveVideo={onSaveVideo}
          saveVideoState={{ status: 'saved', artifactId: artifact.id, video: {} as never }}
          onOpenVoiceTreatments={onOpenVoiceTreatments}
          onChooseAiExperience={vi.fn()}
          onChangeExperience={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Release' }));
    expect(savedRecording.discard).toHaveBeenCalledOnce();
    expect(onCloseTakeReview).toHaveBeenCalledOnce();

    view.rerender(
      <StudioDesignProvider>
        <StudioSessionControlBar
          session={createSession({ lifecycle: 'ready', localStream: stream })}
          recording={createRecording()}
          recordingMode="local"
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

    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start AI' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Recorded take controls' })).not.toBeInTheDocument();
  });

  it('shows Release instead of Discard for an unchanged video already loaded from Assets', () => {
    const artifact = takeArtifact();
    renderBar(
      createSession(),
      vi.fn(),
      createRecording('recorded', { original: artifact, presented: artifact }),
      vi.fn().mockResolvedValue(undefined),
      true,
      vi.fn(),
      vi.fn(),
      { hasUnsavedChanges: false },
    );

    expect(screen.getByRole('button', { name: 'Release' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Discard' })).not.toBeInTheDocument();
  });

  it('notifies the upload workflow only after a take discard is confirmed', async () => {
    const user = userEvent.setup();
    const artifact = takeArtifact();
    const recording = createRecording('recorded', {
      original: artifact,
      presented: artifact,
    });
    const onCloseTakeReview = vi.fn();
    const onDiscardTake = vi.fn();
    renderBar(
      createSession(),
      vi.fn(),
      recording,
      vi.fn().mockResolvedValue(undefined),
      true,
      onCloseTakeReview,
      vi.fn(),
      { onDiscardTake },
    );

    await user.click(screen.getByRole('button', { name: 'Discard' }));
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(recording.discard).not.toHaveBeenCalled();
    expect(onDiscardTake).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await user.click(screen.getByRole('button', { name: 'Discard take' }));
    expect(recording.discard).toHaveBeenCalledOnce();
    expect(onDiscardTake).toHaveBeenCalledOnce();
    expect(onCloseTakeReview).toHaveBeenCalledOnce();
  });

  it('renders the stage-owned visibility state with matching inert semantics', () => {
    const session = createSession({ lifecycle: 'ready', localStream: stream });
    const view = render(
      <StudioDesignProvider>
        <StudioSessionControlBar
          session={session}
          recording={createRecording()}
          recordingMode="local"
          recordingSource={recordingSource}
          recordingSupported
          reviewingTake={false}
          visible={false}
          onStopRecording={vi.fn().mockResolvedValue(undefined)}
          onCloseTakeReview={vi.fn()}
          onOpenVoiceTreatments={vi.fn()}
          onChooseAiExperience={vi.fn()}
          onChangeExperience={vi.fn()}
        />
      </StudioDesignProvider>,
    );
    const controls = view.container.querySelector('[aria-label="Studio session controls"]');

    expect(controls).toHaveAttribute('data-control-visibility', 'hidden');
    expect(controls).toHaveAttribute('aria-hidden', 'true');
    expect(controls).toHaveAttribute('inert');

    view.rerender(
      <StudioDesignProvider>
        <StudioSessionControlBar
          session={session}
          recording={createRecording()}
          recordingMode="local"
          recordingSource={recordingSource}
          recordingSupported
          reviewingTake={false}
          visible
          onStopRecording={vi.fn().mockResolvedValue(undefined)}
          onCloseTakeReview={vi.fn()}
          onOpenVoiceTreatments={vi.fn()}
          onChooseAiExperience={vi.fn()}
          onChangeExperience={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
    expect(controls).not.toHaveAttribute('aria-hidden');
    expect(controls).not.toHaveAttribute('inert');
  });

  it('keeps Stop recording visible and dominant if a stale owner state requests hiding', () => {
    render(
      <StudioDesignProvider>
        <StudioSessionControlBar
          session={createSession({ lifecycle: 'ready', localStream: stream })}
          recording={createRecording('recording', { activeSource: recordingSource })}
          recordingMode="local"
          recordingSource={recordingSource}
          recordingSupported
          reviewingTake={false}
          visible={false}
          onStopRecording={vi.fn().mockResolvedValue(undefined)}
          onCloseTakeReview={vi.fn()}
          onOpenVoiceTreatments={vi.fn()}
          onChooseAiExperience={vi.fn()}
          onChangeExperience={vi.fn()}
        />
      </StudioDesignProvider>,
    );
    const controls = screen.getByRole('region', { name: 'Studio session controls' });

    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
    expect(controls).not.toHaveAttribute('aria-hidden');
    expect(controls).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Stop recording' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start AI' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mute microphone' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Turn camera off' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    expect(controls.querySelector('[data-recording-controls="dominant"]')).not.toBeNull();
  });

  it('keeps below-stage take actions visible after playback chrome becomes idle', () => {
    const artifact = takeArtifact();
    render(
      <StudioDesignProvider>
        <StudioSessionControlBar
          session={createSession()}
          recording={createRecording('recorded', {
            original: artifact,
            presented: artifact,
          })}
          recordingMode="local"
          recordingSource={null}
          recordingSupported
          reviewingTake
          visible={false}
          onStopRecording={vi.fn().mockResolvedValue(undefined)}
          onCloseTakeReview={vi.fn()}
          onOpenVoiceTreatments={vi.fn()}
          onChooseAiExperience={vi.fn()}
          onChangeExperience={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    const controls = screen.getByRole('region', { name: 'Studio session controls' });
    expect(controls).toHaveAttribute('data-control-visibility', 'visible');
    expect(controls).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('group', { name: 'Recorded take controls' })).toBeVisible();
  });
});
