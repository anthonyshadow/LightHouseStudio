import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CaptureSettingsPanel } from '@web/features/recording/CaptureSettingsPanel';
import { RecordingAction } from '@web/features/recording/RecordingAction';
import { RecordingControls } from '@web/features/recording/RecordingControls';
import {
  createCapturePreferencesController,
  createRecordingController,
  createRecordingSource,
} from '../../fixtures/controllers';
import { StoryColumn, StorySection } from '../../support/StoryLayout';

const meta = {
  title: 'Features/Recording/Capture Controls',
  component: RecordingControls,
  subcomponents: { RecordingAction, CaptureSettingsPanel },
  args: {
    recording: createRecordingController(),
    source: createRecordingSource(),
    mode: 'local',
  },
  parameters: {
    docs: {
      description: {
        component:
          'Recording controls expose truthful active-source metadata, elapsed recording state, the global Space shortcut action, and explicit device/quality preferences without starting browser media.',
      },
    },
  },
} satisfies Meta<typeof RecordingControls>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadyToRecord: Story = {
  args: {
    recording: createRecordingController(),
    source: createRecordingSource(),
    mode: 'local',
    onOpenSettings: fn(),
  },
  render: (args) => (
    <StoryColumn width="48rem">
      <RecordingControls {...args} />
      <StorySection title="Primary record action">
        <RecordingAction
          recording={args.recording}
          source={args.source}
          mode={args.mode}
          modelOutputReady
          supported
          onStop={fn(() => Promise.resolve())}
        />
      </StorySection>
    </StoryColumn>
  ),
};

export const RecordingInProgress: Story = {
  args: {
    recording: createRecordingController({ lifecycle: 'recording', elapsedSeconds: 47 }),
    source: createRecordingSource(),
    mode: 'local',
  },
  render: (args) => (
    <StoryColumn width="48rem">
      <RecordingControls {...args} />
      <RecordingAction
        recording={args.recording}
        source={args.source}
        mode={args.mode}
        modelOutputReady
        supported
        onStop={fn(() => Promise.resolve())}
      />
    </StoryColumn>
  ),
};

export const DeviceAndQualitySettings: Story = {
  render: () => (
    <StoryColumn width="42rem">
      <CaptureSettingsPanel controller={createCapturePreferencesController()} mode="local" />
    </StoryColumn>
  ),
};

export const PhoneCameraAvailable: Story = {
  render: () => (
    <StoryColumn width="42rem">
      <CaptureSettingsPanel
        controller={createCapturePreferencesController({
          draft: {
            videoDeviceId: 'iphone-camera',
            audioDeviceId: 'microphone-1',
            profile: '1080p30',
            aspectRatio: '9:16',
          },
          applied: {
            videoDeviceId: 'iphone-camera',
            audioDeviceId: 'microphone-1',
            profile: '1080p30',
            aspectRatio: '9:16',
          },
          effectiveApplied: {
            videoDeviceId: 'iphone-camera',
            audioDeviceId: 'microphone-1',
            profile: '1080p30',
            aspectRatio: '9:16',
          },
          cameraDevices: [
            { deviceId: 'camera-1', label: 'FaceTime HD Camera' },
            { deviceId: 'iphone-camera', label: 'Creator’s iPhone Camera' },
            { deviceId: 'camera-3', label: 'OBS Virtual Camera' },
          ],
          hasPendingChanges: false,
          actualSettings: {
            video: {
              label: 'Creator’s iPhone Camera',
              deviceId: 'iphone-camera',
              width: 1_080,
              height: 1_920,
              frameRate: 30,
            },
            audio: { label: 'Creator Microphone', deviceId: 'microphone-1' },
          },
        })}
        mode="local"
      />
    </StoryColumn>
  ),
};

export const CameraPermissionNotGranted: Story = {
  render: () => (
    <StoryColumn width="42rem">
      <CaptureSettingsPanel
        controller={createCapturePreferencesController({
          draft: {
            videoDeviceId: null,
            audioDeviceId: null,
            profile: '720p30',
            aspectRatio: '16:9',
          },
          applied: {
            videoDeviceId: null,
            audioDeviceId: null,
            profile: '720p30',
            aspectRatio: '16:9',
          },
          effectiveApplied: {
            videoDeviceId: null,
            audioDeviceId: null,
            profile: '720p30',
            aspectRatio: '16:9',
          },
          cameraDevices: [{ deviceId: 'camera-1', label: 'Camera 1' }],
          microphoneDevices: [{ deviceId: 'microphone-1', label: 'Microphone 1' }],
          cameraPermissionState: 'prompt',
          hasPendingChanges: false,
          actualSettings: { video: null, audio: null },
        })}
        mode="local"
      />
    </StoryColumn>
  ),
};

export const PreferredCameraUnavailable: Story = {
  render: () => (
    <StoryColumn width="42rem">
      <CaptureSettingsPanel
        controller={createCapturePreferencesController({
          draft: {
            videoDeviceId: 'iphone-camera',
            audioDeviceId: 'microphone-1',
            profile: '720p30',
            aspectRatio: '16:9',
          },
          applied: {
            videoDeviceId: 'iphone-camera',
            audioDeviceId: 'microphone-1',
            profile: '720p30',
            aspectRatio: '16:9',
          },
          effectiveApplied: {
            videoDeviceId: null,
            audioDeviceId: 'microphone-1',
            profile: '720p30',
            aspectRatio: '16:9',
          },
          cameraDevices: [{ deviceId: 'camera-1', label: 'FaceTime HD Camera' }],
          videoFallbackNotice:
            'The previously selected camera is unavailable. The default camera will be used until it reconnects.',
          hasPendingChanges: false,
          actualSettings: {
            video: {
              label: 'FaceTime HD Camera',
              deviceId: 'camera-1',
              width: 1_280,
              height: 720,
              frameRate: 30,
            },
            audio: { label: 'Creator Microphone', deviceId: 'microphone-1' },
          },
        })}
        mode="local"
      />
    </StoryColumn>
  ),
};
