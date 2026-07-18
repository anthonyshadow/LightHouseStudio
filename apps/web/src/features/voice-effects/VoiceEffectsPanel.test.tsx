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
  importPublicVoice: vi.fn(),
  listPublicVoices: vi.fn(),
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
    processed: null,
    presented: original,
    sidecar: {
      state: 'ready',
      blob: new Blob(['audio'], { type: 'audio/webm' }),
      mimeType: 'audio/webm',
      error: null,
    },
    processingState,
    processingError: null,
    elapsedSeconds: 2,
    downloaded: false,
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(original),
    discard: vi.fn(),
    markDownloaded: vi.fn(),
    beginProcessing: vi.fn(),
    cancelProcessing: vi.fn(),
    completeProcessing: vi.fn().mockReturnValue(original),
    failProcessing: vi.fn(),
    restoreOriginal: vi.fn(),
  };
};

const createProcessing = (): VoiceProcessingController => ({
  selection: { kind: 'local', effect: 'warm-studio' },
  applyLocal: vi.fn().mockResolvedValue(undefined),
  applyElevenLabs: vi.fn().mockResolvedValue(undefined),
  restoreOriginal: vi.fn(),
  cancel: vi.fn(),
});

const renderWithTheme = (component: ReactNode) =>
  render(<StudioDesignProvider>{component}</StudioDesignProvider>);

beforeEach(() => {
  vi.clearAllMocks();
  voiceApi.listWorkspaceVoices.mockResolvedValue(emptyPage);
  voiceApi.listPublicVoices.mockResolvedValue(emptyPage);
});

afterEach(cleanup);

describe('VoiceEffectsPanel', () => {
  it('does not browse voices until the user intentionally opens the disclosure', async () => {
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
    expect(voiceApi.listPublicVoices).not.toHaveBeenCalled();

    await user.click(screen.getByText(/Browse ElevenLabs voices/));

    await waitFor(() => expect(voiceApi.listWorkspaceVoices).toHaveBeenCalledTimes(1));
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
  it('uses item-specific import and preview names, then announces and focuses a successful import', async () => {
    const user = userEvent.setup();
    voiceApi.listPublicVoices.mockResolvedValue({
      ...emptyPage,
      voices: [
        {
          voiceId: 'shared-voice',
          name: 'Public Star',
          category: 'featured',
          description: 'Bright delivery',
          labels: {},
          previewAvailable: true,
          publicOwnerId: 'owner-1',
        },
      ],
      total: 1,
    });
    voiceApi.importPublicVoice.mockResolvedValue('workspace-voice');

    renderWithTheme(<VoiceLibrary disabled={false} onApply={vi.fn()} />);
    await waitFor(() => expect(voiceApi.listWorkspaceVoices).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole('button', { name: 'Public library' }));
    const importButton = await screen.findByRole('button', {
      name: 'Import Public Star into workspace',
    });
    expect(screen.getByLabelText('Listen to Public Star preview')).toBeInTheDocument();

    await user.click(importButton);

    expect(
      await screen.findByText('Public Star was imported and is selected for this take.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Apply Public Star to recorded audio' }),
    ).toHaveFocus();
  });
});
