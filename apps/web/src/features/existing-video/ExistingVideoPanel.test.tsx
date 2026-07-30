// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { ExistingVideoPanel } from './ExistingVideoPanel';
import type { ExistingVideoWorkflow } from './useExistingVideoWorkflow';

const api = vi.hoisted(() => ({
  hydrateReferenceImage: vi.fn(),
}));

vi.mock('../../adapters/api-client/apiClient', () => ({
  hydrateReferenceImage: api.hydrateReferenceImage,
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
  comparison: 'result',
  elapsedSeconds: 0,
  active: false,
  providerActive: false,
  selectFile: vi.fn(),
  addStep: vi.fn(),
  updateStep: vi.fn(),
  removeStep: vi.fn(),
  moveStep: vi.fn(),
  submitStep: vi.fn(),
  retryFinalization: vi.fn(),
  retryExistingJob: vi.fn(),
  finishAtCheckpoint: vi.fn(),
  cancelBeforeAcceptance: vi.fn(),
  reset: vi.fn(),
  showOriginal: vi.fn(),
  showResult: vi.fn(),
  ...overrides,
});

beforeEach(() => {
  api.hydrateReferenceImage.mockReset();
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

  it('shows metadata, explicit ordering controls, and the exact request count', () => {
    const addStep = vi.fn();
    const moveStep = vi.fn();
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
          modelId: 'lucy-2.5',
          prompt: 'Change the scene',
          enhancePrompt: false,
          referenceImage: null,
        },
        {
          id: 'vto',
          modelId: 'lucy-vton-3',
          prompt: 'Apply the jacket',
          enhancePrompt: false,
          referenceImage: null,
        },
      ],
      phase: 'ready',
      addStep,
      moveStep,
    });
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel workflow={ready} videoProcessingAvailable onFinish={vi.fn()} />
      </StudioDesignProvider>,
    );

    expect(screen.getByText(source.name)).toHaveAttribute('title', source.name);
    expect(screen.getByLabelText(`Video preview for ${source.name}`)).toBeVisible();
    expect(screen.getByText('1920 × 1080')).toBeInTheDocument();
    expect(screen.getByText(/2 planned Decart submissions/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Swap Character' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Virtual Try On' })).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Move down' })[0]!);
    expect(moveStep).toHaveBeenCalledWith(0, 1);
    expect(
      screen.getByRole('button', { name: 'Start first · 2 planned submissions' }),
    ).toBeEnabled();
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
                modelId: 'lucy-2.5',
                prompt: '',
                enhancePrompt: false,
                referenceImage: null,
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
              modelId: 'lucy-2.5',
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
        prompt:
          'A professional anchor in a well-lit studio with a dark blazer and soft cinematic lighting.',
        referenceImage: reference,
      }),
    );
    expect(api.hydrateReferenceImage).toHaveBeenCalledWith('asset-anchor');
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
                modelId: 'lucy-2.5',
                prompt: 'Use this portrait',
                enhancePrompt: false,
                referenceImage: reference,
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
          modelId: 'lucy-2.5',
          prompt: 'Change the scene',
          enhancePrompt: false,
          referenceImage: null,
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
});
