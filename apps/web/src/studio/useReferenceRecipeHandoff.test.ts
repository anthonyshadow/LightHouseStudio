// @vitest-environment jsdom

import { act, renderHook, waitFor } from '@testing-library/react';
import type { GeneratedReferenceImageAsset, UploadedReferenceImageAsset } from '@studio/contracts';
import { createPromptBuilderDraft } from '@studio/domain';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
  SavedPrompt,
} from '../features/creative-assets/types';
import {
  createEmptyDraft,
  type SessionDraft,
  type SessionReferenceImage,
  type StudioSessionController,
} from '../features/media-session/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../adapters/api-client/apiClient';
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
  modelModeId: 'lucy-latest',
  source: 'manual',
  referenceImageAssetId: 'reference-1',
  vtonInputKind: null,
  enhancePrompt: false,
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
  mode: 'lucy-latest',
  prompt: 'A calm documentary presenter',
  referenceImageAssetId: 'reference-1',
  assetPrompt: 'A calm documentary presenter',
  assetReferenceImageAssetId: 'reference-1',
  vtonInputKind: null,
  enhancePrompt: false,
  assetVtonInputKind: null,
  assetEnhancePrompt: false,
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
          mode: 'lucy-latest',
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
          mode: 'lucy-latest',
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
          mode: 'lucy-latest',
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
          mode: 'lucy-latest',
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
    mediaLocked = false,
    recordingActive = false,
    sessionModeLocked = false,
    characterBuilderOpenBlockedReason,
    canReplaceRecipeDraft = true,
    replaceRecipeDraftResults,
    initialReferenceImage = null,
  }: {
    store: CreativeAssetStore;
    referenceAsset: UploadedReferenceImageAsset | GeneratedReferenceImageAsset;
    mediaLocked?: boolean;
    recordingActive?: boolean;
    sessionModeLocked?: boolean;
    characterBuilderOpenBlockedReason?: string | undefined;
    canReplaceRecipeDraft?: boolean;
    replaceRecipeDraftResults?: readonly boolean[] | undefined;
    initialReferenceImage?: SessionReferenceImage | null;
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
      createSavedCharacterPrompt: vi.fn(),
    } as unknown as CreativeAssetRepository;
    const draft: SessionDraft = {
      mode: 'lucy-latest' as const,
      prompt: '',
      referenceImage: initialReferenceImage,
      enhance: false,
    };
    let replacementAttempt = 0;
    const replaceRecipeDraft = vi.fn(
      (next: {
        mode: 'lucy-latest';
        prompt: string;
        referenceImage: SessionReferenceImage | null;
        enhance: boolean;
      }) => {
        const committed = replaceRecipeDraftResults?.[replacementAttempt] ?? true;
        replacementAttempt += 1;
        if (!committed) return false;
        Object.assign(draft, next);
        return true;
      },
    );
    const selectMode = vi.fn((mode: SessionDraft['mode']) => {
      Object.assign(draft, createEmptyDraft(mode));
      return true;
    });
    const session = {
      draft,
      replaceRecipeDraft,
      canReplaceRecipeDraft: vi.fn(() => canReplaceRecipeDraft),
      selectMode,
    } as unknown as StudioSessionController;
    const openWorkshopOverlay = vi.fn();
    const closeOverlay = vi.fn();
    const result = renderHook(() =>
      useReferenceRecipeHandoff({
        repository,
        store,
        session,
        mediaLocked,
        recordingActive,
        sessionModeLocked,
        characterBuilderOpenBlockedReason,
        openWorkshopOverlay,
        closeOverlay,
      }),
    );
    return {
      ...result,
      closeOverlay,
      draft,
      hydrated,
      openWorkshopOverlay,
      recordSuccessfulPrompt,
      replaceRecipeDraft,
      repository,
      selectMode,
      session,
    };
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
      selectedWardrobeVariantId: null,
      defaultVoice: null,
      notes: '',
      tags: [],
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
      lastUsedAt: null,
      useCount: 0,
    };
    const store: CreativeAssetStore = {
      schemaVersion: 7,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [character],
      savedCharacterVariants: [],
    };
    const harness = renderHandoff({ store, referenceAsset: uploadedAsset });

    act(() => {
      harness.result.current.actions.useRecipe({
        origin: 'character-prompt',
        assetId: character.id,
        prompt: '',
        modelModeId: 'lucy-latest',
        referenceImageAssetId: uploadedAsset.assetId,
      });
    });

    await waitFor(() =>
      expect(harness.replaceRecipeDraft).toHaveBeenCalledWith({
        mode: 'lucy-latest',
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
      harness.result.current.actions.recordCommittedPrompt(
        'lucy-latest',
        '',
        uploadedAsset.assetId,
      );
    });
    expect(harness.recordSuccessfulPrompt).toHaveBeenCalledWith({
      prompt: '',
      modelModeId: 'lucy-latest',
      referenceImageAssetId: uploadedAsset.assetId,
      savedCharacterPromptId: character.id,
      characterName: character.name,
      vtonInputKind: null,
      enhancePrompt: false,
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
      selectedWardrobeVariantId: null,
      defaultVoice: null,
      notes: '',
      tags: [],
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
      lastUsedAt: null,
      useCount: 0,
    };
    const store: CreativeAssetStore = {
      schemaVersion: 7,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [character],
      savedCharacterVariants: [],
    };
    const harness = renderHandoff({ store, referenceAsset: generatedAsset });

    act(() => {
      harness.result.current.actions.useRecipe({
        origin: 'character-prompt',
        assetId: character.id,
        prompt: character.prompt,
        modelModeId: 'lucy-latest',
        referenceImageAssetId: generatedAsset.assetId,
        builderDraft: draft,
      });
    });

    await waitFor(() =>
      expect(harness.replaceRecipeDraft).toHaveBeenCalledWith({
        mode: 'lucy-latest',
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
      selectedWardrobeVariantId: null,
      defaultVoice: null,
      notes: '',
      tags: [],
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
      lastUsedAt: null,
      useCount: 0,
    };
    const store: CreativeAssetStore = {
      schemaVersion: 7,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [character],
      savedCharacterVariants: [],
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
        modelModeId: 'lucy-latest',
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

  it('unselects the active character only after returning the session to local mode', async () => {
    const character = {
      id: 'removable-character',
      name: 'Removable field host',
      prompt: generatedAsset.originalPrompt,
      source: 'generator' as const,
      promptIntent: 'character-transform' as const,
      builderDraft: null,
      guidedDesign: null,
      referenceImageStatus: 'persisted-reference' as const,
      referenceImageAssetId: generatedAsset.assetId,
      uploadedReferenceImageAssetId: null,
      finalReferenceKind: 'generated' as const,
      selectedWardrobeVariantId: null,
      defaultVoice: null,
      notes: '',
      tags: [],
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
      lastUsedAt: null,
      useCount: 0,
    };
    const store: CreativeAssetStore = {
      schemaVersion: 7,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [character],
      savedCharacterVariants: [],
    };
    const harness = renderHandoff({ store, referenceAsset: generatedAsset });

    act(() => {
      harness.result.current.actions.useRecipe({
        origin: 'character-prompt',
        assetId: character.id,
        prompt: character.prompt,
        modelModeId: 'lucy-latest',
        referenceImageAssetId: generatedAsset.assetId,
      });
    });
    await waitFor(() =>
      expect(harness.result.current.state.activeCharacterName).toBe(character.name),
    );

    let cleared = false;
    act(() => {
      cleared = harness.result.current.actions.clearActiveCharacter();
    });

    expect(cleared).toBe(true);
    expect(harness.selectMode).toHaveBeenCalledWith('local');
    expect(harness.draft).toEqual(createEmptyDraft('local'));
    expect(harness.result.current.state.activeCharacterName).toBeUndefined();
    expect(harness.result.current.state.activeRecipe).toBeNull();
  });

  it('retains a deleted image-only character name when reusing its standalone Recent recipe', async () => {
    const store: CreativeAssetStore = {
      schemaVersion: 7,
      savedPrompts: [],
      recentPrompts: [
        {
          id: 'standalone-image-only-recent',
          prompt: '',
          modelModeId: 'lucy-latest',
          characterName: 'Deleted archive character',
          referenceImageAssetId: uploadedAsset.assetId,
          vtonInputKind: null,
          enhancePrompt: false,
          usedAt: '2026-07-21T12:00:00.000Z',
        },
      ],
      savedCharacterPrompts: [],
      savedCharacterVariants: [],
    };
    const harness = renderHandoff({ store, referenceAsset: uploadedAsset });

    act(() => {
      harness.result.current.actions.useRecipe({
        origin: 'recent-prompt',
        prompt: '',
        modelModeId: 'lucy-latest',
        characterName: 'Deleted archive character',
        referenceImageAssetId: uploadedAsset.assetId,
      });
    });
    await waitFor(() => expect(harness.replaceRecipeDraft).toHaveBeenCalledOnce());

    act(() => {
      harness.result.current.actions.recordCommittedPrompt(
        'lucy-latest',
        '',
        uploadedAsset.assetId,
      );
    });
    expect(harness.recordSuccessfulPrompt).toHaveBeenCalledWith({
      prompt: '',
      modelModeId: 'lucy-latest',
      referenceImageAssetId: uploadedAsset.assetId,
      characterName: 'Deleted archive character',
      vtonInputKind: null,
      enhancePrompt: false,
    });
  });

  it('retains the exact failed selection for owner-scoped retry and commits only once', async () => {
    const store: CreativeAssetStore = {
      schemaVersion: 7,
      savedPrompts: [savedPrompt],
      recentPrompts: [],
      savedCharacterPrompts: [],
      savedCharacterVariants: [],
    };
    fetchReferenceImageMetadata
      .mockRejectedValueOnce(new ApiClientError('missing', 404, 'not_found'))
      .mockResolvedValueOnce(uploadedAsset);
    const harness = renderHandoff({ store, referenceAsset: uploadedAsset });

    act(() => {
      harness.result.current.actions.useRecipe({
        origin: 'saved-prompt',
        assetId: savedPrompt.id,
        prompt: savedPrompt.prompt,
        modelModeId: savedPrompt.modelModeId,
        referenceImageAssetId: uploadedAsset.assetId,
      });
    });

    await waitFor(() =>
      expect(harness.result.current.state.referenceUseFailureMessage).toContain(
        'no longer available',
      ),
    );
    expect(harness.replaceRecipeDraft).not.toHaveBeenCalled();
    expect(harness.closeOverlay).not.toHaveBeenCalled();

    act(() => {
      harness.result.current.actions.retryReferenceUse();
    });

    await waitFor(() => expect(harness.replaceRecipeDraft).toHaveBeenCalledOnce());
    expect(fetchReferenceImageMetadata).toHaveBeenCalledTimes(2);
    expect(fetchReferenceImageMetadata).toHaveBeenLastCalledWith(
      uploadedAsset.assetId,
      expect.any(AbortSignal),
    );
    expect(hydrateReferenceImage).toHaveBeenCalledOnce();
    expect(hydrateReferenceImage).toHaveBeenCalledWith(
      uploadedAsset.assetId,
      uploadedAsset,
      expect.any(AbortSignal),
    );
    expect(harness.result.current.state.referenceUseFailureMessage).toBeNull();
    expect(harness.closeOverlay).toHaveBeenCalledOnce();
  });

  it('rejects duplicate selections while one hydration operation owns the commit path', async () => {
    let resolveMetadata: ((asset: UploadedReferenceImageAsset) => void) | undefined;
    fetchReferenceImageMetadata.mockImplementation(
      () =>
        new Promise<UploadedReferenceImageAsset>((resolve) => {
          resolveMetadata = resolve;
        }),
    );
    const store: CreativeAssetStore = {
      schemaVersion: 7,
      savedPrompts: [savedPrompt],
      recentPrompts: [],
      savedCharacterPrompts: [],
      savedCharacterVariants: [],
    };
    const harness = renderHandoff({ store, referenceAsset: uploadedAsset });
    const selection = {
      origin: 'saved-prompt' as const,
      assetId: savedPrompt.id,
      prompt: savedPrompt.prompt,
      modelModeId: savedPrompt.modelModeId,
      referenceImageAssetId: uploadedAsset.assetId,
    };

    act(() => {
      harness.result.current.actions.useRecipe(selection);
      harness.result.current.actions.useRecipe(selection);
    });

    expect(fetchReferenceImageMetadata).toHaveBeenCalledOnce();
    expect(harness.result.current.state.referenceUsePending).toBe(true);
    act(() => {
      resolveMetadata?.(uploadedAsset);
    });
    await waitFor(() => expect(harness.replaceRecipeDraft).toHaveBeenCalledOnce());
  });

  it('aborts hydration on unmount and prevents stale session or repository commits', () => {
    let operationSignal: AbortSignal | undefined;
    fetchReferenceImageMetadata.mockImplementationOnce((_assetId: string, signal?: AbortSignal) => {
      operationSignal = signal;
      return new Promise<UploadedReferenceImageAsset>(() => undefined);
    });
    const store: CreativeAssetStore = {
      schemaVersion: 7,
      savedPrompts: [savedPrompt],
      recentPrompts: [],
      savedCharacterPrompts: [],
      savedCharacterVariants: [],
    };
    const harness = renderHandoff({ store, referenceAsset: uploadedAsset });

    act(() => {
      harness.result.current.actions.useRecipe({
        origin: 'saved-prompt',
        assetId: savedPrompt.id,
        prompt: savedPrompt.prompt,
        modelModeId: savedPrompt.modelModeId,
        referenceImageAssetId: uploadedAsset.assetId,
      });
    });
    expect(operationSignal).toBeDefined();

    harness.unmount();

    expect(operationSignal?.aborted).toBe(true);
    expect(harness.replaceRecipeDraft).not.toHaveBeenCalled();
    expect(harness.recordSuccessfulPrompt).not.toHaveBeenCalled();
    expect(harness.closeOverlay).not.toHaveBeenCalled();
  });

  it('retains the failed commit for retry without publishing identity or closing early', async () => {
    const exactSavedPrompt = {
      ...savedPrompt,
      referenceImageAssetId: uploadedAsset.assetId,
    };
    const store: CreativeAssetStore = {
      schemaVersion: 7,
      savedPrompts: [exactSavedPrompt],
      recentPrompts: [],
      savedCharacterPrompts: [],
      savedCharacterVariants: [],
    };
    const harness = renderHandoff({
      store,
      referenceAsset: uploadedAsset,
      replaceRecipeDraftResults: [false, true],
    });

    act(() => {
      harness.result.current.actions.useRecipe({
        origin: 'saved-prompt',
        assetId: exactSavedPrompt.id,
        prompt: exactSavedPrompt.prompt,
        modelModeId: exactSavedPrompt.modelModeId,
        referenceImageAssetId: uploadedAsset.assetId,
      });
    });

    await waitFor(() =>
      expect(harness.result.current.state.referenceUseFailureMessage).toContain(
        'Release the active camera',
      ),
    );
    expect(harness.result.current.state.activeRecipe).toBeNull();
    expect(harness.closeOverlay).not.toHaveBeenCalled();

    act(() => {
      harness.result.current.actions.retryReferenceUse();
    });

    await waitFor(() =>
      expect(harness.result.current.state.activeRecipe).toEqual({
        origin: 'saved-prompt',
        assetId: exactSavedPrompt.id,
      }),
    );
    expect(harness.replaceRecipeDraft).toHaveBeenCalledTimes(2);
    expect(harness.closeOverlay).toHaveBeenCalledOnce();
  });

  it('coordinates a legacy Workshop source through open, atomic use, and save', async () => {
    const workshopDraft = createPromptBuilderDraft('add-object');
    const character: SavedCharacterPrompt = {
      id: 'legacy-workshop-character',
      name: 'Legacy object edit',
      prompt: 'Add a brass desk lamp beside the presenter.',
      source: 'generator',
      promptIntent: 'add-object',
      builderDraft: workshopDraft,
      guidedDesign: null,
      referenceImageStatus: 'prompt-only',
      referenceImageAssetId: null,
      uploadedReferenceImageAssetId: null,
      finalReferenceKind: null,
      selectedWardrobeVariantId: null,
      defaultVoice: null,
      notes: '',
      tags: [],
      createdAt: '2026-07-21T12:00:00.000Z',
      updatedAt: '2026-07-21T12:00:00.000Z',
      lastUsedAt: null,
      useCount: 0,
    };
    const store: CreativeAssetStore = {
      schemaVersion: 7,
      savedPrompts: [],
      recentPrompts: [],
      savedCharacterPrompts: [character],
      savedCharacterVariants: [],
    };
    const harness = renderHandoff({ store, referenceAsset: uploadedAsset });

    act(() => {
      harness.result.current.actions.openSavedWorkshop(workshopDraft, character);
    });
    expect(harness.openWorkshopOverlay).toHaveBeenCalledOnce();
    expect(harness.result.current.state.workshopDraft).toEqual(workshopDraft);

    act(() => {
      harness.result.current.actions.applyWorkshopPrompt({
        prompt: character.prompt,
        draft: workshopDraft,
        validation: { valid: true, blocking: [], warnings: [] },
        referenceImageAssetId: null,
      });
    });
    await waitFor(() =>
      expect(harness.result.current.state.activeRecipe).toEqual({
        origin: 'character-prompt',
        assetId: character.id,
      }),
    );
    expect(fetchReferenceImageMetadata).not.toHaveBeenCalled();
    expect(harness.replaceRecipeDraft).toHaveBeenCalledOnce();

    await act(async () => {
      await harness.result.current.actions.saveWorkshopPrompt({
        name: 'Saved object edit',
        prompt: character.prompt,
        draft: workshopDraft,
        validation: { valid: true, blocking: [], warnings: [] },
        referenceImageAssetId: null,
      });
    });
    expect(harness.repository.createSavedCharacterPrompt).toHaveBeenCalledWith({
      name: 'Saved object edit',
      prompt: character.prompt,
      source: 'generator',
      promptIntent: 'add-object',
      builderDraft: workshopDraft,
      referenceImageStatus: 'prompt-only',
      referenceImageAssetId: null,
    });
  });

  it('restores and attributes an enhanced prompt outfit without media or reference hydration', async () => {
    const outfit: SavedPrompt = {
      ...savedPrompt,
      id: 'prompt-outfit',
      title: 'Copper overshirt',
      prompt: 'A copper linen overshirt.',
      modelModeId: 'lucy-vton-latest',
      referenceImageAssetId: null,
      vtonInputKind: 'prompt',
      enhancePrompt: true,
    };
    const harness = renderHandoff({
      store: {
        schemaVersion: 7,
        savedPrompts: [outfit],
        recentPrompts: [],
        savedCharacterPrompts: [],
        savedCharacterVariants: [],
      },
      referenceAsset: uploadedAsset,
    });

    act(() => {
      harness.result.current.actions.useRecipe({
        origin: 'saved-prompt',
        assetId: outfit.id,
        prompt: outfit.prompt,
        modelModeId: outfit.modelModeId,
        referenceImageAssetId: null,
        vtonInputKind: 'prompt',
        enhancePrompt: true,
      });
    });
    await waitFor(() =>
      expect(harness.replaceRecipeDraft).toHaveBeenCalledWith({
        mode: 'lucy-vton-latest',
        prompt: outfit.prompt,
        referenceImage: null,
        enhance: true,
      }),
    );
    expect(fetchReferenceImageMetadata).not.toHaveBeenCalled();
    expect(harness.result.current.state.activeRecipeLabel).toBe('Copper overshirt');

    act(() => {
      harness.result.current.actions.recordCommittedPrompt('lucy-vton-latest', outfit.prompt, null);
    });
    expect(harness.recordSuccessfulPrompt).toHaveBeenCalledWith({
      prompt: outfit.prompt,
      modelModeId: 'lucy-vton-latest',
      savedPromptId: outfit.id,
      referenceImageAssetId: null,
      vtonInputKind: 'prompt',
      enhancePrompt: true,
    });
  });

  it('preserves Character Builder blocking precedence across Shelf and hydration state', () => {
    const externalBlock = renderHandoff({
      store: {
        schemaVersion: 7,
        savedPrompts: [],
        recentPrompts: [],
        savedCharacterPrompts: [],
        savedCharacterVariants: [],
      },
      referenceAsset: uploadedAsset,
      characterBuilderOpenBlockedReason: 'Finish the current take first.',
      canReplaceRecipeDraft: false,
    });
    expect(externalBlock.result.current.state.characterBuilderSaveBlockedReason).toBe(
      'Finish the current take first.',
    );

    const shelfBlock = renderHandoff({
      store: {
        schemaVersion: 7,
        savedPrompts: [],
        recentPrompts: [],
        savedCharacterPrompts: [],
        savedCharacterVariants: [],
      },
      referenceAsset: uploadedAsset,
    });
    act(() => {
      shelfBlock.result.current.actions.setShelfDirty(true);
    });
    expect(shelfBlock.result.current.state.characterBuilderSaveBlockedReason).toContain(
      'unfinished Recipe Shelf changes',
    );

    const sessionBlock = renderHandoff({
      store: {
        schemaVersion: 7,
        savedPrompts: [],
        recentPrompts: [],
        savedCharacterPrompts: [],
        savedCharacterVariants: [],
      },
      referenceAsset: uploadedAsset,
      canReplaceRecipeDraft: false,
    });
    expect(sessionBlock.result.current.state.characterBuilderSaveBlockedReason).toContain(
      'Release the active camera',
    );

    fetchReferenceImageMetadata.mockImplementationOnce(
      () => new Promise<UploadedReferenceImageAsset>(() => undefined),
    );
    const pendingBlock = renderHandoff({
      store: {
        schemaVersion: 7,
        savedPrompts: [
          {
            ...savedPrompt,
            referenceImageAssetId: uploadedAsset.assetId,
          },
        ],
        recentPrompts: [],
        savedCharacterPrompts: [],
        savedCharacterVariants: [],
      },
      referenceAsset: uploadedAsset,
    });
    act(() => {
      pendingBlock.result.current.actions.useRecipe({
        origin: 'saved-prompt',
        assetId: savedPrompt.id,
        prompt: savedPrompt.prompt,
        modelModeId: savedPrompt.modelModeId,
        referenceImageAssetId: uploadedAsset.assetId,
      });
    });
    expect(pendingBlock.result.current.state.characterBuilderSaveBlockedReason).toContain(
      'current recipe handoff',
    );
    pendingBlock.unmount();
  });
});
