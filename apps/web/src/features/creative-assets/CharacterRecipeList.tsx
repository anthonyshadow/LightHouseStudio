import { useTheme } from '@emotion/react';
import { CharacterPromptCard } from './RecipeCards';
import { DeleteConfirmation, RecipeEditor, RenameForm, type RecipeFormValue } from './RecipeForms';
import { listStyles } from './RecipeShelf.styles';
import type { SavedCharacterPrompt } from './types';
import type { RecipeShelfController } from './useRecipeShelfController';

const updateCharacterRecipe = (
  controller: RecipeShelfController,
  item: SavedCharacterPrompt,
  value: RecipeFormValue,
) =>
  controller.perform(() => {
    controller.repository.updateSavedCharacterPrompt(item.id, {
      name: value.title,
      prompt: value.prompt,
      notes: value.notes,
      tags: value.tags,
    });
  });

export const CharacterRecipeList = ({
  controller,
  useDisabled,
}: {
  controller: RecipeShelfController;
  useDisabled: boolean;
}) => {
  const theme = useTheme();

  return (
    <ul css={listStyles(theme)} aria-label="Saved character recipes">
      {controller.results.savedCharacterPrompts.map((item) => {
        const editing =
          controller.editing?.kind === 'character' && controller.editing.id === item.id;
        if (!editing) {
          return (
            <li key={item.id}>
              <CharacterPromptCard
                item={item}
                useDisabled={useDisabled}
                onUse={() => controller.selectCharacter(item)}
                {...(item.builderDraft && controller.canOpenCharacterWorkshop
                  ? { onOpenWorkshop: () => controller.openCharacterWorkshop(item) }
                  : {})}
                onAction={(action) =>
                  controller.startEditing({ kind: 'character', id: item.id, action })
                }
              />
            </li>
          );
        }

        return (
          <li key={item.id}>
            {controller.editing?.action === 'edit' ? (
              <RecipeEditor
                title={`Edit ${item.name}`}
                initialValue={{
                  title: item.name,
                  prompt: item.prompt,
                  notes: item.notes,
                  tags: item.tags,
                }}
                includeNotes
                submitLabel="Save changes"
                onDirtyChange={controller.setFormDirty}
                onCancel={controller.closeEditor}
                onSubmit={(value) => updateCharacterRecipe(controller, item, value)}
              />
            ) : controller.editing?.action === 'rename' ? (
              <RenameForm
                label="Character recipe name"
                initialName={item.name}
                onDirtyChange={controller.setFormDirty}
                onCancel={controller.closeEditor}
                onRename={(name) =>
                  controller.perform(() =>
                    controller.repository.renameSavedCharacterPrompt(item.id, name),
                  )
                }
              />
            ) : (
              <DeleteConfirmation
                name={item.name}
                onCancel={controller.closeEditor}
                onConfirm={() =>
                  controller.perform(() =>
                    controller.repository.deleteSavedCharacterPrompt(item.id),
                  )
                }
              />
            )}
          </li>
        );
      })}
    </ul>
  );
};
