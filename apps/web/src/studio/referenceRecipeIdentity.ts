import { canonicalPrompt } from '@studio/domain';
import type { SavedCharacterPrompt, SavedPrompt } from '../features/creative-assets/types';
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
