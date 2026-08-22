import { useTheme } from '@emotion/react';
import { useId } from 'react';
import {
  Button,
  ReferenceImagePreview,
  SegmentedControl,
  SelectField,
  StatusNotice,
  TextAreaField,
  TextField,
} from '../../ui';
import type { SavedCharacterPrompt } from '../creative-assets/types';
import { ReferenceImageInputField } from '../reference-images/ReferenceImageInputField';
import { CharacterVersionSelector, type CharacterVersionOption } from './CharacterVersionSelector';
import type { CharacterWardrobeVariantDraft } from './useCharacterWardrobeVariantDraft';
import { media } from '../../ui/media';

export const CharacterWardrobeVariantEditor = ({
  character,
  options,
  draft,
  onClose,
}: {
  readonly character: SavedCharacterPrompt;
  readonly options: readonly CharacterVersionOption[];
  readonly draft: CharacterWardrobeVariantDraft;
  readonly onClose: () => void;
}) => {
  const theme = useTheme();
  const drasticChangesId = useId();
  const creating = draft.creating;
  if (!creating) return null;

  return (
    <div
      css={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        display: 'grid',
        gridTemplateRows: 'auto minmax(0, 1fr) auto',
        overflow: 'hidden',
      }}
    >
      <div
        css={{
          minWidth: 0,
          display: 'grid',
          gap: theme.space.sm,
          paddingBlockEnd: theme.space.sm,
          borderBlockEnd: `1px solid ${theme.colors.border}`,
        }}
      >
        <Button
          variant="quiet"
          disabled={draft.busy}
          css={{ justifySelf: 'start' }}
          onClick={draft.cancelCreation}
        >
          ‹ Back to wardrobe
        </Button>
        <SegmentedControl
          label="Create variant"
          value={creating}
          options={[
            { value: 'add-outfit', label: 'Add Outfit' },
            { value: 'change-features', label: 'Change Features' },
          ]}
          disabled={draft.busy}
          onChange={draft.switchCreationKind}
        />
      </div>

      <div
        data-scroll-region="character-wardrobe-create"
        css={{
          minWidth: 0,
          minHeight: 0,
          overflow: 'auto',
          overscrollBehavior: 'contain',
          scrollbarGutter: 'stable',
          paddingBlock: theme.space.md,
        }}
      >
        <div
          css={{
            minWidth: 0,
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.15fr) minmax(16rem, 0.85fr)',
            alignItems: 'start',
            gap: theme.space.lg,
            [media.down('compact')]: {
              gridTemplateColumns: 'minmax(0, 1fr)',
              gap: theme.space.md,
            },
          }}
        >
          <section aria-labelledby="wardrobe-variant-details" css={{ minWidth: 0 }}>
            <h3 id="wardrobe-variant-details" css={{ marginBlockEnd: theme.space.sm }}>
              Variant details
            </h3>
            <div css={{ display: 'grid', gap: theme.space.md }}>
              <TextField
                label="Variant name"
                hint="Required · This name appears in Wardrobe and Existing Video."
                value={draft.title}
                maxLength={80}
                required
                disabled={draft.busy}
                onChange={(event) => draft.setTitle(event.currentTarget.value)}
              />
              <div>
                <p css={{ marginBlockEnd: theme.space.xs }}>
                  <strong>Person source</strong>
                </p>
                <CharacterVersionSelector
                  versions={options}
                  selectedValue={draft.sourceVariantId ?? '__original__'}
                  disabled={draft.busy}
                  actionLabel="Choose source"
                  onSelect={draft.chooseSource}
                />
              </div>
              {creating === 'add-outfit' ? (
                <div css={{ display: 'grid', gap: theme.space.sm }}>
                  <SegmentedControl
                    label="Garment source"
                    value={draft.garmentInputKind}
                    options={[
                      { value: 'upload', label: 'Upload image' },
                      { value: 'saved', label: 'Saved outfit' },
                    ]}
                    disabled={draft.busy}
                    onChange={draft.selectGarmentInputKind}
                  />
                  {draft.garmentInputKind === 'upload' ? (
                    <ReferenceImageInputField
                      kind="garment"
                      label="Garment image"
                      file={draft.garment}
                      disabled={draft.busy}
                      allowUrlImport
                      onSelectFile={draft.selectGarmentFile}
                      onRemove={() => draft.selectGarmentFile(null)}
                    />
                  ) : (
                    <SelectField
                      label="Saved outfit"
                      value={draft.selectedSavedOutfitId}
                      disabled={draft.busy || draft.imageBackedOutfits.length === 0}
                      placeholder={
                        draft.imageBackedOutfits.length
                          ? 'Choose a saved outfit'
                          : 'No image outfits saved'
                      }
                      options={draft.imageBackedOutfits.map((outfit) => ({
                        value: outfit.id,
                        label: outfit.title,
                        description: outfit.prompt || 'Reference-image outfit',
                      }))}
                      hint="Only saved outfits with a reference image can generate a wardrobe variant."
                      onValueChange={draft.selectSavedOutfit}
                    />
                  )}
                </div>
              ) : (
                <div css={{ display: 'grid', gap: theme.space.xs }}>
                  <TextAreaField
                    label="Required changes"
                    hint={`${draft.instructions.length}/2,000`}
                    maxLength={2_000}
                    value={draft.instructions}
                    disabled={draft.busy}
                    onChange={(event) => draft.updateInstructions(event.currentTarget.value)}
                  />
                  <div
                    css={{
                      minHeight: '2.75rem',
                      display: 'grid',
                      gridTemplateColumns: 'auto minmax(0, 1fr)',
                      alignItems: 'start',
                      gap: theme.space.xs,
                    }}
                  >
                    <input
                      id={drasticChangesId}
                      type="checkbox"
                      checked={draft.allowDrasticChanges}
                      disabled={draft.busy}
                      css={{ width: '1.25rem', height: '1.25rem', marginBlockStart: '0.125rem' }}
                      onChange={(event) =>
                        draft.updateAllowDrasticChanges(event.currentTarget.checked)
                      }
                    />
                    <label
                      htmlFor={drasticChangesId}
                      css={{ cursor: draft.busy ? 'not-allowed' : 'pointer' }}
                    >
                      <strong css={{ display: 'block' }}>Allow major departure from source</strong>
                      <small css={{ color: theme.colors.textMuted }}>
                        Let the prompt replace identity and other defining traits. Leave unchecked
                        to preserve the selected character.
                      </small>
                    </label>
                  </div>
                </div>
              )}
              <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.xs }}>
                <Button
                  variant="primary"
                  busy={draft.busy}
                  disabled={draft.generationDisabled}
                  onClick={() => void draft.generate()}
                >
                  {draft.generateLabel}
                </Button>
                {draft.busy ? (
                  <Button variant="secondary" onClick={draft.invalidatePreview}>
                    Cancel generation
                  </Button>
                ) : null}
              </div>
              {draft.error ? (
                <StatusNotice tone="danger" role="alert">
                  {draft.error}
                </StatusNotice>
              ) : null}
            </div>
          </section>

          <section
            aria-labelledby="wardrobe-preview-heading"
            css={{
              minWidth: 0,
              position: 'sticky',
              top: 0,
              display: 'grid',
              gap: theme.space.sm,
              padding: theme.space.md,
              border: `1px solid ${theme.colors.border}`,
              borderRadius: theme.radii.large,
              background: theme.colors.surfaceSoft,
              [media.down('compact')]: { position: 'static' },
            }}
          >
            <div>
              <h3 id="wardrobe-preview-heading" css={{ margin: 0 }}>
                Generated preview
              </h3>
              <p css={{ margin: `${theme.space.xs} 0 0`, color: theme.colors.textMuted }}>
                Review the latest result before saving. Changing an input clears this preview.
              </p>
            </div>
            {draft.preview ? (
              <ReferenceImagePreview
                assetId={draft.preview.assetId}
                alt={`Generated wardrobe preview for ${character.name}`}
                label="Open larger generated wardrobe preview"
                size="panel"
              />
            ) : (
              <div
                role="status"
                aria-live="polite"
                css={{
                  width: '100%',
                  minHeight: '12rem',
                  aspectRatio: '1',
                  display: 'grid',
                  placeItems: 'center',
                  padding: theme.space.md,
                  border: `1px dashed ${theme.colors.borderStrong}`,
                  borderRadius: theme.radii.medium,
                  color: theme.colors.textMuted,
                  background: theme.colors.canvas,
                  textAlign: 'center',
                }}
              >
                {draft.busy
                  ? 'Generating the latest preview…'
                  : draft.creatingOutfit
                    ? 'Your generated outfit preview will appear here.'
                    : 'Your changed-features preview will appear here.'}
              </div>
            )}
          </section>
        </div>
      </div>

      <div
        css={{
          minWidth: 0,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          alignItems: 'center',
          gap: theme.space.sm,
          paddingBlockStart: theme.space.sm,
          borderBlockStart: `1px solid ${theme.colors.border}`,
          background: theme.colors.overlaySurface,
          '@media (max-width: 30rem)': {
            gridTemplateColumns: 'minmax(0, 1fr)',
          },
        }}
      >
        <p
          id="wardrobe-save-guidance"
          aria-live="polite"
          css={{ margin: 0, color: theme.colors.textMuted, fontSize: theme.fontSizes.metadata }}
        >
          {draft.saveGuidance}
        </p>
        <div
          css={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
            gap: theme.space.xs,
            '@media (max-width: 30rem)': {
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr)',
            },
          }}
        >
          <Button variant="quiet" disabled={draft.busy} onClick={onClose}>
            Close wardrobe
          </Button>
          <Button
            variant="primary"
            disabled={!draft.canSave || draft.busy}
            aria-describedby="wardrobe-save-guidance"
            onClick={() => void draft.save()}
          >
            Save variant
          </Button>
        </div>
      </div>
    </div>
  );
};
