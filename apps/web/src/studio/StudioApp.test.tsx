// @vitest-environment jsdom

import type { ReferenceImageAsset } from '@studio/contracts';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
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
    schemaVersion: 3 as const,
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
    draft: { videoDeviceId: null, audioDeviceId: null, profile: '720p30' as const },
    applied: { videoDeviceId: null, audioDeviceId: null, profile: '720p30' as const },
    cameraDevices: [],
    microphoneDevices: [],
    supportedProfiles: ['720p30' as const],
    devicesState: 'idle' as const,
    deviceError: null,
    applyError: null,
    applying: false,
    hasPendingChanges: false,
    actualSettings: { video: null, audio: null },
    refreshDevices: vi.fn(() => Promise.resolve()),
    updateVideoDeviceId: vi.fn(),
    updateAudioDeviceId: vi.fn(),
    updateProfile: vi.fn(),
    apply: vi.fn(() => Promise.resolve(true)),
    discardPending: vi.fn(),
  };
  const session = {
    draft: { mode: 'lucy-2.5' as const, prompt: '', referenceImage: null, enhance: false },
    applied: null,
    lifecycle: 'idle' as const,
    localStream: null,
    remoteStream: null,
    displayStream: null,
    transformedVideoUsable: false,
    pendingChanges: false,
    error: null,
    liveSeconds: 0,
    generationSeconds: 0,
    applying: false,
    capturePreferences,
    startLocal: vi.fn(() => Promise.resolve()),
    preflight: vi.fn(() => Promise.resolve()),
    startModel: vi.fn(() => Promise.resolve()),
    applyChanges: vi.fn(() => Promise.resolve()),
    revertDraft: vi.fn(),
    stopModel: vi.fn(),
    resetModel: vi.fn(),
    stopCamera: vi.fn(),
    releaseForRecordedReview: vi.fn(() => Promise.resolve()),
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
    presented: null,
    sidecar: { state: 'idle' as const, artifact: null, error: null },
    recordingError: null,
    elapsedSeconds: 0,
  };

  return {
    repository,
    session,
    recording,
    latestWorkspace: null as WorkspaceHarnessProps | null,
    generationController: null as AbortController | null,
    createReferenceImage: vi.fn(),
    fetchReferenceImageMetadata: vi.fn(),
    hydrateReferenceImage: vi.fn(),
    hydratedReference: null as PersistedSessionReference | null,
    legacyClose: vi.fn(),
    promptCommitted: null as
      | ((
          mode: 'lucy-2.5' | 'lucy-vton-3',
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
  createReferenceImage: harness.createReferenceImage,
  fetchReferenceImageMetadata: harness.fetchReferenceImageMetadata,
  hydrateReferenceImage: harness.hydrateReferenceImage,
  optimizeCharacterReferencePrompt: vi.fn(),
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
  MediaStage: ({ presentation }: { presentation: { kind: string } }) => (
    <div data-testid="media-stage" data-presentation={presentation.kind} />
  ),
}));

vi.mock('../features/recording', () => ({
  CaptureSettingsPanel: () => <div>Capture settings content</div>,
  RecordingControls: () => <div>Recording controls</div>,
}));

vi.mock('../features/media-session', async () => {
  const { confirmModeReplacement } = await import('../features/media-session/draftPolicy');
  return { confirmModeReplacement, SessionComposer: () => <div>Recipe dock content</div> };
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
    processing: {},
    recordingActive: false,
    reviewLocked: false,
    mediaLocked: false,
    recordingSource: null,
    finalizingStartedAt: null,
    finalizingStream: null,
    finishTake: vi.fn(() => Promise.resolve()),
    stagePresentation: { kind: 'idle', mode: 'lucy-2.5' },
  }),
}));

vi.mock('./StudioHeader', () => ({
  StudioHeader: ({ onBuildCharacter }: { onBuildCharacter: () => void }) => (
    <button type="button" onClick={onBuildCharacter}>
      Build character
    </button>
  ),
}));

vi.mock('../ui', async () => {
  const { StudioDesignProvider } = await import('../ui/StudioDesignProvider');
  return {
    StudioDesignProvider,
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
        <button type="button" onClick={props.actions.onToggleShelf}>
          Toggle shelf
        </button>
        <button
          type="button"
          onClick={() =>
            props.actions.onUseRecipe({
              origin: 'character-prompt',
              assetId: 'character-1',
              modelModeId: 'lucy-2.5',
              prompt: referenceAsset.originalPrompt,
              referenceImageAssetId: referenceAsset.assetId,
            })
          }
        >
          Apply reference recipe
        </button>
        <button
          type="button"
          onClick={() => {
            const controller = new AbortController();
            harness.generationController = controller;
            void props.actions.onGenerateReference(
              {
                rawPrompt: referenceAsset.originalPrompt,
                options: referenceAsset.options,
                optimization: { enabled: false },
              },
              controller.signal,
            );
          }}
        >
          Generate reference
        </button>
        <button type="button" onClick={() => props.state.referenceUseFailure?.onRetry()}>
          Retry reference handoff
        </button>
        <button
          type="button"
          onClick={() => props.state.referenceUseFailure?.onContinueWithoutReference()}
        >
          Continue reference handoff without image
        </button>
        <output data-testid="generation-status">{props.state.referenceGeneration.status}</output>
        <output data-testid="handoff-error">{props.state.referenceUseFailure?.message}</output>
      </div>
    );
  },
}));

import { StudioApp } from './StudioApp';

describe('StudioApp composition lifecycle', () => {
  afterEach(cleanup);

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    harness.latestWorkspace = null;
    harness.generationController = null;
    harness.promptCommitted = null;
    harness.session.replaceRecipeDraft.mockClear();
    harness.repository.recordSuccessfulPrompt.mockClear();
    harness.repository.enrichNewestMatchingRecent.mockClear();
    harness.createReferenceImage.mockReset();
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
    render(<StudioApp />);
    const stage = screen.getByTestId('media-stage');

    fireEvent.click(screen.getByRole('button', { name: 'Open dock' }));
    expect(screen.getByRole('region', { name: 'Recipe Dock' })).toBeInTheDocument();
    expect(screen.getByTestId('media-stage')).toBe(stage);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle shelf' }));
    expect(screen.getByTestId('creative-panel')).toHaveTextContent('shelf');
    expect(screen.getByTestId('media-stage')).toBe(stage);
  });

  it('hydrates and atomically hands a saved reference recipe to the session', async () => {
    render(<StudioApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply reference recipe' }));

    await waitFor(() => expect(harness.session.replaceRecipeDraft).toHaveBeenCalledOnce());
    expect(harness.fetchReferenceImageMetadata).toHaveBeenCalledWith(referenceAsset.assetId);
    expect(harness.hydrateReferenceImage).toHaveBeenCalledWith(
      referenceAsset.assetId,
      expect.objectContaining(referenceAsset),
    );
    expect(harness.session.replaceRecipeDraft).toHaveBeenCalledWith({
      mode: 'lucy-2.5',
      prompt: referenceAsset.lucy25CharacterPrompt,
      referenceImage: harness.hydratedReference,
      enhance: true,
    });
    expect(harness.repository.enrichNewestMatchingRecent).toHaveBeenCalledWith(
      referenceAsset.originalPrompt,
      'lucy-2.5',
      referenceAsset.assetId,
    );
  });

  it('retries the exact failed reference handoff', async () => {
    harness.fetchReferenceImageMetadata
      .mockRejectedValueOnce(new Error('missing'))
      .mockResolvedValueOnce(referenceAsset);
    render(<StudioApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply reference recipe' }));
    await waitFor(() => expect(screen.getByTestId('handoff-error')).not.toBeEmptyDOMElement());

    fireEvent.click(screen.getByRole('button', { name: 'Retry reference handoff' }));
    await waitFor(() => expect(harness.session.replaceRecipeDraft).toHaveBeenCalledOnce());
    expect(harness.fetchReferenceImageMetadata).toHaveBeenCalledTimes(2);
    expect(harness.session.replaceRecipeDraft).toHaveBeenCalledWith({
      mode: 'lucy-2.5',
      prompt: referenceAsset.lucy25CharacterPrompt,
      referenceImage: harness.hydratedReference,
      enhance: true,
    });
  });

  it('continues a failed handoff without silently retaining the missing reference', async () => {
    harness.fetchReferenceImageMetadata.mockRejectedValueOnce(new Error('missing'));
    render(<StudioApp />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply reference recipe' }));
    await waitFor(() => expect(screen.getByTestId('handoff-error')).not.toBeEmptyDOMElement());

    fireEvent.click(
      screen.getByRole('button', { name: 'Continue reference handoff without image' }),
    );
    await waitFor(() => expect(harness.session.replaceRecipeDraft).toHaveBeenCalledOnce());
    expect(harness.session.replaceRecipeDraft).toHaveBeenCalledWith({
      mode: 'lucy-2.5',
      prompt: referenceAsset.originalPrompt,
      referenceImage: null,
      enhance: false,
    });
  });

  it('keeps repository prompt recording connected through the session callback bridge', () => {
    render(<StudioApp />);

    act(() => {
      harness.promptCommitted?.('lucy-2.5', 'A newly committed presenter', null);
    });

    expect(harness.repository.recordSuccessfulPrompt).toHaveBeenCalledWith({
      prompt: 'A newly committed presenter',
      modelModeId: 'lucy-2.5',
      referenceImageAssetId: null,
    });
  });

  it('forwards workshop ownership cancellation and clears generating state', async () => {
    harness.createReferenceImage.mockImplementation(
      (_request: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        }),
    );
    render(<StudioApp />);

    fireEvent.click(screen.getByRole('button', { name: 'Generate reference' }));
    await waitFor(() =>
      expect(screen.getByTestId('generation-status')).toHaveTextContent('generating'),
    );
    const signal = harness.generationController?.signal;
    expect(signal).toBeDefined();
    expect(harness.createReferenceImage).toHaveBeenCalledWith(
      expect.objectContaining({ rawPrompt: referenceAsset.originalPrompt }),
      signal,
    );

    harness.generationController?.abort();
    await waitFor(() => expect(screen.getByTestId('generation-status')).toHaveTextContent('idle'));
  });
});
