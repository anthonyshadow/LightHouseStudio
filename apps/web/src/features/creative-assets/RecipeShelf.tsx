import { useTheme } from '@emotion/react';
import { Button, StatusNotice, Surface } from '../../ui';
import { CharacterRecipeList } from './CharacterRecipeList';
import { EmptyShelf, modeName } from './RecipeCards';
import { RecipeEditor, RepositoryActionError } from './RecipeForms';
import { RecentRecipeList } from './RecentRecipeList';
import { SavedRecipeList } from './SavedRecipeList';
import {
  eyebrowStyles,
  introStyles,
  shelfHeaderStyles,
  shelfStyles,
  titleStyles,
} from './RecipeShelf.styles';
import { RecipeShelfToolbar } from './RecipeShelfToolbar';
import type { RecipeShelfProps } from './RecipeShelf.types';
import { useRecipeShelfController } from './useRecipeShelfController';

export type { RecipeSelection, RecipeShelfProps } from './RecipeShelf.types';

export const RecipeShelf = ({
  repository,
  activeMode,
  promptUseDisabled = false,
  onUsePrompt,
  onOpenCharacterWorkshop,
  onDirtyChange,
}: RecipeShelfProps) => {
  const theme = useTheme();
  const controller = useRecipeShelfController({
    repository,
    activeMode,
    onUsePrompt,
    ...(onOpenCharacterWorkshop ? { onOpenCharacterWorkshop } : {}),
    ...(onDirtyChange ? { onDirtyChange } : {}),
  });

  return (
    <Surface aria-labelledby="recipe-shelf-title" padding="spacious">
      <div css={shelfStyles(theme)}>
        <header css={shelfHeaderStyles(theme)}>
          <div>
            <p css={eyebrowStyles(theme)}>Browser-local library</p>
            <h2 id="recipe-shelf-title" tabIndex={-1} css={titleStyles(theme)}>
              Recipe Shelf
            </h2>
            <p css={introStyles(theme)}>
              Keep reusable text close without saving portraits, garments, recordings, or provider
              data.
            </p>
          </div>
          <Button variant="secondary" onClick={() => controller.openCreate()}>
            New {activeMode === 'lucy-2.5' ? 'character' : 'garment'} recipe
          </Button>
        </header>

        {controller.state.notice ? (
          <StatusNotice
            role="status"
            tone={controller.state.health === 'session-only' ? 'warning' : 'neutral'}
          >
            {controller.state.notice}
          </StatusNotice>
        ) : null}

        {controller.createSeed ? (
          <RecipeEditor
            key={controller.createKey}
            title={`New ${modeName(activeMode)} recipe`}
            initialValue={controller.createSeed}
            submitLabel="Save recipe"
            onDirtyChange={controller.setFormDirty}
            onCancel={controller.closeCreate}
            onSubmit={controller.createRecipe}
          />
        ) : null}

        {controller.actionError ? <RepositoryActionError message={controller.actionError} /> : null}

        <RecipeShelfToolbar controller={controller} activeMode={activeMode} />

        {controller.visibleCategory === 'saved' && controller.results.savedPrompts.length > 0 ? (
          <SavedRecipeList controller={controller} useDisabled={promptUseDisabled} />
        ) : null}

        {controller.visibleCategory === 'recent' && controller.results.recentPrompts.length > 0 ? (
          <RecentRecipeList controller={controller} useDisabled={promptUseDisabled} />
        ) : null}

        {controller.visibleCategory === 'characters' &&
        controller.results.savedCharacterPrompts.length > 0 ? (
          <CharacterRecipeList controller={controller} useDisabled={promptUseDisabled} />
        ) : null}

        {controller.categoryCounts[controller.visibleCategory] === 0 ? (
          <EmptyShelf
            searching={Boolean(controller.query.trim())}
            category={controller.visibleCategory}
          />
        ) : null}
      </div>
    </Surface>
  );
};
