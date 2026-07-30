import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { TakeDock } from '@web/features/take-review/TakeDock';
import { TakeReviewActions } from '@web/features/take-review/TakeReviewActions';
import {
  createRecordedController,
  createVoiceProcessingController,
} from '../../fixtures/controllers';
import { StoryColumn, StorySection } from '../../support/StoryLayout';

const meta = {
  title: 'Features/Take Review/Take Dock',
  component: TakeDock,
  subcomponents: { TakeReviewActions },
  args: {
    recording: createRecordedController(),
    processing: createVoiceProcessingController(),
    elevenLabsAvailable: true,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Take review shows immutable capture metadata and temporary file details, then gates download, discard, release, original restoration, and voice treatment actions around the current in-memory artifact.',
      },
    },
  },
} satisfies Meta<typeof TakeDock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LatestTake: Story = {
  args: {
    recording: createRecordedController(),
    processing: createVoiceProcessingController(),
    elevenLabsAvailable: true,
    browserCapabilities: { webAudio: true, offlineAudio: true },
    view: 'take',
    onCloseTake: fn(),
    onOpenVoiceTreatments: fn(),
  },
  render: (args) => (
    <StoryColumn width="58rem">
      <TakeDock {...args} />
    </StoryColumn>
  ),
};

export const DownloadStarted: Story = {
  args: {
    ...LatestTake.args,
    recording: createRecordedController({ downloaded: true }),
  },
  render: (args) => (
    <StoryColumn width="58rem">
      <TakeDock {...args} />
    </StoryColumn>
  ),
};

export const CompactControlBarActions: Story = {
  render: () => (
    <StoryColumn width="42rem">
      <StorySection title="Playback actions">
        <TakeReviewActions
          recording={createRecordedController({ downloaded: true })}
          presentation="control-bar"
          onCloseTake={fn()}
          onOpenVoiceTreatments={fn()}
        />
      </StorySection>
    </StoryColumn>
  ),
};
