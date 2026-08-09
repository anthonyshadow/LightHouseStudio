import type { CreativeAssetRepository } from '../creative-assets/types';
import type { CharacterSaveSnapshot } from './characterBuilderControllerSupport';

export const persistCharacterSaveSnapshot = async (
  repository: CreativeAssetRepository,
  snapshot: CharacterSaveSnapshot,
  characterId: string,
): Promise<void> => {
  const characterValue = {
    name: snapshot.name,
    prompt: snapshot.prompt,
    builderDraft: snapshot.draft,
    guidedDesign: snapshot.design,
    referenceImageStatus: snapshot.referenceImage
      ? ('persisted-reference' as const)
      : ('prompt-only' as const),
    referenceImageAssetId: snapshot.referenceImage?.assetId ?? null,
    uploadedReferenceImageAssetId: snapshot.uploadedReferenceImageAssetId,
    finalReferenceKind: snapshot.finalReferenceKind,
  };

  if (snapshot.saveKind === 'edit') {
    await repository.updateSavedCharacterPrompt(characterId, characterValue);
    return;
  }

  await repository.persistSavedCharacterPrompt({
    id: characterId,
    ...characterValue,
    source: 'generator',
    promptIntent: snapshot.draft ? 'character-transform' : null,
  });
};
