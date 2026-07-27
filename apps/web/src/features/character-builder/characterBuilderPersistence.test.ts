import { createPromptBuilderDraft } from '@studio/domain';
import { describe, expect, it } from 'vitest';
import { createEmptyGuidedDesign } from './CharacterBuilderForm';
import { DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS } from './ReferenceOptionsFields';
import {
  characterSaveSnapshotFingerprint,
  sanitizeCharacterBuilderDraftValue,
} from './characterBuilderPersistence';

const uploadedAssetId = '8f45ea24-c274-41a5-a988-aa0602115191';
const generatedAssetId = 'deaa355e-1b08-4f78-a465-7291644b2812';

const draftValue = () => ({
  draft: createPromptBuilderDraft('character-transform'),
  design: createEmptyGuidedDesign(),
  options: DEFAULT_CHARACTER_BUILDER_REFERENCE_OPTIONS,
  preview: {
    assetId: generatedAssetId,
    sourceKey: 'prompt-and-upload-source-key',
    stale: false,
  },
  uploadedReference: {
    assetId: uploadedAssetId,
    displayName: '  portrait.png  ',
  },
  pendingSave: null,
});

describe('character builder persisted upload state', () => {
  it('stores independent asset identities and sanitized filenames without image bytes', () => {
    const sanitized = sanitizeCharacterBuilderDraftValue({
      ...draftValue(),
      imageBytes: 'must-not-survive',
      uploadedReference: {
        ...draftValue().uploadedReference,
        displayName: '  portrait.png  ',
        objectUrl: 'blob:must-not-survive',
      },
    });

    expect(sanitized).toMatchObject({
      preview: { assetId: generatedAssetId, stale: false },
      uploadedReference: { assetId: uploadedAssetId, displayName: 'portrait.png' },
    });
    expect(JSON.stringify(sanitized)).not.toMatch(/(?:imageBytes|objectUrl|blob:)/u);
  });

  it('accepts a consistent image-only save journal and rejects mismatched provenance', () => {
    const snapshot = {
      saveKind: 'create' as const,
      name: 'Uploaded Character 01',
      prompt: '',
      draft: null,
      design: null,
      referenceImageAssetId: uploadedAssetId,
      uploadedReferenceImageAssetId: uploadedAssetId,
      finalReferenceKind: 'uploaded',
    } as const;
    const valid = sanitizeCharacterBuilderDraftValue({
      ...draftValue(),
      pendingSave: {
        characterId: 'image-only-character',
        snapshotHash: 'retry-stable-hash',
        stage: 'intent',
        snapshot,
      },
    });
    const invalid = sanitizeCharacterBuilderDraftValue({
      ...draftValue(),
      pendingSave: {
        characterId: 'broken-character',
        snapshotHash: 'broken-hash',
        stage: 'intent',
        snapshot: {
          ...snapshot,
          uploadedReferenceImageAssetId: generatedAssetId,
        },
      },
    });

    expect(valid?.pendingSave?.snapshot).toEqual(snapshot);
    expect(invalid).toBeNull();
  });

  it('includes upload provenance and final kind in the retry fingerprint', async () => {
    const base = {
      saveKind: 'create' as const,
      name: 'Presenter',
      prompt: 'Transform the subject into a presenter.',
      draft: createPromptBuilderDraft('character-transform'),
      design: createEmptyGuidedDesign(),
      referenceImageAssetId: generatedAssetId,
      uploadedReferenceImageAssetId: uploadedAssetId,
      finalReferenceKind: 'generated' as const,
    };

    await expect(characterSaveSnapshotFingerprint(base)).resolves.not.toBe(
      await characterSaveSnapshotFingerprint({
        ...base,
        uploadedReferenceImageAssetId: null,
      }),
    );
    await expect(characterSaveSnapshotFingerprint(base)).resolves.not.toBe(
      await characterSaveSnapshotFingerprint({
        ...base,
        referenceImageAssetId: uploadedAssetId,
        finalReferenceKind: 'uploaded',
      }),
    );
  });
});
