// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { RecordingControls } from './RecordingControls';
import type { RecordingController, RecordingSource } from './types';

const source: RecordingSource = {
  stream: {} as MediaStream,
  videoSource: 'local',
  audioSource: 'microphone',
};

const createRecording = (
  lifecycle: RecordingController['lifecycle'],
  recordingError: string | null = null,
): RecordingController => ({
  lifecycle,
  activeSource: null,
  metadata: null,
  original: null,
  processed: null,
  presented: null,
  sidecar: { state: 'unavailable', blob: null, mimeType: null, error: null },
  recordingError,
  processingState: 'idle',
  processingError: null,
  elapsedSeconds: 3,
  downloaded: false,
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(null),
  restorePersistedOriginal: vi.fn(),
  discard: vi.fn(),
  markDownloaded: vi.fn(),
  beginProcessing: vi.fn(),
  cancelProcessing: vi.fn(),
  completeProcessing: vi.fn(),
  failProcessing: vi.fn(),
  restoreOriginal: vi.fn(),
});

const controls = (recording: RecordingController): ReactNode => (
  <StudioDesignProvider>
    <RecordingControls
      recording={recording}
      source={source}
      mode="local"
      modelOutputReady={false}
      supported
      onStop={vi.fn().mockResolvedValue(undefined)}
    />
  </StudioDesignProvider>
);

afterEach(cleanup);

describe('RecordingControls accessibility', () => {
  it('keeps lifecycle notices out of the fixed control strip and focuses Finish', async () => {
    const view = render(controls(createRecording('idle')));

    view.rerender(controls(createRecording('recording')));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Finish take' })).toHaveFocus());
    expect(screen.queryByText('Recording in progress')).not.toBeInTheDocument();

    view.rerender(controls(createRecording('stopping')));
    expect(screen.queryByText('Finalizing your take…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finish take' })).toBeDisabled();

    view.rerender(controls(createRecording('recorded')));
    expect(screen.queryByText('Take ready')).not.toBeInTheDocument();
  });

  it('leaves recording errors to the stage notice layer', () => {
    const view = render(controls(createRecording('idle')));

    view.rerender(controls(createRecording('error', 'The video source ended unexpectedly.')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('The video source ended unexpectedly.')).not.toBeInTheDocument();
  });

  it('handles Space only from a safe non-editable page context', async () => {
    const recording = createRecording('idle');
    const onStop = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <StudioDesignProvider>
        <RecordingControls
          recording={recording}
          source={source}
          mode="local"
          modelOutputReady={false}
          supported
          onStop={onStop}
        />
        <textarea aria-label="Direction" />
      </StudioDesignProvider>,
    );

    fireEvent.keyDown(document.body, { code: 'Space' });
    await waitFor(() => expect(recording.start).toHaveBeenCalledOnce());

    view.rerender(
      <StudioDesignProvider>
        <RecordingControls
          recording={createRecording('recording')}
          source={source}
          mode="local"
          modelOutputReady={false}
          supported
          onStop={onStop}
        />
        <textarea aria-label="Direction" />
      </StudioDesignProvider>,
    );
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Direction' }), { code: 'Space' });
    expect(onStop).not.toHaveBeenCalled();

    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.append(modal);
    fireEvent.keyDown(document.body, { code: 'Space' });
    expect(onStop).not.toHaveBeenCalled();
    modal.remove();

    fireEvent.keyDown(document.body, { code: 'Space' });
    await waitFor(() => expect(onStop).toHaveBeenCalledOnce());
  });
});
