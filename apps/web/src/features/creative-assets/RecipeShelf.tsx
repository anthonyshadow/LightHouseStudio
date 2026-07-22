import { useTheme } from '@emotion/react';
import { Button, StatusNotice, Surface } from '../../ui';
import { CharacterRecipeList } from './CharacterRecipeList';
import { EmptyShelf, modeName } from './RecipeCards';
import { RecipeEditor, RepositoryActionError } from './RecipeForms';
import { RecentRecipeList } from './RecentRecipeList';
import { SavedRecipeList } from './SavedRecipeList';
import {
  controlsRegionStyles,
  eyebrowStyles,
  footerMetadataStyles,
  headerActionsStyles,
  headerCopyStyles,
  introStyles,
  modePillStyles,
  noticeRegionStyles,
  shelfBodyStyles,
  shelfFooterStyles,
  shelfHeaderStyles,
  shelfSurfaceStyles,
  shelfStyles,
  titleStyles,
} from './RecipeShelf.styles';
import { RecipeShelfToolbar } from './RecipeShelfToolbar';
import type { RecipeShelfProps } from './RecipeShelf.types';
import { useRecipeShelfController, type RecipeShelfController } from './useRecipeShelfController';

export type { ActiveRecipeIdentity, RecipeSelection, RecipeShelfProps } from './RecipeShelf.types';

export type RecipeShelfViewProps = RecipeShelfProps & {
  controller: RecipeShelfController;
};

export const RecipeShelfView = ({
  activeMode,
  promptUseDisabled = false,
  embedded = false,
  controller,
}: RecipeShelfViewProps) => {
  const theme = useTheme();
  const categoryLabel =
    controller.visibleCategory === 'saved'
      ? 'saved recipes'
      : controller.visibleCategory === 'recent'
        ? 'recent prompts'
        : 'character recipes';
  const newRecipeLabel = `New ${activeMode === 'lucy-2.5' ? 'character' : 'garment'} recipe`;

  return (
    <Surface
      {...(embedded
        ? { 'aria-label': 'Recipe Shelf library' }
        : { 'aria-labelledby': 'recipe-shelf-title' })}
      padding="compact"
      css={shelfSurfaceStyles(theme, embedded)}
    >
      <div css={shelfStyles(embedded)}>
        {!embedded ? (
          <header css={shelfHeaderStyles(theme)}>
            <div css={headerCopyStyles()}>
              <p css={eyebrowStyles(theme)}>Browser-local library</p>
              <h2 id="recipe-shelf-title" tabIndex={-1} css={titleStyles(theme)}>
                Recipe Shelf
              </h2>
              <p css={introStyles(theme)}>
                Keep reusable prompts and generated reference links close. Manual images,
                recordings, and provider secrets stay out of browser storage.
              </p>
            </div>
            <div css={headerActionsStyles(theme)}>
              <span css={modePillStyles(theme)}>{modeName(activeMode)} recipes</span>
            </div>
          </header>
        ) : null}

        <div data-scroll-region="recipe-shelf" css={shelfBodyStyles(theme)}>
          <div css={controlsRegionStyles(theme)}>
            {controller.state.notice ? (
              <div css={noticeRegionStyles(theme)}>
                <StatusNotice
                  role="status"
                  tone={controller.state.health === 'session-only' ? 'warning' : 'neutral'}
                >
                  {controller.state.notice}
                </StatusNotice>
              </div>
            ) : null}
            <RecipeShelfToolbar controller={controller} activeMode={activeMode} />
          </div>

          {controller.createSeed ? (
            <RecipeEditor
              key={controller.createKey}
              title={`New ${modeName(activeMode)} recipe`}
              initialValue={controller.createSeed}
              draft={controller.editorDraft ?? undefined}
              submitLabel="Save recipe"
              onDraftChange={controller.setEditorDraft}
              onDirtyChange={controller.setFormDirty}
              onCancel={controller.closeCreate}
              onSubmit={controller.createRecipe}
            />
          ) : null}

          {controller.actionError ? (
            <RepositoryActionError message={controller.actionError} />
          ) : null}

          {controller.visibleCategory === 'saved' && controller.results.savedPrompts.length > 0 ? (
            <SavedRecipeList controller={controller} useDisabled={promptUseDisabled} />
          ) : null}

          {controller.visibleCategory === 'recent' &&
          controller.results.recentPrompts.length > 0 ? (
            <RecentRecipeList controller={controller} useDisabled={promptUseDisabled} />
          ) : null}

          {controller.visibleCategory === 'characters' &&
          controller.results.savedCharacterPrompts.length > 0 ? (
            <CharacterRecipeList controller={controller} useDisabled={promptUseDisabled} />
          ) : null}

          {controller.visibleCount === 0 ? (
            <EmptyShelf
              searching={Boolean(controller.query.trim() || controller.tagFilter)}
              category={controller.visibleCategory}
            />
          ) : null}
        </div>

        <footer css={shelfFooterStyles(theme)}>
          <p
            title={`${controller.visibleCount} ${categoryLabel}; metadata stored in this browser`}
            css={footerMetadataStyles(theme)}
            aria-live="polite"
          >
            {controller.selectedRecipe ? '1 selected · ' : ''}
            {controller.visibleCount} {categoryLabel} · metadata stored in this browser
          </p>
          <Button
            aria-label={newRecipeLabel}
            variant="primary"
            size="small"
            onClick={() => controller.openCreate()}
          >
            New recipe
          </Button>
        </footer>
      </div>
    </Surface>
  );
};

export const RecipeShelf = (props: RecipeShelfProps) => {
  const controller = useRecipeShelfController({
    repository: props.repository,
    activeMode: props.activeMode,
    ...(props.activeRecipe !== undefined ? { activeRecipe: props.activeRecipe } : {}),
    onUsePrompt: props.onUsePrompt,
    ...(props.onOpenCharacterWorkshop
      ? { onOpenCharacterWorkshop: props.onOpenCharacterWorkshop }
      : {}),
    ...(props.onDirtyChange ? { onDirtyChange: props.onDirtyChange } : {}),
  });

  return <RecipeShelfView {...props} controller={controller} />;
};
