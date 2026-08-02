import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useId, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';
import { referenceImageContentUrl } from '../../adapters/api-client/referenceImageRoutes';
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

const chooserStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xxs,
});

const triggerStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  minWidth: 0,
  minHeight: '2.75rem',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.sm,
  padding: `${theme.space.xs} ${theme.space.sm}`,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.small,
  color: theme.colors.text,
  background: theme.colors.surfaceStrong,
  font: 'inherit',
  textAlign: 'start',
  cursor: 'pointer',
  '& span:first-of-type': {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '&:focus-visible': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '2px',
  },
  '&:disabled': { cursor: 'not-allowed', opacity: 0.48 },
});

const optionsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  maxHeight: '18rem',
  display: 'grid',
  overflowY: 'auto',
  margin: 0,
  padding: theme.space.xxs,
  border: `1px solid ${theme.colors.accent}`,
  borderRadius: theme.radii.small,
  background: theme.colors.surfaceStrong,
  boxShadow: theme.shadows.lifted,
  listStyle: 'none',
});

const optionStyles = (theme: Theme): CSSObject => ({
  width: '100%',
  minWidth: 0,
  minHeight: '4.5rem',
  display: 'grid',
  gridTemplateColumns: '4rem minmax(0, 1fr)',
  alignItems: 'center',
  gap: theme.space.sm,
  padding: theme.space.xs,
  border: 0,
  borderRadius: theme.radii.small,
  color: theme.colors.text,
  background: 'transparent',
  font: 'inherit',
  textAlign: 'start',
  cursor: 'pointer',
  '&:hover, &:focus-visible': {
    outline: 0,
    background: theme.colors.canvasRaised,
  },
  '&:focus-visible': {
    boxShadow: `inset 0 0 0 2px ${theme.colors.focus}`,
  },
  '@media (max-width: 22rem)': {
    gridTemplateColumns: '3.25rem minmax(0, 1fr)',
    gap: theme.space.xs,
  },
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

const createOptionStyles = (theme: Theme): CSSObject => ({
  ...optionStyles(theme),
  minHeight: '3.25rem',
  gridTemplateColumns: '2.25rem minmax(0, 1fr)',
  marginTop: theme.space.xxs,
  borderTop: `1px solid ${theme.colors.border}`,
  borderRadius: 0,
  color: theme.colors.accent,
  fontWeight: 760,
  '@media (max-width: 22rem)': {
    gridTemplateColumns: '2.25rem minmax(0, 1fr)',
    gap: theme.space.xs,
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
  const listboxId = useId();
  const labelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const copy = chooserCopy(modelId);
  const canCreateCharacter = modelId === 'lucy-latest' && Boolean(onCreateCharacter);
  const optionCount = recipes.length + (canCreateCharacter ? 1 : 0);
  const selectedRecipe = recipes.find((recipe) => recipe.id === selectedRecipeId);
  const unavailable = disabled || loading || optionCount === 0;
  const visibleOpen = open && !unavailable;

  const focusOption = (index: number) => {
    const normalized = (index + optionCount) % optionCount;
    setActiveIndex(normalized);
    window.requestAnimationFrame(() => optionRefs.current[normalized]?.focus());
  };

  const closeAndRestoreFocus = () => {
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const choose = (recipeId: string) => {
    setOpen(false);
    onChoose(recipeId);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const createCharacter = () => {
    setOpen(false);
    onCreateCharacter?.();
  };

  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        focusOption(index + 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        focusOption(index - 1);
        break;
      case 'Home':
        event.preventDefault();
        focusOption(0);
        break;
      case 'End':
        event.preventDefault();
        focusOption(optionCount - 1);
        break;
      case 'Escape':
        event.preventDefault();
        closeAndRestoreFocus();
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (index === recipes.length) createCharacter();
        else choose(recipes[index]!.id);
        break;
    }
  };

  const closeWhenFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    if (!rootRef.current?.contains(event.relatedTarget)) setOpen(false);
  };

  return (
    <div ref={rootRef} css={chooserStyles(theme)} onBlur={closeWhenFocusLeaves}>
      <span id={labelId}>{copy.label}</span>
      <button
        ref={triggerRef}
        type="button"
        css={triggerStyles(theme)}
        disabled={unavailable}
        aria-label={copy.action}
        aria-haspopup="listbox"
        aria-expanded={visibleOpen}
        aria-controls={visibleOpen ? listboxId : undefined}
        aria-busy={loading || undefined}
        onClick={() => {
          if (visibleOpen) {
            setOpen(false);
            return;
          }
          setOpen(true);
          setActiveIndex(0);
          window.requestAnimationFrame(() => optionRefs.current[0]?.focus());
        }}
      >
        <span>{selectedRecipe?.label ?? (optionCount === 0 ? copy.empty : copy.action)}</span>
        <span aria-hidden="true">{visibleOpen ? '▴' : '▾'}</span>
      </button>

      {visibleOpen ? (
        <div id={listboxId} role="listbox" aria-labelledby={labelId} css={optionsStyles(theme)}>
          {recipes.map((recipe, index) => (
            <button
              key={recipe.id}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              type="button"
              role="option"
              aria-selected={recipe.id === selectedRecipeId}
              tabIndex={index === activeIndex ? 0 : -1}
              css={optionStyles(theme)}
              onFocus={() => setActiveIndex(index)}
              onMouseMove={() => setActiveIndex(index)}
              onKeyDown={(event) => handleOptionKeyDown(event, index)}
              onClick={() => choose(recipe.id)}
            >
              <RecipeThumbnail recipe={recipe} />
              <span css={optionTextStyles(theme)}>
                <strong title={recipe.label}>{recipe.label}</strong>
                <span>{recipe.prompt}</span>
              </span>
            </button>
          ))}
          {canCreateCharacter ? (
            <button
              ref={(node) => {
                optionRefs.current[recipes.length] = node;
              }}
              type="button"
              role="option"
              aria-selected="false"
              tabIndex={activeIndex === recipes.length ? 0 : -1}
              css={createOptionStyles(theme)}
              onFocus={() => setActiveIndex(recipes.length)}
              onMouseMove={() => setActiveIndex(recipes.length)}
              onKeyDown={(event) => handleOptionKeyDown(event, recipes.length)}
              onClick={createCharacter}
            >
              <span aria-hidden="true">＋</span>
              <span>Create A Character</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
