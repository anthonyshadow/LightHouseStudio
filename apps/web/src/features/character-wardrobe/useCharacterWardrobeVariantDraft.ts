import type { CharacterReferenceOptions, ReferenceImageAsset } from '@studio/contracts';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import {
  createOutfitTryOn,
  discardReferenceImage,
  fetchReferenceImageMetadata,
  uploadReferenceImage,
} from '../../adapters/api-client/apiClient';
import { validateReferenceImage } from '../../adapters/browser-media/imageValidation';
import { useReferencePreviewGeneration } from '../character-builder/useReferencePreviewGeneration';
import type {
  CreativeAssetRepository,
  SavedCharacterPrompt,
  SavedCharacterVariant,
  SavedPrompt,
} from '../creative-assets/types';

const createId = () => crypto.randomUUID();

const DEFAULT_OPTIONS: CharacterReferenceOptions = {
  framing: 'full_body',
  orientation: 'auto',
  renderingMode: 'faithful_source_style',
  expression: 'neutral',
  background: 'neutral_gray',
  targetUse: 'lucy_2_5_character_reference',
};

export type CharacterVariantCreationKind = 'add-outfit' | 'change-features';

const variantSaveGuidance = (hasPreview: boolean, hasTitle: boolean): string => {
  if (!hasPreview) return 'Generate a preview before saving this variant.';
  if (!hasTitle) return 'Enter a variant name to enable Save variant.';
  return 'Ready to save. Saving does not select this version.';
};

const generationActionLabel = (kind: CharacterVariantCreationKind, hasPreview: boolean): string => {
  if (kind === 'add-outfit') return hasPreview ? 'Regenerate outfit' : 'Generate outfit';
  return hasPreview ? 'Regenerate features' : 'Generate changes';
};

type UseCharacterWardrobeVariantDraftOptions = {
  readonly repository: CreativeAssetRepository;
  readonly character: SavedCharacterPrompt;
  readonly variants: readonly SavedCharacterVariant[];
  readonly savedOutfits: readonly SavedPrompt[];
  readonly addOutfitAvailable: boolean;
  readonly changeFeaturesAvailable: boolean;
  readonly error: string | null;
  readonly setError: Dispatch<SetStateAction<string | null>>;
  readonly onSaved?: () => void;
  readonly onDirtyChange: (dirty: boolean) => void;
};

export const useCharacterWardrobeVariantDraft = ({
  repository,
  character,
  variants,
  savedOutfits,
  addOutfitAvailable,
  changeFeaturesAvailable,
  error,
  setError,
  onSaved,
  onDirtyChange,
}: UseCharacterWardrobeVariantDraftOptions) => {
  const [creating, setCreating] = useState<CharacterVariantCreationKind | null>(null);
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
    setSourceVariantId(value === '__original__' ? null : value);
  };

  const selectGarmentInputKind = (value: 'upload' | 'saved') => {
    invalidatePreview();
    discardGarmentAsset();
    setGarmentInputKind(value);
    setGarment(null);
    setSelectedSavedOutfitId('');
  };

  const selectGarmentFile = (file: File | null) => {
    invalidatePreview();
    discardGarmentAsset();
    setGarment(file);
  };

  const selectSavedOutfit = (value: string) => {
    invalidatePreview();
    discardGarmentAsset();
    setSelectedSavedOutfitId(value);
    setGarmentAssetId(
      imageBackedOutfits.find((outfit) => outfit.id === value)?.referenceImageAssetId ?? null,
    );
  };

  const updateInstructions = (value: string) => {
    invalidatePreview();
    setInstructions(value);
  };

  const updateAllowDrasticChanges = (value: boolean) => {
    invalidatePreview();
    setAllowDrasticChanges(value);
  };

  const switchCreationKind = (value: CharacterVariantCreationKind) => {
    invalidatePreview();
    setAllowDrasticChanges(false);
    setCreating(value);
  };

  const cancelCreation = () => {
    invalidatePreview();
    discardGarmentAsset();
    setGarment(null);
    setSelectedSavedOutfitId('');
    setAllowDrasticChanges(false);
    setCreating(null);
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
    ) {
      return;
    }
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

  const generate = async () => {
    if (creating === 'add-outfit') await generateOutfit();
    if (creating === 'change-features') await generateFeatures();
  };

  const save = async () => {
    if (!preview || !sourceAssetId || !title.trim() || !creating) return;
    try {
      await repository.createSavedCharacterVariant({
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
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The character variant could not be saved.',
      );
      return;
    }
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

  const canSave = Boolean(
    preview && sourceAssetId && title.trim() && (creating !== 'add-outfit' || garmentAssetId),
  );
  const creatingOutfit = creating === 'add-outfit';
  const generationDisabled = creatingOutfit
    ? (garmentInputKind === 'upload' ? !garment : !selectedSavedOutfitId) ||
      !sourceAssetId ||
      !addOutfitAvailable
    : !instructions.trim() || !sourceAssetId || !changeFeaturesAvailable;

  return {
    allowDrasticChanges,
    busy,
    canSave,
    cancelCreation,
    chooseSource,
    creating,
    creatingOutfit,
    error,
    garment,
    garmentInputKind,
    generate,
    generateLabel: creating ? generationActionLabel(creating, Boolean(preview)) : '',
    generationDisabled,
    imageBackedOutfits,
    instructions,
    invalidatePreview,
    preview,
    save,
    saveGuidance: variantSaveGuidance(Boolean(preview), Boolean(title.trim())),
    selectGarmentFile,
    selectGarmentInputKind,
    selectedSavedOutfitId,
    selectSavedOutfit,
    setCreating,
    setTitle,
    sourceVariantId,
    switchCreationKind,
    title,
    updateAllowDrasticChanges,
    updateInstructions,
  };
};

export type CharacterWardrobeVariantDraft = ReturnType<typeof useCharacterWardrobeVariantDraft>;
