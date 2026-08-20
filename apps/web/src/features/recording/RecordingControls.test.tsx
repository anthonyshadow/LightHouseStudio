// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { cameraAvailabilityNotices } from './cameraAvailability';
import { DESKTOP_CAPTURE_SETTINGS_PANEL_ID, RecordingControls } from './RecordingControls';
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

  it('rests with the docked settings collapsed, still showing devices and a blocked camera', () => {
    const onToggleDesktopSettings = vi.fn();
    render(
      <StudioDesignProvider>
        <RecordingControls
          recording={recording('idle')}
          source={null}
          mode="local"
          desktopSettings={<div data-testid="docked-capture-settings" />}
          onToggleDesktopSettings={onToggleDesktopSettings}
          captureIssues={cameraAvailabilityNotices({
            permissionState: 'denied',
            devicesState: 'ready',
            cameraCount: 0,
          }).filter((notice) => notice.blocking)}
        />
      </StudioDesignProvider>,
    );

    const toggle = screen.getByRole('button', { name: 'Capture settings', hidden: true });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', DESKTOP_CAPTURE_SETTINGS_PANEL_ID);
    // Mounted, so device discovery and the auto-apply guard survive the toggle.
    expect(screen.getByTestId('docked-capture-settings')).toBeInTheDocument();
    expect(document.getElementById(DESKTOP_CAPTURE_SETTINGS_PANEL_ID)).toHaveAttribute('hidden');
    expect(screen.getByText('Camera and microphone are off')).toBeInTheDocument();
    expect(screen.getByText('Camera permission blocked')).toBeInTheDocument();
    expect(screen.getByText('No camera available')).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(onToggleDesktopSettings).toHaveBeenCalledOnce();
  });

  it('hands the surface to the docked settings once they are open', () => {
    render(
      <StudioDesignProvider>
        <RecordingControls
          recording={recording('idle')}
          source={null}
          mode="local"
          desktopSettings={<div data-testid="docked-capture-settings" />}
          desktopSettingsExpanded
          onToggleDesktopSettings={vi.fn()}
          captureIssues={cameraAvailabilityNotices({
            permissionState: 'denied',
            devicesState: 'ready',
            cameraCount: 0,
          }).filter((notice) => notice.blocking)}
        />
      </StudioDesignProvider>,
    );

    expect(screen.getByRole('button', { name: 'Capture settings', hidden: true })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(document.getElementById(DESKTOP_CAPTURE_SETTINGS_PANEL_ID)).not.toHaveAttribute(
      'hidden',
    );
    // The open panel states each one in full; repeating the summary would say it twice.
    expect(screen.queryByText('Camera permission blocked')).not.toBeInTheDocument();
  });
});
