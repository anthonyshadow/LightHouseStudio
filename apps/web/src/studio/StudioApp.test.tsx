// @vitest-environment jsdom

import type { AuthenticatedSessionResponse, ReferenceImageAsset } from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InputHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
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
    schemaVersion: 7 as const,
    savedPrompts: [],
    recentPrompts: [],
    savedCharacterPrompts: [],
    savedCharacterVariants: [],
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
    get currentMetadata() {
      return this.selection?.metadata ?? null;
    },
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
    saveVideo: vi.fn(() => Promise.resolve(null)),
    replaceSavedVideo: vi.fn(() => Promise.resolve(null)),
    resetSavedVideo: vi.fn(),
    hydratedReference: null as PersistedSessionReference | null,
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
  useCreativeAssetSelector: (
    _repository: unknown,
    selector: (state: ReturnType<typeof harness.repository.getSnapshot>) => unknown,
  ) => selector(harness.repository.getSnapshot()),
}));

vi.mock('../features/saved-videos/useSaveVideo', () => ({
  defaultSavedVideoName: (artifact: { name?: string; filename: string }) =>
    artifact.name?.trim() || artifact.filename.replace(/\.[^.]+$/u, ''),
  useSaveVideo: () => ({
    state: { status: 'idle' as const },
    save: harness.saveVideo,
    replace: harness.replaceSavedVideo,
    reset: harness.resetSavedVideo,
  }),
}));

vi.mock('../features/live-stage', () => ({
  MediaStage: ({
    presentation,
    editPreview,
    controls,
  }: {
    presentation: { kind: string };
    editPreview?: unknown;
    controls?: (options: { visible: boolean }) => ReactNode;
  }) => (
    <div>
      <div
        data-testid="media-stage"
        data-presentation={presentation.kind}
        data-edit-preview={editPreview ? 'true' : 'false'}
      />
      {controls?.({ visible: true })}
    </div>
  ),
}));

vi.mock('../features/recording', () => ({
  CaptureSettingsPanel: () => <div>Capture settings content</div>,
  RecordingAction: () => <button type="button">Record</button>,
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

vi.mock('../features/creative-assets/OutfitSelector', () => ({
  OutfitSelector: ({ onCreate }: { onCreate: () => void }) => (
    <div>
      Deferred outfit selector
      <button type="button" onClick={onCreate}>
        Create deferred outfit
      </button>
    </div>
  ),
}));

vi.mock('../features/creative-assets/OutfitBuilder', () => ({
  OutfitBuilder: () => <div>Deferred outfit builder</div>,
}));

vi.mock('../features/account-library/SavedCreativeLibrary', () => ({
  SavedCharacterLibrary: () => <div>Deferred saved characters</div>,
  SavedOutfitLibrary: () => <div>Deferred saved outfits</div>,
}));

vi.mock('../features/video-gallery/VideoGallery', () => ({
  VideoGallery: () => <div>Deferred saved videos</div>,
}));

vi.mock('../features/projects/ProjectRouteSurface', () => ({
  ProjectRouteSurface: () => <div>Deferred Projects workspace</div>,
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
  StudioHeader: ({
    onOpenStudio,
    onOpenProjects,
    onOpenVideos,
    onOpenCharacters,
    onOpenOutfits,
  }: {
    onOpenStudio: () => void;
    onOpenProjects: () => void;
    onOpenVideos: () => void;
    onOpenCharacters: () => void;
    onOpenOutfits: () => void;
  }) => (
    <div>
      Studio header
      <button type="button" onClick={onOpenStudio}>
        Open Studio
      </button>
      <button type="button" onClick={onOpenProjects}>
        Open Projects
      </button>
      <button type="button" onClick={onOpenVideos}>
        Open saved videos
      </button>
      <button type="button" onClick={onOpenCharacters}>
        Open saved characters
      </button>
      <button type="button" onClick={onOpenOutfits}>
        Open saved outfits
      </button>
    </div>
  ),
}));

vi.mock('../ui', async () => {
  const { useEffect, useRef } = await import('react');
  const { StudioDesignProvider } = await import('../ui/StudioDesignProvider');
  const { Button } = await import('../ui/primitives/Button');
  const OverlayPanel = ({
    open,
    title,
    children,
    footer,
    onClose,
  }: PropsWithChildren<{
    open: boolean;
    title: string;
    footer?: ReactNode;
    onClose: () => void;
  }>) => {
    const panelRef = useRef<HTMLElement>(null);
    useEffect(() => {
      if (open) panelRef.current?.focus();
    }, [open]);

    return open ? (
      <section ref={panelRef} aria-label={title} tabIndex={-1}>
        {children}
        {footer}
        <button type="button" onClick={onClose}>
          Close {title}
        </button>
      </section>
    ) : null;
  };
  return {
    StudioDesignProvider,
    Button,
    TextField: ({
      label,
      hint,
      ...props
    }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) => (
      <label>
        {label}
        <input aria-label={label} {...props} />
        {hint ? <span>{hint}</span> : null}
      </label>
    ),
    StatusNotice: ({ title, children }: PropsWithChildren<{ title: string }>) => (
      <aside aria-label={title}>{children}</aside>
    ),
    ConfirmationDialog: ({ open }: { open: boolean }) =>
      open ? <section aria-label="Discard temporary work and leave?" /> : null,
    OverlayPanel,
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
        <button type="button" onClick={props.actions.onOpenCharacter}>
          Open character options
        </button>
        <button type="button" onClick={props.actions.onOpenOutfit}>
          Open outfit options
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
import { AuthProvider } from '../application/auth/AuthProvider';
import { StudioDesignProvider } from '../ui';

const testSession: AuthenticatedSessionResponse = {
  user: {
    id: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
    login: 'demo@lightframe.local',
    username: 'demo',
    email: 'demo@lightframe.local',
    displayName: 'Demo Creator',
    avatarUrl: null,
    planId: 'free',
    role: 'user',
    status: 'active',
    createdAt: '2026-08-05T12:00:00.000Z',
    updatedAt: '2026-08-05T12:00:00.000Z',
    lastLoginAt: '2026-08-05T12:00:00.000Z',
  },
  entitlements: createPhaseOneEntitlements('free', '2026-08-05T12:00:00.000Z'),
  expiresAt: '2099-08-06T12:00:00.000Z',
};

const renderStudio = (initialIntent?: 'upload', initialPath = '/studio') =>
  render(
    <StudioDesignProvider>
      <AuthProvider initialSession={testSession}>
        <RouterProvider
          router={createMemoryRouter(
            [
              {
                path: '/studio/*',
                element: <StudioApp {...(initialIntent ? { initialIntent } : {})} />,
              },
            ],
            { initialEntries: [initialPath] },
          )}
        />
      </AuthProvider>
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
    harness.saveVideo.mockClear();
    harness.replaceSavedVideo.mockClear();
    harness.resetSavedVideo.mockClear();
  });

  it('keeps the mounted stage node stable while overlays and deferred tools change', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Upload Video' }));
    const existingVideoPanel = screen.getByRole('region', { name: 'Use existing video' });
    expect(existingVideoPanel).toHaveFocus();
    expect(screen.getByTestId('media-stage')).toBe(stage);
    expect(harness.session.startLocal).not.toHaveBeenCalled();
    await screen.findByRole('button', { name: 'Record a local video' });
    expect(existingVideoPanel).toHaveFocus();
    expect(screen.getByTestId('media-stage')).toBe(stage);
    expect(screen.getAllByTestId('media-stage')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Open saved videos' }));
    await screen.findByText('Deferred saved videos');
    expect(screen.getByTestId('media-stage')).toBe(stage);

    fireEvent.click(screen.getByRole('button', { name: 'Open saved characters' }));
    await screen.findByText('Deferred saved characters');
    expect(screen.getByTestId('media-stage')).toBe(stage);

    fireEvent.click(screen.getByRole('button', { name: 'Open saved outfits' }));
    await screen.findByText('Deferred saved outfits');
    expect(screen.getByTestId('media-stage')).toBe(stage);
    fireEvent.click(screen.getByRole('button', { name: 'Close Saved Outfits' }));

    fireEvent.click(screen.getByRole('button', { name: 'Open outfit options' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create deferred outfit' }));
    await screen.findByText('Deferred outfit builder');
    expect(screen.getByTestId('media-stage')).toBe(stage);
    expect(screen.getAllByTestId('media-stage')).toHaveLength(1);
    expect(harness.session.startLocal).not.toHaveBeenCalled();
  });

  it('keeps one hidden media-stage owner while the full Projects workspace is active', async () => {
    renderStudio(undefined, '/studio/projects');
    const stage = screen.getByTestId('media-stage');

    expect(await screen.findByText('Deferred Projects workspace')).toBeInTheDocument();
    expect(screen.getAllByTestId('media-stage')).toHaveLength(1);
    expect(stage.closest('[hidden]')).toBeInTheDocument();
    expect(harness.session.startLocal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open Studio' }));
    await waitFor(() =>
      expect(screen.queryByText('Deferred Projects workspace')).not.toBeInTheDocument(),
    );
    expect(screen.getByTestId('media-stage')).toBe(stage);
    expect(stage.closest('[hidden]')).not.toBeInTheDocument();
  });

  it('closes Use existing video and hands local recording to the persistent stage', async () => {
    renderStudio('upload');
    const stage = screen.getByTestId('media-stage');

    expect(screen.getByRole('region', { name: 'Use existing video' })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Record a local video' }));

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

    fireEvent.click(await screen.findByRole('button', { name: 'Record a local video' }));

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

  it('prompts for an optional name before saving the presented video', async () => {
    const media = new Blob(['source'], { type: 'video/mp4' });
    const presented = {
      id: 'video-presented',
      name: 'Recorded take · 20260808T140000Z · ab12cd34',
      createdAt: '2026-08-08T14:00:00.000Z',
      kind: 'recorded' as const,
      parentArtifactId: null,
      media,
      objectUrl: 'blob:video-presented',
      mimeType: 'video/mp4',
      filename: 'local-take-20260808T140000Z.mp4',
      sourceModeId: 'local' as const,
      startedAt: '2026-08-08T14:00:00.000Z',
      durationMs: 10_000,
      sizeBytes: media.size,
    };
    harness.recording.presented = presented;
    harness.recording.original = presented;
    harness.takeStagePresentation = { kind: 'playback', mode: 'local' };
    renderStudio();

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(screen.getByRole('region', { name: 'Save video' })).toBeInTheDocument();
    expect(harness.saveVideo).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Video name (optional)' }), {
      target: { value: 'Studio intro' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Video' }));

    await waitFor(() =>
      expect(harness.saveVideo).toHaveBeenCalledWith(presented, 'Studio intro', undefined, null),
    );
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
    fireEvent.click(screen.getByRole('button', { name: 'Open character options' }));
    fireEvent.click(screen.getByRole('button', { name: 'Choose saved character' }));

    expect(window.confirm).toHaveBeenCalledWith(
      'Discard the unsaved Recipe Shelf changes and open saved characters?',
    );
    expect(screen.getByRole('region', { name: 'Character' })).toBeInTheDocument();
    expect(harness.latestWorkspace?.state.panel).toBe('closed');
    expect(harness.latestWorkspace?.state.recipeShelfEntryIntent).toBeNull();
  });
});
