// @vitest-environment jsdom

import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import type { RecordingArtifact, RecordingController } from '../recording/types';
import type { VoiceProcessingController } from '../voice-effects/types';
import { TakeDock } from './TakeDock';

const artifact = (): RecordingArtifact => {
  const media = new Blob(['take'], { type: 'video/webm' });
  return {
    id: 'take-1',
    media,
    objectUrl: 'blob:take-1',
    mimeType: media.type,
    filename: 'take.webm',
    sourceModeId: 'local',
    startedAt: '2026-07-18T18:32:00.000Z',
    durationMs: 2_500,
    sizeBytes: media.size,
  };
};

const recording = (): RecordingController => {
  const original = artifact();
  return {
    lifecycle: 'recorded',
    activeSource: null,
    metadata: {
      mode: 'local',
      startedAt: original.startedAt,
      width: 1_920,
      height: 1_080,
      frameRate: 29.97,
      videoSource: 'local',
      audioSource: 'microphone',
      videoSourceLabel: 'FaceTime HD Camera',
      audioSourceLabel: 'Studio Microphone',
    },
    original,
    visual: null,
    processed: null,
    presented: original,
    sidecar: { state: 'unavailable', blob: null, mimeType: null, error: null },
    recordingError: null,
    processingState: 'idle',
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

const processing: VoiceProcessingController = {
  selection: { kind: 'none' },
  applyLocal: vi.fn().mockResolvedValue(undefined),
  applyLocalTo: vi.fn().mockResolvedValue({ status: 'ready', artifact: artifact() }),
  applyElevenLabs: vi.fn().mockResolvedValue(undefined),
  applyElevenLabsTo: vi.fn().mockResolvedValue({ status: 'ready', artifact: artifact() }),
  restoreOriginal: vi.fn(),
  cancel: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TakeDock metadata', () => {
  it('leads with duration and resolution and keeps every other value one disclosure away', async () => {
    const user = userEvent.setup();
    render(
      <StudioDesignProvider>
        <TakeDock
          recording={recording()}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
        />
      </StudioDesignProvider>,
    );

    // Only what a review decision needs is inline.
    const summary = within(screen.getByRole('list', { name: 'Take summary' }));
    expect(summary.getByText('1920 × 1080')).toBeInTheDocument();
    expect(summary.queryByText('29.97 fps')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Take details' })).not.toBeVisible();

    await user.click(screen.getByText('Details'));

    // Nothing was deleted; it is one click away.
    const details = within(screen.getByRole('list', { name: 'Take details' }));
    expect(details.getByText('Local Camera')).toBeInTheDocument();
    expect(details.getByText('Video: FaceTime HD Camera')).toHaveAttribute(
      'title',
      'FaceTime HD Camera',
    );
    expect(details.getByText('Audio: Studio Microphone')).toBeInTheDocument();
    expect(details.getByText('29.97 fps')).toBeInTheDocument();
    expect(screen.queryByText('browser default format')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Recorded take playback')).not.toBeInTheDocument();
  });

  it('shows the panel title once, and keeps the heading as the region label', () => {
    render(
      <StudioDesignProvider>
        <TakeDock
          recording={recording()}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
        />
      </StudioDesignProvider>,
    );

    const heading = screen.getByRole('heading', { name: 'Latest take' });
    expect(heading).toHaveAttribute('id', 'take-heading');
    expect(screen.getByRole('region', { name: 'Latest take' })).toBeInTheDocument();
  });

  it('discards only after confirmation and delegates overlay closure after acceptance', async () => {
    const user = userEvent.setup();
    const controller = recording();
    const onCloseTake = vi.fn();

    render(
      <StudioDesignProvider>
        <TakeDock
          recording={controller}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
          onCloseTake={onCloseTake}
        />
      </StudioDesignProvider>,
    );

    const discard = screen.getByRole('button', { name: 'Discard' });
    await user.click(discard);
    await user.click(screen.getByRole('button', { name: 'Stay' }));
    expect(controller.discard).not.toHaveBeenCalled();
    expect(onCloseTake).not.toHaveBeenCalled();

    await user.click(await screen.findByRole('button', { name: 'Discard' }));
    await user.click(screen.getByRole('button', { name: 'Discard take' }));
    expect(controller.discard).toHaveBeenCalledOnce();
    expect(onCloseTake).toHaveBeenCalledOnce();
  });

  it('offers a retained uploaded-video workflow action when provided', async () => {
    const user = userEvent.setup();
    const onEditVideo = vi.fn();

    render(
      <StudioDesignProvider>
        <TakeDock
          recording={recording()}
          processing={processing}
          elevenLabsAvailable={false}
          view="take"
          onEditVideo={onEditVideo}
        />
      </StudioDesignProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'More actions for this take' }));
    await user.click(screen.getByRole('menuitem', { name: 'Edit video' }));
    expect(onEditVideo).toHaveBeenCalledOnce();
  });
});
