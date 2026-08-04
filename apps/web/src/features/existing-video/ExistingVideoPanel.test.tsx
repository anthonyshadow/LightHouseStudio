// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import type { RecordingArtifact } from '../recording/types';
import { ExistingVideoPanel } from './ExistingVideoPanel';
import { ExistingVideoReferenceField } from './ExistingVideoReferenceField';
import type {
  ExistingVideoVoiceSelection,
  ExistingVideoWorkflow,
} from './useExistingVideoWorkflow';

const api = vi.hoisted(() => ({
  hydrateReferenceImage: vi.fn(),
  importRemoteReferenceImage: vi.fn(),
  listWorkspaceVoices: vi.fn(),
  fetchVoicePreview: vi.fn(),
}));

vi.mock('../../adapters/api-client/apiClient', () => ({
  hydrateReferenceImage: api.hydrateReferenceImage,
  importRemoteReferenceImage: api.importRemoteReferenceImage,
}));
vi.mock('../../adapters/api-client/voicesApi', () => ({
  listWorkspaceVoices: api.listWorkspaceVoices,
  fetchVoicePreview: api.fetchVoicePreview,
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
  acceptedSubmission: false,
  pendingVisual: null,
  retryJob: null,
  original: null,
  result: null,
  downloaded: false,
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
  addStep: vi.fn(() => true),
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
  selectLocalVoice: vi.fn(),
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

const readyVtonWorkflow = (updateStep: ReturnType<typeof vi.fn>): ExistingVideoWorkflow => {
  const source = new File(['video'], 'source.mp4', { type: 'video/mp4' });
  return workflow({
    selection: {
      file: source,
      mimeType: 'video/mp4',
      audioSidecar: null,
      audioUnavailableReason: null,
      metadata: {
        kind: 'uploaded',
        mode: 'local',
        selectedAt: '2026-08-02T12:00:00.000Z',
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
        id: 'vton',
        modelId: 'lucy-vton-latest',
        savedRecipeId: null,
        prompt: '',
        enhancePrompt: false,
        referenceImage: null,
        inputKind: 'saved-outfit',
      },
    ],
    phase: 'ready',
    updateStep: updateStep as ExistingVideoWorkflow['updateStep'],
  });
};

const readyCharacterWorkflow = (
  updateStep: ReturnType<typeof vi.fn>,
  step: Partial<ExistingVideoWorkflow['steps'][number]> = {},
): ExistingVideoWorkflow => {
  const source = new File(['video'], 'source.mp4', { type: 'video/mp4' });
  return workflow({
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
        ...step,
      },
    ],
    phase: 'ready',
    updateStep: updateStep as ExistingVideoWorkflow['updateStep'],
  });
};

beforeEach(() => {
  api.hydrateReferenceImage.mockReset();
  api.importRemoteReferenceImage.mockReset();
  api.listWorkspaceVoices.mockReset();
  api.fetchVoicePreview.mockReset();
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

    expect(screen.getByRole('button', { name: 'Upload from device' })).toBeEnabled();
    expect(screen.getByText(/MP4\/H.264/u)).toBeInTheDocument();
    expect(screen.queryByText(/Decart submission/u)).not.toBeInTheDocument();
  });

  it('applies provider-neutral Character Swap capability limits independently from VTO', () => {
    const source = new File(['video'], 'source.mp4', { type: 'video/mp4' });
    const updateStep = vi.fn();
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
                selectedAt: '2026-08-02T12:00:00.000Z',
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
            updateStep,
            steps: [
              {
                id: 'character',
                modelId: 'lucy-latest',
                savedRecipeId: null,
                prompt: 'Use this character direction',
                enhancePrompt: false,
                referenceImage: null,
                inputKind: 'character',
              },
            ],
          })}
          videoProcessingAvailable
          videoProcessingCapabilities={{
            characterSwap: {
              available: true,
              inputPreparation: 'h264-mp4',
              referencePolicy: 'required',
              promptEnhancement: false,
              terminalFailureRelease: 'explicit-user',
              outputResolutions: ['720p', '1080p'],
            },
            virtualTryOn: {
              available: false,
              inputPreparation: 'none',
              referencePolicy: 'optional',
              promptEnhancement: true,
              terminalFailureRelease: 'automatic',
              outputResolutions: ['720p'],
            },
          }}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByText(/requires one identity reference image/u)).toBeVisible();
    expect(screen.getByRole('checkbox', { name: /^Enhance prompt/u })).toBeDisabled();
    expect(screen.getByText(/Prompt enhancement is unavailable for Character Swap/u)).toBeVisible();
    const resolution = screen.getByRole('combobox', { name: /Output resolution/u });
    expect(resolution).toHaveTextContent('720p');
    fireEvent.click(resolution);
    fireEvent.click(screen.getByRole('option', { name: '1080p' }));
    expect(updateStep).toHaveBeenCalledWith('character', { outputResolution: '1080p' });
    expect(screen.getByRole('button', { name: 'Apply Character Swap' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Virtual Try On' })).toBeDisabled();
    expect(document.body.textContent).not.toMatch(/Decart|Pruna|Lucy|p-video/u);
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

    expect(screen.getByText(/Use media you have rights and consent to submit/u)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Prompt' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: 'Public HTTPS image URL' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Use an image URL instead' }));
    expect(screen.getByRole('textbox', { name: 'Public HTTPS image URL' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Prompt' }));
    expect(setVtonInputKind).toHaveBeenCalledWith('vto', 'prompt');
  });

  it('imports a Character Swap reference from the shared public HTTPS URL flow', async () => {
    const imported = new File(['portrait'], 'remote-character.webp', { type: 'image/webp' });
    const onSelectFile = vi.fn();
    api.importRemoteReferenceImage.mockResolvedValue(imported);
    render(
      <StudioDesignProvider>
        <ExistingVideoReferenceField
          modelId="lucy-latest"
          file={null}
          disabled={false}
          allowUrlImport
          onSelectFile={onSelectFile}
          onRemove={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use an image URL instead' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Public HTTPS image URL' }), {
      target: { value: 'https://images.example.test/character.webp' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import image' }));

    await waitFor(() => expect(onSelectFile).toHaveBeenCalledWith(imported));
    expect(api.importRemoteReferenceImage).toHaveBeenCalledWith(
      'https://images.example.test/character.webp',
      expect.any(AbortSignal),
    );
  });

  it('confirms before replacing configured visual settings and preserves them on cancel', async () => {
    const addStep = vi.fn(() => true);
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
      voiceSelection: { kind: 'local', effect: 'warm-studio', voiceName: 'Warm studio' },
    });
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel workflow={ready} videoProcessingAvailable onFinish={vi.fn()} />
      </StudioDesignProvider>,
    );

    expect(screen.getAllByTitle(source.name)[0]).toHaveTextContent(source.name);
    expect(screen.getByLabelText(`Video preview for ${source.name}`)).toBeVisible();
    expect(screen.getAllByText('1920 × 1080')[0]).toBeInTheDocument();
    expect(screen.getByText(/Apply Character Swap/u)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Character Swap/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^Virtual Try On/u })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^Virtual Try On/u })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /^Voice/u })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Voice' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /^Virtual Try On/u }));
    expect(addStep).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Switch to Virtual Try On?' })).toBeVisible();
    expect(
      screen.getAllByText(
        'Switching will clear your current Character Swap settings. Your Voice settings will not be affected, and Voice can still be combined with Virtual Try On.',
      )[0],
    ).toBeVisible();
    expect(screen.getByDisplayValue('Change the scene')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Keep Character Swap' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(addStep).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Change the scene')).toBeVisible();
    expect(screen.getByRole('button', { name: /^Character Swap/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^Virtual Try On/u })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    fireEvent.click(screen.getByRole('button', { name: /^Virtual Try On/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear and switch' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(addStep).toHaveBeenCalledWith('lucy-vton-latest');
    expect(screen.getByRole('button', { name: /^Character Swap/u })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /^Virtual Try On/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Voice' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Move up' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Move down' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apply Character Swap, then Warm studio' }),
    ).toBeEnabled();
  });

  it('switches an empty visual setup immediately without a warning', () => {
    const addStep = vi.fn(() => true);
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
                width: 1_280,
                height: 720,
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
            addStep,
          })}
          videoProcessingAvailable
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Virtual Try On/u }));

    expect(addStep).toHaveBeenCalledWith('lucy-vton-latest');
    expect(screen.queryByRole('dialog', { name: /Switch to/u })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Character Swap/u })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: /^Virtual Try On/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('uses contextual confirmation copy when replacing Virtual Try On settings', () => {
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
                width: 1_280,
                height: 720,
                sizeBytes: source.size,
                hasAudio: false,
              },
            },
            steps: [
              {
                id: 'vto',
                modelId: 'lucy-vton-latest',
                savedRecipeId: null,
                prompt: 'A tailored green jacket',
                enhancePrompt: false,
                referenceImage: null,
                inputKind: 'prompt',
              },
            ],
            phase: 'ready',
          })}
          videoProcessingAvailable
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Character Swap/u }));

    expect(screen.getByRole('dialog', { name: 'Switch to Character Swap?' })).toBeVisible();
    expect(
      screen.getAllByText(
        'Switching will clear your current Virtual Try On settings. Your Voice settings will not be affected, and Voice can still be combined with Character Swap.',
      )[0],
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keep Virtual Try On' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear and switch' })).toBeVisible();
  });

  it('keeps configured Voice selected while either visual edit is viewed', () => {
    const source = new File(['video'], 'source-with-audio.mp4', { type: 'video/mp4' });
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={workflow({
            selection: {
              file: source,
              mimeType: 'video/mp4',
              audioSidecar: {
                blob: new Blob(['audio'], { type: 'audio/webm' }),
                mimeType: 'audio/webm',
              },
              audioUnavailableReason: null,
              metadata: {
                kind: 'uploaded',
                mode: 'local',
                selectedAt: '2026-07-30T12:00:00.000Z',
                displayName: source.name,
                container: 'mp4',
                videoCodec: 'avc',
                audioCodec: 'aac',
                durationMs: 30_000,
                width: 1_280,
                height: 720,
                sizeBytes: source.size,
                hasAudio: true,
              },
            },
            steps: [
              {
                id: 'lucy',
                modelId: 'lucy-latest',
                savedRecipeId: null,
                prompt: 'Use the saved character',
                enhancePrompt: false,
                referenceImage: null,
                inputKind: 'character',
              },
            ],
            phase: 'ready',
            voiceAvailable: true,
            voiceSelection: { kind: 'local', effect: 'warm-studio', voiceName: 'Warm studio' },
          })}
          videoProcessingAvailable
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(
      screen.getByText(
        'Choose one visual edit: Character Swap or Virtual Try On. Voice is independent, so you can add it to either visual edit or use it on its own.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Visual edit')).toBeVisible();
    expect(screen.getAllByText('Voice')[0]).toBeVisible();
    expect(screen.getByRole('button', { name: /^Character Swap/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /^Voice/u })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Voice' }));
    expect(screen.getByRole('heading', { name: 'Configure Voice' })).toBeVisible();
    expect(screen.getByRole('button', { name: /^Character Swap/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Voice' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: /^Character Swap/u }));
    expect(screen.getByRole('heading', { name: 'Configure Character Swap' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Voice' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('retains a saved Voice selection and its browser state while viewing a visual edit', async () => {
    api.listWorkspaceVoices.mockResolvedValue({
      voices: [
        {
          kind: 'workspace',
          voice: {
            voiceId: 'saved-star',
            name: 'Saved Star',
            category: 'featured',
            description: 'Bright delivery',
            labels: {},
            previewAvailable: false,
          },
        },
      ],
      hasMore: false,
      nextPageToken: null,
      total: 1,
    });
    const source = new File(['video'], 'source-with-audio.mp4', { type: 'video/mp4' });

    const StatefulPanel = () => {
      const [voiceSelection, setVoiceSelection] = useState<ExistingVideoVoiceSelection | null>(
        null,
      );
      return (
        <ExistingVideoPanel
          workflow={workflow({
            selection: {
              file: source,
              mimeType: 'video/mp4',
              audioSidecar: {
                blob: new Blob(['audio'], { type: 'audio/webm' }),
                mimeType: 'audio/webm',
              },
              audioUnavailableReason: null,
              metadata: {
                kind: 'uploaded',
                mode: 'local',
                selectedAt: '2026-07-30T12:00:00.000Z',
                displayName: source.name,
                container: 'mp4',
                videoCodec: 'avc',
                audioCodec: 'aac',
                durationMs: 30_000,
                width: 1_280,
                height: 720,
                sizeBytes: source.size,
                hasAudio: true,
              },
            },
            steps: [
              {
                id: 'lucy',
                modelId: 'lucy-latest',
                savedRecipeId: null,
                prompt: 'Use the saved character',
                enhancePrompt: false,
                referenceImage: null,
                inputKind: 'character',
              },
            ],
            phase: 'ready',
            voiceAvailable: true,
            voiceSelection,
            selectVoice: (voiceId, voiceName) =>
              setVoiceSelection({ kind: 'elevenlabs', voiceId, voiceName }),
            clearVoice: () => setVoiceSelection(null),
          })}
          videoProcessingAvailable
          elevenLabsAvailable
          browserCapabilities={{ webAudio: true, offlineAudio: true }}
          onFinish={vi.fn()}
        />
      );
    };

    render(
      <StudioDesignProvider>
        <StatefulPanel />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Voice' }));
    fireEvent.click(screen.getByRole('button', { name: /Saved AI Voice/u }));
    fireEvent.click(await screen.findByRole('button', { name: 'Select Saved Star' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this voice for the edit' }));
    expect(screen.getByRole('button', { name: 'Voice' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Saved AI Voice/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /^Character Swap/u }));
    expect(screen.getByRole('heading', { name: 'Configure Character Swap' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Voice' })).toHaveAttribute('aria-pressed', 'true');
    expect(
      screen.getByRole('button', { name: 'Apply Character Swap, then Saved Star' }),
    ).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Voice' }));
    expect(screen.getByRole('button', { name: /Saved AI Voice/u })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(screen.getByRole('button', { name: /No voice/u }));
    fireEvent.click(screen.getByRole('button', { name: 'Use original audio' }));
    fireEvent.click(screen.getByRole('button', { name: /^Character Swap/u }));
    expect(screen.getByRole('button', { name: 'Voice' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('offers local voice treatments inline and labels the local-only apply action', () => {
    const source = new File(['video'], 'source-with-audio.mp4', { type: 'video/mp4' });
    const selectLocalVoice = vi.fn();
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={workflow({
            selection: {
              file: source,
              mimeType: 'video/mp4',
              audioSidecar: {
                blob: new Blob(['audio'], { type: 'audio/webm' }),
                mimeType: 'audio/webm',
              },
              audioUnavailableReason: null,
              metadata: {
                kind: 'uploaded',
                mode: 'local',
                selectedAt: '2026-07-30T12:00:00.000Z',
                displayName: source.name,
                container: 'mp4',
                videoCodec: 'avc',
                audioCodec: 'aac',
                durationMs: 30_000,
                width: 1_280,
                height: 720,
                sizeBytes: source.size,
                hasAudio: true,
              },
            },
            phase: 'ready',
            voiceAvailable: true,
            voiceSelection: { kind: 'local', effect: 'warm-studio', voiceName: 'Warm studio' },
            selectLocalVoice,
          })}
          videoProcessingAvailable
          browserCapabilities={{ webAudio: true, offlineAudio: true }}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Configure Voice' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /^Clear presenter/u }));
    expect(selectLocalVoice).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Use this treatment for the edit' }));
    expect(selectLocalVoice).toHaveBeenCalledWith('clear-presenter', 'Clear presenter');
    expect(screen.getByRole('button', { name: 'Apply Warm studio locally' })).toBeEnabled();
    expect(screen.getByText(/Plan-only until the outer Start edit action/u)).toBeVisible();
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
              vtonInputKind: null,
              enhancePrompt: false,
            },
          ]}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Saved Character' }));
    const option = screen.getByRole('option', { name: /Professional Anchor/u });
    expect(option).toContainHTML('/api/reference-images/asset-anchor/content');
    expect(option).toHaveTextContent(/soft cinematic lighting/u);
    fireEvent.keyDown(option, { key: 'Enter' });

    await waitFor(() =>
      expect(updateStep).toHaveBeenCalledWith('lucy', {
        savedRecipeId: 'anchor',
        prompt: '',
        referenceImage: reference,
      }),
    );
    expect(api.hydrateReferenceImage).toHaveBeenCalledWith('asset-anchor');
  });

  it('fills the prompt only for a prompt-only saved character', async () => {
    const updateStep = vi.fn();
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={readyCharacterWorkflow(updateStep)}
          videoProcessingAvailable
          savedRecipes={[
            {
              id: 'prompt-character',
              label: 'Prompt Character',
              modelId: 'lucy-latest',
              prompt: 'A prompt-only saved character.',
              referenceImageAssetId: null,
              vtonInputKind: null,
              enhancePrompt: false,
            },
          ]}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Saved Character' }));
    fireEvent.click(screen.getByRole('option', { name: /Prompt Character/u }));

    await waitFor(() =>
      expect(updateStep).toHaveBeenCalledWith('lucy', {
        savedRecipeId: 'prompt-character',
        prompt: 'A prompt-only saved character.',
        referenceImage: null,
      }),
    );
    expect(api.hydrateReferenceImage).not.toHaveBeenCalled();
  });

  it('keeps a saved image character selected while a different prompt is written', () => {
    const updateStep = vi.fn();
    const reference = new File(['portrait'], 'anchor.png', { type: 'image/png' });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:anchor-preview'),
    });
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={readyCharacterWorkflow(updateStep, {
            savedRecipeId: 'anchor',
            referenceImage: reference,
          })}
          videoProcessingAvailable
          savedRecipes={[
            {
              id: 'anchor',
              label: 'Professional Anchor',
              modelId: 'lucy-latest',
              prompt: 'Stored prompt that should not be copied.',
              referenceImageAssetId: 'asset-anchor',
              vtonInputKind: null,
              enhancePrompt: false,
            },
          ]}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.change(screen.getByRole('textbox', { name: /^Prompt/u }), {
      target: { value: 'Use a different scene direction.' },
    });

    expect(updateStep).toHaveBeenCalledWith('lucy', {
      savedRecipeId: 'anchor',
      prompt: 'Use a different scene direction.',
    });
  });

  it('does not fall back to a saved character prompt when its image cannot load', async () => {
    const updateStep = vi.fn();
    api.hydrateReferenceImage.mockRejectedValue(new Error('missing'));
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={readyCharacterWorkflow(updateStep)}
          videoProcessingAvailable
          savedRecipes={[
            {
              id: 'missing-anchor',
              label: 'Missing Anchor',
              modelId: 'lucy-latest',
              prompt: 'Do not use this stored fallback.',
              referenceImageAssetId: 'missing-asset',
              vtonInputKind: null,
              enhancePrompt: false,
            },
          ]}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Saved Character' }));
    fireEvent.click(screen.getByRole('option', { name: /Missing Anchor/u }));

    await screen.findByText(/reference image could not be loaded/u);
    expect(updateStep).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: /^Prompt/u })).toHaveValue('');
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
              vtonInputKind: null,
              enhancePrompt: false,
            },
          ]}
          onCreateCharacter={onCreateCharacter}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Saved Character' }));
    const options = screen.getAllByRole('option');
    expect(options.at(-1)).toHaveAccessibleName('Create A Character');
    fireEvent.click(options.at(-1)!);
    expect(onCreateCharacter).toHaveBeenCalledWith('lucy');
  });

  it('hydrates and applies the exact wardrobe variant selected for a parent character', async () => {
    const updateStep = vi.fn();
    const source = new File(['video'], 'source.mp4', { type: 'video/mp4' });
    const variantReference = new File(['variant'], 'evening.jpg', { type: 'image/jpeg' });
    api.hydrateReferenceImage.mockResolvedValue({ file: variantReference });

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
                selectedAt: '2026-08-03T12:00:00.000Z',
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
              id: 'host',
              label: 'Professional Anchor · Original',
              modelId: 'lucy-latest',
              prompt: 'A professional anchor.',
              referenceImageAssetId: 'host-original',
              vtonInputKind: null,
              enhancePrompt: false,
              savedCharacterPromptId: 'host',
              originalCharacterVersion: true,
            },
            {
              id: 'host-evening',
              label: 'Professional Anchor · Evening look',
              modelId: 'lucy-latest',
              prompt: 'A professional anchor.',
              referenceImageAssetId: 'host-evening-asset',
              vtonInputKind: null,
              enhancePrompt: false,
              savedCharacterPromptId: 'host',
              savedCharacterVariantId: 'host-evening',
              originalCharacterVersion: false,
            },
          ]}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Saved Character' }));
    fireEvent.click(screen.getByRole('option', { name: /Professional Anchor/u }));
    const variantCard = screen.getByText('Evening look').closest('article');
    expect(variantCard).not.toBeNull();
    fireEvent.click(within(variantCard!).getByRole('button', { name: 'Choose' }));

    await waitFor(() =>
      expect(api.hydrateReferenceImage).toHaveBeenCalledWith('host-evening-asset'),
    );
    expect(updateStep).toHaveBeenCalledWith(
      'lucy',
      expect.objectContaining({
        savedRecipeId: 'host-evening',
        prompt: '',
        referenceImage: variantReference,
      }),
    );
  });

  it('restores a saved prompt outfit in Prompt mode with its enhancement setting', async () => {
    const updateStep = vi.fn();
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
                selectedAt: '2026-08-02T12:00:00.000Z',
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
                id: 'vton',
                modelId: 'lucy-vton-latest',
                savedRecipeId: null,
                prompt: '',
                enhancePrompt: false,
                referenceImage: null,
                inputKind: 'saved-outfit',
              },
            ],
            phase: 'ready',
            updateStep,
          })}
          videoProcessingAvailable
          savedRecipes={[
            {
              id: 'prompt-outfit',
              label: 'Copper overshirt',
              modelId: 'lucy-vton-latest',
              prompt: 'A copper linen overshirt.',
              referenceImageAssetId: null,
              vtonInputKind: 'prompt',
              enhancePrompt: true,
            },
          ]}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Saved or recently uploaded outfit' }));
    fireEvent.click(screen.getByRole('option', { name: 'Copper overshirt' }));
    await waitFor(() =>
      expect(updateStep).toHaveBeenCalledWith('vton', {
        savedRecipeId: 'prompt-outfit',
        prompt: 'A copper linen overshirt.',
        referenceImage: null,
        inputKind: 'prompt',
        enhancePrompt: true,
      }),
    );
    expect(api.hydrateReferenceImage).not.toHaveBeenCalled();
  });

  it('restores a saved image outfit in Saved outfit mode with enhancement off', async () => {
    const updateStep = vi.fn();
    const source = new File(['video'], 'source.mp4', { type: 'video/mp4' });
    const reference = new File(['image'], 'coat.png', { type: 'image/png' });
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
                selectedAt: '2026-08-02T12:00:00.000Z',
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
                id: 'vton',
                modelId: 'lucy-vton-latest',
                savedRecipeId: null,
                prompt: '',
                enhancePrompt: false,
                referenceImage: null,
                inputKind: 'saved-outfit',
              },
            ],
            phase: 'ready',
            updateStep,
          })}
          videoProcessingAvailable
          savedRecipes={[
            {
              id: 'image-outfit',
              label: 'Archive coat',
              modelId: 'lucy-vton-latest',
              prompt: '',
              referenceImageAssetId: 'opaque-coat',
              vtonInputKind: 'saved-outfit',
              enhancePrompt: false,
            },
          ]}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Saved or recently uploaded outfit' }));
    fireEvent.click(screen.getByRole('option', { name: 'Archive coat' }));
    await waitFor(() =>
      expect(updateStep).toHaveBeenCalledWith('vton', {
        savedRecipeId: 'image-outfit',
        prompt: '',
        referenceImage: reference,
        inputKind: 'saved-outfit',
        enhancePrompt: false,
      }),
    );
  });

  it('requires an explicit prompt fallback when a saved outfit image is missing', async () => {
    const updateStep = vi.fn();
    api.hydrateReferenceImage.mockRejectedValue(new Error('missing'));
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={readyVtonWorkflow(updateStep)}
          videoProcessingAvailable
          savedRecipes={[
            {
              id: 'combined-outfit',
              label: 'Migrated coat',
              modelId: 'lucy-vton-latest',
              prompt: 'A structured wool coat.',
              referenceImageAssetId: 'missing-coat',
              vtonInputKind: 'saved-outfit',
              enhancePrompt: false,
            },
          ]}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Saved or recently uploaded outfit' }));
    fireEvent.click(screen.getByRole('option', { name: 'Migrated coat' }));
    await screen.findByRole('button', { name: 'Continue without reference' });
    expect(updateStep).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue without reference' }));
    expect(updateStep).toHaveBeenCalledWith('vton', {
      savedRecipeId: 'combined-outfit',
      prompt: 'A structured wool coat.',
      referenceImage: null,
      inputKind: 'prompt',
      enhancePrompt: false,
    });
  });

  it('offers only retry or removal for a missing image-only outfit', async () => {
    const updateStep = vi.fn();
    api.hydrateReferenceImage.mockRejectedValue(new Error('missing'));
    render(
      <StudioDesignProvider>
        <ExistingVideoPanel
          workflow={readyVtonWorkflow(updateStep)}
          videoProcessingAvailable
          savedRecipes={[
            {
              id: 'image-only-outfit',
              label: 'Image coat',
              modelId: 'lucy-vton-latest',
              prompt: '',
              referenceImageAssetId: 'missing-image-only',
              vtonInputKind: 'saved-outfit',
              enhancePrompt: false,
            },
          ]}
          onFinish={vi.fn()}
        />
      </StudioDesignProvider>,
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Saved or recently uploaded outfit' }));
    fireEvent.click(screen.getByRole('option', { name: 'Image coat' }));
    await screen.findByRole('button', { name: 'Retry image' });
    expect(screen.queryByRole('button', { name: 'Continue without reference' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remove outfit' }));
    expect(updateStep).toHaveBeenCalledWith('vton', {
      savedRecipeId: null,
      prompt: '',
      referenceImage: null,
      inputKind: 'saved-outfit',
      enhancePrompt: false,
    });
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
    expect(screen.getByRole('button', { name: 'Clear Character Swap setup' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Resume accepted job · no new submission' }),
    ).toBeEnabled();
    expect(screen.getByText(/resuming checks the accepted job/u)).toBeVisible();
  });

  it('downloads the result, starts over with the source, or discards the completed video', () => {
    const reset = vi.fn();
    const startOver = vi.fn();
    const downloadResult = vi.fn();
    const editSelected = vi.fn();
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

    const download = screen.getByRole('link', { name: 'Download result' });
    expect(screen.getByRole('button', { name: 'Original' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Result' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Edit result' }));
    expect(editSelected).toHaveBeenCalledOnce();
    expect(download).toHaveAttribute('href', 'blob:generated-result');
    expect(download).toHaveAttribute('download', 'source-lucy-1.mp4');
    fireEvent.click(download);
    expect(downloadResult).toHaveBeenCalledOnce();
    expect(screen.queryByRole('button', { name: /Review Voice/u })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Start over from original' }));
    expect(startOver).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Discard video and result' }));
    expect(screen.getByRole('dialog', { name: 'Discard this video?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Discard video' }));
    expect(reset).toHaveBeenCalledWith(true);
  });
});
