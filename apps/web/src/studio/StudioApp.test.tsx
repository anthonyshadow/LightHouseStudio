// @vitest-environment jsdom

import type {
  AuthenticatedSessionResponse,
  ReferenceImageAsset,
  SavedVideoDetail,
} from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { InputHTMLAttributes, PropsWithChildren, ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CreativeWorkspaceActions,
  CreativeWorkspaceRefs,
  CreativeWorkspaceState,
} from './CreativeWorkspace';
import type { PersistedSessionReference } from '../features/media-session';
import type { ProjectRouteSurfaceProps } from '../features/projects/ProjectRouteSurface';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';
import type { StudioHeaderDestination } from './StudioHeader';
import type * as SavedVideosApiModule from '../adapters/api-client/savedVideosApi';
import type * as ProjectsApiModule from '../features/projects/projectsApi';

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
  /** The one shape a ready existing-video selection has; only the file ever differs. */
  const readySelection = (
    displayName: string,
    sizeBytes: number,
    selectedAt = '2026-08-11T16:00:00.000Z',
  ) => ({
    metadata: {
      kind: 'uploaded' as const,
      mode: 'local' as const,
      selectedAt,
      displayName,
      container: 'mp4' as const,
      videoCodec: 'avc' as const,
      audioCodec: null,
      durationMs: 10_000,
      width: 1_280,
      height: 720,
      sizeBytes,
      hasAudio: false as const,
    },
  });
  const store = {
    schemaVersion: 7 as const,
    savedPrompts: [],
    recentPrompts: [],
    savedCharacterPrompts: [],
    savedCharacterVariants: [],
  };
  const repository = {
    getSnapshot: vi.fn(() => ({ store, health: 'ready' as const, notice: null })),
    // The shell awaits this before letting any surface state a library size.
    ready: vi.fn(() => Promise.resolve()),
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
    restoreAspectRatio: vi.fn(() => true),
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
    original: null as null | { id: string; media?: Blob },
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
    selection: null as null | ReturnType<typeof readySelection>,
    steps: [],
    comparison: 'result' as const,
    get currentMetadata() {
      return this.selection?.metadata ?? null;
    },
    active: false,
    providerActive: false,
    visualProviderCompatibility: { compatible: true as const, aspect: '16:9', reason: null },
    phase: 'idle' as 'idle' | 'ready',
    completedStepCount: 0,
    selectFile: vi.fn((file: File) => {
      const artifact = {
        id: 'direct-saved-video',
        name: file.name,
        createdAt: '2026-08-11T16:00:00.000Z',
        kind: 'uploaded' as const,
        parentArtifactId: null,
        media: file,
        objectUrl: 'blob:direct-saved-video',
        mimeType: file.type,
        filename: file.name,
        sourceModeId: 'local' as const,
        startedAt: '2026-08-11T16:00:00.000Z',
        durationMs: 10_000,
        sizeBytes: file.size,
      };
      recording.presented = artifact;
      existingVideo.phase = 'ready';
      existingVideo.selection = readySelection(file.name, file.size);
      return Promise.resolve(artifact);
    }),
    // Resolves whether the take actually became the source, which is what spends the editor intent.
    adoptRecordedArtifact: vi.fn(() => Promise.resolve(true)),
    cancelBeforeAcceptance: vi.fn(),
    cleanup: vi.fn(() => Promise.resolve()),
    reset: vi.fn(),
    showResult: vi.fn(),
    updateStep: vi.fn(),
  };
  const takeStagePresentation: { kind: string; mode?: string } = {
    kind: 'idle',
    mode: 'lucy-latest',
  };

  return {
    readySelection,
    repository,
    session,
    recording,
    existingVideo,
    takeStagePresentation,
    latestWorkspace: null as WorkspaceHarnessProps | null,
    latestProjectSurfaceProps: null as ProjectRouteSurfaceProps | null,
    latestHeaderDestination: null as StudioHeaderDestination | null,
    fetchReferenceImageMetadata: vi.fn(),
    hydrateReferenceImage: vi.fn(),
    getSavedVideo: vi.fn(),
    apiFetch: vi.fn(),
    getProject: vi.fn(),
    attachProjectAsset: vi.fn(),
    savedVideoState: ((): { status: 'idle' } | { status: 'saved'; video: SavedVideoDetail } => ({
      status: 'idle',
    }))(),
    saveVideo: vi.fn(() => Promise.resolve(null)),
    replaceSavedVideo: vi.fn(() => Promise.resolve(null)),
    resetSavedVideo: vi.fn(),
    latestVideoGalleryProps: null as {
      focusVideoId?: string | null;
      onFocusVideoConsumed?: (() => void) | undefined;
    } | null,
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
  invalidApiResponse: (message: string, code: string) => (): Error =>
    Object.assign(new Error(message), { name: 'ApiClientError', status: 502, code }),
  fetchReferenceImageMetadata: harness.fetchReferenceImageMetadata,
  hydrateReferenceImage: harness.hydrateReferenceImage,
  apiFetch: harness.apiFetch,
}));

vi.mock('../adapters/api-client/savedVideosApi', async (importOriginal) => {
  const actual = await importOriginal<typeof SavedVideosApiModule>();
  return { ...actual, getSavedVideo: harness.getSavedVideo };
});

vi.mock('../features/creative-assets/repository', () => ({
  createCreativeAssetRepository: () => harness.repository,
}));
vi.mock('../features/creative-assets/useCreativeAssetRepository', () => ({
  useCreativeAssetSelector: (
    _repository: unknown,
    selector: (state: ReturnType<typeof harness.repository.getSnapshot>) => unknown,
  ) => selector(harness.repository.getSnapshot()),
}));

vi.mock('../features/saved-videos/useSaveVideo', () => ({
  defaultSavedVideoName: (artifact: { name?: string; filename: string }) =>
    artifact.name?.trim() || artifact.filename.replace(/\.[^.]+$/u, ''),
  useSaveVideo: () => ({
    state: harness.savedVideoState,
    save: harness.saveVideo,
    replace: harness.replaceSavedVideo,
    reset: harness.resetSavedVideo,
  }),
}));

vi.mock('../features/projects/projectsApi', async (importOriginal) => {
  const actual = await importOriginal<typeof ProjectsApiModule>();
  return {
    ...actual,
    getProject: harness.getProject,
    attachProjectAsset: harness.attachProjectAsset,
  };
});

vi.mock('../features/live-stage', () => ({
  MediaStage: ({
    presentation,
    editPreview,
    controls,
    notices = [],
  }: {
    presentation: { kind: string };
    editPreview?: unknown;
    controls?: (options: { visible: boolean }) => ReactNode;
    notices?: readonly {
      title: string;
      message: string;
      action?: { label: string; onAction: () => void };
    }[];
  }) => (
    <div>
      <div
        data-testid="media-stage"
        data-presentation={presentation.kind}
        data-edit-preview={editPreview ? 'true' : 'false'}
      />
      {notices.map((notice) => (
        <aside key={notice.title} aria-label={notice.title}>
          {notice.message}
          {notice.action ? (
            <button type="button" onClick={notice.action.onAction}>
              {notice.action.label}
            </button>
          ) : null}
        </aside>
      ))}
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
          Edit video
        </button>
      ) : null}
    </div>
  ),
}));

vi.mock('../features/take-review/TakeDock', () => ({
  TakeDock: ({ onEditVideo }: { onEditVideo?: () => void }) => (
    <div>
      Saved Video review controls
      {onEditVideo ? (
        <button type="button" onClick={onEditVideo}>
          Edit video
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
  SavedCharacterLibrary: ({ onUse }: { onUse?: (character: Record<string, unknown>) => void }) => (
    <div>
      Deferred saved characters
      {onUse ? (
        <button
          type="button"
          onClick={() =>
            onUse({
              id: 'character-1',
              name: 'Documentary presenter',
              prompt: 'A calm documentary presenter',
              modelModeId: 'lucy-latest',
              referenceImageAssetId: '28d0b01f-70aa-4db6-ac65-379cdd916113',
            })
          }
        >
          Apply saved Character
        </button>
      ) : null}
    </div>
  ),
  SavedOutfitLibrary: () => <div>Deferred saved outfits</div>,
}));

vi.mock('../features/video-gallery/VideoGallery', () => ({
  VideoGallery: (props: {
    focusVideoId?: string | null;
    onFocusVideoConsumed?: (() => void) | undefined;
  }) => {
    harness.latestVideoGalleryProps = props;
    return (
      <div>
        <span>Deferred saved videos</span>
        <span>Requested video: {props.focusVideoId ?? 'none'}</span>
        <button type="button" onClick={() => props.onFocusVideoConsumed?.()}>
          Consume requested video
        </button>
      </div>
    );
  },
}));

vi.mock('../features/projects/ProjectRouteSurface', () => ({
  ProjectRouteSurface: (props: ProjectRouteSurfaceProps) => {
    harness.latestProjectSurfaceProps = props;
    return <div>Deferred Projects workspace</div>;
  },
}));

vi.mock('../features/existing-video/useExistingVideoWorkflow', () => ({
  useExistingVideoWorkflow: () => harness.existingVideo,
}));

vi.mock('../features/media-session', async () => {
  const { hasDraftContent, modeReplacementNeedsConfirmation } =
    await import('../features/media-session/draftPolicy');
  return {
    hasDraftContent,
    modeReplacementNeedsConfirmation,
    SessionComposer: () => <div>AI configuration content</div>,
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
    activeDestination,
    onOpenDashboard,
    onOpenStudio,
    onOpenProjects,
    onOpenCampaigns,
    onOpenAssets,
    onLogout,
  }: {
    activeDestination: StudioHeaderDestination;
    onOpenDashboard: () => void;
    onOpenStudio: () => void;
    onOpenProjects: () => void;
    onOpenCampaigns: () => void;
    onOpenAssets: () => void;
    onLogout: () => void;
  }) => {
    harness.latestHeaderDestination = activeDestination;
    return (
      <div>
        Studio header
        <button type="button" onClick={onOpenDashboard}>
          Open Dashboard
        </button>
        <button type="button" onClick={onOpenStudio}>
          Open Studio
        </button>
        <button type="button" onClick={onOpenProjects}>
          Open Projects
        </button>
        <button type="button" onClick={onOpenCampaigns}>
          Open Campaigns
        </button>
        <button type="button" onClick={onOpenAssets}>
          Open Assets
        </button>
        <button type="button" onClick={onLogout}>
          Log out
        </button>
      </div>
    );
  },
}));

vi.mock('../ui', async () => {
  const { useEffect, useRef } = await import('react');
  const { StudioDesignProvider } = await import('../ui/StudioDesignProvider');
  const { AppIcon } = await import('../ui/primitives/AppIcon');
  const { Button } = await import('../ui/primitives/Button');
  const { VisuallyHidden } = await import('../ui/primitives/VisuallyHidden');
  // The confirmation mechanism is plain state with no styling, so the real one is used here: a
  // stub would let a shell change that stops asking pass unnoticed.
  const { useConfirmationRequest, ConfirmationRequestDialog } =
    await import('../ui/primitives/confirmationRequest');
  const { useAwaitableQuestion } = await import('../ui/primitives/useAwaitableQuestion');
  const OverlayPanel = ({
    open,
    title,
    children,
    footer,
    headerActions,
    closeLabel,
    onClose,
  }: PropsWithChildren<{
    open: boolean;
    title: string;
    footer?: ReactNode;
    headerActions?: ReactNode;
    closeLabel?: string;
    onClose: () => void;
  }>) => {
    const panelRef = useRef<HTMLElement>(null);
    useEffect(() => {
      if (open) panelRef.current?.focus();
    }, [open]);

    return open ? (
      <section ref={panelRef} aria-label={title} tabIndex={-1}>
        {headerActions}
        {children}
        {footer}
        <button type="button" aria-label={closeLabel} onClick={onClose}>
          {closeLabel ?? `Close ${title}`}
        </button>
      </section>
    ) : null;
  };
  return {
    StudioDesignProvider,
    AppIcon,
    Button,
    VisuallyHidden,
    useConfirmationRequest,
    ConfirmationRequestDialog,
    useAwaitableQuestion,
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
    SegmentedControl: ({
      label,
      value,
      options,
      disabled,
      onChange,
    }: {
      label: string;
      value: string;
      options: readonly { value: string; label: string }[];
      disabled?: boolean;
      onChange: (value: string) => void;
    }) => (
      <div role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={option.value === value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
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
        <button
          type="button"
          disabled={!props.state.hasPlaybackVideo}
          onClick={props.actions.onOpenEditVideo}
        >
          Edit video rail
        </button>
        <button type="button" onClick={props.actions.onOpenCharacter}>
          Open character options
        </button>
        <button type="button" onClick={props.actions.onOpenOutfit}>
          Open outfit options
        </button>
      </div>
    );
  },
}));

import { AuthenticatedShell } from '../app/shell/AuthenticatedShell';
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

const directVideoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const directVideoVersionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
const directVideoVersion: SavedVideoDetail['currentVersion'] = {
  id: directVideoVersionId,
  videoId: directVideoId,
  ordinal: 2,
  origin: 'editor',
  characterName: null,
  characterVariantName: null,
  sourceVersionId: null,
  mimeType: 'video/mp4',
  filename: 'launch-review.mp4',
  sizeBytes: 6,
  durationMs: 10_000,
  width: 1_280,
  height: 720,
  exportSpecification: null,
  createdAt: '2026-08-11T16:00:00.000Z',
};
const directSavedVideo: SavedVideoDetail = {
  id: directVideoId,
  title: 'Launch review',
  status: 'ready',
  currentVersion: directVideoVersion,
  sourceVideoId: null,
  versionCount: 2,
  thumbnailAvailable: false,
  createdAt: '2026-08-11T15:00:00.000Z',
  updatedAt: '2026-08-11T16:00:00.000Z',
  versions: [directVideoVersion],
};

const renderStudio = (initialIntent?: 'upload', initialPath = '/studio/create') =>
  (() => {
    const router = createMemoryRouter(
      [
        {
          path: '*',
          // The real composition: the shell supplies the query cache, confirmations and session
          // lifecycle the Studio runtime reads, so rendering it bare would test a wiring nobody has.
          element: <AuthenticatedShell {...(initialIntent ? { initialIntent } : {})} />,
        },
      ],
      { initialEntries: [initialPath] },
    );
    return {
      ...render(
        <StudioDesignProvider>
          <AuthProvider initialSession={testSession}>
            <RouterProvider router={router} />
          </AuthProvider>
        </StudioDesignProvider>,
      ),
      router,
    };
  })();

const applySavedCharacter = async () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open character options' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Choose saved character' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Apply saved Character' }));
};

describe('StudioApp composition lifecycle', () => {
  // The shell code-splits the runtime, so the very first render resolves
  // `lazy(() => import('./StudioApp'))` before any stage can mount. Loading it here keeps that
  // one-off module cost — the whole Studio graph, transformed and evaluated on demand — out of the
  // first assertion's wait budget, which it otherwise spends outright when the full suite runs its
  // workers in parallel.
  beforeAll(async () => {
    await import('./StudioApp');
  });

  afterEach(cleanup);

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    harness.latestWorkspace = null;
    harness.latestProjectSurfaceProps = null;
    harness.latestHeaderDestination = null;
    harness.promptCommitted = null;
    harness.recording.original = null;
    harness.recording.presented = null;
    harness.existingVideo.selection = null;
    harness.existingVideo.phase = 'idle';
    harness.takeStagePresentation = { kind: 'idle', mode: 'lucy-latest' };
    harness.session.startLocal.mockClear();
    harness.session.startLocal.mockImplementation(() => Promise.resolve());
    harness.session.stopCamera.mockClear();
    harness.recording.discard.mockClear();
    harness.existingVideo.adoptRecordedArtifact.mockClear();
    harness.existingVideo.selectFile.mockClear();
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
    harness.getSavedVideo.mockReset().mockResolvedValue(directSavedVideo);
    harness.apiFetch.mockReset().mockResolvedValue(
      new Response('video!', {
        status: 200,
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': '6' },
      }),
    );
    harness.getProject.mockReset().mockResolvedValue({
      project: { id: '18b120ac-1578-46e3-8c3d-42307772f391', status: 'draft' },
    });
    harness.attachProjectAsset.mockReset().mockResolvedValue({
      membership: { id: '08707aa5-7b7f-4ce1-a48e-647370f6d3ab' },
      created: true,
    });
    harness.savedVideoState = { status: 'idle' };
    harness.saveVideo.mockClear();
    harness.replaceSavedVideo.mockClear();
    harness.resetSavedVideo.mockClear();
  });

  it('keeps the mounted stage node stable while overlays and deferred tools change', async () => {
    renderStudio();
    const stage = await screen.findByTestId('media-stage', undefined, { timeout: 5_000 });
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

    fireEvent.click(screen.getByRole('button', { name: 'Open outfit options' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Create deferred outfit' }));
    await screen.findByText('Deferred outfit builder');
    expect(screen.getByTestId('media-stage')).toBe(stage);
    expect(screen.getAllByTestId('media-stage')).toHaveLength(1);
    expect(harness.session.startLocal).not.toHaveBeenCalled();
  });

  it('releases the stage entirely when the operator leaves Studio for an Asset library', async () => {
    const { router } = renderStudio();
    expect(await screen.findByTestId('media-stage')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Assets' }));
    await screen.findByText('Deferred saved videos');
    expect(router.state.location.pathname).toBe('/assets/videos');
    // Not hidden — absent. A stage kept behind `display: none` still holds a camera, a <video>
    // element and the whole capture graph on a route that has no use for any of it.
    expect(screen.queryByTestId('media-stage')).not.toBeInTheDocument();

    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Asset libraries' })).getByRole('button', {
        name: /Characters/u,
      }),
    );
    await screen.findByText('Deferred saved characters');
    expect(router.state.location.pathname).toBe('/assets/characters');
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.queryByTestId('media-stage')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Open Studio' }));
    await waitFor(() => expect(screen.getByTestId('media-stage')).toBeInTheDocument());
    expect(screen.getAllByTestId('media-stage')).toHaveLength(1);
    expect(harness.session.startLocal).not.toHaveBeenCalled();
  });

  it('hands a requested Saved Video to the library and drops the parameter once it is used', async () => {
    const requestedId = '3d1b3b5a-6d2c-4d1f-9c0e-7a1f2b3c4d5e';
    const { router } = renderStudio(undefined, `/assets/videos?video=${requestedId}`);

    expect(await screen.findByText(`Requested video: ${requestedId}`)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Consume requested video' }));

    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(router.state.location.pathname).toBe('/assets/videos');
    // Replaced, not pushed: Back must not walk into the preview the operator just closed.
    expect(router.state.historyAction).toBe('REPLACE');
    expect(screen.getByText('Requested video: none')).toBeInTheDocument();
  });

  it('ignores a malformed Saved Video parameter instead of requesting it', async () => {
    renderStudio(undefined, '/assets/videos?video=not-a-uuid');

    expect(await screen.findByText('Requested video: none')).toBeInTheDocument();
  });

  it('switches Asset libraries in one entry and closes without stacking a hub route', async () => {
    const { router } = renderStudio();

    fireEvent.click(screen.getByRole('button', { name: 'Open Assets' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/assets/videos'));
    expect(router.state.historyAction).toBe('PUSH');

    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Asset libraries' })).getByRole('button', {
        name: /Outfits/u,
      }),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe('/assets/outfits'));
    expect(router.state.historyAction).toBe('REPLACE');

    fireEvent.click(screen.getByRole('button', { name: 'Close Assets' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
    // A memory router has no `window.history.state.idx`, so `useRouteBack` takes its replace
    // fallback here; a real browser pops instead. Either way the close never pushes, which is the
    // property N3 is about. The pop itself is covered in `e2e/app-routing.spec.ts`.
    expect(router.state.historyAction).not.toBe('PUSH');
  });

  it.each([
    ['/assets/videos', 'assets'],
    ['/assets/characters', 'assets'],
    ['/assets/outfits', 'assets'],
  ] as const)('reports %s under the Assets destination', (path, destination) => {
    renderStudio(undefined, path);

    expect(harness.latestHeaderDestination).toBe(destination);
  });

  it('hydrates a direct Saved Video route into review while preserving the route and stage owner', async () => {
    const { router } = renderStudio(undefined, `/studio/${directVideoId}`);
    const stage = await screen.findByTestId('media-stage');

    expect(await screen.findByRole('region', { name: 'Latest take' })).toBeVisible();
    expect(harness.getSavedVideo).toHaveBeenCalledWith(directVideoId, expect.any(AbortSignal));
    expect(harness.existingVideo.selectFile).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'launch-review.mp4', type: 'video/mp4' }),
    );
    expect(router.state.location.pathname).toBe(`/studio/${directVideoId}`);
    expect(screen.getByTestId('media-stage')).toBe(stage);
    expect(await screen.findByRole('button', { name: 'Edit video' })).toBeVisible();
    expect(
      screen.queryByRole('navigation', { name: 'Video editing tools' }),
    ).not.toBeInTheDocument();
  });

  it('shows a safe direct-route failure and returns to the canonical Video library', async () => {
    harness.getSavedVideo.mockRejectedValueOnce(new Error('private upstream detail'));
    const { router } = renderStudio(undefined, `/studio/${directVideoId}`);

    expect(await screen.findByLabelText('Video unavailable')).toHaveTextContent(
      'That video could not be loaded safely. Your Assets are unchanged.',
    );
    expect(screen.queryByText('private upstream detail')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Assets' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/assets/videos'));
  });

  it('attaches an explicitly saved Project-launched Video and returns to Project detail', async () => {
    const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
    harness.savedVideoState = { status: 'saved', video: directSavedVideo };
    const { router } = renderStudio(
      undefined,
      `/studio/create?intent=upload&projectId=${projectId}`,
    );

    await waitFor(() =>
      expect(harness.attachProjectAsset).toHaveBeenCalledWith(
        projectId,
        { kind: 'video', resourceId: directVideoId },
        expect.any(AbortSignal),
      ),
    );
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${projectId}`));
  });

  it('preserves a saved Video and offers attachment retry after a partial Project failure', async () => {
    const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
    harness.savedVideoState = { status: 'saved', video: directSavedVideo };
    harness.attachProjectAsset
      .mockRejectedValueOnce(new Error('temporary association failure'))
      .mockResolvedValueOnce({
        membership: { id: '08707aa5-7b7f-4ce1-a48e-647370f6d3ab' },
        created: true,
      });
    const { router } = renderStudio(
      undefined,
      `/studio/create?intent=upload&projectId=${projectId}`,
    );

    expect(await screen.findByLabelText('Project attachment needs attention')).toHaveTextContent(
      'The Video was saved to Assets, but its Project association could not be completed.',
    );
    expect(router.state.location.pathname).toBe('/studio/create');
    fireEvent.click(screen.getByRole('button', { name: 'Retry attachment' }));
    await waitFor(() => expect(harness.attachProjectAsset).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/projects/${projectId}`));
  });

  it('degrades an inaccessible Project creation context to standalone creation', async () => {
    const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
    harness.getProject.mockRejectedValueOnce(new Error('not found'));
    const { router } = renderStudio(
      undefined,
      `/studio/create?intent=upload&projectId=${projectId}`,
    );

    await waitFor(() => expect(router.state.location.search).toBe('?intent=upload'));
    expect(router.state.location.pathname).toBe('/studio/create');
    expect(harness.attachProjectAsset).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Use existing video' })).toBeVisible();
  });

  it('starts capture from a record intent once per visit, not once per session', async () => {
    const { router } = renderStudio(undefined, '/studio/create?intent=record');

    await waitFor(() => expect(harness.session.startLocal).toHaveBeenCalledOnce());

    // Leaving Studio and coming back is a fresh visit and must record again.
    await act(async () => {
      await router.navigate('/dashboard');
    });
    await act(async () => {
      await router.navigate('/studio/create?intent=record');
    });

    await waitFor(() => expect(harness.session.startLocal).toHaveBeenCalledTimes(2));
  });

  it('treats a return within Studio as a fresh record intent, without a remount to do it', async () => {
    const { router } = renderStudio(undefined, '/studio/create?intent=record');
    await waitFor(() => expect(harness.session.startLocal).toHaveBeenCalledOnce());
    const stage = await screen.findByTestId('media-stage');

    // Both destinations mount the runtime, so it never unmounts here. Only the `location.key` guard
    // in useStudioRecordingLaunch can make the second visit record — which is what keeps that guard
    // covered now that leaving Studio would otherwise explain it.
    await act(async () => {
      await router.navigate(`/studio/${directVideoId}`);
    });
    await act(async () => {
      await router.navigate('/studio/create?intent=record');
    });

    expect(screen.getByTestId('media-stage')).toBe(stage);
    await waitFor(() => expect(harness.session.startLocal).toHaveBeenCalledTimes(2));
  });

  it('does not restart capture when the record-intent entry re-renders', async () => {
    renderStudio(undefined, '/studio/create?intent=record');

    await waitFor(() => expect(harness.session.startLocal).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Open character options' }));

    await waitFor(() => expect(harness.session.startLocal).toHaveBeenCalledOnce());
  });

  it('mounts no media-stage owner while the Projects overview is active', async () => {
    renderStudio(undefined, '/projects');

    expect(await screen.findByText('Deferred Projects workspace')).toBeInTheDocument();
    expect(screen.queryAllByTestId('media-stage')).toHaveLength(0);
    expect(harness.session.startLocal).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Open Studio' }));
    await waitFor(() =>
      expect(screen.queryByText('Deferred Projects workspace')).not.toBeInTheDocument(),
    );
    const stage = await screen.findByTestId('media-stage');
    expect(stage.closest('[hidden]')).not.toBeInTheDocument();
  });

  it('keeps the same media-stage owner visible in an open Project and supplies source lifecycle seams', async () => {
    renderStudio(undefined, '/projects/18b120ac-1578-46e3-8c3d-42307772f391/workspace');
    const stage = await screen.findByTestId('media-stage');

    expect(await screen.findByText('Deferred Projects workspace')).toBeInTheDocument();
    expect(screen.getAllByTestId('media-stage')).toHaveLength(1);
    expect(stage.closest('[hidden]')).not.toBeInTheDocument();
    // `present`/`clear` are the union's own guarantee once the discriminant is `stage`, so this one
    // assertion carries what three `typeof` checks used to: the workspace got the Studio bridge's
    // runtime rather than the detached default.
    expect(harness.latestProjectSurfaceProps?.sourceRuntime?.kind).toBe('stage');
    expect(typeof harness.latestProjectSurfaceProps?.onStartRecording).toBe('function');
    expect(typeof harness.latestProjectSurfaceProps?.onSourceActivityChange).toBe('function');
    expect(typeof harness.latestProjectSurfaceProps?.onSessionChange).toBe('function');
    expect(harness.latestHeaderDestination).toBe('projects');
  });

  it('flushes the active Project session before logout cleanup', async () => {
    renderStudio(undefined, '/projects/18b120ac-1578-46e3-8c3d-42307772f391/workspace');
    await screen.findByText('Deferred Projects workspace');
    const flush = vi.fn(() => Promise.resolve(true));
    const sessionPort: ProjectSessionPort = {
      projectId: '18b120ac-1578-46e3-8c3d-42307772f391',
      phase: 'dirty',
      current: null,
      proposal: null,
      hasLocalProposal: true,
      message: null,
      propose: vi.fn(() => true),
      flush,
      retry: vi.fn(() => Promise.resolve(true)),
      discard: vi.fn(() => true),
      getCurrent: vi.fn(() => null),
      acceptCurrent: vi.fn(),
    };
    act(() => harness.latestProjectSurfaceProps?.onSessionChange?.(sessionPort));

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(flush).toHaveBeenCalledOnce());
  });

  it('closes Use existing video and hands local recording to the persistent stage', async () => {
    renderStudio('upload');
    const stage = await screen.findByTestId('media-stage');

    expect(screen.getByRole('region', { name: 'Use existing video' })).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Record a local video' }));

    expect(screen.queryByRole('region', { name: 'Use existing video' })).not.toBeInTheDocument();
    expect(harness.session.startLocal).toHaveBeenCalledOnce();
    expect(screen.getByTestId('media-stage')).toBe(stage);
    expect(screen.getAllByTestId('media-stage')).toHaveLength(1);
  });

  it('adopts an explicitly recorded local take into the post-recording editor', async () => {
    harness.session.startLocal.mockImplementationOnce(() => {
      harness.recording.original = { id: 'recorded-source', media: new Blob(['take']) };
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

  it('keeps the editor request armed when the take is refused rather than adopted', async () => {
    harness.existingVideo.adoptRecordedArtifact.mockResolvedValueOnce(false);
    harness.session.startLocal.mockImplementationOnce(() => {
      harness.recording.original = { id: 'refused-source', media: new Blob(['take']) };
      harness.takeStagePresentation = { kind: 'playback', mode: 'local' };
      return Promise.resolve();
    });
    renderStudio('upload');

    fireEvent.click(await screen.findByRole('button', { name: 'Record a local video' }));

    await waitFor(() => expect(harness.existingVideo.adoptRecordedArtifact).toHaveBeenCalledOnce());
    // A refusal must not spend the one-shot intent on an overlay that adopted nothing.
    expect(screen.queryByRole('region', { name: 'Use existing video' })).not.toBeInTheDocument();
  });

  it('holds an expiring session open to say what an unsaved take loses', async () => {
    harness.recording.presented = { id: 'expiring-take' };
    renderStudio();

    fireEvent(window, new Event('lightframe:authentication-required'));

    const notice = await screen.findByRole('region', { name: 'Your session ended' });
    expect(notice).toHaveTextContent('Anything you have not saved is discarded');
    expect(harness.session.stopCamera).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Log in again' }));

    await waitFor(() => expect(harness.session.stopCamera).toHaveBeenCalledOnce());
    expect(harness.recording.discard).toHaveBeenCalled();
  });

  it('adopts the presented take when Edit video is pressed for finalized playback', async () => {
    const media = new Blob(['take'], { type: 'video/mp4' });
    harness.recording.original = { id: 'dock-take', media };
    harness.recording.presented = { id: 'dock-take', media };
    harness.takeStagePresentation = { kind: 'playback', mode: 'local' };
    renderStudio();

    const editVideo = screen.getByRole('button', { name: 'Edit video rail' });
    expect(editVideo).toBeEnabled();
    fireEvent.click(editVideo);

    // The take on the stage is the video being edited: pressing Edit video adopts it instead of
    // opening an empty chooser beside it.
    await waitFor(() => expect(harness.existingVideo.adoptRecordedArtifact).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByRole('region', { name: 'Use existing video' })).toHaveTextContent(
        'Post-recording editor',
      ),
    );
    expect(harness.latestWorkspace?.state.activeTool).toBe('edit-video');
  });

  it('opens the editor directly from the Project rail without the chooser detour', async () => {
    const media = new Blob(['cut'], { type: 'video/mp4' });
    harness.recording.original = { id: 'project-cut', media };
    harness.recording.presented = { id: 'project-cut', media };
    harness.takeStagePresentation = { kind: 'playback', mode: 'local' };
    harness.existingVideo.adoptRecordedArtifact.mockImplementationOnce(() => {
      harness.existingVideo.phase = 'ready';
      harness.existingVideo.selection = harness.readySelection('project-cut.mp4', media.size);
      return Promise.resolve(true);
    });
    // Restored by the global `vi.restoreAllMocks()` in vitest.setup.ts.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    renderStudio(undefined, '/projects/18b120ac-1578-46e3-8c3d-42307772f391/workspace');
    await screen.findByText('Deferred Projects workspace');

    fireEvent.click(screen.getByRole('button', { name: 'Edit video rail' }));

    // A workspace launch adopts the current cut and opens the editor itself — never the
    // "Use existing video" chooser the operator did not visit.
    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Video editing tools' })).toBeVisible(),
    );
    expect(screen.queryByRole('region', { name: 'Use existing video' })).not.toBeInTheDocument();

    // Leaving the editor returns to the workspace, not to the chooser.
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('navigation', { name: 'Video editing tools' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByRole('region', { name: 'Use existing video' })).not.toBeInTheDocument();
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
    expect(screen.getByRole('region', { name: 'Save to Assets' })).toBeInTheDocument();
    expect(harness.saveVideo).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Video name (optional)' }), {
      target: { value: 'Studio intro' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save to Assets' }));

    await waitFor(() =>
      expect(harness.saveVideo).toHaveBeenCalledWith(presented, {
        title: 'Studio intro',
        source: undefined,
        character: null,
        thumbnail: { kind: 'auto' },
      }),
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
    harness.existingVideo.selection = harness.readySelection(
      'editable-result.mp4',
      media.size,
      '2026-08-04T12:00:00.000Z',
    );
    harness.takeStagePresentation = { kind: 'playback', mode: 'local' };
    const context = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => null);
    renderStudio();
    const stage = await screen.findByTestId('media-stage');

    fireEvent.click(screen.getByRole('button', { name: 'Edit video rail' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit video' }));

    await waitFor(() =>
      expect(screen.getByRole('navigation', { name: 'Video editing tools' })).toBeVisible(),
    );
    expect(screen.getByTestId('media-stage')).toBe(stage);
    expect(screen.getByTestId('media-stage')).toHaveAttribute('data-edit-preview', 'true');
    expect(screen.queryByText('Recording controls')).not.toBeInTheDocument();
    context.mockRestore();
  });

  it('hydrates and atomically applies saved Character settings to the session', async () => {
    renderStudio();
    await applySavedCharacter();

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
    await applySavedCharacter();
    await waitFor(() =>
      expect(screen.getByLabelText('Reference image could not be restored')).toBeVisible(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
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
    await applySavedCharacter();
    await waitFor(() =>
      expect(screen.getByLabelText('Reference image could not be restored')).toBeVisible(),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue without reference' }));
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

  it('does not expose Recipe, Dock, or Shelf controls in the Studio workspace', () => {
    renderStudio();

    expect(screen.queryByRole('button', { name: /Recipe|Dock|Shelf/u })).not.toBeInTheDocument();
    expect(screen.queryByText(/Recipe|Dock|Shelf/u)).not.toBeInTheDocument();
  });
});
