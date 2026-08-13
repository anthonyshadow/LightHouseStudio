import { useState } from 'react';
import type {
  CharacterVersionSelection,
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
  SavedPrompt,
} from '../creative-assets/types';
import { CharacterDefaultVoicePanel } from './CharacterDefaultVoicePanel';
import { CharacterWardrobeLibrary } from './CharacterWardrobeLibrary';
import { CharacterWardrobeVariantEditor } from './CharacterWardrobeVariantEditor';
import type { CharacterVersionOption } from './CharacterVersionSelector';
import { useCharacterWardrobeVariantDraft } from './useCharacterWardrobeVariantDraft';

const ORIGINAL_VALUE = '__original__';

export const CharacterWardrobePanel = ({
  repository,
  store,
  character,
  addOutfitAvailable,
  changeFeaturesAvailable,
  elevenLabsAvailable = false,
  savedOutfits = [],
  useDisabled = false,
  onUse,
  onSaved,
  onDirtyChange,
  onClose,
}: {
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  readonly character: SavedCharacterPrompt;
  readonly addOutfitAvailable: boolean;
  readonly changeFeaturesAvailable: boolean;
  readonly elevenLabsAvailable?: boolean;
  readonly savedOutfits?: readonly SavedPrompt[];
  readonly useDisabled?: boolean;
  readonly onUse: (selection: CharacterVersionSelection) => void;
  readonly onSaved?: () => void;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onClose: () => void;
}) => {
  const [configuringVoice, setConfiguringVoice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const variants = store.savedCharacterVariants.filter(
    (variant) => variant.parentCharacterId === character.id,
  );
  const options: CharacterVersionOption[] = [
    {
      value: ORIGINAL_VALUE,
      title: 'Original',
      referenceImageAssetId: character.referenceImageAssetId,
      original: true,
      useCount: character.useCount,
    },
    ...variants.map((variant) => ({
      value: variant.id,
      title: variant.title,
      referenceImageAssetId: variant.referenceImageAssetId,
      original: false,
      useCount: variant.useCount,
    })),
  ];
  const draft = useCharacterWardrobeVariantDraft({
    repository,
    character,
    variants,
    savedOutfits,
    addOutfitAvailable,
    changeFeaturesAvailable,
    error,
    setError,
    ...(onSaved ? { onSaved } : {}),
    onDirtyChange,
  });

  if (draft.creating) {
    return (
      <CharacterWardrobeVariantEditor
        character={character}
        options={options}
        draft={draft}
        onClose={onClose}
      />
    );
  }

  if (configuringVoice) {
    return (
      <CharacterDefaultVoicePanel
        repository={repository}
        character={character}
        onBack={() => setConfiguringVoice(false)}
      />
    );
  }

  return (
    <CharacterWardrobeLibrary
      repository={repository}
      character={character}
      variants={variants}
      options={options}
      addOutfitAvailable={addOutfitAvailable}
      changeFeaturesAvailable={changeFeaturesAvailable}
      elevenLabsAvailable={elevenLabsAvailable}
      useDisabled={useDisabled}
      error={error}
      setError={setError}
      onUse={onUse}
      {...(onSaved ? { onSaved } : {})}
      onStartCreating={draft.setCreating}
      onConfigureVoice={() => setConfiguringVoice(true)}
    />
  );
};
