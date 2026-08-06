import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { AIExperienceChooser } from '@web/studio/AIExperienceChooser';
import { StudioHeader } from '@web/studio/StudioHeader';
import { StudioSessionControlBar } from '@web/studio/StudioSessionControlBar';
import {
  createRecordedController,
  createRecordingController,
  createRecordingSource,
  createSessionController,
  emptyMediaStream,
} from '../fixtures/controllers';
import { Button } from '@web/ui';
import { StoryColumn, StorySection } from '../support/StoryLayout';

const headerAvailability = {
  decart: true,
  elevenLabs: true,
  elevenLabsModel: 'eleven_multilingual_v2',
  referenceImages: true,
};

const browserCapabilities = {
  secureContext: true,
  mediaDevices: true,
  mediaRecorder: true,
  webAudio: true,
  offlineAudio: true,
};

const headerUser = {
  id: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
  login: 'demo@lightframe.local',
  username: 'demo',
  email: 'demo@lightframe.local',
  displayName: 'Lightframe Demo',
  avatarUrl: null,
  planId: 'free' as const,
  role: 'user' as const,
  status: 'active' as const,
  createdAt: '2026-08-05T00:00:00.000Z',
  updatedAt: '2026-08-05T00:00:00.000Z',
  lastLoginAt: '2026-08-05T00:00:00.000Z',
};

const meta = {
  title: 'Studio/Chrome',
  component: StudioHeader,
  args: {
    availability: headerAvailability,
    browser: browserCapabilities,
    capabilityState: 'ready',
    user: headerUser,
    onOpenVideos: fn(),
    onOpenCharacters: fn(),
    onOpenOutfits: fn(),
    onLogout: fn(),
  },
  parameters: {
    docs: {
      description: {
        component:
          'Studio chrome covers the brand, mutually exclusive system/account popovers, the fullscreen AI experience chooser, and the context-sensitive stage control bar for idle, local preview, AI, recording, and take-review states.',
      },
    },
  },
} satisfies Meta<typeof StudioHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

const HeaderHarness = () => {
  return (
    <StoryColumn width="86rem">
      <StudioHeader
        availability={headerAvailability}
        browser={browserCapabilities}
        capabilityState="ready"
        user={headerUser}
        onOpenVideos={fn()}
        onOpenCharacters={fn()}
        onOpenOutfits={fn()}
        onLogout={fn()}
      />
    </StoryColumn>
  );
};

export const HeaderReady: Story = {
  render: () => <HeaderHarness />,
};

const ChooserHarness = ({ ready }: { ready: boolean }) => {
  const [open, setOpen] = useState(false);
  return (
    <StoryColumn width="42rem">
      <StorySection title="AI experience launcher">
        <Button variant="primary" onClick={() => setOpen(true)}>
          Start AI
        </Button>
      </StorySection>
      <AIExperienceChooser
        open={open}
        decartAvailable
        capabilityState="ready"
        activeCharacterName={ready ? 'Midnight culture host' : undefined}
        characterReady={ready}
        virtualTryOnReady={false}
        onClose={() => setOpen(false)}
        onStartCharacter={fn()}
        onCreateCharacter={fn()}
        onChooseSavedCharacter={fn()}
        onStartVirtualTryOn={fn()}
        onConfigureVirtualTryOn={fn()}
        onChooseSavedVirtualTryOn={fn()}
      />
    </StoryColumn>
  );
};

export const ExperienceChooser: Story = {
  render: () => <ChooserHarness ready={false} />,
};

export const ExperienceChooserWithCharacter: Story = {
  render: () => <ChooserHarness ready />,
};

const controlBarFrame = (children: React.ReactNode) => (
  <StoryColumn width="78rem">
    <div
      css={(theme) => ({
        position: 'relative',
        height: '20rem',
        border: `1px solid ${theme.colors.border}`,
        borderRadius: theme.radii.large,
        background: theme.gradients.stageIdle,
      })}
    >
      {children}
    </div>
  </StoryColumn>
);

export const IdleControlBar: Story = {
  render: () =>
    controlBarFrame(
      <StudioSessionControlBar
        session={createSessionController()}
        recording={createRecordingController()}
        recordingMode="local"
        recordingSource={null}
        recordingSupported
        reviewingTake={false}
        onStopRecording={fn(() => Promise.resolve())}
        onCloseTakeReview={fn()}
        onOpenVoiceTreatments={fn()}
        onChooseAiExperience={fn()}
        onChangeExperience={fn()}
      />,
    ),
};

export const LocalPreviewControlBar: Story = {
  render: () =>
    controlBarFrame(
      <StudioSessionControlBar
        session={createSessionController('local', {
          lifecycle: 'ready',
          localStream: emptyMediaStream(),
          displayStream: emptyMediaStream(),
        })}
        recording={createRecordingController()}
        recordingMode="local"
        recordingSource={createRecordingSource()}
        recordingSupported
        reviewingTake={false}
        onStopRecording={fn(() => Promise.resolve())}
        onCloseTakeReview={fn()}
        onOpenVoiceTreatments={fn()}
        onChooseAiExperience={fn()}
        onChangeExperience={fn()}
      />,
    ),
};

export const LiveCharacterControlBar: Story = {
  render: () =>
    controlBarFrame(
      <StudioSessionControlBar
        session={createSessionController('lucy-latest', {
          lifecycle: 'generating',
          localStream: emptyMediaStream(),
          remoteStream: emptyMediaStream(),
          displayStream: emptyMediaStream(),
          transformedVideoUsable: true,
        })}
        experienceLabel="Midnight culture host"
        recording={createRecordingController()}
        recordingMode="lucy-latest"
        recordingSource={createRecordingSource()}
        recordingSupported
        reviewingTake={false}
        onStopRecording={fn(() => Promise.resolve())}
        onCloseTakeReview={fn()}
        onOpenVoiceTreatments={fn()}
        onChooseAiExperience={fn()}
        onChangeExperience={fn()}
      />,
    ),
};

export const TakeReviewControlBar: Story = {
  render: () =>
    controlBarFrame(
      <StudioSessionControlBar
        session={createSessionController('local', {
          lifecycle: 'ready',
          localStream: emptyMediaStream(),
        })}
        recording={createRecordedController({ downloaded: true })}
        recordingMode="local"
        recordingSource={null}
        recordingSupported
        reviewingTake
        onStopRecording={fn(() => Promise.resolve())}
        onCloseTakeReview={fn()}
        onOpenVoiceTreatments={fn()}
        onChooseAiExperience={fn()}
        onChangeExperience={fn()}
      />,
    ),
};
