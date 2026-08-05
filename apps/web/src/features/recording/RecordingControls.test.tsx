// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { RecordingControls } from './RecordingControls';
import type { RecordingController, RecordingSource } from './types';

const recording = (
  lifecycle: RecordingController['lifecycle'],
  elapsedSeconds = 0,
): RecordingController =>
  ({
    lifecycle,
    elapsedSeconds,
  }) as RecordingController;

const source = ({ audio = true }: { audio?: boolean } = {}): RecordingSource =>
  ({
    videoSource: 'local',
    audioSource: audio ? 'microphone' : 'none',
    stream: {
      getVideoTracks: () => [
        {
          label: 'Studio camera',
          getSettings: () => ({ width: 1_920, height: 1_080, frameRate: 29.7 }),
        },
      ],
      getAudioTracks: () => (audio ? [{ label: 'Desk microphone' }] : []),
    } as unknown as MediaStream,
  }) satisfies RecordingSource;

const renderControls = (
  controller: RecordingController,
  recordingSource: RecordingSource | null,
  onOpenSettings = vi.fn(),
) => {
  render(
    <StudioDesignProvider>
      <RecordingControls
        recording={controller}
        source={recordingSource}
        mode="local"
        onOpenSettings={onOpenSettings}
      />
    </StudioDesignProvider>,
  );
  return onOpenSettings;
};

afterEach(cleanup);

describe('RecordingControls', () => {
  it('reports the selected tracks and measured capture geometry and opens settings', async () => {
    const user = userEvent.setup();
    const onOpenSettings = renderControls(recording('idle'), source());

    expect(screen.getAllByText('Studio camera').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Desk microphone').length).toBeGreaterThan(0);
    expect(screen.getByText('1920×1080 · 30fps')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open capture settings' }));
    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it('exposes an accessible timer and locks settings throughout stop finalization', () => {
    renderControls(recording('stopping', 65), source());

    expect(screen.getByRole('timer', { name: 'Recording elapsed time 1:05' })).toHaveTextContent(
      'Recording 1:05',
    );
    expect(screen.getByRole('button', { name: 'Open capture settings' })).toBeDisabled();
  });

  it('truthfully reports inactive devices without constructing a source', () => {
    renderControls(recording('idle'), null, undefined);
    expect(screen.getByText('Camera and microphone are off')).toBeInTheDocument();
  });
});
