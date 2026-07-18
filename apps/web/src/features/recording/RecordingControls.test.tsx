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
  processingError: string | null = null,
): RecordingController => ({
  lifecycle,
  activeSource: null,
  metadata: null,
  original: null,
  processed: null,
  presented: null,
  sidecar: { state: 'unavailable', blob: null, mimeType: null, error: null },
  processingState: 'idle',
  processingError,
  elapsedSeconds: 3,
  downloaded: false,
  start: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn().mockResolvedValue(null),
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
  it('announces each capture transition and hands focus to its relevant control or status', async () => {
    const view = render(controls(createRecording('idle')));

    view.rerender(controls(createRecording('recording')));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Finish take' })).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent('Recording in progress');
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');

    view.rerender(controls(createRecording('stopping')));
    const finalizingTarget = screen
      .getByText('Finalizing your take…')
      .closest<HTMLElement>('[tabindex="-1"]');
    await waitFor(() => expect(finalizingTarget).toHaveFocus());

    view.rerender(controls(createRecording('recorded')));
    const readyTarget = screen.getByText('Take ready').closest<HTMLElement>('[tabindex="-1"]');
    await waitFor(() => expect(readyTarget).toHaveFocus());
    expect(screen.getByRole('button', { name: 'Record a take' })).toHaveAttribute(
      'aria-describedby',
      'recording-state',
    );
  });

  it('moves focus to an assertive error without hiding the actionable message', async () => {
    const view = render(controls(createRecording('idle')));

    view.rerender(controls(createRecording('error', 'The video source ended unexpectedly.')));
    const alert = screen.getByRole('alert');
    const alertTarget = alert.closest<HTMLElement>('[tabindex="-1"]');

    await waitFor(() => expect(alertTarget).toHaveFocus());
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    expect(alert).toHaveTextContent('The video source ended unexpectedly.');
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
