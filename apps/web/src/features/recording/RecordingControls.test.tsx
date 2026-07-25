// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { RecordingAction } from './RecordingAction';
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
    <RecordingControls recording={recording} source={source} mode="local" />
  </StudioDesignProvider>
);

afterEach(cleanup);

describe('RecordingControls accessibility', () => {
  it('keeps recording actions out of the device information strip', () => {
    const view = render(controls(createRecording('idle')));
    expect(screen.queryByRole('button', { name: 'Record' })).not.toBeInTheDocument();

    view.rerender(controls(createRecording('recording')));
    expect(screen.getByRole('timer')).toHaveTextContent('Recording 0:03');
    expect(screen.queryByRole('button', { name: 'Stop recording' })).not.toBeInTheDocument();
    expect(screen.queryByText('Recording in progress')).not.toBeInTheDocument();

    view.rerender(controls(createRecording('stopping')));
    expect(screen.queryByText('Finalizing your take…')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop recording' })).not.toBeInTheDocument();

    view.rerender(controls(createRecording('recorded')));
    expect(screen.queryByText('Take ready')).not.toBeInTheDocument();
  });

  it('leaves recording errors to the stage notice layer', () => {
    const view = render(controls(createRecording('idle')));

    view.rerender(controls(createRecording('error', 'The video source ended unexpectedly.')));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText('The video source ended unexpectedly.')).not.toBeInTheDocument();
  });

  it('keeps the moved action keyboard shortcut limited to a safe non-editable context', async () => {
    const recording = createRecording('idle');
    const onStop = vi.fn().mockResolvedValue(undefined);
    const view = render(
      <StudioDesignProvider>
        <RecordingAction
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
        <RecordingAction
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
