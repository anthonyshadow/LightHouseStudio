import { useTheme } from '@emotion/react';
import { RecentPromptCard } from './RecipeCards';
import { listStyles } from './RecipeShelf.styles';
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
        <li key={item.id}>
          <RecentPromptCard
            item={item}
            useDisabled={useDisabled}
            onUse={() => controller.selectRecent(item)}
            onSave={() => controller.openCreate({ prompt: item.prompt })}
          />
        </li>
      ))}
    </ul>
  );
};
