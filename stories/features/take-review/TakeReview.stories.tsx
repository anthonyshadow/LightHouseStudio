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
  title: 'Features/Take Review/Review Panel',
  component: TakeDock,
  subcomponents: { TakeReviewActions },
  args: {
    recording: createRecordedController(),
    processing: createVoiceProcessingController(),
    elevenLabsAvailable: true,
    // Required since the dock stopped defaulting a view no caller used.
    view: 'take',
  },
  parameters: {
    docs: {
      description: {
        component:
          'Take review shows immutable capture metadata and temporary file details, then gates save, discard, close, original restoration, and voice treatment actions around the current in-memory artifact.',
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
    onSaveVideo: fn(),
  },
  render: (args) => (
    <StoryColumn width="58rem">
      <TakeDock {...args} />
    </StoryColumn>
  ),
};

export const SavedToGallery: Story = {
  render: () => {
    const recording = createRecordedController();
    return (
      <StoryColumn width="58rem">
        <TakeDock
          recording={recording}
          processing={createVoiceProcessingController()}
          elevenLabsAvailable
          browserCapabilities={{ webAudio: true, offlineAudio: true }}
          view="take"
          onCloseTake={fn()}
          onOpenVoiceTreatments={fn()}
          onSaveVideo={fn()}
          saveVideoState={{
            status: 'saved',
            artifactId: recording.presented!.id,
            video: {} as never,
          }}
        />
      </StoryColumn>
    );
  },
};

export const CompactControlBarActions: Story = {
  render: () => {
    const recording = createRecordedController();
    return (
      <StoryColumn width="42rem">
        <StorySection title="Playback actions">
          <TakeReviewActions
            recording={recording}
            presentation="control-bar"
            onCloseTake={fn()}
            onOpenVoiceTreatments={fn()}
            onSaveVideo={fn()}
            saveVideoState={{
              status: 'saved',
              artifactId: recording.presented!.id,
              video: {} as never,
            }}
          />
        </StorySection>
      </StoryColumn>
    );
  },
};
