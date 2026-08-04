import { useTheme } from '@emotion/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { uploadReferenceImage } from '../../adapters/api-client/apiClient';
import { validateReferenceImage } from '../../adapters/browser-media/imageValidation';
import { ReferenceImageInputField } from '../reference-images/ReferenceImageInputField';
import {
  Button,
  SegmentedControl,
  StatusNotice,
  Surface,
  TextAreaField,
  TextField,
} from '../../ui';
import type { CreativeAssetRepository, SavedPrompt, VtonInputKind } from './types';

const inputOptions = [
  { value: 'prompt', label: 'Prompt' },
  { value: 'saved-outfit', label: 'Reference image' },
] as const;

type OutfitBuilderProps = {
  readonly repository: CreativeAssetRepository;
  readonly initialOutfit?: SavedPrompt | undefined;
  readonly saveAsCopy?: boolean | undefined;
  readonly saveAndSelect?: boolean | undefined;
  readonly disabledReason?: string | undefined;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onCancel: () => void;
  readonly onSaved: (outfit: SavedPrompt) => void;
};

const createRequestId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `outfit-${Date.now().toString(36)}`;

export const OutfitBuilder = ({
  repository,
  initialOutfit,
  saveAsCopy = false,
  saveAndSelect = false,
  disabledReason,
  onDirtyChange,
  onCancel,
  onSaved,
}: OutfitBuilderProps) => {
  const theme = useTheme();
  const initialKind = initialOutfit?.vtonInputKind ?? 'prompt';
  const [inputKind, setInputKind] = useState<VtonInputKind>(initialKind);
  const [prompt, setPrompt] = useState(initialOutfit?.prompt ?? '');
  const [enhancePrompt, setEnhancePrompt] = useState(initialOutfit?.enhancePrompt ?? false);
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [retainedReferenceId, setRetainedReferenceId] = useState(
    initialOutfit?.referenceImageAssetId ?? null,
  );
  const [step, setStep] = useState<'build' | 'name'>('build');
  const [name, setName] = useState(
    saveAsCopy ? `${initialOutfit?.title ?? 'Outfit'} copy` : (initialOutfit?.title ?? ''),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestIdRef = useRef(createRequestId());
  const uploadedAssetIdRef = useRef<string | null>(null);

  const dirty =
    inputKind !== initialKind ||
    prompt !== (initialOutfit?.prompt ?? '') ||
    enhancePrompt !== (initialOutfit?.enhancePrompt ?? false) ||
    referenceFile !== null ||
    retainedReferenceId !== (initialOutfit?.referenceImageAssetId ?? null) ||
    name !==
      (saveAsCopy ? `${initialOutfit?.title ?? 'Outfit'} copy` : (initialOutfit?.title ?? ''));

  useLayoutEffect(() => {
    onDirtyChange(dirty);
    return () => onDirtyChange(false);
  }, [dirty, onDirtyChange]);

  const chooseReference = async (file: File) => {
    setError(null);
    const validation = await validateReferenceImage(file, 'lucy-vton-latest');
    if (validation.blockingError) {
      setError(validation.blockingError);
      return;
    }
    uploadedAssetIdRef.current = null;
    setRetainedReferenceId(null);
    setReferenceFile(file);
  };

  const buildValid =
    inputKind === 'prompt' ? Boolean(prompt.trim()) : Boolean(referenceFile || retainedReferenceId);

  const save = async () => {
    if (!name.trim() || name.trim().length > 80 || !buildValid || disabledReason) return;
    setSaving(true);
    setError(null);
    try {
      let referenceImageAssetId = inputKind === 'saved-outfit' ? retainedReferenceId : null;
      if (inputKind === 'saved-outfit' && referenceFile && !uploadedAssetIdRef.current) {
        const asset = await uploadReferenceImage(referenceFile, requestIdRef.current);
        uploadedAssetIdRef.current = asset.assetId;
      }
      if (inputKind === 'saved-outfit') {
        referenceImageAssetId = uploadedAssetIdRef.current ?? retainedReferenceId;
      }
      const payload = {
        title: name.trim(),
        prompt:
          inputKind === 'prompt'
            ? prompt
            : initialOutfit?.vtonInputKind === 'saved-outfit'
              ? initialOutfit.prompt
              : '',
        referenceImageAssetId,
        vtonInputKind: inputKind,
        enhancePrompt: inputKind === 'prompt' && enhancePrompt,
      } as const;
      const saved =
        initialOutfit && !saveAsCopy
          ? repository.updateSavedPrompt(initialOutfit.id, payload)
          : repository.createSavedPrompt({
              ...payload,
              modelModeId: 'lucy-vton-latest',
              source: 'manual',
            });
      onDirtyChange(false);
      onSaved(saved);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'The outfit could not be saved. Try again.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-outfit-builder-dirty={dirty ? 'true' : 'false'}
      css={{ display: 'grid', gap: theme.space.md, alignContent: 'start' }}
    >
      <Surface tone="soft" padding="compact">
        <p>
          Build a reusable garment recipe. Saving does not start the camera, contact Decart, or
          submit an image provider request.
        </p>
      </Surface>
      {error ? (
        <StatusNotice tone="danger" role="alert">
          {error}
        </StatusNotice>
      ) : null}
      {step === 'build' ? (
        <>
          <SegmentedControl
            label="Outfit input"
            value={inputKind}
            options={inputOptions}
            disabled={saving}
            onChange={(next) => {
              setInputKind(next);
              setError(null);
            }}
          />
          {inputKind === 'prompt' ? (
            <>
              <TextAreaField
                label="Garment direction"
                hint={`${prompt.length}/1,200`}
                value={prompt}
                maxLength={1_200}
                disabled={saving}
                placeholder="Describe the garment and desired appearance"
                onChange={(event) => setPrompt(event.currentTarget.value)}
              />
              <label>
                <input
                  type="checkbox"
                  checked={enhancePrompt}
                  disabled={saving}
                  onChange={(event) => setEnhancePrompt(event.currentTarget.checked)}
                />{' '}
                Enhance prompt
              </label>
            </>
          ) : (
            <>
              {retainedReferenceId && !referenceFile ? (
                <StatusNotice tone="neutral">
                  The currently saved local reference image will be retained unless you replace it.
                </StatusNotice>
              ) : null}
              <ReferenceImageInputField
                kind="garment"
                file={referenceFile}
                disabled={saving}
                allowUrlImport
                onSelectFile={(file) => void chooseReference(file)}
                onRemove={() => {
                  uploadedAssetIdRef.current = null;
                  setReferenceFile(null);
                  setRetainedReferenceId(null);
                }}
              />
            </>
          )}
          <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.xs }}>
            <Button variant="quiet" disabled={saving} onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!buildValid || saving}
              onClick={() => setStep('name')}
            >
              Continue to save
            </Button>
          </div>
        </>
      ) : (
        <>
          <TextField
            label="Outfit name"
            value={name}
            maxLength={80}
            disabled={saving}
            required
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <span>{name.length}/80</span>
          <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.xs }}>
            <Button variant="quiet" disabled={saving} onClick={() => setStep('build')}>
              Back
            </Button>
            <Button
              variant="primary"
              busy={saving}
              disabled={!name.trim() || Boolean(disabledReason)}
              title={disabledReason}
              onClick={() => void save()}
            >
              {saveAndSelect ? 'Save & Select' : 'Save outfit'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};
