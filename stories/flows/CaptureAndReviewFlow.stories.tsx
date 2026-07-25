import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { MediaStage } from '@web/features/live-stage/MediaStage';
import { RecordingAction } from '@web/features/recording/RecordingAction';
import { RecordingControls } from '@web/features/recording/RecordingControls';
import { TakeDock } from '@web/features/take-review/TakeDock';
import { Button, StatusNotice } from '@web/ui';
import {
  createRecordedController,
  createRecordingController,
  createRecordingSource,
  createVoiceProcessingController,
} from '../fixtures/controllers';
import { StoryColumn } from '../support/StoryLayout';

const meta = {
  title: 'Flows/Capture and Take Review',
  parameters: {
    docs: {
      description: {
        component:
          'The local-first capture flow moves from private idle stage to explicit recording controls and then to temporary take review. Static typed controllers keep the story deterministic while preserving production copy and action boundaries.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const CaptureFlowHarness = () => {
  const [step, setStep] = useState<'idle' | 'ready' | 'review'>('idle');
  const source = createRecordingSource();
  const recording = step === 'review' ? createRecordedController() : createRecordingController();

  if (step === 'review') {
    return (
      <StoryColumn width="64rem">
        <StatusNotice tone="success" title="Take finalized">
          Playback belongs on the stage; metadata and retention actions remain in the dock.
        </StatusNotice>
        <TakeDock
          recording={recording}
          processing={createVoiceProcessingController()}
          elevenLabsAvailable
          browserCapabilities={{ webAudio: true, offlineAudio: true }}
          view="take"
          onCloseTake={() => setStep('ready')}
          onOpenVoiceTreatments={fn()}
        />
      </StoryColumn>
    );
  }

  return (
    <StoryColumn width="72rem">
      <div css={{ height: '32rem' }}>
        <MediaStage
          presentation={{ kind: 'idle', mode: 'local' }}
          mode="local"
          lifecycle={step === 'idle' ? 'idle' : 'ready'}
          liveSeconds={0}
          generationSeconds={0}
          recording={false}
          recordingSeconds={0}
          idleAction={
            step === 'idle' ? (
              <Button variant="primary" onClick={() => setStep('ready')}>
                Start Camera + Mic
              </Button>
            ) : undefined
          }
        />
      </div>
      <RecordingControls
        recording={recording}
        source={step === 'ready' ? source : null}
        mode="local"
      />
      {step === 'ready' ? (
        <RecordingAction
          recording={recording}
          source={source}
          mode="local"
          modelOutputReady
          supported
          onStop={() => {
            setStep('review');
            return Promise.resolve();
          }}
        />
      ) : null}
      {step === 'ready' ? (
        <Button variant="primary" onClick={() => setStep('review')}>
          Simulate completed take
        </Button>
      ) : null}
    </StoryColumn>
  );
};

export const LocalCaptureToReview: Story = {
  render: () => <CaptureFlowHarness />,
};
