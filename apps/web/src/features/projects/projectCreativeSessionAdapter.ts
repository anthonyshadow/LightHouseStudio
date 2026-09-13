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
  /**
   * What the Project will hold once everything already staged lands — the settled snapshot with the
   * pending proposal laid over it.
   *
   * The settled snapshot alone is a step behind from the moment `propose` is called until the save
   * returns, and the fallbacks below read it. A capture landing inside that window carried nothing,
   * answered `null` for settings it had no step to state, and overwrote the checkpoint staged a
   * moment earlier — each write making the other stale, until the flush gave up and the submission
   * it was taken for never went out. Defaults to `current`'s own snapshot, which is the same thing
   * for a caller holding a settled session.
   */
  readonly settled?: ProjectSnapshot;
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

/**
 * The two settings whose only writer is the editor's step, resolved for one treatment kind.
 *
 * The ambient creative edge deliberately does not read the step, so without the settled fallback
 * "no step supplied" read as "no provider, no resolution": the first ambient capture after a
 * checkpoint nulled both, appending a revision roughly a second after the one a run was pinned to.
 * That moved the Project's head past the attempt, so the run stopped being current — the workspace
 * dropped its blocking overlay mid-run, and the finished result came back retained instead of
 * applied, with nothing to show for it.
 *
 * Inheriting is for fields like these, whose sole writer is the step. A field the stepless capture
 * can work out for itself — from the draft or the active Recipe — must be re-derived there instead,
 * or the Project can never let go of a setting. A different treatment kind inherits nothing: it is
 * a real change of intent and states its own settings.
 */
const visualSettings = (
  step: ExistingVideoStep | null,
  settled: ProjectSnapshot['visualTreatment'],
  kind: 'character-swap' | 'virtual-try-on',
) => {
  const carried = settled.kind === kind ? settled : null;
  return {
    providerId: step?.provider ?? carried?.providerId ?? null,
    outputResolution: step?.outputResolution ?? carried?.outputResolution ?? null,
  };
};

/**
 * The try-on input kind the settled snapshot already states, when it still describes this Outfit.
 *
 * The chain below is how a capture works one out from scratch, and it answers with the Outfit's own
 * kind. But an operator can have overridden that — "continue without the reference" downgrades a
 * saved-outfit step to `prompt` and leaves the Outfit selected — and a stepless capture re-deriving
 * from scratch would answer `saved-outfit` and overwrite them. That disagreement is submitted, not
 * cosmetic: the API sends `inputKind` on to the provider and drops the prompt for a reference-image
 * try-on. Tied to the Outfit that was selected when it was stated, so choosing a different one
 * still re-derives rather than inheriting a decision made about something else.
 */
const carriedInputKind = (
  settled: ProjectSnapshot,
  selectedOutfit: ProjectCreativeProposal['selectedOutfit'],
): 'prompt' | 'saved-outfit' | 'reference-image' | null =>
  settled.visualTreatment.kind === 'virtual-try-on' &&
  (settled.selectedOutfit?.outfitId ?? null) === (selectedOutfit?.outfitId ?? null)
    ? settled.visualTreatment.inputKind
    : null;

const visualProposal = (
  draft: SessionDraft,
  step: ExistingVideoStep | null,
  selectedCharacter: ProjectCreativeProposal['selectedCharacter'],
  selectedOutfit: ProjectCreativeProposal['selectedOutfit'],
  settled: ProjectSnapshot,
): ProjectCreativeProposal['visualTreatment'] => {
  const mode = step?.modelId ?? draft.mode;
  if (mode === 'lucy-latest') {
    return selectedCharacter === null
      ? { kind: 'none' }
      : {
          kind: 'character-swap',
          ...visualSettings(step, settled.visualTreatment, 'character-swap'),
        };
  }
  if (mode === 'lucy-vton-latest') {
    const inputKind =
      step?.inputKind === 'saved-outfit' ||
      step?.inputKind === 'reference-image' ||
      step?.inputKind === 'prompt'
        ? step.inputKind
        : (carriedInputKind(settled, selectedOutfit) ??
          (selectedOutfit?.inputKind === 'saved-outfit'
            ? 'saved-outfit'
            : draft.referenceImage
              ? 'reference-image'
              : 'prompt'));
    return {
      kind: 'virtual-try-on',
      ...visualSettings(step, settled.visualTreatment, 'virtual-try-on'),
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
  /*
   * An override, never the reference itself. Every reader — the workspace's hydration below, the
   * Studio session edge, and the API that picks the image a submission actually sends — resolves
   * `creativeIntent.referenceAssetId ?? selectedCharacter/selectedOutfit.referenceAssetId`, and
   * that second term already is the resolved Character version's own reference. So this states one
   * thing only: a reference this session persisted that is not the resource's. Restating the
   * resource's reference here said nothing new and disagreed with the capture that did not.
   */
  const referenceAssetId =
    draft.referenceImage?.kind === 'persisted' ? draft.referenceImage.assetId : null;
  /*
   * The prompt the step states, or the draft's when it states none. An operation whose prompt the
   * provider supplies — character swap on a server-default binding — leaves the step's own prompt
   * empty for the whole of its life, and an editable one is empty until it is typed into. Reading
   * that emptiness as "no intent" blanked what the ambient capture had recorded from the draft, so
   * the checkpoint before a submission and the capture after it disagreed and appended a revision
   * on top of the run. Emptiness is the absence of a statement, not a statement that there is none.
   * Stated once above the branches, which is the point: all five of them apply the one rule.
   */
  const intent = step?.prompt || draft.prompt;
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
      // The Character, never the Variant: `selectedCharacter.variantId` is what says which version
      // was used, and the ambient capture — which cannot see the step — has only the Character to
      // name. Naming the Variant here made the two captures disagree without recording anything
      // `selectedCharacter` did not already hold. `recipeLabel` still prefers the Variant's title.
      recipeId: character?.id ?? step.savedRecipeId,
      recipeLabel:
        variant?.title ??
        character?.name ??
        step.characterVariantName ??
        step.characterName ??
        null,
      userIntent: intent,
      appliedPrompt: intent || null,
      referenceAssetId,
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
      userIntent: intent,
      appliedPrompt: intent || null,
      referenceAssetId,
      resourceRevision: outfit?.updatedAt ?? null,
    };
  }
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
      userIntent: intent,
      appliedPrompt: intent || null,
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
      userIntent: intent,
      appliedPrompt: intent || null,
      referenceAssetId,
      resourceRevision: prompt?.updatedAt ?? null,
    };
  }
  return {
    promptId: null,
    promptLabel: null,
    recipeId: null,
    recipeLabel: null,
    userIntent: intent,
    appliedPrompt: intent || null,
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
  settled,
}: ProjectCreativeAdapterInput): ProjectCreativeProposal => {
  const selectedCharacter = characterSelection(activeRecipe, store, visualStep);
  const selectedOutfit = outfitSelection(activeRecipe, store, visualStep);
  const visualTreatment = visualProposal(
    draft,
    visualStep,
    selectedCharacter,
    selectedOutfit,
    settled ?? current.revision.snapshot,
  );
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
        message: `${label} is no longer available in this workspace. The values it applied are still saved in the Project.`,
      });
    } else if (!revisionMatches(selectedCharacter.characterRevision, character.updatedAt)) {
      issues.push({
        kind: 'character',
        historicalLabel: label,
        reason: 'changed',
        message: `${label} changed after you saved progress. The Project keeps the exact prompt and reference it saved.`,
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
          message: `${variantLabel} is no longer available in this workspace. The values it applied are still saved in the Project.`,
        });
      } else if (!revisionMatches(selectedCharacter.variantRevision, variant.updatedAt)) {
        issues.push({
          kind: 'character-variant',
          historicalLabel: variantLabel,
          reason: 'changed',
          message: `${variantLabel} changed after you saved progress. The Project keeps the exact reference it saved.`,
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
        message: `${label} is no longer available in this workspace. The values it applied are still saved in the Project.`,
      });
    } else if (!revisionMatches(selectedOutfit.outfitRevision, outfit.updatedAt)) {
      issues.push({
        kind: 'outfit',
        historicalLabel: label,
        reason: 'changed',
        message: `${label} changed after you saved progress. The Project keeps the exact prompt and reference it saved.`,
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
        message: `${label} is no longer available in this workspace. Its exact prompt is still saved in the Project.`,
      });
    } else if (!revisionMatches(snapshot.creativeIntent.resourceRevision, prompt.updatedAt)) {
      issues.push({
        kind: 'prompt',
        historicalLabel: label,
        reason: 'changed',
        message: `${label} changed after you saved progress. The Project keeps the exact prompt and reference it saved.`,
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
