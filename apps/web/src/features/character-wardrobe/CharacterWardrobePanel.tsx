import type { CharacterReferenceOptions, ReferenceImageAsset } from '@studio/contracts';
import { useTheme } from '@emotion/react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  createOutfitTryOn,
  discardReferenceImage,
  fetchReferenceImageMetadata,
  uploadReferenceImage,
} from '../../adapters/api-client/apiClient';
import { validateReferenceImage } from '../../adapters/browser-media/imageValidation';
import {
  Button,
  ConfirmationDialog,
  ReferenceImagePreview,
  SegmentedControl,
  SelectField,
  StatusNotice,
  TextAreaField,
  TextField,
} from '../../ui';
import type {
  CharacterVersionSelection,
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
  SavedPrompt,
} from '../creative-assets/types';
import { VoiceLibrary } from '../voice-effects/VoiceLibrary';
import { ReferenceImageInputField } from '../reference-images/ReferenceImageInputField';
import { useReferencePreviewGeneration } from '../character-builder/useReferencePreviewGeneration';
import { CharacterVersionSelector, type CharacterVersionOption } from './CharacterVersionSelector';

const createId = () => crypto.randomUUID();
const ORIGINAL_VALUE = '__original__';
const DEFAULT_OPTIONS: CharacterReferenceOptions = {
  framing: 'full_body',
  orientation: 'auto',
  renderingMode: 'faithful_source_style',
  expression: 'neutral',
  background: 'neutral_gray',
  targetUse: 'lucy_2_5_character_reference',
};

type CreationKind = 'add-outfit' | 'change-features';

const variantSaveGuidance = (hasPreview: boolean, hasTitle: boolean): string => {
  if (!hasPreview) return 'Generate a preview before saving this variant.';
  if (!hasTitle) return 'Enter a variant name to enable Save variant.';
  return 'Ready to save. Saving does not select this version.';
};

const generationActionLabel = (kind: CreationKind, hasPreview: boolean): string => {
  if (kind === 'add-outfit') return hasPreview ? 'Regenerate outfit' : 'Generate outfit';
  return hasPreview ? 'Regenerate features' : 'Generate changes';
};

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
  const theme = useTheme();
  const drasticChangesId = useId();
  const variants = store.savedCharacterVariants.filter(
    (variant) => variant.parentCharacterId === character.id,
  );
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState<CreationKind | null>(null);
  const [configuringVoice, setConfiguringVoice] = useState(false);
  const [sourceVariantId, setSourceVariantId] = useState<string | null>(
    character.selectedWardrobeVariantId,
  );
  const [garment, setGarment] = useState<File | null>(null);
  const [garmentInputKind, setGarmentInputKind] = useState<'upload' | 'saved'>('upload');
  const [selectedSavedOutfitId, setSelectedSavedOutfitId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [allowDrasticChanges, setAllowDrasticChanges] = useState(false);
  const [title, setTitle] = useState('');
  const [preview, setPreview] = useState<ReferenceImageAsset | null>(null);
  const [garmentAssetId, setGarmentAssetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteCandidateId, setDeleteCandidateId] = useState<string | null>(null);
  const operationRef = useRef<{ controller: AbortController; key: string } | null>(null);
  const retryRef = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const previewRef = useRef<ReferenceImageAsset | null>(null);
  const garmentAssetIdRef = useRef<string | null>(null);
  const committedAssetIdsRef = useRef(new Set<string>());

  const sourceAssetId = sourceVariantId
    ? (variants.find((variant) => variant.id === sourceVariantId)?.referenceImageAssetId ?? null)
    : character.referenceImageAssetId;
  const imageBackedOutfits = savedOutfits.filter(
    (outfit) => outfit.modelModeId === 'lucy-vton-latest' && outfit.referenceImageAssetId,
  );
  const dirty =
    creating !== null &&
    Boolean(
      sourceVariantId !== character.selectedWardrobeVariantId ||
      garmentInputKind !== 'upload' ||
      selectedSavedOutfitId ||
      garment ||
      instructions.trim() ||
      allowDrasticChanges ||
      title.trim() ||
      preview ||
      busy,
    );
  useLayoutEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);
  useEffect(() => {
    garmentAssetIdRef.current = garmentAssetId;
  }, [garmentAssetId]);
  useEffect(
    () => () => {
      operationRef.current?.controller.abort();
      for (const assetId of [previewRef.current?.assetId, garmentAssetIdRef.current]) {
        if (assetId && !committedAssetIdsRef.current.has(assetId)) {
          void discardReferenceImage(assetId).catch(() => undefined);
        }
      }
    },
    [],
  );

  const featureGeneration = useReferencePreviewGeneration({
    onPhase: () => setBusy(true),
    onOptimizationSuccess: () => undefined,
    onSuccess: (result) => {
      setPreview((replaced) => {
        if (replaced && replaced.assetId !== result.asset.assetId) {
          void discardReferenceImage(replaced.assetId).catch(() => undefined);
        }
        return result.asset;
      });
      setBusy(false);
      setError(null);
    },
    onError: (caught) => {
      setBusy(false);
      setError(
        caught instanceof Error ? caught.message : 'The character features could not be changed.',
      );
    },
  });

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
  const visibleOptions = options.filter((option) =>
    option.title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );

  const invalidatePreview = () => {
    operationRef.current?.controller.abort();
    operationRef.current = null;
    featureGeneration.cancel();
    setPreview((discarded) => {
      if (discarded) void discardReferenceImage(discarded.assetId).catch(() => undefined);
      return null;
    });
    setBusy(false);
    setError(null);
  };

  const discardGarmentAsset = () => {
    if (garmentAssetId) void discardReferenceImage(garmentAssetId).catch(() => undefined);
    setGarmentAssetId(null);
  };

  const chooseSource = (value: string) => {
    invalidatePreview();
    setSourceVariantId(value === ORIGINAL_VALUE ? null : value);
  };

  const generateOutfit = async () => {
    const savedGarmentAssetId = imageBackedOutfits.find(
      (outfit) => outfit.id === selectedSavedOutfitId,
    )?.referenceImageAssetId;
    if (
      !sourceAssetId ||
      (garmentInputKind === 'upload' ? !garment : !savedGarmentAssetId) ||
      busy ||
      !addOutfitAvailable
    )
      return;
    const key =
      garmentInputKind === 'upload'
        ? `${sourceAssetId}:${garment!.name}:${garment!.size}:${garment!.lastModified}`
        : `${sourceAssetId}:saved:${selectedSavedOutfitId}:${savedGarmentAssetId}`;
    const controller = new AbortController();
    operationRef.current = { controller, key };
    setBusy(true);
    setError(null);
    let providerFingerprint: string | null = null;
    let providerRequestId: string | null = null;
    try {
      if (garmentInputKind === 'upload') {
        const validation = await validateReferenceImage(garment!, 'lucy-vton-latest');
        if (validation.blockingError) throw new Error(validation.blockingError);
      }
      const garmentAsset =
        garmentInputKind === 'saved'
          ? { assetId: savedGarmentAssetId! }
          : garmentAssetId
            ? { assetId: garmentAssetId }
            : await uploadReferenceImage(garment!, createId(), controller.signal);
      if (controller.signal.aborted || operationRef.current?.key !== key) return;
      setGarmentAssetId(garmentAsset.assetId);
      providerFingerprint = `${key}:${garmentAsset.assetId}`;
      providerRequestId =
        retryRef.current?.fingerprint === providerFingerprint
          ? retryRef.current.requestId
          : createId();
      const result = await createOutfitTryOn(
        sourceAssetId,
        garmentAsset.assetId,
        providerRequestId,
        controller.signal,
      );
      if (controller.signal.aborted || operationRef.current?.key !== key) return;
      retryRef.current = null;
      setPreview(result);
    } catch (caught) {
      if (!controller.signal.aborted) {
        if (providerFingerprint && providerRequestId) {
          retryRef.current = { fingerprint: providerFingerprint, requestId: providerRequestId };
        }
        setError(caught instanceof Error ? caught.message : 'The outfit could not be generated.');
      }
    } finally {
      if (operationRef.current?.controller === controller) {
        operationRef.current = null;
        setBusy(false);
      }
    }
  };

  const generateFeatures = async () => {
    if (!sourceAssetId || !instructions.trim() || busy || !changeFeaturesAvailable) return;
    const selectedSourceAssetId = sourceAssetId;
    const selectedSourcePromptMode =
      sourceVariantId || allowDrasticChanges ? 'image-only' : 'character-prompt';
    const selectedInstructions = instructions.trim();
    const key = `features:${selectedSourceAssetId}:${allowDrasticChanges ? 'drastic' : 'faithful'}:${selectedInstructions}`;
    const controller = new AbortController();
    operationRef.current = { controller, key };
    setBusy(true);
    setError(null);
    let sourceOptions = DEFAULT_OPTIONS;
    try {
      const metadata = await fetchReferenceImageMetadata(selectedSourceAssetId, controller.signal);
      if (metadata.source === 'generated') sourceOptions = metadata.options;
    } catch {
      if (controller.signal.aborted || operationRef.current?.key !== key) return;
      // The edit call performs the authoritative owner-scoped source validation.
    }
    if (controller.signal.aborted || operationRef.current?.key !== key) return;
    try {
      await featureGeneration.generate(
        {
          rawPrompt:
            character.prompt.trim() || `Faithful character reference for ${character.name}`,
          sourceAssetId: selectedSourceAssetId,
          sourcePromptMode: selectedSourcePromptMode,
          allowDrasticChanges,
          changeInstructions: selectedInstructions,
          options: sourceOptions,
          attemptOptimization: false,
        },
        controller.signal,
      );
    } finally {
      if (operationRef.current?.controller === controller) operationRef.current = null;
    }
  };

  const save = () => {
    if (!preview || !sourceAssetId || !title.trim() || !creating) return;
    repository.createSavedCharacterVariant({
      parentCharacterId: character.id,
      title: title.trim(),
      referenceImageAssetId: preview.assetId,
      creation:
        creating === 'add-outfit'
          ? {
              method: 'add-outfit',
              sourceReferenceImageAssetId: sourceAssetId,
              garmentReferenceImageAssetId: garmentAssetId!,
            }
          : {
              method: 'change-features',
              sourceReferenceImageAssetId: sourceAssetId,
              changeInstructions: instructions.trim(),
            },
    });
    committedAssetIdsRef.current.add(preview.assetId);
    if (garmentAssetId) committedAssetIdsRef.current.add(garmentAssetId);
    onDirtyChange(false);
    setCreating(null);
    setTitle('');
    setGarment(null);
    setGarmentInputKind('upload');
    setSelectedSavedOutfitId('');
    setGarmentAssetId(null);
    setInstructions('');
    setAllowDrasticChanges(false);
    setPreview(null);
    onSaved?.();
  };

  if (!creating) {
    if (configuringVoice) {
      return (
        <div
          data-scroll-region="character-default-voice"
          css={{
            height: '100%',
            minHeight: 0,
            overflow: 'auto',
            display: 'grid',
            gap: theme.space.md,
          }}
        >
          <div
            css={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: theme.space.xs }}
          >
            <Button variant="quiet" onClick={() => setConfiguringVoice(false)}>
              ‹ Back to wardrobe
            </Button>
            {character.defaultVoice ? (
              <Button
                variant="secondary"
                onClick={() =>
                  repository.updateSavedCharacterPrompt(character.id, { defaultVoice: null })
                }
              >
                Remove default voice
              </Button>
            ) : null}
          </div>
          <StatusNotice tone="neutral">
            {character.defaultVoice
              ? `${character.defaultVoice.voiceName} is selected automatically when this character is chosen in the existing-video editor. You can still override it per edit.`
              : 'No default voice is attached. Choose a saved voice below to attach one.'}
          </StatusNotice>
          <VoiceLibrary
            disabled={false}
            selectedVoiceId={character.defaultVoice?.voiceId ?? null}
            onSelect={(voice) =>
              repository.updateSavedCharacterPrompt(character.id, {
                defaultVoice: {
                  kind: 'elevenlabs',
                  voiceId: voice.voiceId,
                  voiceName: voice.name,
                },
              })
            }
          />
        </div>
      );
    }
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
              onClick={() => setCreating('add-outfit')}
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
              onClick={() => setCreating('change-features')}
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
              onClick={() => setConfiguringVoice(true)}
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
                selectedValue={character.selectedWardrobeVariantId ?? ORIGINAL_VALUE}
                disabled={useDisabled}
                allowPromptOnlyOriginal
                onDelete={setDeleteCandidateId}
                onSelect={(value) =>
                  onUse({
                    characterId: character.id,
                    variantId: value === ORIGINAL_VALUE ? null : value,
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
          title={
            deleteCandidate ? `Delete “${deleteCandidate.title}”?` : 'Delete character variant?'
          }
          description="This removes the saved variant and its library links. Cloud-stored image assets are deleted only when no saved item still uses them; local files remain until whole-environment retirement."
          confirmLabel="Delete variant"
          cancelLabel="Keep variant"
          danger
          onCancel={() => setDeleteCandidateId(null)}
          onConfirm={() => {
            if (!deleteCandidate) return;
            try {
              repository.deleteSavedCharacterVariant(deleteCandidate.id);
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
          }}
        />
      </>
    );
  }

  const canSave = Boolean(
    preview && sourceAssetId && title.trim() && (creating !== 'add-outfit' || garmentAssetId),
  );
  const saveGuidance = variantSaveGuidance(Boolean(preview), Boolean(title.trim()));
  const creatingOutfit = creating === 'add-outfit';
  const generationDisabled = creatingOutfit
    ? (garmentInputKind === 'upload' ? !garment : !selectedSavedOutfitId) ||
      !sourceAssetId ||
      !addOutfitAvailable
    : !instructions.trim() || !sourceAssetId || !changeFeaturesAvailable;
  const generateLabel = generationActionLabel(creating, Boolean(preview));

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
          disabled={busy}
          css={{ justifySelf: 'start' }}
          onClick={() => {
            invalidatePreview();
            discardGarmentAsset();
            setGarment(null);
            setSelectedSavedOutfitId('');
            setAllowDrasticChanges(false);
            setCreating(null);
          }}
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
          disabled={busy}
          onChange={(value) => {
            invalidatePreview();
            setAllowDrasticChanges(false);
            setCreating(value);
          }}
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
            '@media (max-width: 48rem)': {
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
                value={title}
                maxLength={80}
                required
                disabled={busy}
                onChange={(event) => setTitle(event.currentTarget.value)}
              />
              <div>
                <p css={{ marginBlockEnd: theme.space.xs }}>
                  <strong>Person source</strong>
                </p>
                <CharacterVersionSelector
                  versions={options}
                  selectedValue={sourceVariantId ?? ORIGINAL_VALUE}
                  disabled={busy}
                  actionLabel="Choose source"
                  onSelect={chooseSource}
                />
              </div>
              {creating === 'add-outfit' ? (
                <div css={{ display: 'grid', gap: theme.space.sm }}>
                  <SegmentedControl
                    label="Garment source"
                    value={garmentInputKind}
                    options={[
                      { value: 'upload', label: 'Upload image' },
                      { value: 'saved', label: 'Saved outfit' },
                    ]}
                    disabled={busy}
                    onChange={(value) => {
                      invalidatePreview();
                      discardGarmentAsset();
                      setGarmentInputKind(value);
                      setGarment(null);
                      setSelectedSavedOutfitId('');
                    }}
                  />
                  {garmentInputKind === 'upload' ? (
                    <ReferenceImageInputField
                      kind="garment"
                      label="Garment image"
                      file={garment}
                      disabled={busy}
                      allowUrlImport
                      onSelectFile={(file) => {
                        invalidatePreview();
                        discardGarmentAsset();
                        setGarment(file);
                      }}
                      onRemove={() => {
                        invalidatePreview();
                        discardGarmentAsset();
                        setGarment(null);
                      }}
                    />
                  ) : (
                    <SelectField
                      label="Saved outfit"
                      value={selectedSavedOutfitId}
                      disabled={busy || imageBackedOutfits.length === 0}
                      placeholder={
                        imageBackedOutfits.length
                          ? 'Choose a saved outfit'
                          : 'No image outfits saved'
                      }
                      options={imageBackedOutfits.map((outfit) => ({
                        value: outfit.id,
                        label: outfit.title,
                        description: outfit.prompt || 'Reference-image outfit',
                      }))}
                      hint="Only saved outfits with a reference image can generate a wardrobe variant."
                      onValueChange={(value) => {
                        invalidatePreview();
                        discardGarmentAsset();
                        setSelectedSavedOutfitId(value);
                        setGarmentAssetId(
                          imageBackedOutfits.find((outfit) => outfit.id === value)
                            ?.referenceImageAssetId ?? null,
                        );
                      }}
                    />
                  )}
                </div>
              ) : (
                <div css={{ display: 'grid', gap: theme.space.xs }}>
                  <TextAreaField
                    label="Required changes"
                    hint={`${instructions.length}/2,000`}
                    maxLength={2_000}
                    value={instructions}
                    disabled={busy}
                    onChange={(event) => {
                      invalidatePreview();
                      setInstructions(event.currentTarget.value);
                    }}
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
                      checked={allowDrasticChanges}
                      disabled={busy}
                      css={{ width: '1.25rem', height: '1.25rem', marginBlockStart: '0.125rem' }}
                      onChange={(event) => {
                        invalidatePreview();
                        setAllowDrasticChanges(event.currentTarget.checked);
                      }}
                    />
                    <label
                      htmlFor={drasticChangesId}
                      css={{ cursor: busy ? 'not-allowed' : 'pointer' }}
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
                  busy={busy}
                  disabled={generationDisabled}
                  onClick={() => (creatingOutfit ? void generateOutfit() : void generateFeatures())}
                >
                  {generateLabel}
                </Button>
                {busy ? (
                  <Button variant="secondary" onClick={invalidatePreview}>
                    Cancel generation
                  </Button>
                ) : null}
              </div>
              {error ? (
                <StatusNotice tone="danger" role="alert">
                  {error}
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
              '@media (max-width: 48rem)': { position: 'static' },
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
            {preview ? (
              <ReferenceImagePreview
                assetId={preview.assetId}
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
                {busy
                  ? 'Generating the latest preview…'
                  : creatingOutfit
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
          {saveGuidance}
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
          <Button variant="quiet" disabled={busy} onClick={onClose}>
            Close wardrobe
          </Button>
          <Button
            variant="primary"
            disabled={!canSave || busy}
            aria-describedby="wardrobe-save-guidance"
            onClick={save}
          >
            Save variant
          </Button>
        </div>
      </div>
    </div>
  );
};
