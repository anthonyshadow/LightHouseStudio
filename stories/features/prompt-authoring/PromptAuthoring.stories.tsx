import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CharacterPromptWorkshop, createPromptBuilderDraft } from '@web/features/prompt-authoring';
import { GeneratedPromptPreview } from '@web/features/prompt-authoring/GeneratedPromptPreview';
import { PromptFeedback } from '@web/features/prompt-authoring/PromptFeedback';
import { PromptIntentFields } from '@web/features/prompt-authoring/PromptIntentFields';
import { PromptWorkshopActions } from '@web/features/prompt-authoring/PromptWorkshopActions';
import { PromptWorkshopHeader } from '@web/features/prompt-authoring/PromptWorkshopHeader';
import {
  PromptWorkshopAccordion,
  PromptWorkshopReview,
} from '@web/features/prompt-authoring/PromptWorkshopSections';
import { SingleEditIntentFields } from '@web/features/prompt-authoring/SingleEditIntentFields';
import { StoryColumn, StorySection } from '../../support/StoryLayout';

const meta = {
  title: 'Features/Prompt Authoring/Workshop',
  component: CharacterPromptWorkshop,
  subcomponents: {
    GeneratedPromptPreview,
    PromptFeedback,
    PromptWorkshopActions,
    PromptWorkshopHeader,
    PromptWorkshopAccordion,
    PromptWorkshopReview,
    PromptIntentFields,
    SingleEditIntentFields,
  },
  args: {
    onUse: fn(),
  },
  parameters: {
    docs: {
      description: {
        component:
          'Prompt Workshop owns Add, Replace, and Restyle recipes. Character creation, edit, and reference generation live exclusively in Character Builder.',
      },
    },
  },
} satisfies Meta<typeof CharacterPromptWorkshop>;

export default meta;
type Story = StoryObj<typeof meta>;

const addObjectDraft = createPromptBuilderDraft('add-object');
if (addObjectDraft.intent !== 'add-object') throw new Error('Expected an Add object draft.');

export const AddObjectRecipe: Story = {
  args: {
    initialDraft: {
      ...addObjectDraft,
      objectDescription: 'a copper field notebook',
      placement: 'held at chest height',
    },
    onUse: fn(),
    onSave: fn(),
  },
  render: (args) => (
    <StoryColumn width="76rem">
      <CharacterPromptWorkshop {...args} />
    </StoryColumn>
  ),
};

export const EmptyRestyleRecipe: Story = {
  args: {
    initialDraft: createPromptBuilderDraft('change-attribute'),
    onUse: fn(),
    onSave: fn(),
  },
  render: (args) => (
    <StoryColumn width="76rem">
      <CharacterPromptWorkshop {...args} />
    </StoryColumn>
  ),
};

export const SupportingParts: Story = {
  render: () => (
    <StoryColumn>
      <StorySection title="Generated recipe">
        <GeneratedPromptPreview prompt="Add a copper field notebook, held at chest height." />
      </StorySection>
      <PromptFeedback
        validation={{
          valid: false,
          blocking: [
            {
              code: 'missing-placement',
              message: 'Choose a specific placement.',
              field: 'placement',
            },
          ],
          warnings: [],
        }}
      />
      <PromptWorkshopActions
        canCommit
        hasSaveAction
        showSave={false}
        saveName=""
        saveState="idle"
        onUse={fn()}
        onToggleSave={fn()}
        onSaveNameChange={fn()}
        onSave={fn()}
      />
    </StoryColumn>
  ),
};
