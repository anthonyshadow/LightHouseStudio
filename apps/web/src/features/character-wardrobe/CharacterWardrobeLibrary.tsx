import { useTheme } from '@emotion/react';
import { useState, type Dispatch, type SetStateAction } from 'react';
import { Button, ConfirmationDialog, StatusNotice, TextField } from '../../ui';
import type {
  CharacterVersionSelection,
  CreativeAssetRepository,
  SavedCharacterPrompt,
  SavedCharacterVariant,
} from '../creative-assets/types';
import { CharacterVersionSelector, type CharacterVersionOption } from './CharacterVersionSelector';
import type { CharacterVariantCreationKind } from './useCharacterWardrobeVariantDraft';

export const CharacterWardrobeLibrary = ({
  repository,
  character,
  variants,
  options,
  addOutfitAvailable,
  changeFeaturesAvailable,
  elevenLabsAvailable,
  useDisabled,
  error,
  setError,
  onUse,
  onSaved,
  onStartCreating,
  onConfigureVoice,
}: {
  readonly repository: CreativeAssetRepository;
  readonly character: SavedCharacterPrompt;
  readonly variants: readonly SavedCharacterVariant[];
  readonly options: readonly CharacterVersionOption[];
  readonly addOutfitAvailable: boolean;
  readonly changeFeaturesAvailable: boolean;
  readonly elevenLabsAvailable: boolean;
  readonly useDisabled: boolean;
  readonly error: string | null;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly onUse: (selection: CharacterVersionSelection) => void;
  readonly onSaved?: () => void;
  readonly onStartCreating: (kind: CharacterVariantCreationKind) => void;
  readonly onConfigureVoice: () => void;
}) => {
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const visibleOptions = options.filter((option) =>
    option.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  const deleteCandidate = deleteCandidateId
    ? (variants.find((variant) => variant.id === deleteCandidateId) ?? null)
    : null;

  return (
    <>
      <div
        css={{
          height: '100%',
          minHeight: 0,
          display: 'grid',
          gridTemplateRows: 'auto auto minmax(0, 1fr)',
          gap: theme.space.sm,
        }}
      >
        <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.xs }}>
          <Button
            variant="primary"
            disabled={!character.referenceImageAssetId || !addOutfitAvailable}
            title={
              !addOutfitAvailable
                ? 'Add Outfit is unavailable until server configuration is complete.'
                : undefined
            }
            onClick={() => onStartCreating('add-outfit')}
          >
            Add outfit
          </Button>
          <Button
            variant="secondary"
            disabled={!character.referenceImageAssetId || !changeFeaturesAvailable}
            title={
              !changeFeaturesAvailable
                ? 'Change Features is unavailable from the selected image provider.'
                : undefined
            }
            onClick={() => onStartCreating('change-features')}
          >
            Change features
          </Button>
          <Button
            variant="secondary"
            disabled={!elevenLabsAvailable}
            title={
              elevenLabsAvailable
                ? undefined
                : 'Default voices are unavailable until ElevenLabs is configured.'
            }
            onClick={onConfigureVoice}
          >
            {character.defaultVoice
              ? `Default voice: ${character.defaultVoice.voiceName}`
              : 'Attach default voice'}
          </Button>
        </div>
        {!character.referenceImageAssetId ? (
          <StatusNotice tone="warning">
            Add or generate a reference image in Character Builder before creating wardrobe
            variants. The original prompt remains usable.
          </StatusNotice>
        ) : !addOutfitAvailable || !changeFeaturesAvailable ? (
          <StatusNotice tone="neutral">
            {!addOutfitAvailable ? 'Add Outfit is not configured. ' : ''}
            {!changeFeaturesAvailable ? 'Change Features is not configured. ' : ''}Saved versions
            remain available.
          </StatusNotice>
        ) : null}
        <div
          data-scroll-region="character-wardrobe"
          css={{
            minHeight: 0,
            overflow: 'auto',
            display: 'grid',
            alignContent: 'start',
            gap: theme.space.sm,
          }}
        >
          <TextField
            label="Search wardrobe"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          {visibleOptions.length ? (
            <CharacterVersionSelector
              versions={visibleOptions}
              selectedValue={character.selectedWardrobeVariantId ?? '__original__'}
              disabled={useDisabled}
              allowPromptOnlyOriginal
              onDelete={setDeleteCandidateId}
              onSelect={(value) =>
                onUse({
                  characterId: character.id,
                  variantId: value === '__original__' ? null : value,
                })
              }
            />
          ) : (
            <StatusNotice tone="neutral">No wardrobe versions match this search.</StatusNotice>
          )}
          {error ? (
            <StatusNotice tone="danger" role="alert">
              {error}
            </StatusNotice>
          ) : null}
          {variants.length === 0 ? <p>No variants yet. Create one when you are ready.</p> : null}
        </div>
      </div>
      <ConfirmationDialog
        open={deleteCandidate !== null}
        title={deleteCandidate ? `Delete “${deleteCandidate.title}”?` : 'Delete character variant?'}
        description="This removes the saved variant and its library links. Cloud-stored image assets are deleted only when no saved item still uses them; local files remain until whole-environment retirement."
        confirmLabel="Delete variant"
        cancelLabel="Keep variant"
        danger
        onCancel={() => setDeleteCandidateId(null)}
        onConfirm={() => {
          void (async () => {
            if (!deleteCandidate) return;
            try {
              await repository.deleteSavedCharacterVariant(deleteCandidate.id);
              setDeleteCandidateId(null);
              setError(null);
              onSaved?.();
            } catch (caught) {
              setDeleteCandidateId(null);
              setError(
                caught instanceof Error
                  ? caught.message
                  : 'The character variant could not be deleted.',
              );
            }
          })();
        }}
      />
    </>
  );
};
