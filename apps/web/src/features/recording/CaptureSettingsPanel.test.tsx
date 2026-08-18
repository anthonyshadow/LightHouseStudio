// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCapturePreferences } from '../../orchestration/session/useCapturePreferences';
import { StudioDesignProvider } from '../../ui';
import { CaptureSettingsPanel } from './CaptureSettingsPanel';

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
const originalPermissions = Object.getOwnPropertyDescriptor(navigator, 'permissions');

const installMediaDevices = (value: Partial<MediaDevices>) => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value,
  });
};

afterEach(() => {
  // Capture choices persist, so a case that applies one must not seed the next.
  window.localStorage.clear();
  cleanup();
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices);
  else Reflect.deleteProperty(navigator, 'mediaDevices');
  if (originalPermissions) Object.defineProperty(navigator, 'permissions', originalPermissions);
  else Reflect.deleteProperty(navigator, 'permissions');
});

const device = (kind: MediaDeviceKind, deviceId: string, label: string): MediaDeviceInfo => ({
  kind,
  deviceId,
  label,
  groupId: '',
  toJSON: () => ({}),
});

const chooseOption = async (
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  option: string,
) => {
  await user.click(screen.getByRole('combobox', { name: label }));
  await user.click(
    within(screen.getByRole('listbox', { name: label })).getByRole('option', { name: option }),
  );
};

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
      const controller = useCapturePreferences({
        stream: null,
        ownerUserId: 'test-owner',
        onApply,
      });
      return (
        <StudioDesignProvider>
          <CaptureSettingsPanel controller={controller} mode="local" />
        </StudioDesignProvider>
      );
    };
    render(<Harness />);

    await waitFor(() => expect(enumerateDevices).toHaveBeenCalledOnce());
    expect(getUserMedia).not.toHaveBeenCalled();
    const landscape = screen.getByRole('radio', { name: 'Landscape · 16:9' });
    expect(landscape).toBeInTheDocument();
    expect(landscape.closest('label')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByRole('radio', { name: 'Portrait · 9:16' })).toBeInTheDocument();
    expect(screen.getByText('Landscape · 16:9')).toBeVisible();
    expect(screen.getByText('Portrait · 9:16')).toBeVisible();
    await chooseOption(user, 'Camera', 'Studio camera');
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    await chooseOption(user, 'Microphone', 'Desk microphone');
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(2));
    await user.click(screen.getByText('Portrait · 9:16'));
    await waitFor(() => expect(onApply).toHaveBeenCalledTimes(3));
    await chooseOption(user, 'Local preview quality', '1080p · 30 fps');

    await waitFor(() =>
      expect(onApply).toHaveBeenLastCalledWith({
        videoDeviceId: 'camera-2',
        audioDeviceId: 'microphone-2',
        profile: '1080p30',
        aspectRatio: '9:16',
      }),
    );
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Apply settings' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh media devices' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Discard capture setting changes' }),
    ).not.toBeInTheDocument();
  });

  it('renders every browser camera label, including varied Continuity Camera names', async () => {
    installMediaDevices({
      enumerateDevices: vi
        .fn()
        .mockResolvedValue([
          device('videoinput', 'built-in', 'FaceTime HD Camera'),
          device('videoinput', 'iphone', 'Creator’s iPhone Camera'),
          device('videoinput', 'continuity', 'Continuity Camera (Desk)'),
          device('videoinput', 'virtual', 'OBS Virtual Camera'),
        ]),
      getSupportedConstraints: () => ({}),
    });

    const Harness = () => {
      const controller = useCapturePreferences({
        stream: null,
        ownerUserId: 'test-owner',
        onApply: vi.fn().mockResolvedValue(undefined),
      });
      return (
        <StudioDesignProvider>
          <CaptureSettingsPanel controller={controller} mode="local" />
        </StudioDesignProvider>
      );
    };
    render(<Harness />);

    const camera = await screen.findByRole('combobox', { name: 'Camera' });
    await userEvent.click(camera);
    const cameraOptions = screen.getByRole('listbox', { name: 'Camera' });
    expect(cameraOptions).toHaveTextContent('FaceTime HD Camera');
    expect(cameraOptions).toHaveTextContent('Creator’s iPhone Camera');
    expect(cameraOptions).toHaveTextContent('Continuity Camera (Desk)');
    expect(cameraOptions).toHaveTextContent('OBS Virtual Camera');
    expect(screen.queryByText('Use a phone as a camera')).not.toBeInTheDocument();
  });

  it('restores the applied choice after an automatic live replacement fails', async () => {
    const user = userEvent.setup();
    installMediaDevices({
      enumerateDevices: vi.fn().mockResolvedValue([]),
      getSupportedConstraints: () => ({}),
    });
    const onApply = vi.fn().mockRejectedValue(new Error('replacement failed'));

    const Harness = () => {
      const controller = useCapturePreferences({
        stream: null,
        ownerUserId: 'test-owner',
        onApply,
      });
      return (
        <StudioDesignProvider>
          <CaptureSettingsPanel controller={controller} mode="local" />
        </StudioDesignProvider>
      );
    };
    render(<Harness />);

    await user.click(screen.getByText('Portrait · 9:16'));

    expect(await screen.findByText('Settings unchanged')).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Landscape · 16:9' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Portrait · 9:16' })).not.toBeChecked();
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('explains denied permission and an empty browser camera list without requesting access', async () => {
    const getUserMedia = vi.fn();
    installMediaDevices({
      getUserMedia,
      enumerateDevices: vi.fn().mockResolvedValue([]),
      getSupportedConstraints: () => ({}),
    });
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: vi.fn().mockResolvedValue({ state: 'denied' }) },
    });

    const Harness = () => {
      const controller = useCapturePreferences({
        stream: null,
        ownerUserId: 'test-owner',
        onApply: vi.fn().mockResolvedValue(undefined),
      });
      return (
        <StudioDesignProvider>
          <CaptureSettingsPanel controller={controller} mode="local" />
        </StudioDesignProvider>
      );
    };
    render(<Harness />);

    expect(await screen.findByText('Camera permission blocked')).toBeInTheDocument();
    expect(screen.getByText('No camera available')).toBeInTheDocument();
    expect(screen.getByText('Use a phone as a camera')).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
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
        ownerUserId: 'test-owner',
        onApply: vi.fn().mockResolvedValue(undefined),
      });
      return (
        <StudioDesignProvider>
          <CaptureSettingsPanel controller={controller} mode="lucy-latest" />
        </StudioDesignProvider>
      );
    };
    render(<Harness />);

    expect(screen.getByText('Provider-managed quality')).toBeInTheDocument();
    expect(screen.getByText('FaceTime HD Camera')).toBeInTheDocument();
    expect(screen.getByText('MacBook Microphone')).toBeInTheDocument();
    expect(screen.getByText('1280×720 · 30 fps')).toBeInTheDocument();
  });

  it('renders the complete settings workflow in the desktop sidebar presentation', () => {
    installMediaDevices({
      enumerateDevices: vi.fn().mockResolvedValue([]),
      getSupportedConstraints: () => ({}),
    });

    const Harness = () => {
      const controller = useCapturePreferences({
        stream: null,
        ownerUserId: 'test-owner',
        onApply: vi.fn().mockResolvedValue(undefined),
      });
      return (
        <StudioDesignProvider>
          <CaptureSettingsPanel controller={controller} mode="local" presentation="sidebar" />
        </StudioDesignProvider>
      );
    };
    render(<Harness />);

    expect(screen.getByRole('heading', { name: 'Capture settings' })).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Landscape · 16:9' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Portrait · 9:16' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh media devices' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Discard capture setting changes' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apply settings' })).not.toBeInTheDocument();
  });
});
