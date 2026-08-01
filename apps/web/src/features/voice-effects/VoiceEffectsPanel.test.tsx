// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingArtifact } from '../recording';
import type { RecordingController } from '../recording/types';
import type { VoiceProcessingController } from './types';
import { StudioDesignProvider } from '../../ui';

const voiceApi = vi.hoisted(() => ({
  fetchVoicePreview: vi.fn(),
  listWorkspaceVoices: vi.fn(),
}));

vi.mock('../../adapters/api-client/voicesApi', () => voiceApi);

import { VoiceEffectsPanel } from './VoiceEffectsPanel';
import { VoiceLibrary } from './VoiceLibrary';

const emptyPage = {
  voices: [],
  hasMore: false,
  nextPageToken: null,
  total: 0,
};

const createOriginal = (): RecordingArtifact => {
  const blob = new Blob(['video'], { type: 'video/webm' });
  return {
    id: 'original',
    media: blob,
    objectUrl: 'blob:original',
    mimeType: blob.type,
    filename: 'take.webm',
    sourceModeId: 'local',
    startedAt: '2026-07-14T12:00:00.000Z',
    durationMs: 2_000,
    sizeBytes: blob.size,
  };
};

const createRecording = (
  processingState: RecordingController['processingState'] = 'idle',
): RecordingController => {
  const original = createOriginal();
  return {
    lifecycle: 'recorded',
    activeSource: null,
    metadata: null,
    original,
    visual: null,
    processed: null,
    presented: original,
    sidecar: {
      state: 'ready',
      blob: new Blob(['audio'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
      error: null,
    },
    recordingError: null,
    processingState,
    processingOperation: null,
    processingError: null,
    elapsedSeconds: 2,
    downloaded: false,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(original),
    restorePersistedOriginal: vi.fn().mockReturnValue(original),
    discard: vi.fn(),
    markDownloaded: vi.fn(),
    beginProcessing: vi.fn(),
    cancelProcessing: vi.fn(),
    completeVisualProcessing: vi.fn().mockReturnValue(original),
    completeProcessing: vi.fn().mockReturnValue(original),
    failProcessing: vi.fn(),
    clearVisualProcessing: vi.fn(),
    restoreOriginal: vi.fn(),
  };
};

const createProcessing = (): VoiceProcessingController => ({
  selection: { kind: 'local', effect: 'warm-studio' },
  applyLocal: vi.fn().mockResolvedValue(undefined),
  applyLocalTo: vi.fn().mockResolvedValue({ status: 'ready', artifact: createOriginal() }),
  applyElevenLabs: vi.fn().mockResolvedValue(undefined),
  applyElevenLabsTo: vi.fn().mockResolvedValue({ status: 'ready', artifact: createOriginal() }),
  restoreOriginal: vi.fn(),
  cancel: vi.fn(),
});

const renderWithTheme = (component: ReactNode) =>
  render(<StudioDesignProvider>{component}</StudioDesignProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  voiceApi.listWorkspaceVoices.mockResolvedValue(emptyPage);
  voiceApi.fetchVoicePreview.mockResolvedValue(new Blob(['preview'], { type: 'audio/mpeg' }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('VoiceEffectsPanel', () => {
  it('does not browse voices until the user intentionally opens the stacked browser', async () => {
    const user = userEvent.setup();
    renderWithTheme(
      <VoiceEffectsPanel
        recording={createRecording()}
        processing={createProcessing()}
        elevenLabsAvailable
        browserCapabilities={{ webAudio: true, offlineAudio: true }}
      />,
    );

    expect(voiceApi.listWorkspaceVoices).not.toHaveBeenCalled();
    await user.click(screen.getByText(/Browse saved voices/));

    expect(screen.getByRole('dialog', { name: 'Voice Browser' })).toBeInTheDocument();
    expect(screen.getByText(/Take review → Voice treatments → Saved voices/)).toBeVisible();
    await waitFor(() => expect(voiceApi.listWorkspaceVoices).toHaveBeenCalledTimes(1));
  });

  it('keeps provider and compatibility detail available through progressive disclosure', () => {
    renderWithTheme(
      <VoiceEffectsPanel
        recording={createRecording()}
        processing={createProcessing()}
        elevenLabsAvailable
        browserCapabilities={{ webAudio: true, offlineAudio: true }}
      />,
    );

    expect(screen.getByText('Take review → Voice treatments')).toBeVisible();
    expect(screen.getByText('Browser compatibility details')).toBeVisible();
    expect(screen.getByText(/failed replacement never overwrites the original/)).not.toBeVisible();
  });

  it('keeps Original available while processing so restoration is immediate', async () => {
    const user = userEvent.setup();
    const processing = createProcessing();
    renderWithTheme(
      <VoiceEffectsPanel
        recording={createRecording('processing')}
        processing={processing}
        elevenLabsAvailable={false}
        browserCapabilities={{ webAudio: true, offlineAudio: true }}
      />,
    );

    const original = screen.getByRole('button', { name: 'Original' });
    expect(original).toBeEnabled();
    await user.click(original);
    expect(processing.restoreOriginal).toHaveBeenCalledTimes(1);
  });

  it('explains missing Web Audio and disables rendered effects', () => {
    renderWithTheme(
      <VoiceEffectsPanel
        recording={createRecording()}
        processing={createProcessing()}
        elevenLabsAvailable={false}
        browserCapabilities={{ webAudio: false, offlineAudio: false }}
      />,
    );

    expect(screen.getByText('Voice replacement unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Warm studio' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Original' })).toBeEnabled();
  });
});

describe('VoiceLibrary accessibility', () => {
  it('previews and applies only a voice returned by the saved library endpoint', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onSelect = vi.fn();
    voiceApi.listWorkspaceVoices.mockResolvedValue({
      ...emptyPage,
      voices: [
        {
          kind: 'workspace',
          voice: {
            voiceId: 'saved-voice',
            name: 'Saved Star',
            category: 'featured',
            description: 'Bright delivery',
            labels: {},
            previewAvailable: true,
          },
        },
      ],
      total: 1,
    });

    renderWithTheme(
      <VoiceLibrary
        disabled={false}
        clipDurationLabel="0:05"
        modelId="eleven_multilingual_sts_v2"
        onApply={onApply}
        onSelect={onSelect}
      />,
    );
    await waitFor(() => expect(voiceApi.listWorkspaceVoices).toHaveBeenCalledTimes(1));

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:voice-preview'),
      revokeObjectURL: vi.fn(),
    });
    await user.click(
      screen.getByRole('button', { name: 'Load Saved Star preview · contacts provider' }),
    );
    expect(await screen.findByLabelText('Listen to Saved Star preview')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select Saved Star' }));
    expect(onSelect).toHaveBeenCalledWith({
      voiceId: 'saved-voice',
      name: 'Saved Star',
      category: 'featured',
      description: 'Bright delivery',
      labels: {},
      previewAvailable: true,
    });
    expect(screen.getByText(/Clip duration: 0:05/)).toHaveTextContent(
      'using eleven_multilingual_sts_v2',
    );
    expect(
      screen.getByRole('button', { name: 'Apply Saved Star to recorded audio' }),
    ).toHaveAccessibleDescription(
      /may use provider credits.*Zero-retention eligibility is required/i,
    );
    await user.click(screen.getByRole('button', { name: 'Apply Saved Star to recorded audio' }));

    expect(onApply).toHaveBeenCalledWith({
      voiceId: 'saved-voice',
      name: 'Saved Star',
      category: 'featured',
      description: 'Bright delivery',
      labels: {},
      previewAvailable: true,
    });
    expect(screen.queryByText(/public library|import|add & apply/i)).not.toBeInTheDocument();
  });
});
