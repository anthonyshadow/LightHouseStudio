import { useTheme } from '@emotion/react';
import { RecentPromptCard } from './RecipeCards';
import { listItemStyles, listStyles } from './RecipeShelf.styles';
import type { RecipeShelfController } from './useRecipeShelfController';

export const RecentRecipeList = ({
  controller,
  useDisabled,
}: {
  controller: RecipeShelfController;
  useDisabled: boolean;
}) => {
  const theme = useTheme();
  return (
    <ul css={listStyles(theme)} aria-label="Recent successful prompts">
      {controller.results.recentPrompts.map((item) => (
        <li key={item.id} css={listItemStyles()}>
          <RecentPromptCard
            item={item}
            selected={controller.isSelected('recent', item.id)}
            useDisabled={useDisabled}
            onSelect={() => controller.selectRecipe({ kind: 'recent', id: item.id })}
            onUse={() => controller.selectRecent(item)}
            onSave={() => controller.openCreate({ prompt: item.prompt })}
          />
        </li>
      ))}
    </ul>
  );
};
