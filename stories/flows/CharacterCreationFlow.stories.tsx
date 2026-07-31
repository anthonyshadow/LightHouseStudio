import { useMemo, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { createPromptBuilderDraft } from '@studio/domain';
import { CharacterBuilderForm } from '@web/features/character-builder/CharacterBuilderForm';
import { createEmptyGuidedDesign } from '@web/features/character-builder/characterModel';
import { RecipeShelf } from '@web/features/creative-assets/RecipeShelf';
import { Button, StatusNotice } from '@web/ui';
import { createSeededCreativeAssetRepository } from '../fixtures/creativeAssets';
import { StoryColumn } from '../support/StoryLayout';

const meta = {
  title: 'Flows/Character Creation',
  parameters: {
    docs: {
      description: {
        component:
          'A maintainable flow fixture that links guided visual character direction to the browser-local saved-character collection. It documents the handoff boundary without starting media or contacting providers.',
      },
    },
  },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const CharacterCreationHarness = () => {
  const [draft, setDraft] = useState(() => createPromptBuilderDraft('character-transform'));
  const [design, setDesign] = useState(createEmptyGuidedDesign);
  const [builderStep, setBuilderStep] = useState<1 | 2 | 3>(1);
  const [stage, setStage] = useState<'builder' | 'saved'>('builder');
  const repository = useMemo(() => createSeededCreativeAssetRepository(), []);

  return (
    <StoryColumn width="82rem">
      {stage === 'builder' ? (
        <>
          <StatusNotice title="Step 1 of 2">Build an editable character direction.</StatusNotice>
          <CharacterBuilderForm
            draft={draft}
            design={design}
            activeStep={builderStep}
            previewActions={
              <Button variant="primary" onClick={() => setStage('saved')}>
                Save character direction
              </Button>
            }
            onStepChange={setBuilderStep}
            onChange={(nextDraft, nextDesign) => {
              setDraft(nextDraft);
              setDesign(nextDesign);
            }}
          />
        </>
      ) : (
        <>
          <StatusNotice tone="success" title="Step 2 of 2">
            The saved character is now available from the local Recipe Shelf.
          </StatusNotice>
          <Button variant="quiet" onClick={() => setStage('builder')}>
            Back to builder
          </Button>
          <RecipeShelf
            repository={repository}
            activeMode="lucy-2.5"
            onUsePrompt={fn()}
            onOpenCharacterWorkshop={fn()}
          />
        </>
      )}
    </StoryColumn>
  );
};

export const BuildThenBrowse: Story = {
  render: () => <CharacterCreationHarness />,
};
