// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RecordingArtifact } from '../recording';
import type { RecordingController } from '../recording/types';
import type { VoiceProcessingController } from './types';
import { StudioDesignProvider } from '../../ui';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';

const voiceApi = vi.hoisted(() => ({
  fetchVoicePreview: vi.fn(),
  listWorkspaceVoices: vi.fn(),
  listSharedVoices: vi.fn(),
  saveSharedVoice: vi.fn(),
  removeWorkspaceVoice: vi.fn(),
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
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(original),
    restorePersistedOriginal: vi.fn().mockReturnValue(original),
    presentRemoteOriginal: vi.fn().mockReturnValue(original),
    replaceSource: vi.fn().mockReturnValue(original),
    discard: vi.fn(),
    beginProcessing: vi.fn(),
    cancelProcessing: vi.fn(),
    completeVisualProcessing: vi.fn().mockReturnValue(original),
    completeProcessing: vi.fn().mockReturnValue(original),
    failProcessing: vi.fn(),
    repairPresentedObjectUrl: vi.fn().mockReturnValue(false),
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
  render(
    <RemoteStateTestProvider>
      <StudioDesignProvider>{component}</StudioDesignProvider>
    </RemoteStateTestProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  voiceApi.listWorkspaceVoices.mockResolvedValue(emptyPage);
  voiceApi.listSharedVoices.mockResolvedValue({ voices: [], hasMore: false, page: 0, total: 0 });
  voiceApi.saveSharedVoice.mockResolvedValue({ status: 'saved', voiceId: 'shared-voice' });
  voiceApi.removeWorkspaceVoice.mockResolvedValue({ status: 'removed', voiceId: 'saved-voice' });
  voiceApi.fetchVoicePreview.mockResolvedValue(new Blob(['preview'], { type: 'audio/mpeg' }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('VoiceEffectsPanel', () => {
  it('does not browse voices until the user intentionally opens the integrated library', async () => {
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
    await user.click(screen.getByRole('button', { name: /Saved AI Voice/u }));

    expect(screen.getByRole('heading', { name: 'Saved Voices' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Browse Voices' })).toBeVisible();
    expect(screen.getByText(/provider sample only/u)).toBeVisible();
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

    expect(screen.getByText(/Compatibility & Help/u)).toBeVisible();
    expect(screen.getByText(/AI voices require ElevenLabs/u)).not.toBeVisible();
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

    expect(screen.getByText('Voice unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Warm studio' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Original' })).toBeEnabled();
  });
});

describe('VoiceLibrary accessibility', () => {
  it('previews and applies only a voice returned by the saved library endpoint', async () => {
    const user = userEvent.setup();
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
            traits: {
              language: 'en',
              gender: 'female',
              age: 'young',
              accent: 'Canadian',
              useCase: 'narration',
              descriptive: 'bright',
            },
            previewAvailable: true,
            removable: true,
          },
        },
      ],
      total: 1,
    });

    renderWithTheme(<VoiceLibrary disabled={false} onSelect={onSelect} />);
    await waitFor(() => expect(voiceApi.listWorkspaceVoices).toHaveBeenCalledTimes(1));

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:voice-preview'),
      revokeObjectURL: vi.fn(),
    });
    await user.click(await screen.findByRole('button', { name: 'Preview Saved Star' }));
    expect(await screen.findByLabelText('Listen to Saved Star preview')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select Saved Star' }));
    expect(onSelect).toHaveBeenCalledWith({
      voiceId: 'saved-voice',
      name: 'Saved Star',
      category: 'featured',
      description: 'Bright delivery',
      labels: {},
      traits: {
        language: 'en',
        gender: 'female',
        age: 'young',
        accent: 'Canadian',
        useCase: 'narration',
        descriptive: 'bright',
      },
      previewAvailable: true,
      removable: true,
    });
    expect(screen.getByText('Selected')).toBeVisible();
    expect(screen.queryByText(/public library|import|add & apply/i)).not.toBeInTheDocument();
  });

  it('names the action for the hosting surface and explains a disabled library', async () => {
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
            traits: {
              language: 'en',
              gender: 'female',
              age: 'young',
              accent: 'Canadian',
              useCase: 'narration',
              descriptive: 'bright',
            },
            previewAvailable: true,
            removable: true,
          },
        },
      ],
      total: 1,
    });

    const { unmount } = renderWithTheme(
      <VoiceLibrary disabled={false} selectLabel="Use in Studio" onSelect={vi.fn()} />,
    );

    expect(await screen.findByRole('button', { name: 'Use in Studio Saved Star' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Remove Saved Star from Saved Voices' }),
    ).toBeEnabled();
    unmount();

    renderWithTheme(
      <VoiceLibrary
        disabled
        selectLabel="Use in Studio"
        unavailableReason="Voice actions need a configured provider."
        onSelect={vi.fn()}
      />,
    );

    expect(await screen.findByRole('button', { name: 'Use in Studio Saved Star' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Remove Saved Star from Saved Voices' }),
    ).toBeDisabled();
    expect(screen.getByText('Voice actions need a configured provider.')).toBeVisible();
  });

  it('browses eligible voices and prevents duplicate adds after a successful save', async () => {
    const user = userEvent.setup();
    voiceApi.listSharedVoices.mockResolvedValue({
      voices: [
        {
          kind: 'shared',
          voice: {
            voiceId: 'catalog-voice',
            publicOwnerId: 'owner-one',
            name: 'Catalog Star',
            category: 'professional',
            description: 'Warm narration',
            labels: { language: 'en' },
            traits: {
              language: 'en',
              gender: 'female',
              age: 'middle-aged',
              accent: 'American',
              useCase: 'narration',
              descriptive: 'warm',
            },
            previewAvailable: true,
            saved: false,
          },
        },
      ],
      hasMore: false,
      page: 0,
      total: 1,
    });
    voiceApi.saveSharedVoice.mockResolvedValue({ status: 'saved', voiceId: 'catalog-voice' });

    renderWithTheme(<VoiceLibrary disabled={false} onSelect={vi.fn()} />);
    await waitFor(() => expect(voiceApi.listWorkspaceVoices).toHaveBeenCalledOnce());
    await user.click(screen.getByRole('button', { name: 'Browse Voices' }));
    await waitFor(() => expect(voiceApi.listSharedVoices).toHaveBeenCalledOnce());

    await user.click(screen.getByRole('button', { name: 'Add Catalog Star to Saved Voices' }));
    await waitFor(() => expect(voiceApi.saveSharedVoice).toHaveBeenCalledOnce());
    expect(screen.getByRole('button', { name: 'Catalog Star is already saved' })).toBeDisabled();
    expect(screen.getByText('Catalog Star was added to Saved Voices.')).toBeVisible();
  });

  it('confirms eligible removal and blocks removal of the selected voice', async () => {
    const user = userEvent.setup();
    const removablePage = {
      ...emptyPage,
      voices: [
        {
          kind: 'workspace',
          voice: {
            voiceId: 'saved-voice',
            name: 'Saved Star',
            category: 'professional',
            description: 'Warm narration',
            labels: {},
            traits: {
              language: 'en',
              gender: 'female',
              age: 'middle-aged',
              accent: 'American',
              useCase: 'narration',
              descriptive: 'warm',
            },
            previewAvailable: true,
            removable: true,
          },
        },
      ],
      total: 1,
    };
    voiceApi.listWorkspaceVoices.mockResolvedValue(removablePage);

    const first = renderWithTheme(<VoiceLibrary disabled={false} onSelect={vi.fn()} />);
    await screen.findByRole('button', { name: 'Remove Saved Star from Saved Voices' });
    await user.click(screen.getByRole('button', { name: 'Remove Saved Star from Saved Voices' }));
    expect(screen.getByRole('heading', { name: 'Remove saved voice?' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Remove voice' }));
    await waitFor(() =>
      expect(voiceApi.removeWorkspaceVoice).toHaveBeenCalledWith(
        'saved-voice',
        expect.any(AbortSignal),
      ),
    );
    first.unmount();

    renderWithTheme(
      <VoiceLibrary disabled={false} selectedVoiceId="saved-voice" onSelect={vi.fn()} />,
    );
    expect(
      await screen.findByRole('button', {
        name: 'Select Original or another voice before removing Saved Star',
      }),
    ).toBeDisabled();
  });
});
