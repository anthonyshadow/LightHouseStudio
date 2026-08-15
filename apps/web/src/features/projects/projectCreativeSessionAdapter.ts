import type { ProjectCurrentResponse, ProjectSessionProposalContract } from '@studio/contracts';
import { isSessionModeId, resolveCharacterVersion } from '@studio/domain';
import type { RecipeSelection } from '../creative-assets/RecipeShelf.types';
import type { CreativeAssetStore } from '../creative-assets/types';
import type {
  ExistingVideoStep,
  ExistingVideoVoiceSelection,
} from '../existing-video/existingVideoWorkflowTypes';
import type { SessionDraft, StudioMode } from '../media-session/types';
import type { CapturePreferences, LocalCaptureAspectRatio } from '../recording/types';
import type { ActiveStudioRecipe } from '../../studio/referenceRecipeIdentity';

type ProjectSnapshot = ProjectCurrentResponse['revision']['snapshot'];

export type ProjectCreativeProposal = Pick<
  ProjectSessionProposalContract,
  | 'workflowPhase'
  | 'liveMode'
  | 'selectedCharacter'
  | 'selectedOutfit'
  | 'selectedVoice'
  | 'visualTreatment'
  | 'creativeIntent'
>;

export interface ProjectCreativeAdapterInput {
  readonly current: ProjectCurrentResponse;
  readonly draft: SessionDraft;
  readonly capturePreferences: CapturePreferences;
  readonly activeRecipe: ActiveStudioRecipe;
  readonly store: CreativeAssetStore;
  readonly visualStep: ExistingVideoStep | null;
  readonly voiceSelection: ExistingVideoVoiceSelection | null;
}

export interface ProjectCreativeResourceIssue {
  readonly kind: 'character' | 'character-variant' | 'outfit' | 'voice' | 'prompt' | 'recipe';
  readonly historicalLabel: string;
  readonly reason: 'missing' | 'changed' | 'unavailable';
  readonly message: string;
}

export interface ProjectCreativeHydrationMetadata {
  readonly mode: StudioMode | null;
  readonly aspectRatio: LocalCaptureAspectRatio | null;
}

const revisionMatches = (expected: string | null, current: string): boolean =>
  expected === null || expected === current;

export const projectCreativeHydrationMetadata = (
  snapshot: ProjectSnapshot,
): ProjectCreativeHydrationMetadata => {
  const inferredMode =
    snapshot.visualTreatment.kind === 'character-swap' || snapshot.selectedCharacter !== null
      ? 'lucy-latest'
      : snapshot.visualTreatment.kind === 'virtual-try-on' || snapshot.selectedOutfit !== null
        ? 'lucy-vton-latest'
        : null;
  const storedMode = snapshot.liveMode?.modeId;
  const captureFormat = snapshot.liveMode?.captureFormat;
  return {
    mode: inferredMode ?? (isSessionModeId(storedMode) ? storedMode : null),
    aspectRatio:
      captureFormat === 'landscape' ? '16:9' : captureFormat === 'portrait' ? '9:16' : null,
  };
};

export const resolveProjectSavedVoiceResourceIssue = (
  snapshot: ProjectSnapshot,
  status: 'missing' | 'unavailable',
): ProjectCreativeResourceIssue | null => {
  const voice = snapshot.selectedVoice;
  if (voice?.kind !== 'saved-voice') return null;
  return {
    kind: 'voice',
    historicalLabel: voice.voiceName,
    reason: status,
    message:
      status === 'missing'
        ? `${voice.voiceName} is no longer available in this workspace. Its historical applied settings remain in the Project.`
        : `${voice.voiceName} could not be verified against this workspace. Its historical applied settings remain in the Project.`,
  };
};

const characterSelection = (
  activeRecipe: ActiveStudioRecipe,
  store: CreativeAssetStore,
  step: ExistingVideoStep | null,
): ProjectCreativeProposal['selectedCharacter'] => {
  const stepVariant =
    step?.modelId === 'lucy-latest' && step.savedRecipeId
      ? (store.savedCharacterVariants.find((candidate) => candidate.id === step.savedRecipeId) ??
        null)
      : null;
  const stepCharacter =
    step?.modelId === 'lucy-latest' && step.savedRecipeId
      ? (store.savedCharacterPrompts.find(
          (candidate) => candidate.id === (stepVariant?.parentCharacterId ?? step.savedRecipeId),
        ) ?? null)
      : null;
  const characterId =
    stepCharacter?.id ??
    (activeRecipe?.origin === 'character-prompt' ? activeRecipe.assetId : null);
  if (characterId === null) return null;
  const resolved = resolveCharacterVersion(store, {
    characterId,
    variantId:
      stepVariant?.id ??
      (activeRecipe?.origin === 'character-prompt' ? (activeRecipe.variantId ?? null) : null),
  });
  if (!resolved) return null;
  return {
    characterId: resolved.character.id,
    characterLabel: resolved.character.name,
    characterRevision: resolved.character.updatedAt,
    variantId: resolved.variant?.id ?? null,
    variantLabel: resolved.variant?.title ?? null,
    variantRevision: resolved.variant?.updatedAt ?? null,
    referenceAssetId: resolved.referenceImageAssetId,
  };
};

const outfitSelection = (
  activeRecipe: ActiveStudioRecipe,
  store: CreativeAssetStore,
  step: ExistingVideoStep | null,
): ProjectCreativeProposal['selectedOutfit'] => {
  const outfitId =
    step?.modelId === 'lucy-vton-latest' && step.savedRecipeId
      ? step.savedRecipeId
      : activeRecipe?.origin === 'saved-prompt'
        ? activeRecipe.assetId
        : null;
  if (outfitId === null) return null;
  const outfit = store.savedPrompts.find(
    (candidate) => candidate.id === outfitId && candidate.modelModeId === 'lucy-vton-latest',
  );
  if (!outfit) return null;
  return {
    outfitId: outfit.id,
    outfitLabel: outfit.title,
    outfitRevision: outfit.updatedAt,
    referenceAssetId: outfit.referenceImageAssetId,
    inputKind: outfit.vtonInputKind,
  };
};

const voiceProposal = (
  selection: ExistingVideoVoiceSelection | null,
): ProjectCreativeProposal['selectedVoice'] => {
  if (selection === null) return null;
  return selection.kind === 'local'
    ? {
        kind: 'local-effect',
        effectId: selection.effect,
        effectRevision: 'builtin-v1',
      }
    : {
        kind: 'saved-voice',
        voiceId: selection.voiceId,
        voiceName: selection.voiceName,
        resourceRevision: null,
        treatment: {
          stability: null,
          similarity: null,
          style: null,
          speakerBoost: null,
        },
      };
};

const visualProposal = (
  draft: SessionDraft,
  step: ExistingVideoStep | null,
  selectedCharacter: ProjectCreativeProposal['selectedCharacter'],
  selectedOutfit: ProjectCreativeProposal['selectedOutfit'],
): ProjectCreativeProposal['visualTreatment'] => {
  const mode = step?.modelId ?? draft.mode;
  if (mode === 'lucy-latest') {
    return selectedCharacter === null
      ? { kind: 'none' }
      : {
          kind: 'character-swap',
          providerId: step?.provider ?? null,
          outputResolution: step?.outputResolution ?? null,
        };
  }
  if (mode === 'lucy-vton-latest') {
    const inputKind =
      step?.inputKind === 'saved-outfit' ||
      step?.inputKind === 'reference-image' ||
      step?.inputKind === 'prompt'
        ? step.inputKind
        : selectedOutfit?.inputKind === 'saved-outfit'
          ? 'saved-outfit'
          : draft.referenceImage
            ? 'reference-image'
            : 'prompt';
    return {
      kind: 'virtual-try-on',
      providerId: step?.provider ?? null,
      outputResolution: step?.outputResolution ?? null,
      inputKind,
      enhancePrompt: step?.enhancePrompt ?? draft.enhance,
    };
  }
  return { kind: 'none' };
};

const creativeIntent = (
  draft: SessionDraft,
  activeRecipe: ActiveStudioRecipe,
  store: CreativeAssetStore,
  step: ExistingVideoStep | null,
): ProjectCreativeProposal['creativeIntent'] => {
  if (step?.modelId === 'lucy-latest') {
    const variant = step.savedRecipeId
      ? (store.savedCharacterVariants.find((candidate) => candidate.id === step.savedRecipeId) ??
        null)
      : null;
    const character = step.savedRecipeId
      ? (store.savedCharacterPrompts.find(
          (candidate) => candidate.id === (variant?.parentCharacterId ?? step.savedRecipeId),
        ) ?? null)
      : null;
    return {
      promptId: null,
      promptLabel: null,
      recipeId: step.savedRecipeId,
      recipeLabel:
        variant?.title ??
        character?.name ??
        step.characterVariantName ??
        step.characterName ??
        null,
      userIntent: step.prompt,
      appliedPrompt: step.prompt || null,
      referenceAssetId: variant?.referenceImageAssetId ?? character?.referenceImageAssetId ?? null,
      resourceRevision: variant?.updatedAt ?? character?.updatedAt ?? null,
    };
  }
  if (step?.modelId === 'lucy-vton-latest') {
    const outfit = step.savedRecipeId
      ? (store.savedPrompts.find((candidate) => candidate.id === step.savedRecipeId) ?? null)
      : null;
    return {
      promptId: step.savedRecipeId,
      promptLabel: outfit?.title ?? null,
      recipeId: null,
      recipeLabel: null,
      userIntent: step.prompt,
      appliedPrompt: step.prompt || null,
      referenceAssetId: outfit?.referenceImageAssetId ?? null,
      resourceRevision: outfit?.updatedAt ?? null,
    };
  }
  const referenceAssetId =
    draft.referenceImage?.kind === 'persisted' ? draft.referenceImage.assetId : null;
  if (activeRecipe?.origin === 'character-prompt') {
    const character = store.savedCharacterPrompts.find(
      (candidate) => candidate.id === activeRecipe.assetId,
    );
    const variant = activeRecipe.variantId
      ? store.savedCharacterVariants.find(
          (candidate) =>
            candidate.id === activeRecipe.variantId &&
            candidate.parentCharacterId === activeRecipe.assetId,
        )
      : null;
    return {
      promptId: null,
      promptLabel: null,
      recipeId: character?.id ?? activeRecipe.assetId,
      recipeLabel: variant?.title ?? character?.name ?? null,
      userIntent: draft.prompt,
      appliedPrompt: draft.prompt || null,
      referenceAssetId,
      resourceRevision: variant?.updatedAt ?? character?.updatedAt ?? null,
    };
  }
  if (activeRecipe?.origin === 'saved-prompt') {
    const prompt = store.savedPrompts.find((candidate) => candidate.id === activeRecipe.assetId);
    return {
      promptId: prompt?.id ?? activeRecipe.assetId,
      promptLabel: prompt?.title ?? null,
      recipeId: null,
      recipeLabel: null,
      userIntent: draft.prompt,
      appliedPrompt: draft.prompt || null,
      referenceAssetId,
      resourceRevision: prompt?.updatedAt ?? null,
    };
  }
  return {
    promptId: null,
    promptLabel: null,
    recipeId: null,
    recipeLabel: null,
    userIntent: draft.prompt,
    appliedPrompt: draft.prompt || null,
    referenceAssetId,
    resourceRevision: null,
  };
};

/**
 * Captures one semantic Project checkpoint. Callers invoke this from explicit
 * selection/configuration boundaries, never from keystroke or slider events.
 */
export const createProjectCreativeProposal = ({
  current,
  draft,
  capturePreferences,
  activeRecipe,
  store,
  visualStep,
  voiceSelection,
}: ProjectCreativeAdapterInput): ProjectCreativeProposal => {
  const selectedCharacter = characterSelection(activeRecipe, store, visualStep);
  const selectedOutfit = outfitSelection(activeRecipe, store, visualStep);
  const visualTreatment = visualProposal(draft, visualStep, selectedCharacter, selectedOutfit);
  const hasCreativeState = draft.mode !== 'local' || visualStep !== null || voiceSelection !== null;
  return {
    workflowPhase:
      current.revision.snapshot.sourceAssetId !== null && hasCreativeState
        ? 'creative'
        : current.revision.snapshot.workflowPhase,
    liveMode: {
      modeId: draft.mode,
      captureFormat: capturePreferences.aspectRatio === '16:9' ? 'landscape' : 'portrait',
      audioSource: draft.mode === 'local' ? 'local-microphone' : 'model-output',
    },
    selectedCharacter,
    selectedOutfit,
    selectedVoice: voiceProposal(voiceSelection),
    visualTreatment,
    creativeIntent: creativeIntent(draft, activeRecipe, store, visualStep),
  };
};

export const resolveProjectCreativeResourceIssues = (
  snapshot: ProjectSnapshot,
  store: CreativeAssetStore,
): readonly ProjectCreativeResourceIssue[] => {
  const issues: ProjectCreativeResourceIssue[] = [];
  const selectedCharacter = snapshot.selectedCharacter;
  if (selectedCharacter !== null) {
    const character = store.savedCharacterPrompts.find(
      (candidate) => candidate.id === selectedCharacter.characterId,
    );
    const label = selectedCharacter.characterLabel ?? 'Previously selected Character';
    if (!character) {
      issues.push({
        kind: 'character',
        historicalLabel: label,
        reason: 'missing',
        message: `${label} is no longer available in this workspace. Its historical applied values remain in the Project.`,
      });
    } else if (!revisionMatches(selectedCharacter.characterRevision, character.updatedAt)) {
      issues.push({
        kind: 'character',
        historicalLabel: label,
        reason: 'changed',
        message: `${label} changed after this checkpoint. The Project retains the exact historical prompt and reference identity.`,
      });
    }
    if (selectedCharacter.variantId !== null) {
      const variant = store.savedCharacterVariants.find(
        (candidate) =>
          candidate.id === selectedCharacter.variantId &&
          candidate.parentCharacterId === selectedCharacter.characterId,
      );
      const variantLabel = selectedCharacter.variantLabel ?? 'Previously selected Variant';
      if (!variant) {
        issues.push({
          kind: 'character-variant',
          historicalLabel: variantLabel,
          reason: 'missing',
          message: `${variantLabel} is no longer available in this workspace. Its historical applied values remain in the Project.`,
        });
      } else if (!revisionMatches(selectedCharacter.variantRevision, variant.updatedAt)) {
        issues.push({
          kind: 'character-variant',
          historicalLabel: variantLabel,
          reason: 'changed',
          message: `${variantLabel} changed after this checkpoint. The Project retains the exact historical reference identity.`,
        });
      }
    }
  }

  const selectedOutfit = snapshot.selectedOutfit;
  if (selectedOutfit !== null) {
    const outfit = store.savedPrompts.find(
      (candidate) =>
        candidate.id === selectedOutfit.outfitId && candidate.modelModeId === 'lucy-vton-latest',
    );
    const label = selectedOutfit.outfitLabel ?? 'Previously selected Outfit';
    if (!outfit) {
      issues.push({
        kind: 'outfit',
        historicalLabel: label,
        reason: 'missing',
        message: `${label} is no longer available in this workspace. Its historical applied values remain in the Project.`,
      });
    } else if (!revisionMatches(selectedOutfit.outfitRevision, outfit.updatedAt)) {
      issues.push({
        kind: 'outfit',
        historicalLabel: label,
        reason: 'changed',
        message: `${label} changed after this checkpoint. The Project retains the exact historical prompt and reference identity.`,
      });
    }
  }

  const promptId = snapshot.creativeIntent.promptId;
  if (promptId !== null && promptId !== selectedOutfit?.outfitId) {
    const prompt = store.savedPrompts.find((candidate) => candidate.id === promptId);
    const label = snapshot.creativeIntent.promptLabel ?? 'Previously selected Prompt';
    if (!prompt) {
      issues.push({
        kind: 'prompt',
        historicalLabel: label,
        reason: 'missing',
        message: `${label} is no longer available in this workspace. Its exact historical prompt remains in the Project.`,
      });
    } else if (!revisionMatches(snapshot.creativeIntent.resourceRevision, prompt.updatedAt)) {
      issues.push({
        kind: 'prompt',
        historicalLabel: label,
        reason: 'changed',
        message: `${label} changed after this checkpoint. The Project retains the exact historical prompt and reference identity.`,
      });
    }
  }

  return issues;
};

/** Returns a reusable selection only when its current owner-scoped record is the exact revision. */
export const projectCreativeHydrationSelection = (
  snapshot: ProjectSnapshot,
  store: CreativeAssetStore,
): RecipeSelection | null => {
  if (resolveProjectCreativeResourceIssues(snapshot, store).length > 0) return null;
  const selectedCharacter = snapshot.selectedCharacter;
  if (selectedCharacter !== null) {
    const character = store.savedCharacterPrompts.find(
      (candidate) => candidate.id === selectedCharacter.characterId,
    );
    const resolved = character
      ? resolveCharacterVersion(store, {
          characterId: character.id,
          variantId: selectedCharacter.variantId,
        })
      : null;
    if (!character || !resolved) return null;
    return {
      origin: 'character-prompt',
      prompt: snapshot.creativeIntent.appliedPrompt ?? resolved.prompt,
      modelModeId: 'lucy-latest',
      referenceImageAssetId:
        snapshot.creativeIntent.referenceAssetId ?? selectedCharacter.referenceAssetId,
      assetId: character.id,
      ...(selectedCharacter.variantId
        ? { savedCharacterVariantId: selectedCharacter.variantId }
        : {}),
      ...((selectedCharacter.variantLabel ?? selectedCharacter.characterLabel)
        ? {
            characterName: selectedCharacter.variantLabel ?? selectedCharacter.characterLabel!,
          }
        : {}),
      ...(character.builderDraft ? { builderDraft: character.builderDraft } : {}),
    };
  }
  const selectedOutfit = snapshot.selectedOutfit;
  if (selectedOutfit !== null) {
    const outfit = store.savedPrompts.find((candidate) => candidate.id === selectedOutfit.outfitId);
    if (!outfit) return null;
    return {
      origin: 'saved-prompt',
      prompt: snapshot.creativeIntent.appliedPrompt ?? outfit.prompt,
      modelModeId: 'lucy-vton-latest',
      referenceImageAssetId:
        snapshot.creativeIntent.referenceAssetId ?? selectedOutfit.referenceAssetId,
      vtonInputKind: selectedOutfit.inputKind ?? outfit.vtonInputKind,
      enhancePrompt:
        snapshot.visualTreatment.kind === 'virtual-try-on'
          ? (snapshot.visualTreatment.enhancePrompt ?? outfit.enhancePrompt)
          : outfit.enhancePrompt,
      assetId: outfit.id,
    };
  }
  return null;
};
