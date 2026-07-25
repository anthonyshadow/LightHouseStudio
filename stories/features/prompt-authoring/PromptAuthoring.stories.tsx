import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { CharacterPromptWorkshop, createPromptBuilderDraft } from '@web/features/prompt-authoring';
import type { CharacterTransformDraft } from '@studio/domain';
import { CharacterPresetPicker } from '@web/features/prompt-authoring/CharacterPresetPicker';
import { CharacterTransformFields } from '@web/features/prompt-authoring/CharacterTransformFields';
import { GeneratedPromptPreview } from '@web/features/prompt-authoring/GeneratedPromptPreview';
import { PromptFeedback } from '@web/features/prompt-authoring/PromptFeedback';
import { PromptIntentFields } from '@web/features/prompt-authoring/PromptIntentFields';
import { PromptWorkshopActions } from '@web/features/prompt-authoring/PromptWorkshopActions';
import { PromptWorkshopHeader } from '@web/features/prompt-authoring/PromptWorkshopHeader';
import {
  PromptWorkshopAccordion,
  PromptWorkshopReview,
} from '@web/features/prompt-authoring/PromptWorkshopSections';
import { ReferenceImageGenerator } from '@web/features/prompt-authoring/ReferenceImageGenerator';
import { SingleEditIntentFields } from '@web/features/prompt-authoring/SingleEditIntentFields';
import { StoryColumn, StorySection } from '../../support/StoryLayout';

const initialCharacterDraft = {
  ...(createPromptBuilderDraft('character-transform') as CharacterTransformDraft),
  adultAge: 'adult',
  characterBase: 'late-night culture host',
  outfit: 'structured midnight-blue jacket with subtle satin detail',
  expression: 'warm, composed eye contact',
  mood: 'cinematic and quietly confident',
} satisfies CharacterTransformDraft;

const meta = {
  title: 'Features/Prompt Authoring/Workshop',
  component: CharacterPromptWorkshop,
  subcomponents: {
    CharacterPresetPicker,
    GeneratedPromptPreview,
    PromptFeedback,
    PromptWorkshopActions,
    PromptWorkshopHeader,
    PromptWorkshopAccordion,
    PromptWorkshopReview,
    PromptIntentFields,
    CharacterTransformFields,
    SingleEditIntentFields,
    ReferenceImageGenerator,
  },
  args: {
    onUse: fn(),
  },
  parameters: {
    docs: {
      description: {
        component:
          'The structured workshop composes its header, intent picker, progressive accordion fields, generated preview, validation feedback, reference-image generator, and commit/save actions into one keyboard-friendly authoring flow.',
      },
    },
  },
} satisfies Meta<typeof CharacterPromptWorkshop>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CharacterRecipe: Story = {
  args: {
    initialDraft: initialCharacterDraft,
    referenceImagesAvailable: true,
    referenceImageModel: 'gpt-image-1',
    optimizerModel: 'gpt-5.4-mini',
    optimizerVersion: 'storybook',
    onUse: fn(),
    onSave: fn(),
  },
  render: (args) => (
    <StoryColumn width="76rem">
      <CharacterPromptWorkshop {...args} />
    </StoryColumn>
  ),
};

export const EmptyAddObjectRecipe: Story = {
  args: {
    initialDraft: createPromptBuilderDraft('add-object'),
    onUse: fn(),
    onSave: fn(),
  },
  render: (args) => (
    <StoryColumn width="76rem">
      <CharacterPromptWorkshop {...args} />
    </StoryColumn>
  ),
};

const SupportingPartsHarness = () => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showSave, setShowSave] = useState(true);
  const [saveName, setSaveName] = useState('Midnight host');
  return (
    <StoryColumn>
      <StorySection title="Visible starting points">
        <CharacterPresetPicker
          selectedId={selectedId}
          onSelect={(preset) => setSelectedId(preset.id)}
        />
      </StorySection>
      <GeneratedPromptPreview prompt="Transform the adult subject into a polished midnight culture host." />
      <PromptFeedback
        validation={{
          valid: false,
          blocking: [
            { code: 'missing-subject', message: 'Describe the main subject.', field: 'subject' },
          ],
          warnings: [
            { code: 'reference-shape', message: 'A portrait image works best for this direction.' },
          ],
        }}
      />
      <PromptWorkshopActions
        canCommit
        hasSaveAction
        showSave={showSave}
        saveName={saveName}
        saveState="idle"
        onUse={fn()}
        onToggleSave={() => setShowSave((value) => !value)}
        onSaveNameChange={setSaveName}
        onSave={fn()}
      />
    </StoryColumn>
  );
};

export const SupportingParts: Story = {
  render: () => <SupportingPartsHarness />,
};
