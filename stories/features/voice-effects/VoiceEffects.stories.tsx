import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { VoiceEffectsPanel } from '@web/features/voice-effects/VoiceEffectsPanel';
import { VoiceLibrary } from '@web/features/voice-effects/VoiceLibrary';
import { VoiceList } from '@web/features/voice-effects/VoiceList';
import { VoicePreview } from '@web/features/voice-effects/VoicePreview';
import type { VoiceLibraryItem } from '@web/features/voice-effects/types';
import {
  createRecordedController,
  createVoiceProcessingController,
} from '../../fixtures/controllers';
import { StoryColumn, StorySection } from '../../support/StoryLayout';

const workspaceVoice = {
  kind: 'workspace',
  voice: {
    voiceId: 'voice-storybook',
    name: 'Warm Narrator',
    category: 'professional',
    description: 'Warm, measured delivery for editorial narration.',
    previewAvailable: false,
  },
} as VoiceLibraryItem;

const meta = {
  title: 'Features/Voice Effects/Voice Treatments',
  component: VoiceEffectsPanel,
  subcomponents: { VoiceList, VoiceLibrary, VoicePreview },
  args: {
    recording: createRecordedController(),
    processing: createVoiceProcessingController(),
    elevenLabsAvailable: true,
  },
  parameters: {
    docs: {
      description: {
        component:
          'Voice treatments keep restoration, local effects, cloud conversion, browser capability warnings, cancellation, saved-library browsing, preview, selection, and apply states explicit around the recorded take.',
      },
    },
  },
} satisfies Meta<typeof VoiceEffectsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LocalTreatments: Story = {
  args: {
    recording: createRecordedController(),
    processing: createVoiceProcessingController(),
    elevenLabsAvailable: true,
    browserCapabilities: { webAudio: true, offlineAudio: true },
  },
  render: (args) => (
    <StoryColumn width="48rem">
      <VoiceEffectsPanel {...args} />
    </StoryColumn>
  ),
};

export const BrowserCapabilityWarning: Story = {
  args: {
    recording: createRecordedController(),
    processing: createVoiceProcessingController({ selection: { kind: 'none' } }),
    elevenLabsAvailable: false,
    browserCapabilities: { webAudio: false, offlineAudio: false },
  },
  render: (args) => (
    <StoryColumn width="48rem">
      <VoiceEffectsPanel {...args} />
    </StoryColumn>
  ),
};

export const VoiceListSelection: Story = {
  render: () => (
    <StoryColumn width="42rem">
      <StorySection title="Saved library voices">
        <h3 css={{ margin: 0 }}>Available voices</h3>
        <VoiceList
          voices={[workspaceVoice]}
          selected={workspaceVoice}
          loading={false}
          onSelect={fn()}
          onPreviewError={fn()}
        />
      </StorySection>
    </StoryColumn>
  ),
};
