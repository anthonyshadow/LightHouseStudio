import { projectSessionProposalSchema, type ProjectCurrentResponse } from '@studio/contracts';
import { describe, expect, it } from 'vitest';
import type { CreativeAssetStore } from '../creative-assets/types';
import {
  createProjectCreativeProposal,
  projectCreativeHydrationMetadata,
  projectCreativeHydrationSelection,
  resolveProjectCreativeResourceIssues,
  resolveProjectSavedVoiceResourceIssue,
} from './projectCreativeSessionAdapter';

const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const revisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const sourceAssetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const referenceAssetId = '08ab9b2e-0cb2-4f07-9bed-b931204e1546';
const now = '2026-08-12T16:00:00.000Z';

const store: CreativeAssetStore = {
  schemaVersion: 7,
  recentPrompts: [],
  savedPrompts: [
    {
      id: 'outfit-one',
      title: 'Copper coat',
      prompt: 'A structured copper coat',
      modelModeId: 'lucy-vton-latest',
      source: 'manual',
      referenceImageAssetId: referenceAssetId,
      vtonInputKind: 'saved-outfit',
      enhancePrompt: false,
      tags: [],
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      useCount: 0,
    },
  ],
  savedCharacterPrompts: [
    {
      id: 'character-one',
      name: 'Ari',
      prompt: 'A cinematic explorer',
      source: 'manual',
      promptIntent: null,
      builderDraft: null,
      guidedDesign: null,
      referenceImageStatus: 'persisted-reference',
      referenceImageAssetId: referenceAssetId,
      uploadedReferenceImageAssetId: referenceAssetId,
      finalReferenceKind: 'uploaded',
      selectedWardrobeVariantId: 'variant-one',
      defaultVoice: null,
      notes: '',
      tags: [],
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      useCount: 0,
    },
  ],
  savedCharacterVariants: [
    {
      id: 'variant-one',
      parentCharacterId: 'character-one',
      title: 'Ari · field jacket',
      referenceImageAssetId: referenceAssetId,
      creation: {
        method: 'change-features',
        sourceReferenceImageAssetId: referenceAssetId,
        changeInstructions: 'Add a field jacket.',
      },
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
      useCount: 0,
    },
  ],
};

const current = (): ProjectCurrentResponse => ({
  project: {
    id: projectId,
    campaignId: null,
    title: 'Creative Project',
    status: 'ready',
    version: 2,
    currentRevisionId: revisionId,
    currentRevisionNumber: 2,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  revision: {
    id: revisionId,
    projectId,
    revisionNumber: 2,
    parentRevisionId: null,
    parentRevisionNumber: 1,
    snapshot: {
      schemaVersion: 2,
      sourceAssetId,
      workingMedia: { kind: 'asset', assetId: sourceAssetId },
      presentedMedia: { kind: 'asset', assetId: sourceAssetId },
      selectedCharacter: null,
      selectedOutfit: null,
      selectedVoice: null,
      visualTreatment: { kind: 'none' },
      liveMode: null,
      creativeIntent: {
        promptId: null,
        promptLabel: null,
        recipeId: null,
        recipeLabel: null,
        userIntent: '',
        appliedPrompt: null,
        referenceAssetId: null,
        resourceRevision: null,
      },
      localEdit: null,
      exportSpecification: null,
      lastSuccessfulOutput: null,
      workflowPhase: 'creative',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: 'user-edit',
    createdAt: now,
  },
});

/** `current()` with the settled snapshot patched — the shape a capture reads its fallbacks from. */
const currentWith = (
  patch: Partial<ProjectCurrentResponse['revision']['snapshot']>,
): ProjectCurrentResponse => {
  const settled = current();
  return {
    ...settled,
    revision: { ...settled.revision, snapshot: { ...settled.revision.snapshot, ...patch } },
  };
};

const capturePreferences = {
  videoDeviceId: null,
  audioDeviceId: null,
  profile: '1080p30',
  aspectRatio: '9:16',
} as const;

const characterPrompt = 'Replace the character with a red-haired explorer';

describe('Project creative session adapter', () => {
  it('maps an exact Character Variant, treatment, Voice, prompt, and live metadata atomically', () => {
    const proposal = createProjectCreativeProposal({
      current: current(),
      draft: {
        mode: 'lucy-latest',
        prompt: 'Exact applied explorer prompt',
        referenceImage: {
          kind: 'persisted',
          assetId: referenceAssetId,
          file: new File(['image'], 'ari.png', { type: 'image/png' }),
          contentUrl: `/api/reference-images/${referenceAssetId}/content`,
        },
        enhance: false,
      },
      capturePreferences,
      activeRecipe: {
        origin: 'character-prompt',
        assetId: 'character-one',
        variantId: 'variant-one',
      },
      store,
      visualStep: {
        id: 'step-one',
        modelId: 'lucy-latest',
        savedRecipeId: 'variant-one',
        prompt: 'Exact applied explorer prompt',
        enhancePrompt: false,
        referenceImage: null,
        inputKind: 'character',
        provider: 'decart',
        outputResolution: '1080p',
        characterName: 'Ari',
        characterVariantName: 'Ari · field jacket',
      },
      voiceSelection: { kind: 'local', effect: 'warm-studio', voiceName: 'Warm studio' },
    });

    expect(proposal).toMatchObject({
      workflowPhase: 'creative',
      liveMode: {
        modeId: 'lucy-latest',
        captureFormat: 'portrait',
        audioSource: 'model-output',
      },
      selectedCharacter: {
        characterId: 'character-one',
        characterLabel: 'Ari',
        characterRevision: now,
        variantId: 'variant-one',
        variantLabel: 'Ari · field jacket',
        variantRevision: now,
        referenceAssetId,
      },
      selectedVoice: {
        kind: 'local-effect',
        effectId: 'warm-studio',
        effectRevision: 'builtin-v1',
      },
      visualTreatment: {
        kind: 'character-swap',
        providerId: 'decart',
        outputResolution: '1080p',
      },
      creativeIntent: {
        // The Character, with the Variant recorded in `selectedCharacter.variantId` above; the
        // label still names the Variant.
        recipeId: 'character-one',
        recipeLabel: 'Ari · field jacket',
        appliedPrompt: 'Exact applied explorer prompt',
        referenceAssetId,
        resourceRevision: now,
      },
    });
    expect(
      projectSessionProposalSchema.safeParse({
        ...proposal,
        localEdit: null,
        exportSpecification: null,
      }).success,
    ).toBe(true);
  });

  it('supports prompt-only Virtual Try-On without fabricating an Outfit resource', () => {
    const proposal = createProjectCreativeProposal({
      current: current(),
      draft: {
        mode: 'lucy-vton-latest',
        prompt: 'A cobalt evening jacket',
        referenceImage: null,
        enhance: true,
      },
      capturePreferences,
      activeRecipe: null,
      store,
      visualStep: null,
      voiceSelection: null,
    });
    expect(proposal.selectedOutfit).toBeNull();
    expect(proposal.visualTreatment).toEqual({
      kind: 'virtual-try-on',
      providerId: null,
      outputResolution: null,
      inputKind: 'prompt',
      enhancePrompt: true,
    });
    expect(
      projectSessionProposalSchema.safeParse({
        ...proposal,
        localEdit: null,
        exportSpecification: null,
      }).success,
    ).toBe(true);
  });

  /*
   * The sequence a submission actually produces: `start()` checkpoints with the editor's step, then
   * the ambient creative edge captures again moments later with no step of its own. Any field the
   * two disagree on appends a revision about a second after the one the run was pinned to, which
   * moves the Project's head past the attempt and stops the run being current mid-flight.
   */
  const captureThenSync = ({
    variantId = null,
    draftReference = referenceAssetId,
  }: {
    readonly variantId?: string | null;
    readonly draftReference?: string | null;
  } = {}) => {
    const draft = {
      mode: 'lucy-latest' as const,
      prompt: characterPrompt,
      referenceImage: draftReference
        ? {
            kind: 'persisted' as const,
            assetId: draftReference,
            file: new File(['image'], 'ari.png', { type: 'image/png' }),
            contentUrl: `/api/reference-images/${draftReference}/content`,
          }
        : null,
      enhance: false,
    };
    const activeRecipe = {
      origin: 'character-prompt',
      assetId: 'character-one',
      variantId,
    } as const;
    const shared = { draft, capturePreferences, activeRecipe, store, voiceSelection: null };

    const checkpoint = createProjectCreativeProposal({
      ...shared,
      current: current(),
      visualStep: {
        id: 'step-one',
        modelId: 'lucy-latest',
        savedRecipeId: variantId ?? 'character-one',
        // Character swap on a server-default binding never carries a prompt of its own.
        prompt: '',
        enhancePrompt: false,
        referenceImage: null,
        inputKind: 'character',
        provider: 'decart',
        outputResolution: '720p',
        characterName: 'Ari',
        characterVariantName: null,
      },
    });

    const ambient = createProjectCreativeProposal({
      ...shared,
      current: currentWith(checkpoint),
      visualStep: null,
    });

    return { checkpoint, ambient };
  };

  it('leaves a checkpointed run settled, so the next ambient capture appends no revision', () => {
    const { checkpoint, ambient } = captureThenSync();

    expect(checkpoint.visualTreatment).toEqual({
      kind: 'character-swap',
      providerId: 'decart',
      outputResolution: '720p',
    });
    expect(checkpoint.creativeIntent.userIntent).toBe(characterPrompt);
    expect(ambient).toEqual(checkpoint);
  });

  it('settles a run checkpointed against a Character Variant the same way', () => {
    const { checkpoint, ambient } = captureThenSync({ variantId: 'variant-one' });

    // The Variant is recorded where hydration and the resource-issue resolver read it from, and
    // the Character is what both captures can name.
    expect(checkpoint.selectedCharacter).toMatchObject({
      characterId: 'character-one',
      variantId: 'variant-one',
    });
    expect(checkpoint.creativeIntent).toMatchObject({
      recipeId: 'character-one',
      recipeLabel: 'Ari · field jacket',
    });
    expect(ambient).toEqual(checkpoint);
  });

  it('records a session reference only when it is not the resolved Character version’s own', () => {
    // Nothing is lost by staying silent: every reader falls back to `selectedCharacter`, which
    // carries the Variant's reference whenever a Variant is selected.
    const { checkpoint } = captureThenSync({ variantId: 'variant-one', draftReference: null });
    expect(checkpoint.creativeIntent.referenceAssetId).toBeNull();
    expect(checkpoint.selectedCharacter?.referenceAssetId).toBe(referenceAssetId);
  });

  it('states its own settings when the treatment kind changes rather than inheriting them', () => {
    const proposal = createProjectCreativeProposal({
      current: currentWith({
        visualTreatment: {
          kind: 'character-swap',
          providerId: 'decart',
          outputResolution: '1080p',
        },
      }),
      draft: {
        mode: 'lucy-vton-latest',
        prompt: 'A cobalt evening jacket',
        referenceImage: null,
        enhance: false,
      },
      capturePreferences,
      activeRecipe: null,
      store,
      visualStep: null,
      voiceSelection: null,
    });

    expect(proposal.visualTreatment).toEqual({
      kind: 'virtual-try-on',
      providerId: null,
      outputResolution: null,
      inputKind: 'prompt',
      enhancePrompt: false,
    });
  });

  it('hydrates only an exact owner-scoped resource revision and retains historical missing labels', () => {
    const snapshot = {
      ...current().revision.snapshot,
      selectedCharacter: {
        characterId: 'character-one',
        characterLabel: 'Historical Ari',
        characterRevision: now,
        variantId: 'variant-one',
        variantLabel: 'Historical field jacket',
        variantRevision: now,
        referenceAssetId,
      },
      visualTreatment: {
        kind: 'character-swap' as const,
        providerId: 'decart',
        outputResolution: '720p' as const,
      },
      creativeIntent: {
        promptId: null,
        promptLabel: null,
        recipeId: 'character-one',
        recipeLabel: 'Historical field jacket',
        userIntent: 'Historical prompt',
        appliedPrompt: 'Historical prompt',
        referenceAssetId,
        resourceRevision: now,
      },
    };
    expect(projectCreativeHydrationSelection(snapshot, store)).toMatchObject({
      origin: 'character-prompt',
      assetId: 'character-one',
      savedCharacterVariantId: 'variant-one',
      prompt: 'Historical prompt',
    });

    const missingStore = { ...store, savedCharacterVariants: [] };
    expect(projectCreativeHydrationSelection(snapshot, missingStore)).toBeNull();
    expect(resolveProjectCreativeResourceIssues(snapshot, missingStore)).toContainEqual(
      expect.objectContaining({
        kind: 'character-variant',
        historicalLabel: 'Historical field jacket',
        reason: 'missing',
      }),
    );
  });

  it('restores only supported live mode and capture metadata without inferring a start', () => {
    expect(
      projectCreativeHydrationMetadata({
        ...current().revision.snapshot,
        liveMode: {
          modeId: 'local',
          captureFormat: 'portrait',
          audioSource: 'local-microphone',
        },
      }),
    ).toEqual({ mode: 'local', aspectRatio: '9:16' });
    expect(
      projectCreativeHydrationMetadata({
        ...current().revision.snapshot,
        liveMode: {
          modeId: 'retired-provider-mode',
          captureFormat: 'freeform',
          audioSource: 'none',
        },
      }),
    ).toEqual({ mode: null, aspectRatio: null });
  });

  it('explains missing prompts and Voices without presenting historical Recipe issues', () => {
    const promptSnapshot = {
      ...current().revision.snapshot,
      creativeIntent: {
        promptId: 'deleted-prompt',
        promptLabel: 'Historical keynote prompt',
        recipeId: null,
        recipeLabel: null,
        userIntent: 'Historical keynote prompt body',
        appliedPrompt: 'Historical keynote prompt body',
        referenceAssetId: null,
        resourceRevision: now,
      },
    };
    expect(resolveProjectCreativeResourceIssues(promptSnapshot, store)).toContainEqual(
      expect.objectContaining({
        kind: 'prompt',
        historicalLabel: 'Historical keynote prompt',
        reason: 'missing',
      }),
    );

    const recipeSnapshot = {
      ...current().revision.snapshot,
      creativeIntent: {
        promptId: null,
        promptLabel: null,
        recipeId: 'outfit-one',
        recipeLabel: 'Historical copper recipe',
        userIntent: 'Historical copper recipe body',
        appliedPrompt: 'Historical copper recipe body',
        referenceAssetId,
        resourceRevision: '2026-08-11T16:00:00.000Z',
      },
    };
    expect(resolveProjectCreativeResourceIssues(recipeSnapshot, store)).toEqual([]);

    const voiceSnapshot = {
      ...current().revision.snapshot,
      selectedVoice: {
        kind: 'saved-voice' as const,
        voiceId: 'voice-one',
        voiceName: 'Historical Nova',
        resourceRevision: null,
        treatment: {
          stability: null,
          similarity: null,
          style: null,
          speakerBoost: null,
        },
      },
    };
    expect(resolveProjectSavedVoiceResourceIssue(voiceSnapshot, 'missing')).toMatchObject({
      kind: 'voice',
      historicalLabel: 'Historical Nova',
      reason: 'missing',
    });
    expect(resolveProjectSavedVoiceResourceIssue(voiceSnapshot, 'unavailable')).toMatchObject({
      reason: 'unavailable',
    });
  });
});
