import { useMemo } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { RecipeShelf } from '@web/features/creative-assets/RecipeShelf';
import { RecipeShelfView } from '@web/features/creative-assets/RecipeShelf';
import {
  CharacterPromptCard,
  EmptyShelf,
  RecentPromptCard,
  SavedPromptCard,
} from '@web/features/creative-assets/RecipeCards';
import { CharacterRecipeList } from '@web/features/creative-assets/CharacterRecipeList';
import { RecentRecipeList } from '@web/features/creative-assets/RecentRecipeList';
import { RecipeShelfToolbar } from '@web/features/creative-assets/RecipeShelfToolbar';
import { SavedRecipeList } from '@web/features/creative-assets/SavedRecipeList';
import {
  DeleteConfirmation,
  RecipeEditor,
  RenameForm,
  RepositoryActionError,
} from '@web/features/creative-assets/RecipeForms';
import { createSeededCreativeAssetRepository } from '../../fixtures/creativeAssets';
import { StoryColumn, StoryGrid, StorySection } from '../../support/StoryLayout';

const meta = {
  title: 'Features/Creative Assets/Recipe Shelf',
  component: RecipeShelf,
  subcomponents: {
    RecipeEditor,
    RenameForm,
    DeleteConfirmation,
    EmptyShelf,
    RepositoryActionError,
    RecipeShelfView,
    RecipeShelfToolbar,
    SavedPromptCard,
    RecentPromptCard,
    CharacterPromptCard,
    SavedRecipeList,
    RecentRecipeList,
    CharacterRecipeList,
  },
  args: {
    repository: createSeededCreativeAssetRepository(),
    activeMode: 'lucy-latest',
    onUsePrompt: fn(),
  },
  parameters: {
    docs: {
      description: {
        component:
          'The browser-local Recipe Shelf composes its category toolbar, search/tag filters, saved/recent/character cards, create/edit/rename/delete forms, selection state, empty states, and storage-health feedback.',
      },
    },
  },
} satisfies Meta<typeof RecipeShelf>;

export default meta;
type Story = StoryObj<typeof meta>;

const ShelfHarness = ({ mode = 'lucy-latest' }: { mode?: 'lucy-latest' | 'lucy-vton-latest' }) => {
  const repository = useMemo(() => createSeededCreativeAssetRepository(), []);
  return (
    <StoryColumn width="72rem">
      <RecipeShelf
        repository={repository}
        activeMode={mode}
        onUsePrompt={fn()}
        onOpenCharacterWorkshop={fn()}
      />
    </StoryColumn>
  );
};

export const CharacterRecipes: Story = {
  render: () => <ShelfHarness />,
};

export const VirtualTryOnRecipes: Story = {
  render: () => <ShelfHarness mode="lucy-vton-latest" />,
};

export const FormsAndEmptyStates: Story = {
  render: () => (
    <StoryColumn>
      <RecipeEditor
        title="New Character recipe"
        submitLabel="Save recipe"
        includeNotes
        initialValue={{
          title: 'Midnight host',
          prompt: 'Transform the adult subject into a midnight culture host.',
          tags: ['host', 'editorial'],
        }}
        onSubmit={fn()}
        onCancel={fn()}
      />
      <StorySection title="Inline states">
        <StoryGrid>
          <EmptyShelf searching={false} category="saved" />
          <EmptyShelf searching category="characters" />
          <RepositoryActionError message="The recipe could not be saved. Your edits are still here." />
        </StoryGrid>
      </StorySection>
    </StoryColumn>
  ),
};
