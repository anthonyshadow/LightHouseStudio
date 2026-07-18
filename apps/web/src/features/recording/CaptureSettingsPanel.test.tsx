// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCapturePreferences } from '../../orchestration/session/useCapturePreferences';
import { StudioDesignProvider } from '../../ui';
import { CaptureSettingsPanel } from './CaptureSettingsPanel';

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');

const installMediaDevices = (value: Partial<MediaDevices>) => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value,
  });
};

afterEach(() => {
  cleanup();
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
});

const device = (kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo => ({
  kind,
  deviceId,
  label,
  groupId: '',
  toJSON: () => ({}),
});

describe('CaptureSettingsPanel', () => {
  it('enumerates safely and applies session-only source and quality preferences', async () => {
    const user = userEvent.setup();
    const getUserMedia = vi.fn();
    const enumerateDevices = vi
      .fn()
      .mockResolvedValue([
        device('videoinput', 'camera-2', 'Studio camera'),
        device('audioinput', 'microphone-2', 'Desk microphone'),
      ]);
    installMediaDevices({
      getUserMedia,
      enumerateDevices,
      getSupportedConstraints: () => ({ width: true, height: true, frameRate: true }),
    });
    const onApply = vi.fn().mockResolvedValue(undefined);

    const Harness = () => {
      const controller = useCapturePreferences({ stream: null, onApply });
      return (
        <StudioDesignProvider>
          <CaptureSettingsPanel controller={controller} mode="local" />
        </StudioDesignProvider>
      );
    };
    render(<Harness />);

    await waitFor(() => expect(enumerateDevices).toHaveBeenCalledOnce());
    expect(getUserMedia).not.toHaveBeenCalled();
    await user.selectOptions(screen.getByLabelText('Camera'), 'camera-2');
    await user.selectOptions(screen.getByLabelText('Microphone'), 'microphone-2');
    await user.selectOptions(screen.getByLabelText('Local preview quality'), '1080p30');
    await user.click(screen.getByRole('button', { name: 'Apply settings' }));

    expect(onApply).toHaveBeenCalledWith({
      videoDeviceId: 'camera-2',
      audioDeviceId: 'microphone-2',
      profile: '1080p30',
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Apply settings' })).toBeDisabled();
  });

  it('shows provider-managed quality and active negotiated settings', () => {
    const video = {
      kind: 'video',
      label: 'FaceTime HD Camera',
      getSettings: () => ({ width: 1_280, height: 720, frameRate: 30 }),
    } as unknown as MediaStreamTrack;
    const audio = {
      kind: 'audio',
      label: 'MacBook Microphone',
      getSettings: () => ({}),
    } as unknown as MediaStreamTrack;
    const stream = {
      getVideoTracks: () => [video],
      getAudioTracks: () => [audio],
    } as unknown as MediaStream;
    installMediaDevices({
      enumerateDevices: vi.fn().mockResolvedValue([]),
      getSupportedConstraints: () => ({}),
    });

    const Harness = () => {
      const controller = useCapturePreferences({
        stream,
        onApply: vi.fn().mockResolvedValue(undefined),
      });
      return (
        <StudioDesignProvider>
          <CaptureSettingsPanel controller={controller} mode="lucy-2.5" />
        </StudioDesignProvider>
      );
    };
    render(<Harness />);

    expect(screen.getByText('Provider-managed quality')).toBeInTheDocument();
    expect(screen.getByText('FaceTime HD Camera')).toBeInTheDocument();
    expect(screen.getByText('MacBook Microphone')).toBeInTheDocument();
    expect(screen.getByText('1280×720 · 30 fps')).toBeInTheDocument();
  });
});
