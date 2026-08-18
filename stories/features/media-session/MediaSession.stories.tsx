import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { SessionComposer } from '@web/features/media-session/SessionComposer';
import { ModelRecipeFields } from '@web/features/media-session/ModelRecipeFields';
import { ReferenceImageField } from '@web/features/media-session/ReferenceImageField';
import { SessionActions } from '@web/features/media-session/SessionActions';
import { AppliedRecipeSummary, SessionStatus } from '@web/features/media-session/SessionStatus';
import { emptyMediaStream, createSessionController } from '../../fixtures/controllers';
import { StoryColumn } from '../../support/StoryLayout';

const meta = {
  title: 'Features/Media Session/AI Settings',
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
          'SessionComposer combines mode selection, local privacy guidance, Character and Virtual Try-On settings, reference-image validation, lifecycle/status feedback, applied-settings summary, and persistent start/apply/reset actions.',
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
  },
  render: (args) => frame(<SessionComposer {...args} />),
};

export const CharacterDraft: Story = {
  args: {
    session: createSessionController('lucy-latest', {
      draft: {
        mode: 'lucy-latest',
        prompt: 'Transform the adult subject into a polished midnight culture host.',
        referenceImage: null,
        enhance: true,
      },
    }),
    recording: false,
    activeCharacterName: 'Midnight culture host',
  },
  render: (args) => frame(<SessionComposer {...args} />),
};

export const LiveAppliedRecipe: Story = {
  args: {
    session: createSessionController('lucy-latest', {
      draft: {
        mode: 'lucy-latest',
        prompt: 'Adult field correspondent',
        referenceImage: null,
        enhance: true,
      },
      applied: {
        mode: 'lucy-latest',
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
  },
  render: (args) => frame(<SessionComposer {...args} />),
};

const ephemeralPortrait = new File(['portrait'], 'portrait.webp', { type: 'image/webp' });

export const EphemeralReferenceInteraction: Story = {
  args: {
    session: createSessionController('lucy-latest', {
      draft: {
        mode: 'lucy-latest',
        prompt: '',
        referenceImage: {
          kind: 'ephemeral',
          file: ephemeralPortrait,
          previewUrl: 'data:image/webp;base64,UklGRg==',
        },
        enhance: false,
      },
    }),
    recording: false,
  },
  render: (args) => frame(<SessionComposer {...args} />),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Optional portrait reference');

    await expect(input).toHaveAccessibleName(
      'Optional portrait reference Replace image Drag & drop or choose a file',
    );
    await userEvent.click(canvas.getByRole('button', { name: 'Clear image' }));
    await expect(args.session.updateReferenceImage).toHaveBeenCalledWith(null);
    await waitFor(() => expect(input).toHaveFocus());
  },
};
