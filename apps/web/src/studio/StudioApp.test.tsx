// @vitest-environment jsdom

import type { ReferenceImageAsset } from '@studio/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CreativeWorkspaceActions,
  CreativeWorkspaceRefs,
  CreativeWorkspaceState,
} from './CreativeWorkspace';
import type { PersistedSessionReference } from '../features/media-session';

type WorkspaceHarnessProps = {
  state: CreativeWorkspaceState;
  actions: CreativeWorkspaceActions;
  refs: CreativeWorkspaceRefs;
};

const referenceAsset: ReferenceImageAsset = {
  assetId: '28d0b01f-70aa-4db6-ac65-379cdd916113',
  mimeType: 'image/png',
  size: '1024x1024',
  width: 1024,
  height: 1024,
  byteSize: 1234,
  source: 'generated',
  provider: 'openai',
  model: 'gpt-image-2',
  quality: 'high',
  promptHash: 'a'.repeat(64),
  optimizationEnabled: true,
  originalPrompt: 'A calm documentary presenter',
  optimizedImagePrompt: 'A centered documentary presenter on a neutral background.',
  lucy25CharacterPrompt: 'Keep the same calm documentary presenter.',
  normalizedCharacterDescription: 'A calm documentary presenter.',
  preservedCharacterFacts: ['calm presenter'],
  technicalDefaultsAdded: ['neutral background'],
  warnings: [],
  options: {
    framing: 'head_and_shoulders',
    orientation: 'square',
    renderingMode: 'photorealistic',
    expression: 'neutral',
    background: 'neutral_gray',
    targetUse: 'lucy_2_5_character_reference',
  },
  requestedGenerator: null,
  optimizer: { model: 'gpt-5.6', version: 'lucy-character-reference-v1' },
  optimizationInputHash: 'b'.repeat(64),
  manuallyEdited: false,
  derivation: { kind: 'generate' },
  createdAt: '2026-07-18T12:00:00.000Z',
  updatedAt: '2026-07-18T12:00:00.000Z',
  contentUrl: '/api/reference-images/28d0b01f-70aa-4db6-ac65-379cdd916113/content',
};

const harness = vi.hoisted(() => {
  const store = {
    schemaVersion: 5 as const,
    savedPrompts: [],
    recentPrompts: [],
    savedCharacterPrompts: [],
  };
  const repository = {
    getSnapshot: vi.fn(() => ({ store, health: 'ready' as const, notice: null })),
    subscribe: vi.fn(() => () => undefined),
    createSavedPrompt: vi.fn(),
    updateSavedPrompt: vi.fn(),
    renameSavedPrompt: vi.fn(),
    deleteSavedPrompt: vi.fn(),
    createSavedCharacterPrompt: vi.fn(),
    persistSavedCharacterPrompt: vi.fn(),
    updateSavedCharacterPrompt: vi.fn(),
    renameSavedCharacterPrompt: vi.fn(),
    deleteSavedCharacterPrompt: vi.fn(),
    recordSuccessfulPrompt: vi.fn(),
    enrichNewestMatchingRecent: vi.fn(),
    search: vi.fn(() => ({ savedPrompts: [], recentPrompts: [], savedCharacterPrompts: [] })),
  };
  const capturePreferences = {
    draft: {
      videoDeviceId: null,
      audioDeviceId: null,
      profile: '720p30' as const,
      aspectRatio: '16:9' as const,
    },
    applied: {
      videoDeviceId: null,
      audioDeviceId: null,
      profile: '720p30' as const,
      aspectRatio: '16:9' as const,
    },
    effectiveApplied: {
      videoDeviceId: null,
      audioDeviceId: null,
      profile: '720p30' as const,
      aspectRatio: '16:9' as const,
    },
    cameraDevices: [],
    microphoneDevices: [],
    supportedProfiles: ['720p30' as const],
    devicesState: 'idle' as const,
    cameraPermissionState: 'unknown' as const,
    deviceError: null,
    videoFallbackNotice: null,
    applyError: null,
    applying: false,
    hasPendingChanges: false,
    actualSettings: { video: null, audio: null },
    refreshDevices: vi.fn(() => Promise.resolve()),
    updateVideoDeviceId: vi.fn(),
    updateAudioDeviceId: vi.fn(),
    updateProfile: vi.fn(),
    updateAspectRatio: vi.fn(),
    reportVideoDeviceUnavailable: vi.fn(),
    dismissVideoFallbackNotice: vi.fn(),
    apply: vi.fn(() => Promise.resolve(true)),
    discardPending: vi.fn(),
  };
  const session = {
    draft: { mode: 'lucy-latest' as const, prompt: '', referenceImage: null, enhance: false },
    applied: null,
    lifecycle: 'idle' as const,
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
    capturePreferences,
    startLocal: vi.fn(() => Promise.resolve()),
    preflight: vi.fn(() => Promise.resolve()),
    startModel: vi.fn(() => Promise.resolve()),
    applyChanges: vi.fn(() => Promise.resolve()),
    revertDraft: vi.fn(),
    stopModel: vi.fn(),
    completeExpectedModelSession: vi.fn(() => Promise.resolve()),
    resetModel: vi.fn(),
    stopCamera: vi.fn(),
    releaseForRecordedReview: vi.fn(() => Promise.resolve()),
    toggleMicrophone: vi.fn(),
    toggleCamera: vi.fn(),
    selectMode: vi.fn(() => true),
    canReplaceRecipeDraft: vi.fn(() => true),
    replaceRecipeDraft: vi.fn(() => true),
    updatePrompt: vi.fn(),
    updateEnhancement: vi.fn(),
    updateReferenceImage: vi.fn(),
    clearError: vi.fn(),
  };
  const recording = {
    lifecycle: 'idle' as const,
    activeSource: null,
    original: null as null | { id: string },
    visual: null,
    processed: null,
    presented: null as null | Record<string, unknown>,
    sidecar: { state: 'idle' as const, artifact: null, error: null },
    recordingError: null,
    processingState: 'idle' as const,
    elapsedSeconds: 0,
    discard: vi.fn(),
  };
  const existingVideo = {
    selection: null as null | {
      metadata: {
        kind: 'uploaded';
        mode: 'local';
        selectedAt: string;
        displayName: string;
        container: 'mp4';
        videoCodec: 'avc';
        audioCodec: null;
        durationMs: number;
        width: number;
        height: number;
        sizeBytes: number;
        hasAudio: false;
      };
    },
    steps: [],
    comparison: 'result' as const,
    active: false,
    providerActive: false,
    adoptRecordedArtifact: vi.fn(() => Promise.resolve()),
    cancelBeforeAcceptance: vi.fn(),
    reset: vi.fn(),
    showResult: vi.fn(),
    updateStep: vi.fn(),
  };
  const takeStagePresentation: { kind: string; mode?: string } = {
    kind: 'idle',
    mode: 'lucy-latest',
  };

  return {
    repository,
    session,
    recording,
    existingVideo,
    takeStagePresentation,
    latestWorkspace: null as WorkspaceHarnessProps | null,
    fetchReferenceImageMetadata: vi.fn(),
    hydrateReferenceImage: vi.fn(),
    hydratedReference: null as PersistedSessionReference | null,
    legacyClose: vi.fn(),
    promptCommitted: null as
      | ((
          mode: 'lucy-latest' | 'lucy-vton-latest',
          prompt: string,
          referenceImageAssetId: string | null,
        ) => void)
      | null,
  };
});

vi.mock('../adapters/browser-media/browserMedia', () => ({
  detectBrowserCapabilities: () => ({
    secureContext: true,
    mediaDevices: true,
    mediaRecorder: true,
    webAudio: true,
    offlineAudio: true,
  }),
}));

vi.mock('../adapters/api-client/apiClient', () => ({
  ApiClientError: class ApiClientError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code = 'api-error',
    ) {
      super(message);
      this.name = 'ApiClientError';
    }
  },
  fetchReferenceImageMetadata: harness.fetchReferenceImageMetadata,
  hydrateReferenceImage: harness.hydrateReferenceImage,
}));

vi.mock('../features/creative-assets/repository', () => ({
  createCreativeAssetRepository: () => harness.repository,
}));
vi.mock('../features/creative-assets/useCreativeAssetRepository', () => ({
  useCreativeAssetRepository: () => harness.repository.getSnapshot(),
}));

vi.mock('../features/guided-flow/projectRepository', () => ({
  createLocalProjectRepository: () => ({
    initialize: () => Promise.resolve({ kind: 'memory', available: true }),
    list: () => Promise.resolve([]),
    getStorageState: () => ({ kind: 'memory', available: true }),
    close: harness.legacyClose,
  }),
}));

vi.mock('../features/live-stage', () => ({
  MediaStage: ({
    presentation,
    editPreview,
  }: {
    presentation: { kind: string };
    editPreview?: unknown;
  }) => (
    <div
      data-testid="media-stage"
      data-presentation={presentation.kind}
      data-edit-preview={editPreview ? 'true' : 'false'}
    />
  ),
}));

vi.mock('../features/recording', () => ({
  CaptureSettingsPanel: () => <div>Capture settings content</div>,
  RecordingControls: () => <div>Recording controls</div>,
}));

vi.mock('../features/existing-video/ExistingVideoPanel', () => ({
  ExistingVideoPanel: ({
    onRecordVideo,
    onAdjustVideo,
  }: {
    onRecordVideo?: () => void;
    onAdjustVideo?: () => void;
  }) => (
    <div>
      Post-recording editor
      {onRecordVideo ? (
        <button type="button" onClick={onRecordVideo}>
          Record a local video
        </button>
      ) : null}
      {onAdjustVideo ? (
        <button type="button" onClick={onAdjustVideo}>
          Adjust video
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock('../features/existing-video/useExistingVideoWorkflow', () => ({
  useExistingVideoWorkflow: () => harness.existingVideo,
}));

vi.mock('../features/media-session', async () => {
  const { confirmModeReplacement, hasDraftContent } =
    await import('../features/media-session/draftPolicy');
  return {
    confirmModeReplacement,
    hasDraftContent,
    SessionComposer: () => <div>Recipe dock content</div>,
  };
});

vi.mock('../orchestration/session', () => ({
  useStudioSession: (options: { onPromptCommitted?: typeof harness.promptCommitted }) => {
    harness.promptCommitted = options.onPromptCommitted ?? null;
    return harness.session;
  },
}));
vi.mock('./useProviderAvailability', () => ({
  useProviderAvailability: () => ({
    availability: {
      decart: true,
      elevenLabs: true,
      elevenLabsModel: 'eleven_multilingual_v2',
      referenceImages: true,
      referenceImageEditAvailable: true,
      referenceImageOptimizerAvailable: true,
      referenceImageModel: 'gpt-image-2',
      referenceImageOptimizerModel: 'gpt-5.6',
      referenceImageOptimizerVersion: 'lucy-character-reference-v1',
    },
    state: 'ready',
    retry: vi.fn(),
  }),
}));
vi.mock('./useTakeReviewFlow', () => ({
  useTakeReviewFlow: () => ({
    recording: harness.recording,
    processing: { cancel: vi.fn() },
    recordingActive: false,
    reviewLocked: false,
    mediaLocked: false,
    recordingSource: null,
    finalizingStartedAt: null,
    finalizingStream: null,
    automaticRecordingStopEvent: null,
    finishTake: vi.fn(() => Promise.resolve()),
    stagePresentation: harness.takeStagePresentation,
  }),
}));

vi.mock('./StudioHeader', () => ({
  StudioHeader: ({ onOpenCharacterSelector }: { onOpenCharacterSelector: () => void }) => (
    <button type="button" onClick={onOpenCharacterSelector}>
      Character selector
    </button>
  ),
}));

vi.mock('../ui', async () => {
  const { StudioDesignProvider } = await import('../ui/StudioDesignProvider');
  const { Button } = await import('../ui/primitives/Button');
  return {
    StudioDesignProvider,
    Button,
    StatusNotice: ({ title, children }: PropsWithChildren<{ title: string }>) => (
      <aside aria-label={title}>{children}</aside>
    ),
    ConfirmationDialog: ({ open }: { open: boolean }) =>
      open ? <section aria-label="Discard temporary work and leave?" /> : null,
    OverlayPanel: ({
      open,
      title,
      children,
    }: PropsWithChildren<{ open: boolean; title: string }>) =>
      open ? <section aria-label={title}>{children}</section> : null,
  };
});

vi.mock('./CreativeWorkspace', () => ({
  CreativeWorkspace: (props: WorkspaceHarnessProps) => {
    harness.latestWorkspace = props;
    return (
      <div>
        <output data-testid="creative-panel">{props.state.panel}</output>
        <button type="button" onClick={props.actions.onOpenDock}>
          Open dock
        </button>
        <button
          type="button"
          disabled={!props.state.hasPlaybackVideo}
          onClick={props.actions.onOpenEditVideo}
        >
          Edit Video rail
        </button>
        <button type="button" onClick={props.actions.onToggleShelf}>
          Toggle shelf
        </button>
        <button type="button" onClick={() => props.actions.onShelfDirtyChange(true)}>
          Mark shelf dirty
        </button>
        <button
          type="button"
          onClick={() =>
            props.actions.onUseRecipe({
              origin: 'character-prompt',
              assetId: 'character-1',
              modelModeId: 'lucy-latest',
              prompt: referenceAsset.originalPrompt,
              referenceImageAssetId: referenceAsset.assetId,
            })
          }
        >
          Apply reference recipe
        </button>
        <button type="button" onClick={() => props.state.referenceUseFailure?.onRetry()}>
          Retry reference handoff
        </button>
        <button
          type="button"
          onClick={() => props.state.referenceUseFailure?.onContinueWithoutReference?.()}
        >
          Continue reference handoff without image
        </button>
        <output data-testid="handoff-error">{props.state.referenceUseFailure?.message}</output>
      </div>
    );
  },
}));

import { StudioApp } from './StudioApp';
import { StudioDesignProvider } from '../ui';

const renderStudio = (initialIntent?: 'upload') =>
  render(
    <StudioDesignProvider>
      <RouterProvider
        router={createMemoryRouter(
          [
            {
              path: '/studio',
              element: <StudioApp {...(initialIntent ? { initialIntent } : {})} />,
            },
          ],
          { initialEntries: ['/studio'] },
        )}
      />
    </StudioDesignProvider>,
  );

describe('StudioApp composition lifecycle', () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    harness.latestWorkspace = null;
    harness.promptCommitted = null;
    harness.recording.original = null;
    harness.recording.presented = null;
    harness.existingVideo.selection = null;
    harness.takeStagePresentation = { kind: 'idle', mode: 'lucy-latest' };
    harness.session.startLocal.mockClear();
    harness.session.startLocal.mockImplementation(() => Promise.resolve());
    harness.existingVideo.adoptRecordedArtifact.mockClear();
    harness.session.replaceRecipeDraft.mockClear();
    harness.repository.recordSuccessfulPrompt.mockClear();
    harness.repository.enrichNewestMatchingRecent.mockClear();
    harness.fetchReferenceImageMetadata.mockReset().mockResolvedValue(referenceAsset);
    harness.hydratedReference = {
      kind: 'persisted',
      assetId: referenceAsset.assetId,
      file: new File(['image'], 'reference.png', { type: 'image/png' }),
      contentUrl: referenceAsset.contentUrl,
    };
    harness.hydrateReferenceImage.mockReset().mockResolvedValue(harness.hydratedReference);
  });

  it('keeps the mounted stage node stable while overlays change', () => {
    renderStudio();
    const stage = screen.getByTestId('media-stage');
    expect(screen.getAllByTestId('media-stage')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open dock' }));
    expect(screen.getByRole('region', { name: 'Recipe Dock' })).toBeInTheDocument();
    expect(screen.getByTestId('media-stage')).toBe(stage);
    expect(screen.getAllByTestId('media-stage')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle shelf' }));
    expect(screen.getByTestId('creative-panel')).toHaveTextContent('shelf');
    expect(screen.getByTestId('media-stage')).toBe(stage);
    expect(screen.getAllByTestId('media-stage')).toHaveLength(1);
  });

  it('closes Use existing video and hands local recording to the persistent stage', () => {
    renderStudio('upload');
    const stage = screen.getByTestId('media-stage');

    expect(screen.getByRole('region', { name: 'Use existing video' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Record a local video' }));

    expect(screen.queryByRole('region', { name: 'Use existing video' })).not.toBeInTheDocument();
    expect(harness.session.startLocal).toHaveBeenCalledOnce();
    expect(screen.getByTestId('media-stage')).toBe(stage);
    expect(screen.getAllByTestId('media-stage')).toHaveLength(1);
  });

  it('adopts an explicitly recorded local take into the post-recording editor', async () => {
    harness.session.startLocal.mockImplementationOnce(() => {
      harness.recording.original = { id: 'recorded-source' };
      harness.takeStagePresentation = { kind: 'playback', mode: 'local' };
      return Promise.resolve();
    });
    renderStudio('upload');

    fireEvent.click(screen.getByRole('button', { name: 'Record a local video' }));

    await waitFor(() => expect(harness.existingVideo.adoptRecordedArtifact).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Use existing video' })).toHaveTextContent(
        'Post-recording editor',
      ),
    );
  });

  it('opens the existing-video chooser for finalized playback without adopting a Dock take', () => {
    harness.recording.presented = { id: 'dock-take' };
    harness.takeStagePresentation = { kind: 'playback', mode: 'local' };
    renderStudio();

    const editVideo = screen.getByRole('button', { name: 'Edit Video rail' });
    expect(editVideo).toBeEnabled();
    fireEvent.click(editVideo);

    expect(screen.getByRole('region', { name: 'Use existing video' })).toBeInTheDocument();
    expect(harness.existingVideo.adoptRecordedArtifact).not.toHaveBeenCalled();
    expect(harness.latestWorkspace?.state.activeTool).toBe('edit-video');
  });

  it('enters local editing without replacing the persistent stage or duplicating controls', async () => {
    const media = new Blob(['source'], { type: 'video/mp4' });
    harness.recording.presented = {
      id: 'editable-result',
      media,
      objectUrl: 'blob:editable-result',
      mimeType: 'video/mp4',
      filename: 'editable-result.mp4',
      sourceModeId: 'local',
      startedAt: '2026-08-04T12:00:00.000Z',
      durationMs: 10_000,
      sizeBytes: media.size,
    };
    harness.existingVideo.selection = {
      metadata: {
        kind: 'uploaded',
        mode: 'local',
        selectedAt: '2026-08-04T12:00:00.000Z',
        displayName: 'editable-result.mp4',
        container: 'mp4',
        videoCodec: 'avc',
        audioCodec: null,
        durationMs: 10_000,
        width: 1_280,
        height: 720,
        sizeBytes: media.size,
        hasAudio: false,
      },
    };
    harness.takeStagePresentation = { kind: 'playback', mode: 'local' };
    const context = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => null);
    renderStudio();
    const stage = screen.getByTestId('media-stage');

    fireEvent.click(screen.getByRole('button', { name: 'Edit Video rail' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adjust video' }));

    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Video editing tools' })).toBeVisible(),
    );
    expect(screen.getByTestId('media-stage')).toBe(stage);
    expect(screen.getByTestId('media-stage')).toHaveAttribute('data-edit-preview', 'true');
    expect(screen.queryByText('Recording controls')).not.toBeInTheDocument();
    expect(screen.queryByTestId('creative-panel')).not.toBeInTheDocument();
    context.mockRestore();
  });

  it('hydrates and atomically hands a saved reference recipe to the session', async () => {
    renderStudio();
    fireEvent.click(screen.getByRole('button', { name: 'Apply reference recipe' }));

    await waitFor(() => expect(harness.session.replaceRecipeDraft).toHaveBeenCalledOnce());
    expect(harness.fetchReferenceImageMetadata).toHaveBeenCalledWith(
      referenceAsset.assetId,
      expect.any(AbortSignal),
    );
    expect(harness.hydrateReferenceImage).toHaveBeenCalledWith(
      referenceAsset.assetId,
      expect.objectContaining(referenceAsset),
      expect.any(AbortSignal),
    );
    expect(harness.session.replaceRecipeDraft).toHaveBeenCalledWith({
      mode: 'lucy-latest',
      prompt: referenceAsset.lucy25CharacterPrompt,
      referenceImage: harness.hydratedReference,
      enhance: true,
    });
    expect(harness.repository.enrichNewestMatchingRecent).toHaveBeenCalledWith(
      referenceAsset.originalPrompt,
      'lucy-latest',
      referenceAsset.assetId,
    );
  });

  it('retries the exact failed reference handoff', async () => {
    harness.fetchReferenceImageMetadata
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValueOnce(referenceAsset);
    renderStudio();
    fireEvent.click(screen.getByRole('button', { name: 'Apply reference recipe' }));
    await waitFor(() => expect(screen.getByTestId('handoff-error')).not.toBeEmptyDOMElement());

    fireEvent.click(screen.getByRole('button', { name: 'Retry reference handoff' }));
    await waitFor(() => expect(harness.session.replaceRecipeDraft).toHaveBeenCalledOnce());
    expect(harness.fetchReferenceImageMetadata).toHaveBeenCalledTimes(2);
    expect(harness.session.replaceRecipeDraft).toHaveBeenCalledWith({
      mode: 'lucy-latest',
      prompt: referenceAsset.lucy25CharacterPrompt,
      referenceImage: harness.hydratedReference,
      enhance: true,
    });
  });

  it('continues a failed handoff without silently retaining the missing reference', async () => {
    harness.fetchReferenceImageMetadata.mockRejectedValueOnce(new Error('missing'));
    renderStudio();
    fireEvent.click(screen.getByRole('button', { name: 'Apply reference recipe' }));
    await waitFor(() => expect(screen.getByTestId('handoff-error')).not.toBeEmptyDOMElement());

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue reference handoff without image' }),
    );
    await waitFor(() => expect(harness.session.replaceRecipeDraft).toHaveBeenCalledOnce());
    expect(harness.session.replaceRecipeDraft).toHaveBeenCalledWith({
      mode: 'lucy-latest',
      prompt: referenceAsset.originalPrompt,
      referenceImage: null,
      enhance: false,
    });
  });

  it('keeps repository prompt recording connected through the session callback bridge', () => {
    renderStudio();

    act(() => {
      harness.promptCommitted?.('lucy-latest', 'A newly committed presenter', null);
    });

    expect(harness.repository.recordSuccessfulPrompt).toHaveBeenCalledWith({
      prompt: 'A newly committed presenter',
      modelModeId: 'lucy-latest',
      referenceImageAssetId: null,
      vtonInputKind: null,
      enhancePrompt: false,
    });
  });

  it('cancels saved-character entry before replacing hidden Shelf edits', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderStudio();

    fireEvent.click(screen.getByRole('button', { name: 'Mark shelf dirty' }));
    fireEvent.click(screen.getByRole('button', { name: 'Character selector' }));
    fireEvent.click(screen.getByRole('button', { name: 'Select Character' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose saved character' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Discard the unsaved Recipe Shelf changes and open saved characters?',
    );
    expect(screen.getByRole('region', { name: 'Character' })).toBeInTheDocument();
    expect(harness.latestWorkspace?.state.panel).toBe('closed');
    expect(harness.latestWorkspace?.state.recipeShelfEntryIntent).toBeNull();
  });
});
