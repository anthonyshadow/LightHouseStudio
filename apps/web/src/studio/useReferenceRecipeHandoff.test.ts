// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import type { GeneratedReferenceImageAsset, UploadedReferenceImageAsset } from '@studio/contracts';
import { createPromptBuilderDraft } from '@studio/domain';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedPrompt,
} from '../features/creative-assets/types';
import type { SessionReferenceImage } from '../features/media-session/types';
import type { StudioSessionController } from '../features/media-session/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isExactActiveRecipe, useReferenceRecipeHandoff } from './useReferenceRecipeHandoff';

const fetchReferenceImageMetadata = vi.hoisted(() => vi.fn());
const hydrateReferenceImage = vi.hoisted(() => vi.fn());

vi.mock('../adapters/api-client/apiClient', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, fetchReferenceImageMetadata, hydrateReferenceImage };
});

const savedPrompt: SavedPrompt = {
  id: 'saved-prompt-1',
  title: 'Presenter',
  prompt: 'A calm documentary presenter',
  modelModeId: 'lucy-2.5',
  source: 'manual',
  referenceImageAssetId: 'reference-1',
  tags: [],
  createdAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
  lastUsedAt: null,
  useCount: 0,
};

const persistedReference: SessionReferenceImage = {
  kind: 'persisted',
  assetId: 'reference-1',
  file: new File(['image'], 'reference.png', { type: 'image/png' }),
  contentUrl: '/api/reference-images/reference-1/content',
};

const exactFingerprint = {
  mode: 'lucy-2.5',
  prompt: 'A calm documentary presenter',
  referenceImageAssetId: 'reference-1',
  assetPrompt: 'A calm documentary presenter',
  assetReferenceImageAssetId: 'reference-1',
} as const;

const uploadedAsset: UploadedReferenceImageAsset = {
  assetId: '8f45ea24-c274-41a5-a988-aa0602115191',
  mimeType: 'image/png',
  byteSize: 5,
  source: 'uploaded',
  width: 800,
  height: 1200,
  createdAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
  contentUrl: '/api/reference-images/8f45ea24-c274-41a5-a988-aa0602115191/content',
};

const generatedAsset: GeneratedReferenceImageAsset = {
  assetId: 'deaa355e-1b08-4f78-a465-7291644b2812',
  mimeType: 'image/png',
  byteSize: 5,
  source: 'generated',
  provider: 'openai',
  model: 'gpt-image-2',
  quality: 'high',
  size: '1024x1024',
  width: 1024,
  height: 1024,
  promptHash: 'a'.repeat(64),
  optimizationEnabled: true,
  originalPrompt: 'A calm documentary presenter',
  optimizedImagePrompt: 'A neutral reference of a calm documentary presenter.',
  lucy25CharacterPrompt: 'Transform the subject into a calm documentary presenter.',
  normalizedCharacterDescription: 'A calm documentary presenter.',
  preservedCharacterFacts: [],
  technicalDefaultsAdded: [],
  warnings: [],
  options: {
    framing: 'head_and_shoulders',
    orientation: 'auto',
    renderingMode: 'photorealistic',
    expression: 'neutral',
    background: 'neutral_gray',
    targetUse: 'lucy_2_5_character_reference',
  },
  requestedGenerator: null,
  optimizer: { model: 'gpt-5.6', version: 'lucy-character-reference-v1' },
  optimizationInputHash: 'b'.repeat(64),
  manuallyEdited: false,
  derivation: { kind: 'compose', sourceAssetId: uploadedAsset.assetId },
  createdAt: '2026-07-21T12:00:00.000Z',
  updatedAt: '2026-07-21T12:00:00.000Z',
  contentUrl: '/api/reference-images/deaa355e-1b08-4f78-a465-7291644b2812/content',
};

beforeEach(() => {
  fetchReferenceImageMetadata.mockReset();
  hydrateReferenceImage.mockReset();
});

describe('reference recipe identity', () => {
  it('retains identity across non-semantic prompt whitespace', () => {
    expect(
      isExactActiveRecipe({
        fingerprint: exactFingerprint,
        asset: savedPrompt,
        draft: {
          mode: 'lucy-2.5',
          prompt: '  A calm documentary presenter  ',
          referenceImage: persistedReference,
        },
      }),
    ).toBe(true);
  });

  it('releases identity when the draft reference or stored asset changes', () => {
    const replacementReference: SessionReferenceImage = {
      ...persistedReference,
      assetId: 'reference-2',
    };
    expect(
      isExactActiveRecipe({
        fingerprint: exactFingerprint,
        asset: savedPrompt,
        draft: {
          mode: 'lucy-2.5',
          prompt: savedPrompt.prompt,
          referenceImage: replacementReference,
        },
      }),
    ).toBe(false);
    expect(
      isExactActiveRecipe({
        fingerprint: exactFingerprint,
        asset: { ...savedPrompt, prompt: 'An edited presenter' },
        draft: {
          mode: 'lucy-2.5',
          prompt: savedPrompt.prompt,
          referenceImage: persistedReference,
        },
      }),
    ).toBe(false);
  });

  it('does not treat a session-only reference as the persisted recipe asset', () => {
    const ephemeralReference: SessionReferenceImage = {
      kind: 'ephemeral',
      file: new File(['image'], 'portrait.png', { type: 'image/png' }),
      previewUrl: 'blob:portrait',
    };
    expect(
      isExactActiveRecipe({
        fingerprint: exactFingerprint,
        asset: savedPrompt,
        draft: {
          mode: 'lucy-2.5',
          prompt: savedPrompt.prompt,
          referenceImage: ephemeralReference,
        },
      }),
    ).toBe(false);
  });
});

describe('reference recipe handoff', () => {
  const renderHandoff = ({
    store,
    referenceAsset,
  }: {
    store: CreativeAssetStore;
    referenceAsset: UploadedReferenceImageAsset | GeneratedReferenceImageAsset;
  }) => {
    const hydrated: SessionReferenceImage = {
      kind: 'persisted',
      assetId: referenceAsset.assetId,
      file: new File(['image'], 'reference.png', { type: 'image/png' }),
      contentUrl: referenceAsset.contentUrl,
    };
    fetchReferenceImageMetadata.mockResolvedValue(referenceAsset);
    hydrateReferenceImage.mockResolvedValue(hydrated);
    const recordSuccessfulPrompt = vi.fn();
    const repository = {
      getSnapshot: () => ({ store, health: 'ready', notice: null }),
      recordSuccessfulPrompt,
      enrichNewestMatchingRecent: vi.fn(),
    } as unknown as CreativeAssetRepository;
    const draft = {
      mode: 'lucy-2.5' as const,
      prompt: '',
      referenceImage: null as SessionReferenceImage | null,
      enhance: false,
    };
    const replaceRecipeDraft = vi.fn(
      (next: {
        mode: 'lucy-2.5';
        prompt: string;
        referenceImage: SessionReferenceImage | null;
        enhance: boolean;
      }) => {
        Object.assign(draft, next);
        return true;
      },
    );
    const session = {
      draft,
      replaceRecipeDraft,
      canReplaceRecipeDraft: vi.fn(() => true),
      selectMode: vi.fn(() => true),
    } as unknown as StudioSessionController;
    const result = renderHook(() =>
      useReferenceRecipeHandoff({
        repository,
        store,
        session,
        referenceImagesAvailable: true,
        mediaLocked: false,
        recordingActive: false,
        sessionModeLocked: false,
        characterBuilderOpenBlockedReason: undefined,
        openWorkshopOverlay: vi.fn(),
        closeOverlay: vi.fn(),
      }),
    );
    return { ...result, hydrated, recordSuccessfulPrompt, replaceRecipeDraft };
  };

  it('preloads an image-only character without enhancement and records Recent only after use', async () => {
    const character = {
      id: 'image-only-character',
      name: 'Uploaded Character 01',
      prompt: '',
      source: 'generator' as const,
      promptIntent: null,
      builderDraft: null,
      guidedDesign: null,
      referenceImageStatus: 'persisted-reference' as const,
      referenceImageAssetId: uploadedAsset.assetId,
      uploadedReferenceImageAssetId: uploadedAsset.assetId,
      finalReferenceKind: 'uploaded' as const,
      notes: '',
      tags: [],
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
      lastUsedAt: null,
      useCount: 0,
    };
    const store: CreativeAssetStore = {
      schemaVersion: 4,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [character],
    };
    const harness = renderHandoff({ store, referenceAsset: uploadedAsset });

    act(() => {
      harness.result.current.actions.useRecipe({
        origin: 'character-prompt',
        assetId: character.id,
        prompt: '',
        modelModeId: 'lucy-2.5',
        referenceImageAssetId: uploadedAsset.assetId,
      });
    });

    await waitFor(() =>
      expect(harness.replaceRecipeDraft).toHaveBeenCalledWith({
        mode: 'lucy-2.5',
        prompt: '',
        referenceImage: harness.hydrated,
        enhance: false,
      }),
    );
    await waitFor(() =>
      expect(harness.result.current.state.activeCharacterName).toBe(character.name),
    );
    expect(harness.recordSuccessfulPrompt).not.toHaveBeenCalled();

    act(() => {
      harness.result.current.actions.recordCommittedPrompt('lucy-2.5', '', uploadedAsset.assetId);
    });
    expect(harness.recordSuccessfulPrompt).toHaveBeenCalledWith({
      prompt: '',
      modelModeId: 'lucy-2.5',
      referenceImageAssetId: uploadedAsset.assetId,
      savedCharacterPromptId: character.id,
      characterName: character.name,
    });
  });

  it('uses the generated Lucy prompt and enhancement for a combined preview recipe', async () => {
    const draft = createPromptBuilderDraft('character-transform');
    const character = {
      id: 'combined-character',
      name: 'Documentary presenter',
      prompt: generatedAsset.originalPrompt,
      source: 'generator' as const,
      promptIntent: 'character-transform' as const,
      builderDraft: draft,
      guidedDesign: null,
      referenceImageStatus: 'persisted-reference' as const,
      referenceImageAssetId: generatedAsset.assetId,
      uploadedReferenceImageAssetId: uploadedAsset.assetId,
      finalReferenceKind: 'generated' as const,
      notes: '',
      tags: [],
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
      lastUsedAt: null,
      useCount: 0,
    };
    const store: CreativeAssetStore = {
      schemaVersion: 4,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [character],
    };
    const harness = renderHandoff({ store, referenceAsset: generatedAsset });

    act(() => {
      harness.result.current.actions.useRecipe({
        origin: 'character-prompt',
        assetId: character.id,
        prompt: character.prompt,
        modelModeId: 'lucy-2.5',
        referenceImageAssetId: generatedAsset.assetId,
        builderDraft: draft,
      });
    });

    await waitFor(() =>
      expect(harness.replaceRecipeDraft).toHaveBeenCalledWith({
        mode: 'lucy-2.5',
        prompt: generatedAsset.lucy25CharacterPrompt,
        referenceImage: harness.hydrated,
        enhance: true,
      }),
    );
  });

  it('selects a saved character by its exact recipe and image IDs across legacy provider prompt metadata', async () => {
    const character = {
      id: 'legacy-generated-character',
      name: 'Legacy field host',
      prompt: 'Substitute the subject with a composed field host.',
      source: 'generator' as const,
      promptIntent: 'character-transform' as const,
      builderDraft: null,
      guidedDesign: null,
      referenceImageStatus: 'persisted-reference' as const,
      referenceImageAssetId: generatedAsset.assetId,
      uploadedReferenceImageAssetId: null,
      finalReferenceKind: 'generated' as const,
      notes: '',
      tags: [],
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
      lastUsedAt: null,
      useCount: 0,
    };
    const store: CreativeAssetStore = {
      schemaVersion: 4,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [character],
    };
    const harness = renderHandoff({
      store,
      referenceAsset: {
        ...generatedAsset,
        originalPrompt: 'Legacy provider metadata that predates the saved character recipe.',
      },
    });

    act(() => {
      harness.result.current.actions.useRecipe({
        origin: 'character-prompt',
        assetId: character.id,
        characterName: character.name,
        prompt: character.prompt,
        modelModeId: 'lucy-2.5',
        referenceImageAssetId: generatedAsset.assetId,
      });
    });

    await waitFor(() =>
      expect(harness.result.current.state.activeCharacterName).toBe(character.name),
    );
    expect(harness.result.current.state.activeRecipe).toEqual({
      origin: 'character-prompt',
      assetId: character.id,
    });
  });

  it('retains a deleted image-only character name when reusing its standalone Recent recipe', async () => {
    const store: CreativeAssetStore = {
      schemaVersion: 4,
      savedPrompts: [],
      recentPrompts: [
        {
          id: 'standalone-image-only-recent',
          prompt: '',
          modelModeId: 'lucy-2.5',
          characterName: 'Deleted archive character',
          referenceImageAssetId: uploadedAsset.assetId,
          usedAt: '2026-07-21T12:00:00.000Z',
        },
      ],
      savedCharacterPrompts: [],
    };
    const harness = renderHandoff({ store, referenceAsset: uploadedAsset });

    act(() => {
      harness.result.current.actions.useRecipe({
        origin: 'recent-prompt',
        prompt: '',
        modelModeId: 'lucy-2.5',
        characterName: 'Deleted archive character',
        referenceImageAssetId: uploadedAsset.assetId,
      });
    });
    await waitFor(() => expect(harness.replaceRecipeDraft).toHaveBeenCalledOnce());

    act(() => {
      harness.result.current.actions.recordCommittedPrompt('lucy-2.5', '', uploadedAsset.assetId);
    });
    expect(harness.recordSuccessfulPrompt).toHaveBeenCalledWith({
      prompt: '',
      modelModeId: 'lucy-2.5',
      referenceImageAssetId: uploadedAsset.assetId,
      characterName: 'Deleted archive character',
    });
  });
});
