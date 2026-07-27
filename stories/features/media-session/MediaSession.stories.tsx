import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { SessionComposer } from '@web/features/media-session/SessionComposer';
import { ModelRecipeFields } from '@web/features/media-session/ModelRecipeFields';
import { ReferenceImageField } from '@web/features/media-session/ReferenceImageField';
import { SessionActions } from '@web/features/media-session/SessionActions';
import { AppliedRecipeSummary, SessionStatus } from '@web/features/media-session/SessionStatus';
import { emptyMediaStream, createSessionController } from '../../fixtures/controllers';
import { StoryColumn } from '../../support/StoryLayout';

const meta = {
  title: 'Features/Media Session/Recipe Dock',
  component: SessionComposer,
  subcomponents: {
    ModelRecipeFields,
    ReferenceImageField,
    SessionActions,
    SessionStatus,
    AppliedRecipeSummary,
  },
  parameters: {
    docs: {
      description: {
        component:
          'SessionComposer combines mode selection, local privacy guidance, Character and Virtual Try-On recipe fields, reference-image validation, lifecycle/status feedback, applied-recipe summary, and persistent start/apply/reset actions.',
      },
    },
  },
} satisfies Meta<typeof SessionComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

const frame = (component: React.ReactNode) => (
  <StoryColumn width="42rem">
    <div css={{ height: '46rem' }}>{component}</div>
  </StoryColumn>
);

export const PrivateLocalCapture: Story = {
  args: {
    session: createSessionController('local'),
    recording: false,
    onOpenWorkshop: fn(),
  },
  render: (args) => frame(<SessionComposer {...args} />),
};

export const CharacterDraft: Story = {
  args: {
    session: createSessionController('lucy-2.5', {
      draft: {
        mode: 'lucy-2.5',
        prompt: 'Transform the adult subject into a polished midnight culture host.',
        referenceImage: null,
        enhance: true,
      },
    }),
    recording: false,
    activeCharacterName: 'Midnight culture host',
    onOpenWorkshop: fn(),
  },
  render: (args) => frame(<SessionComposer {...args} />),
};

export const LiveAppliedRecipe: Story = {
  args: {
    session: createSessionController('lucy-2.5', {
      draft: {
        mode: 'lucy-2.5',
        prompt: 'Adult field correspondent',
        referenceImage: null,
        enhance: true,
      },
      applied: {
        mode: 'lucy-2.5',
        prompt: 'Adult field correspondent',
        referenceImage: null,
        referenceIdentity: null,
        enhance: true,
      },
      lifecycle: 'generating',
      localStream: emptyMediaStream(),
      remoteStream: emptyMediaStream(),
      displayStream: emptyMediaStream(),
      transformedVideoUsable: true,
    }),
    recording: false,
    onOpenWorkshop: fn(),
  },
  render: (args) => frame(<SessionComposer {...args} />),
};
