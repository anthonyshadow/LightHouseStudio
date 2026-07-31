import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MediaStage } from '@web/features/live-stage/MediaStage';
import { StageNoticeLayer } from '@web/features/live-stage/StageNoticeLayer';
import { Button } from '@web/ui';
import { createTakeArtifact } from '../../fixtures/controllers';
import { StoryColumn } from '../../support/StoryLayout';

const notices = [
  {
    id: 'reconnecting',
    severity: 'warning' as const,
    title: 'Reconnecting AI',
    message: 'Local preview remains available while the provider reconnects.',
    action: { label: 'Stop AI', onAction: fn() },
  },
  {
    id: 'microphone',
    severity: 'info' as const,
    title: 'Microphone muted',
    onDismiss: fn(),
  },
];

const meta = {
  title: 'Features/Live Stage/Media Stage',
  component: MediaStage,
  subcomponents: { StageNoticeLayer },
  parameters: {
    docs: {
      description: {
        component:
          'MediaStage is the visual center of the studio. It renders private idle guidance, live local/provider streams, take finalization, recorded playback, stage metadata, fullscreen controls, recording state, and a deterministic priority notice layer.',
      },
    },
  },
} satisfies Meta<typeof MediaStage>;

export default meta;
type Story = StoryObj<typeof meta>;

const stageFrame = (component: React.ReactNode) => (
  <StoryColumn width="78rem">
    <div css={{ height: 'min(72dvh, 48rem)', minHeight: '32rem' }}>{component}</div>
  </StoryColumn>
);

export const PrivateIdleStage: Story = {
  args: {
    presentation: { kind: 'idle', mode: 'local' },
    mode: 'local',
    lifecycle: 'idle',
    recording: false,
    recordingSeconds: 0,
    idleAction: <Button variant="primary">Record New Video</Button>,
  },
  render: (args) => stageFrame(<MediaStage {...args} />),
};

export const CharacterStageWithNotices: Story = {
  args: {
    presentation: { kind: 'idle', mode: 'lucy-latest' },
    mode: 'lucy-latest',
    lifecycle: 'reconnecting',
    recording: false,
    recordingSeconds: 0,
    experienceLabel: 'Midnight culture host',
    notices,
    idleAction: <Button variant="primary">Start Character AI</Button>,
  },
  render: (args) => stageFrame(<MediaStage {...args} />),
};

export const RecordedPlayback: Story = {
  args: {
    presentation: { kind: 'playback', artifact: createTakeArtifact(), controlsLocked: false },
    mode: 'local',
    lifecycle: 'ready',
    recording: false,
    recordingSeconds: 0,
    onPlaybackError: fn(),
  },
  render: (args) => stageFrame(<MediaStage {...args} />),
};
