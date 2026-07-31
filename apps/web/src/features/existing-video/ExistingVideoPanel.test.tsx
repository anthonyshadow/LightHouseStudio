// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import type { RecordingArtifact } from '../recording/types';
import { ExistingVideoPanel } from './ExistingVideoPanel';
import type { ExistingVideoWorkflow } from './useExistingVideoWorkflow';

const api = vi.hoisted(() => ({
  hydrateReferenceImage: vi.fn(),
  importRemoteReferenceImage: vi.fn(),
}));

vi.mock('../../adapters/api-client/apiClient', () => ({
  hydrateReferenceImage: api.hydrateReferenceImage,
  importRemoteReferenceImage: api.importRemoteReferenceImage,
}));

const originalCreateObjectUrl = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const originalRevokeObjectUrl = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');

const workflow = (overrides: Partial<ExistingVideoWorkflow> = {}): ExistingVideoWorkflow => ({
  selection: null,
  steps: [],
  phase: 'empty',
  message: null,
  status: null,
  completedStepCount: 0,
  submittedModels: [],
  acceptedSubmission: false,
  pendingVisual: null,
  retryJob: null,
  original: null,
  result: null,
  editBase: null,
  voiceSelection: null,
  voiceAvailable: false,
  comparison: 'result',
  elapsedSeconds: 0,
  operation: null,
  active: false,
  providerActive: false,
  selectFile: vi.fn(),
  adoptRecordedArtifact: vi.fn(),
  addStep: vi.fn(),
  updateStep: vi.fn(),
  removeStep: vi.fn(),
  submitStep: vi.fn(),
  submitPlan: vi.fn(),
  retryFinalization: vi.fn(),
  retryExistingJob: vi.fn(),
  cancelBeforeAcceptance: vi.fn(),
  downloadResult: vi.fn(),
  reset: vi.fn(),
  startOver: vi.fn(),
  setVtonInputKind: vi.fn(),
  selectVoice: vi.fn(),
  clearVoice: vi.fn(),
  editSelected: vi.fn(),
  showOriginal: vi.fn(),
  showResult: vi.fn(),
  ...overrides,
});

const resultArtifact = (): RecordingArtifact => {
  const media = new Blob(['generated'], { type: 'video/mp4' });
  return {
    id: 'generated-result',
    media,
    objectUrl: 'blob:generated-result',
    mimeType: media.type,
    filename: 'source-lucy-1.mp4',
    sourceModeId: 'local',
    startedAt: '2026-07-30T12:00:00.000Z',
    durationMs: 30_000,
    sizeBytes: media.size,
  };
};

beforeEach(() => {
  api.hydrateReferenceImage.mockReset();
  api.importRemoteReferenceImage.mockReset();
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => {
      throw new Error('Skip media decoding unless a test explicitly enables it.');
    }),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  if (originalCreateObjectUrl) {
    Object.defineProperty(URL, 'createObjectURL', originalCreateObjectUrl);
  } else {
    Reflect.deleteProperty(URL, 'createObjectURL');
  }
  if (originalRevokeObjectUrl) {
    Object.defineProperty(URL, 'revokeObjectURL', originalRevokeObjectUrl);
  } else {
    Reflect.deleteProperty(URL, 'revokeObjectURL');
  }
});

describe('ExistingVideoPanel', () => {
  it('offers a keyboard-operable picker before any provider or camera work', () => {
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={workflow()}
          videoProcessingAvailable={false}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Select video' })).toBeEnabled();
    expect(screen.getByText(/MP4\/H.264/u)).toBeInTheDocument();
    expect(screen.queryByText(/Decart submission/u)).not.toBeInTheDocument();
  });

  it('hands Record a local video to the stage-owned recording flow without rendering inline capture', () => {
    const onRecordVideo = vi.fn();
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={workflow()}
          videoProcessingAvailable={false}
          onFinish={vi.fn()}
          recordingSupported
          onRecordVideo={onRecordVideo}
        />
      </StudioDesignProvider>,
    );

    expect(screen.queryByLabelText('Local camera preview')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Record a local video' }));
    expect(onRecordVideo).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: 'Start recording' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop recording' })).not.toBeInTheDocument();
  });

  it('shows exactly one VTO input mode and keeps the image URL hidden until requested', () => {
    const source = new File(['video'], 'source.mp4', { type: 'video/mp4' });
    const setVtonInputKind = vi.fn();
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={workflow({
            selection: {
              file: source,
              mimeType: 'video/mp4',
              audioSidecar: null,
              audioUnavailableReason: null,
              metadata: {
                kind: 'uploaded',
                mode: 'local',
                selectedAt: '2026-07-30T12:00:00.000Z',
                displayName: source.name,
                container: 'mp4',
                videoCodec: 'avc',
                audioCodec: null,
                durationMs: 30_000,
                width: 1_280,
                height: 720,
                sizeBytes: source.size,
                hasAudio: false,
              },
            },
            phase: 'ready',
            steps: [
              {
                id: 'vto',
                modelId: 'lucy-vton-latest',
                savedRecipeId: null,
                prompt: '',
                enhancePrompt: false,
                referenceImage: null,
                inputKind: 'reference-image',
              },
            ],
            setVtonInputKind,
          })}
          videoProcessingAvailable
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByText(/For the controlled pilot/u)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Prompt' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Public HTTPS image URL' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use an image URL instead' }));
    expect(screen.getByRole('textbox', { name: 'Public HTTPS image URL' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Prompt' }));
    expect(setVtonInputKind).toHaveBeenCalledWith('vto', 'prompt');
  });

  it('shows metadata and keeps the visual choices mutually exclusive', () => {
    const addStep = vi.fn();
    const source = new File(['video'], 'a very long local source name.mp4', {
      type: 'video/mp4',
    });
    const ready = workflow({
      selection: {
        file: source,
        mimeType: 'video/mp4',
        audioSidecar: null,
        audioUnavailableReason: null,
        metadata: {
          kind: 'uploaded',
          mode: 'local',
          selectedAt: '2026-07-30T12:00:00.000Z',
          displayName: source.name,
          container: 'mp4',
          videoCodec: 'avc',
          audioCodec: null,
          durationMs: 30_000,
          width: 1_920,
          height: 1_080,
          sizeBytes: 5_000_000,
          hasAudio: false,
        },
      },
      steps: [
        {
          id: 'lucy',
          modelId: 'lucy-latest',
          savedRecipeId: null,
          prompt: 'Change the scene',
          enhancePrompt: false,
          referenceImage: null,
          inputKind: 'character',
        },
      ],
      phase: 'ready',
      addStep,
      voiceAvailable: true,
    });
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel workflow={ready} videoProcessingAvailable onFinish={vi.fn()} />
      </StudioDesignProvider>,
    );

    expect(screen.getByTitle(source.name)).toHaveTextContent(source.name);
    expect(screen.getByLabelText(`Video preview for ${source.name}`)).toBeVisible();
    expect(screen.getByText('1920 × 1080')).toBeInTheDocument();
    expect(screen.getByText(/1 planned Decart submission: Character Swap/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Character Swap' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Virtual Try On' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Virtual Try On' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('heading', { name: 'Voice' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add voice change' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Virtual Try On' }));
    expect(addStep).toHaveBeenCalledWith('lucy-vton-latest');
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move down' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start · 1 Decart submission' })).toBeEnabled();
  });

  it('shows image-rich saved characters with clamped prompt copy and applies the selected item', async () => {
    const updateStep = vi.fn();
    const source = new File(['video'], 'source.mp4', { type: 'video/mp4' });
    const reference = new File(['image'], 'anchor.png', { type: 'image/png' });
    api.hydrateReferenceImage.mockResolvedValue({ file: reference });

    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={workflow({
            selection: {
              file: source,
              mimeType: 'video/mp4',
              audioSidecar: null,
              audioUnavailableReason: null,
              metadata: {
                kind: 'uploaded',
                mode: 'local',
                selectedAt: '2026-07-30T12:00:00.000Z',
                displayName: source.name,
                container: 'mp4',
                videoCodec: 'avc',
                audioCodec: null,
                durationMs: 30_000,
                width: 1_920,
                height: 1_080,
                sizeBytes: source.size,
                hasAudio: false,
              },
            },
            steps: [
              {
                id: 'lucy',
                modelId: 'lucy-latest',
                savedRecipeId: null,
                prompt: '',
                enhancePrompt: false,
                referenceImage: null,
                inputKind: 'character',
              },
            ],
            phase: 'ready',
            updateStep,
          })}
          videoProcessingAvailable
          savedRecipes={[
            {
              id: 'anchor',
              label: 'Professional Anchor',
              modelId: 'lucy-latest',
              prompt:
                'A professional anchor in a well-lit studio with a dark blazer and soft cinematic lighting.',
              referenceImageAssetId: 'asset-anchor',
            },
          ]}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Choose a Saved Character/u }));
    const option = screen.getByRole('option', { name: /Professional Anchor/u });
    expect(option).toContainHTML('/api/reference-images/asset-anchor/content');
    expect(option).toHaveTextContent(/soft cinematic lighting/u);
    fireEvent.keyDown(option, { key: 'Enter' });

    await waitFor(() =>
      expect(updateStep).toHaveBeenCalledWith('lucy', {
        savedRecipeId: 'anchor',
        prompt:
          'A professional anchor in a well-lit studio with a dark blazer and soft cinematic lighting.',
        referenceImage: reference,
      }),
    );
    expect(api.hydrateReferenceImage).toHaveBeenCalledWith('asset-anchor');
  });

  it('places Create A Character last and opens the builder for the current Character Swap step', () => {
    const onCreateCharacter = vi.fn();
    const source = new File(['video'], 'source.mp4', { type: 'video/mp4' });

    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={workflow({
            selection: {
              file: source,
              mimeType: 'video/mp4',
              audioSidecar: null,
              audioUnavailableReason: null,
              metadata: {
                kind: 'uploaded',
                mode: 'local',
                selectedAt: '2026-07-30T12:00:00.000Z',
                displayName: source.name,
                container: 'mp4',
                videoCodec: 'avc',
                audioCodec: null,
                durationMs: 30_000,
                width: 1_920,
                height: 1_080,
                sizeBytes: source.size,
                hasAudio: false,
              },
            },
            steps: [
              {
                id: 'lucy',
                modelId: 'lucy-latest',
                savedRecipeId: null,
                prompt: '',
                enhancePrompt: false,
                referenceImage: null,
                inputKind: 'character',
              },
            ],
            phase: 'ready',
          })}
          videoProcessingAvailable
          savedRecipes={[
            {
              id: 'anchor',
              label: 'Professional Anchor',
              modelId: 'lucy-latest',
              prompt: 'A professional anchor.',
              referenceImageAssetId: null,
            },
          ]}
          onCreateCharacter={onCreateCharacter}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose a Saved Character' }));
    const options = screen.getAllByRole('option');
    expect(options.at(-1)).toHaveAccessibleName('Create A Character');
    fireEvent.click(options.at(-1)!);
    expect(onCreateCharacter).toHaveBeenCalledWith('lucy');
  });

  it('renders and releases the attached reference image preview', async () => {
    const createObjectUrl = vi.fn((blob: Blob) => {
      if (!blob.type.startsWith('image/'))
        throw new Error('Skip video decoding in this unit test.');
      return 'blob:reference-preview';
    });
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });
    const source = new File(['video'], 'source.mp4', { type: 'video/mp4' });
    const reference = new File(['image'], 'portrait.png', { type: 'image/png' });
    const { unmount } = render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={workflow({
            selection: {
              file: source,
              mimeType: 'video/mp4',
              audioSidecar: null,
              audioUnavailableReason: null,
              metadata: {
                kind: 'uploaded',
                mode: 'local',
                selectedAt: '2026-07-30T12:00:00.000Z',
                displayName: source.name,
                container: 'mp4',
                videoCodec: 'avc',
                audioCodec: null,
                durationMs: 30_000,
                width: 1_920,
                height: 1_080,
                sizeBytes: source.size,
                hasAudio: false,
              },
            },
            steps: [
              {
                id: 'lucy',
                modelId: 'lucy-latest',
                savedRecipeId: null,
                prompt: 'Use this portrait',
                enhancePrompt: false,
                referenceImage: reference,
                inputKind: 'character',
              },
            ],
            phase: 'ready',
          })}
          videoProcessingAvailable
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(
      await screen.findByAltText(`Attached reference preview: ${reference.name}`),
    ).toHaveAttribute('src', 'blob:reference-preview');
    unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:reference-preview');
  });

  it('keeps recipe fields editable after an accepted job interruption and explains resume semantics', () => {
    const updateStep = vi.fn();
    const source = new File(['video'], 'source.mp4', { type: 'video/mp4' });
    const interrupted = workflow({
      selection: {
        file: source,
        mimeType: 'video/mp4',
        audioSidecar: null,
        audioUnavailableReason: null,
        metadata: {
          kind: 'uploaded',
          mode: 'local',
          selectedAt: '2026-07-30T12:00:00.000Z',
          displayName: source.name,
          container: 'mp4',
          videoCodec: 'avc',
          audioCodec: null,
          durationMs: 30_000,
          width: 1_920,
          height: 1_080,
          sizeBytes: 5_000_000,
          hasAudio: false,
        },
      },
      steps: [
        {
          id: 'lucy',
          modelId: 'lucy-latest',
          savedRecipeId: null,
          prompt: 'Change the scene',
          enhancePrompt: false,
          referenceImage: null,
          inputKind: 'character',
        },
      ],
      phase: 'error',
      message: 'The status check was interrupted.',
      acceptedSubmission: true,
      retryJob: { jobId: crypto.randomUUID(), stepIndex: 0 },
      updateStep,
    });

    render(
      <StudioDesignProvider>
        <ExistingVideoPanel workflow={interrupted} videoProcessingAvailable onFinish={vi.fn()} />
      </StudioDesignProvider>,
    );

    const prompt = screen.getByPlaceholderText('Describe the character or visual edit');
    expect(prompt).toBeEnabled();
    fireEvent.change(prompt, { target: { value: 'Make the character a robot' } });
    expect(updateStep).toHaveBeenCalledWith('lucy', {
      savedRecipeId: null,
      prompt: 'Make the character a robot',
    });
    expect(screen.getAllByRole('button', { name: 'Remove' })).toEqual([
      expect.objectContaining({ disabled: true }),
      expect.objectContaining({ disabled: true }),
    ]);
    expect(
      screen.getByRole('button', { name: 'Resume accepted job · no new submission' }),
    ).toBeEnabled();
    expect(screen.getByText(/checks and downloads the original accepted recipe/u)).toBeVisible();
  });

  it('downloads the result, starts over with the source, or discards the completed video', () => {
    const reset = vi.fn();
    const startOver = vi.fn();
    const downloadResult = vi.fn();
    const editSelected = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const source = new File(['video'], 'completed-source.mp4', { type: 'video/mp4' });

    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={workflow({
            selection: {
              file: source,
              mimeType: 'video/mp4',
              audioSidecar: null,
              audioUnavailableReason: null,
              metadata: {
                kind: 'uploaded',
                mode: 'local',
                selectedAt: '2026-07-30T12:00:00.000Z',
                displayName: source.name,
                container: 'mp4',
                videoCodec: 'avc',
                audioCodec: null,
                durationMs: 30_000,
                width: 1_280,
                height: 720,
                sizeBytes: source.size,
                hasAudio: false,
              },
            },
            phase: 'complete',
            result: resultArtifact(),
            startOver,
            downloadResult,
            editSelected,
            reset,
          })}
          videoProcessingAvailable
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    const download = screen.getByRole('link', { name: 'Download' });
    expect(screen.getByRole('button', { name: 'Original' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Result' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Edit result' }));
    expect(editSelected).toHaveBeenCalledOnce();
    expect(download).toHaveAttribute('href', 'blob:generated-result');
    expect(download).toHaveAttribute('download', 'source-lucy-1.mp4');
    fireEvent.click(download);
    expect(downloadResult).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /Review Voice/u })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start over' }));
    expect(startOver).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Discard video' }));

    expect(confirm).toHaveBeenCalledWith(
      'Discard this uploaded video and its results? They cannot be recovered after this tab releases them.',
    );
    expect(reset).toHaveBeenCalledWith(true);
  });
});
