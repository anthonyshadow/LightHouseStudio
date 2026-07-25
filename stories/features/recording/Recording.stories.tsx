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
      <CaptureSettingsPanel
        controller={createCapturePreferencesController()}
        mode="local"
        onApplied={fn()}
      />
    </StoryColumn>
  ),
};
