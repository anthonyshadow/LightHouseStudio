import { generateStructuredPrompt, type CharacterTransformDraft } from '@studio/domain';
import type { SavedCharacterPrompt } from '../creative-assets/types';
import { createReferencePreviewSourceKey } from './characterReferenceIdentity';
import { createFreshCharacterBuilderDraftValue } from './characterBuilderControllerSupport';
import { createGuidedDesignFromDraft } from './characterModel';
import {
  createCharacterBuilderDraftRepository,
  type CharacterBuilderDraftRepository,
} from './draftRepository';
import {
  sanitizeCharacterBuilderDraftValue,
  type CharacterBuilderDraftValueV1,
  type CharacterBuilderTarget,
} from './characterBuilderPersistence';

const LEGACY_PROMPT_PREVIEW_LIMIT = 500;

const legacyDraft = (prompt: string): CharacterTransformDraft => {
  const fresh = createFreshCharacterBuilderDraftValue().draft;
  return {
    ...fresh,
    customDetails: prompt.trim().slice(0, LEGACY_PROMPT_PREVIEW_LIMIT),
  };
};

export const createCharacterEditDraftValue = (
  asset: SavedCharacterPrompt,
): CharacterBuilderDraftValueV1 => {
  const fresh = createFreshCharacterBuilderDraftValue();
  const draft =
    asset.builderDraft?.intent === 'character-transform'
      ? asset.builderDraft
      : asset.prompt.trim()
        ? legacyDraft(asset.prompt)
        : fresh.draft;
  const design = asset.guidedDesign ?? createGuidedDesignFromDraft(draft);
  const options = fresh.options;
  const uploadedAssetId = asset.uploadedReferenceImageAssetId;
  const finalAssetId = asset.referenceImageAssetId;
  const generatedPreview =
    finalAssetId &&
    (asset.finalReferenceKind === 'generated' ||
      (!asset.finalReferenceKind && finalAssetId !== uploadedAssetId))
      ? {
          assetId: finalAssetId,
          sourceKey: createReferencePreviewSourceKey(
            generateStructuredPrompt(draft).prompt,
            options,
            uploadedAssetId,
          ),
          stale: false,
        }
      : null;

  return {
    target: {
      kind: 'edit',
      characterId: asset.id,
      originalName: asset.name,
      originalPrompt: asset.prompt,
    },
    draft,
    design,
    options,
    preview: generatedPreview,
    uploadedReference: uploadedAssetId
      ? { assetId: uploadedAssetId, displayName: `${asset.name} reference` }
      : null,
    pendingSave: null,
  };
};

const sameTarget = (left: CharacterBuilderTarget, right: CharacterBuilderTarget): boolean =>
  left.kind === right.kind &&
  (left.kind === 'create' || (right.kind === 'edit' && left.characterId === right.characterId));

export type CharacterBuilderLaunchRepository = Pick<
  CharacterBuilderDraftRepository<CharacterBuilderDraftValueV1>,
  'load' | 'resetDurably' | 'close'
>;

export interface PrepareCharacterBuilderLaunchOptions {
  readonly target: CharacterBuilderTarget;
  readonly confirmDiscard: (message: string) => boolean | Promise<boolean>;
  readonly repository?: CharacterBuilderLaunchRepository;
}

export const prepareCharacterBuilderLaunch = async ({
  target,
  confirmDiscard,
  repository = createCharacterBuilderDraftRepository({
    sanitizeDraft: sanitizeCharacterBuilderDraftValue,
  }),
}: PrepareCharacterBuilderLaunchOptions): Promise<boolean> => {
  try {
    const active = await repository.load();
    if (!active || sameTarget(active.value.target, target)) return true;
    if (
      !(await confirmDiscard(
        'An unfinished character draft exists. Continue and discard it? If you cancel, the draft will stay unchanged.',
      ))
    ) {
      return false;
    }
    await repository.resetDurably({ expectedRevision: active.revision });
    return true;
  } finally {
    repository.close();
  }
};
