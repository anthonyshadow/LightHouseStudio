import { canonicalPrompt } from '@studio/domain';
import type {
  CreativeAssetStore,
  SavedCharacterPrompt,
  SavedPrompt,
} from '../features/creative-assets/types';
import type {
  SessionDraft,
  SessionReferenceImage,
  StudioMode,
} from '../features/media-session/types';

export type ActiveStudioRecipe = {
  origin: 'character-prompt' | 'saved-prompt';
  assetId: string;
} | null;

export type ActiveRecipeFingerprint = {
  mode: StudioMode;
  prompt: string;
  referenceImageAssetId: string | null;
  assetPrompt: string;
  assetReferenceImageAssetId: string | null;
};

export type RecipeAsset = SavedCharacterPrompt | SavedPrompt;

export type ActiveRecipeState = {
  readonly recipe: ActiveStudioRecipe;
  readonly fingerprint: ActiveRecipeFingerprint | null;
};

export type ActiveRecipeAction =
  | {
      readonly type: 'commit';
      readonly recipe: Exclude<ActiveStudioRecipe, null>;
      readonly fingerprint: ActiveRecipeFingerprint;
    }
  | { readonly type: 'clear' };

export const INITIAL_ACTIVE_RECIPE_STATE: ActiveRecipeState = {
  recipe: null,
  fingerprint: null,
};

export const activeRecipeReducer = (
  _state: ActiveRecipeState,
  action: ActiveRecipeAction,
): ActiveRecipeState =>
  action.type === 'commit'
    ? { recipe: action.recipe, fingerprint: action.fingerprint }
    : INITIAL_ACTIVE_RECIPE_STATE;

type ExactActiveRecipeInput = {
  readonly fingerprint: ActiveRecipeFingerprint;
  readonly asset: RecipeAsset;
  readonly draft: Pick<SessionDraft, 'mode' | 'prompt' | 'referenceImage'>;
};

const EPHEMERAL_REFERENCE_IDENTITY = 'session:ephemeral-reference';

export const referenceIdentity = (reference: SessionReferenceImage | null): string | null => {
  if (!reference) return null;
  return reference.kind === 'persisted' ? reference.assetId : EPHEMERAL_REFERENCE_IDENTITY;
};

/** Active shelf identity is retained only while both the draft and stored asset remain exact. */
export const isExactActiveRecipe = ({
  fingerprint,
  asset,
  draft,
}: ExactActiveRecipeInput): boolean => {
  const assetMode = 'modelModeId' in asset ? asset.modelModeId : 'lucy-2.5';
  return (
    draft.mode === fingerprint.mode &&
    canonicalPrompt(draft.prompt) === canonicalPrompt(fingerprint.prompt) &&
    referenceIdentity(draft.referenceImage) === fingerprint.referenceImageAssetId &&
    assetMode === fingerprint.mode &&
    canonicalPrompt(asset.prompt) === canonicalPrompt(fingerprint.assetPrompt) &&
    asset.referenceImageAssetId === fingerprint.assetReferenceImageAssetId &&
    fingerprint.referenceImageAssetId === fingerprint.assetReferenceImageAssetId
  );
};

export type ResolvedActiveRecipe = {
  readonly recipe: ActiveStudioRecipe;
  readonly fingerprint: ActiveRecipeFingerprint | null;
  readonly asset: RecipeAsset | null;
  readonly characterName: string | undefined;
  readonly character: {
    readonly id: string;
    readonly name: string;
    readonly referenceImageAssetId: string | null;
  } | null;
  readonly label: string | undefined;
};

/** Resolves the authoritative reducer state against the current draft and repository snapshot. */
export const resolveActiveRecipe = (
  state: ActiveRecipeState,
  store: CreativeAssetStore,
  draft: Pick<SessionDraft, 'mode' | 'prompt' | 'referenceImage'>,
): ResolvedActiveRecipe => {
  const { recipe, fingerprint } = state;
  if (!recipe) {
    return {
      recipe: null,
      fingerprint: null,
      asset: null,
      characterName: undefined,
      character: null,
      label: undefined,
    };
  }

  const assets =
    recipe.origin === 'character-prompt' ? store.savedCharacterPrompts : store.savedPrompts;
  const asset = assets.find((candidate) => candidate.id === recipe.assetId) ?? null;
  const exact = Boolean(
    asset && (!fingerprint || isExactActiveRecipe({ fingerprint, asset, draft })),
  );
  if (!exact || !asset) {
    return {
      recipe: null,
      fingerprint: null,
      asset,
      characterName: undefined,
      character: null,
      label: undefined,
    };
  }

  const characterName =
    recipe.origin === 'character-prompt' && 'name' in asset ? asset.name : undefined;
  return {
    recipe,
    fingerprint,
    asset,
    characterName,
    character:
      characterName && 'name' in asset
        ? {
            id: asset.id,
            name: characterName,
            referenceImageAssetId: asset.referenceImageAssetId,
          }
        : null,
    label: recipe.origin === 'saved-prompt' && 'title' in asset ? asset.title : characterName,
  };
};
