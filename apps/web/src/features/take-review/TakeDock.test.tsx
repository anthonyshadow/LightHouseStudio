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
    processed: null,
    presented: original,
    sidecar: { state: 'unavailable', blob: null, mimeType: null, error: null },
    recordingError: null,
    processingState: 'idle',
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

const processing: VoiceProcessingController = {
  selection: { kind: 'none' },
  applyLocal: vi.fn().mockResolvedValue(undefined),
  applyElevenLabs: vi.fn().mockResolvedValue(undefined),
  restoreOriginal: vi.fn(),
  cancel: vi.fn(),
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('TakeDock metadata', () => {
  it('shows only truthful captured values reported by the recording controller', () => {
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

    const metadata = within(screen.getByRole('list', { name: 'Capture metadata' }));
    expect(metadata.getByText('Local Camera')).toBeInTheDocument();
    expect(metadata.getByText('Video: FaceTime HD Camera')).toHaveAttribute(
      'title',
      'FaceTime HD Camera',
    );
    expect(metadata.getByText('Audio: Studio Microphone')).toBeInTheDocument();
    expect(metadata.getByText('1920 × 1080')).toBeInTheDocument();
    expect(metadata.getByText('29.97 fps')).toBeInTheDocument();
    expect(screen.queryByText('browser default format')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Recorded take playback')).not.toBeInTheDocument();
  });

  it('discards only after confirmation and delegates overlay closure after acceptance', async () => {
    const user = userEvent.setup();
    const controller = recording();
    const onCloseTake = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);

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
    expect(controller.discard).not.toHaveBeenCalled();
    expect(onCloseTake).not.toHaveBeenCalled();

    await user.click(discard);
    expect(controller.discard).toHaveBeenCalledOnce();
    expect(onCloseTake).toHaveBeenCalledOnce();
  });
});
