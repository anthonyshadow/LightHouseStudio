import { useTheme } from '@emotion/react';
import { SelectField, TextField } from '../../ui';
import type { ModelModeId } from './types';
import type { RecipeShelfController } from './useRecipeShelfController';
import {
  categoryButtonStyles,
  categoryStyles,
  countStyles,
  toolbarStyles,
} from './RecipeShelf.styles';

export const RecipeShelfToolbar = ({
  controller,
  activeMode,
}: {
  controller: RecipeShelfController;
  activeMode: ModelModeId;
}) => {
  const theme = useTheme();
  const categories = [
    ['saved', 'Saved'],
    ['recent', 'Recent'],
    ...(activeMode === 'lucy-latest' ? ([['characters', 'Characters']] as const) : []),
  ] as const;

  return (
    <div css={toolbarStyles(theme)}>
      <div css={categoryStyles(theme)} role="group" aria-label="Recipe shelf section">
        {categories.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={controller.visibleCategory === value}
            css={categoryButtonStyles(theme, controller.visibleCategory === value)}
            onClick={() => controller.chooseCategory(value)}
          >
            {label} <span css={countStyles(theme)}>{controller.categoryCounts[value]}</span>
          </button>
        ))}
      </div>
      <TextField
        type="search"
        label="Search this mode"
        placeholder="Name, prompt, note, or tag…"
        value={controller.query}
        maxLength={100}
        disabled={controller.formDirty}
        hint={
          controller.formDirty
            ? 'Save or cancel the open recipe changes before searching.'
            : undefined
        }
        onChange={(event) => controller.setQuery(event.currentTarget.value)}
      />
      <SelectField
        label="Filter by tag"
        value={controller.tagFilter}
        disabled={controller.formDirty || controller.visibleCategory === 'recent'}
        options={[
          { value: '', label: 'All tags' },
          ...controller.availableTags.map((tag) => ({ value: tag, label: tag })),
        ]}
        hint={
          controller.visibleCategory === 'recent'
            ? 'Recent prompts do not store tags.'
            : controller.availableTags.length === 0
              ? 'Tags appear after you add them to a saved recipe.'
              : undefined
        }
        onValueChange={controller.chooseTag}
      />
    </div>
  );
};
