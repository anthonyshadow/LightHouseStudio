import { DeleteConfirmation, RecipeEditor, RenameForm, type RecipeFormValue } from './RecipeForms';
import { SavedPromptCard } from './RecipeCards';
import { listStyles } from './RecipeShelf.styles';
import type { SavedPrompt } from './types';
import type { RecipeShelfController } from './useRecipeShelfController';
import { useTheme } from '@emotion/react';

const updateSavedRecipe = (
  controller: RecipeShelfController,
  item: SavedPrompt,
  value: RecipeFormValue,
) =>
  controller.perform(() => {
    controller.repository.updateSavedPrompt(item.id, {
      title: value.title,
      prompt: value.prompt,
      tags: value.tags,
    });
  });

export const SavedRecipeList = ({
  controller,
  useDisabled,
}: {
  controller: RecipeShelfController;
  useDisabled: boolean;
}) => {
  const theme = useTheme();

  return (
    <ul css={listStyles(theme)} aria-label="Saved prompt recipes">
      {controller.results.savedPrompts.map((item) => {
        const editing = controller.editing?.kind === 'saved' && controller.editing.id === item.id;
        if (!editing) {
          return (
            <li key={item.id}>
              <SavedPromptCard
                item={item}
                useDisabled={useDisabled}
                onUse={() => controller.selectSaved(item)}
                onAction={(action) =>
                  controller.startEditing({ kind: 'saved', id: item.id, action })
                }
              />
            </li>
          );
        }

        return (
          <li key={item.id}>
            {controller.editing?.action === 'edit' ? (
              <RecipeEditor
                title={`Edit ${item.title}`}
                initialValue={{ title: item.title, prompt: item.prompt, tags: item.tags }}
                submitLabel="Save changes"
                onDirtyChange={controller.setFormDirty}
                onCancel={controller.closeEditor}
                onSubmit={(value) => updateSavedRecipe(controller, item, value)}
              />
            ) : controller.editing?.action === 'rename' ? (
              <RenameForm
                label="Recipe name"
                initialName={item.title}
                onDirtyChange={controller.setFormDirty}
                onCancel={controller.closeEditor}
                onRename={(name) =>
                  controller.perform(() => controller.repository.renameSavedPrompt(item.id, name))
                }
              />
            ) : (
              <DeleteConfirmation
                name={item.title}
                onCancel={controller.closeEditor}
                onConfirm={() =>
                  controller.perform(() => controller.repository.deleteSavedPrompt(item.id))
                }
              />
            )}
          </li>
        );
      })}
    </ul>
  );
};
