import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useState } from 'react';
import { referenceImageContentUrl } from '../../adapters/api-client/referenceImageRoutes';
import { SelectField, type SelectOption } from '../../ui';
import type { VtonInputKind } from '../creative-assets/types';
import type { ExistingVideoStep } from './useExistingVideoWorkflow';

export type ExistingVideoSavedRecipe = Readonly<{
  id: string;
  label: string;
  modelId: ExistingVideoStep['modelId'];
  prompt: string;
  referenceImageAssetId: string | null;
  vtonInputKind: VtonInputKind | null;
  enhancePrompt: boolean;
}>;

const CREATE_CHARACTER_VALUE = '__create-character__';

const richOptionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: '4rem minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.sm,
  '@media (max-width: 22rem)': {
    gridTemplateColumns: '3.25rem minmax(0, 1fr)',
    gap: theme.space.xs,
  },
});

const createOptionStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: '2.25rem',
  display: 'grid',
  gridTemplateColumns: '2.25rem minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.xs,
  color: theme.colors.accent,
  fontWeight: 760,
});

const thumbnailStyles = (theme: Theme): CSSObject => ({
  width: '4rem',
  height: '3rem',
  display: 'grid',
  placeItems: 'center',
  overflow: 'hidden',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: theme.radii.small,
  color: theme.colors.textMuted,
  background: theme.colors.canvas,
  fontSize: theme.fontSizes.caption,
  '& img': {
    width: '100%',
    height: '100%',
    display: 'block',
    objectFit: 'contain',
  },
  '@media (max-width: 22rem)': {
    width: '3.25rem',
    height: '3.25rem',
  },
});

const optionTextStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xxs,
  '& strong': {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: theme.fontSizes.metadata,
  },
  '& span': {
    display: '-webkit-box',
    overflow: 'hidden',
    color: theme.colors.textMuted,
    fontSize: theme.fontSizes.caption,
    lineHeight: 1.35,
    overflowWrap: 'anywhere',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
  },
});

const chooserCopy = (modelId: ExistingVideoStep['modelId']) =>
  modelId === 'lucy-latest'
    ? {
        label: 'Saved Character',
        action: 'Choose a Saved Character',
        empty: 'No saved characters',
      }
    : {
        label: 'Saved Outfit',
        action: 'Choose a Saved Outfit',
        empty: 'No saved outfits',
      };

const RecipeThumbnail = ({ recipe }: { recipe: ExistingVideoSavedRecipe }) => {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const assetId = recipe.referenceImageAssetId;
  const imageAvailable = assetId && !failed;

  return (
    <span css={thumbnailStyles(theme)} aria-hidden="true">
      {imageAvailable ? (
        <img src={referenceImageContentUrl(assetId)} alt="" onError={() => setFailed(true)} />
      ) : (
        <span>No image</span>
      )}
    </span>
  );
};

export interface ExistingVideoRecipeChooserProps {
  readonly modelId: ExistingVideoStep['modelId'];
  readonly recipes: readonly ExistingVideoSavedRecipe[];
  readonly selectedRecipeId: string | null;
  readonly disabled: boolean;
  readonly loading: boolean;
  readonly onChoose: (recipeId: string) => void;
  readonly onCreateCharacter?: () => void;
}

export const ExistingVideoRecipeChooser = ({
  modelId,
  recipes,
  selectedRecipeId,
  disabled,
  loading,
  onChoose,
  onCreateCharacter,
}: ExistingVideoRecipeChooserProps) => {
  const theme = useTheme();
  const copy = chooserCopy(modelId);
  const canCreateCharacter = modelId === 'lucy-latest' && Boolean(onCreateCharacter);
  const options: SelectOption[] = [
    ...recipes.map((recipe) => ({
      value: recipe.id,
      label: recipe.label,
      description: recipe.prompt,
    })),
    ...(canCreateCharacter ? [{ value: CREATE_CHARACTER_VALUE, label: 'Create A Character' }] : []),
  ];

  return (
    <SelectField
      label={copy.label}
      value={selectedRecipeId ?? ''}
      options={options}
      placeholder={options.length === 0 ? copy.empty : copy.action}
      emptyMessage={copy.empty}
      disabled={disabled || loading || options.length === 0}
      busy={loading}
      onValueChange={(value) => {
        if (value === CREATE_CHARACTER_VALUE) onCreateCharacter?.();
        else onChoose(value);
      }}
      renderOption={(option) => {
        if (option.value === CREATE_CHARACTER_VALUE) {
          return (
            <span css={createOptionStyles(theme)}>
              <span aria-hidden="true">＋</span>
              <span>Create A Character</span>
            </span>
          );
        }

        const recipe = recipes.find((candidate) => candidate.id === option.value);
        if (!recipe) return <span>{option.label}</span>;
        return (
          <span css={richOptionStyles(theme)}>
            <RecipeThumbnail recipe={recipe} />
            <span css={optionTextStyles(theme)}>
              <strong title={recipe.label}>{recipe.label}</strong>
              <span>{recipe.prompt}</span>
            </span>
          </span>
        );
      }}
    />
  );
};
