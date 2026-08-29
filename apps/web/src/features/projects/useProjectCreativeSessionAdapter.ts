import { videoCharacterSwapProviderIdSchema } from '@studio/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchReferenceImageMetadata,
  hydrateReferenceImage,
} from '../../adapters/api-client/apiClient';
import { fetchWorkspaceVoiceRelationship } from '../../adapters/api-client/voicesApi';
import type { CreativeAssetRepository, CreativeAssetStore } from '../creative-assets/types';
import type { useExistingVideoWorkflow } from '../existing-video/useExistingVideoWorkflow';
import type { useStudioSession } from '../../orchestration/session';
import type { useReferenceRecipeHandoff } from '../../studio/useReferenceRecipeHandoff';
import {
  createProjectCreativeProposal,
  projectCreativeHydrationMetadata,
  projectCreativeHydrationSelection,
  resolveProjectCreativeResourceIssues,
  resolveProjectSavedVoiceResourceIssue,
} from './projectCreativeSessionAdapter';
import { effectiveCreativeSnapshot, localVoiceName } from './projectCreatePresentation';
import type { ProjectSessionPort } from './useProjectSession';

export type ProjectCreativeCheckpointPhase = 'idle' | 'saving' | 'saved' | 'error';

type SavedVoiceRelationshipState = Readonly<{
  key: string | null;
  status: 'idle' | 'available' | 'missing' | 'unavailable';
}>;

type ProjectCreativeCheckpointState = Readonly<{
  projectId: string | null;
  phase: ProjectCreativeCheckpointPhase;
  message: string | null;
}>;

/**
 * The creative fields an operator actually picks.
 *
 * Deliberately not the whole proposal: `liveMode` and `workflowPhase` are context that
 * `createProjectCreativeProposal` always restates — a fresh Project has no `liveMode` at all — so
 * comparing on them would make merely opening a Project look like a change. They still ride along
 * with a real one.
 */
const creativeChoices = (value: {
  readonly selectedCharacter: unknown;
  readonly selectedOutfit: unknown;
  readonly selectedVoice: unknown;
  readonly visualTreatment: unknown;
  readonly creativeIntent: unknown;
}): string =>
  JSON.stringify([
    value.selectedCharacter,
    value.selectedOutfit,
    value.selectedVoice,
    value.visualTreatment,
    value.creativeIntent,
  ]);

const creativeHydrationKey = (projectId: string, snapshot: ProjectSessionPort['current']) =>
  snapshot === null
    ? null
    : JSON.stringify({
        projectId,
        selectedCharacter: snapshot.revision.snapshot.selectedCharacter,
        selectedOutfit: snapshot.revision.snapshot.selectedOutfit,
        selectedVoice: snapshot.revision.snapshot.selectedVoice,
        visualTreatment: snapshot.revision.snapshot.visualTreatment,
        creativeIntent: snapshot.revision.snapshot.creativeIntent,
        liveMode: snapshot.revision.snapshot.liveMode,
      });

export const useProjectCreativeSessionAdapter = ({
  projectId,
  projectSession,
  studioSession,
  handoff,
  repository,
  store,
  existingVideo,
}: {
  readonly projectId: string | null;
  readonly projectSession: ProjectSessionPort | null;
  readonly studioSession: ReturnType<typeof useStudioSession>;
  readonly handoff: ReturnType<typeof useReferenceRecipeHandoff>;
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  readonly existingVideo: ReturnType<typeof useExistingVideoWorkflow>;
}) => {
  const [checkpointState, setCheckpointState] = useState<ProjectCreativeCheckpointState>(() => ({
    projectId,
    phase: 'idle',
    message: null,
  }));
  const [savedVoiceRelationship, setSavedVoiceRelationship] = useState<SavedVoiceRelationshipState>(
    { key: null, status: 'idle' },
  );
  const hydrationKeyRef = useRef<string | null>(null);
  const historicalHydrationControllerRef = useRef<AbortController | null>(null);
  const existingVideoSourceKeyRef = useRef<string | null>(null);
  const existingVideoConfigurationKeyRef = useRef<string | null>(null);
  const freedOutputRevisionRef = useRef<string | null>(null);

  // Read off the port rather than through it: the port is rebuilt on every autosave phase change,
  // so an effect depending on the whole thing re-enters three more times for each pick it caused.
  // `propose` is a controller method, stable for the life of one Project.
  const proposeCreative = projectSession?.propose ?? null;
  const pendingProposal = projectSession?.proposal ?? null;
  const current = projectSession?.current ?? null;
  const snapshot = current?.revision.snapshot ?? null;
  const savedVoice =
    snapshot?.selectedVoice?.kind === 'saved-voice' ? snapshot.selectedVoice : null;
  const savedVoiceId = savedVoice?.voiceId ?? null;
  const savedVoiceKey =
    projectId !== null && current !== null && savedVoice !== null
      ? `${projectId}:${current.revision.id}:${savedVoice.voiceId}`
      : null;
  const phase = checkpointState.projectId === projectId ? checkpointState.phase : 'idle';
  const message = checkpointState.projectId === projectId ? checkpointState.message : null;
  /** Both fields belong to one Project; a state left over from another Project is discarded. */
  const setCheckpoint = useCallback(
    (nextPhase: ProjectCreativeCheckpointPhase, nextMessage: string | null) => {
      setCheckpointState({ projectId, phase: nextPhase, message: nextMessage });
    },
    [projectId],
  );
  const setMessage = useCallback(
    (nextMessage: string | null) => {
      setCheckpointState((currentState) => ({
        projectId,
        phase: currentState.projectId === projectId ? currentState.phase : 'idle',
        message: nextMessage,
      }));
    },
    [projectId],
  );
  const libraryResourceIssues = useMemo(
    () => (snapshot === null ? [] : resolveProjectCreativeResourceIssues(snapshot, store)),
    [snapshot, store],
  );
  const savedVoiceIssue = useMemo(() => {
    if (
      snapshot === null ||
      savedVoiceKey === null ||
      savedVoiceRelationship.key !== savedVoiceKey ||
      (savedVoiceRelationship.status !== 'missing' &&
        savedVoiceRelationship.status !== 'unavailable')
    ) {
      return null;
    }
    return resolveProjectSavedVoiceResourceIssue(snapshot, savedVoiceRelationship.status);
  }, [savedVoiceKey, savedVoiceRelationship, snapshot]);
  const resourceIssues = useMemo(
    () =>
      savedVoiceIssue === null
        ? libraryResourceIssues
        : [...libraryResourceIssues, savedVoiceIssue],
    [libraryResourceIssues, savedVoiceIssue],
  );

  useEffect(() => {
    if (savedVoiceId === null || savedVoiceKey === null) return;
    const controller = new AbortController();
    void fetchWorkspaceVoiceRelationship(savedVoiceId, controller.signal)
      .then((relationship) => {
        if (controller.signal.aborted) return;
        setSavedVoiceRelationship({
          key: savedVoiceKey,
          status: relationship.saved ? 'available' : 'missing',
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setSavedVoiceRelationship({ key: savedVoiceKey, status: 'unavailable' });
      });
    return () => controller.abort('project-saved-voice-relationship-replaced');
  }, [savedVoiceId, savedVoiceKey]);

  useEffect(() => {
    if (projectId === null || projectSession === null || snapshot === null) {
      hydrationKeyRef.current = null;
      historicalHydrationControllerRef.current?.abort('project-creative-context-cleared');
      historicalHydrationControllerRef.current = null;
      existingVideoSourceKeyRef.current = null;
      existingVideoConfigurationKeyRef.current = null;
      return;
    }
    const key = creativeHydrationKey(projectId, projectSession.current);
    if (key === null || hydrationKeyRef.current === key) return;
    hydrationKeyRef.current = key;
    const controller = new AbortController();
    historicalHydrationControllerRef.current?.abort('project-creative-snapshot-replaced');
    historicalHydrationControllerRef.current = controller;

    void repository
      .ready()
      .then(async () => {
        if (controller.signal.aborted) return;
        const ownerStore = repository.getSnapshot().store;
        const hydration = projectCreativeHydrationMetadata(snapshot);
        if (hydration.aspectRatio !== null) {
          studioSession.capturePreferences.restoreAspectRatio(hydration.aspectRatio);
        }
        const selection = projectCreativeHydrationSelection(snapshot, ownerStore);
        if (selection !== null) {
          handoff.actions.useRecipe(selection);
          return;
        }

        const appliedPrompt =
          snapshot.creativeIntent.appliedPrompt ?? snapshot.creativeIntent.userIntent;
        const mode = hydration.mode;
        if (mode === 'local') {
          studioSession.selectMode('local');
          return;
        }
        if (mode === null) return;

        try {
          const referenceAssetId =
            snapshot.creativeIntent.referenceAssetId ??
            snapshot.selectedCharacter?.referenceAssetId ??
            snapshot.selectedOutfit?.referenceAssetId ??
            null;
          const referenceImage = referenceAssetId
            ? await (async () => {
                const metadata = await fetchReferenceImageMetadata(
                  referenceAssetId,
                  controller.signal,
                );
                return hydrateReferenceImage(referenceAssetId, metadata, controller.signal);
              })()
            : null;
          controller.signal.throwIfAborted();
          studioSession.replaceRecipeDraft({
            mode,
            prompt: appliedPrompt,
            referenceImage,
            enhance:
              snapshot.visualTreatment.kind === 'virtual-try-on'
                ? (snapshot.visualTreatment.enhancePrompt ?? false)
                : false,
          });
          if (resourceIssues.length > 0) {
            setMessage(
              'Historical applied values were restored. Choose another reusable resource to replace the unavailable or changed record.',
            );
          }
        } catch {
          if (controller.signal.aborted) return;
          studioSession.replaceRecipeDraft({
            mode,
            prompt: appliedPrompt,
            referenceImage: null,
            enhance:
              snapshot.visualTreatment.kind === 'virtual-try-on'
                ? (snapshot.visualTreatment.enhancePrompt ?? false)
                : false,
          });
          setMessage(
            'The exact reusable reference is unavailable to this owner. Historical labels and prompt remain visible; choose another reference to continue.',
          );
        }
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setMessage(
          'The owner-scoped creative library is unavailable. Historical Project values remain visible; choose another resource after the library is available.',
        );
      });

    return () => controller.abort('project-creative-hydration-replaced');
  }, [
    handoff.actions,
    projectId,
    projectSession,
    repository,
    resourceIssues.length,
    setMessage,
    snapshot,
    studioSession,
  ]);

  /**
   * A saved output ends the round it was configured for, and the Project clears its own creative
   * configuration with it, so the visual tool is freed for the next round. The voice needs no
   * handling here: the configuration effect below already follows the snapshot back to none.
   *
   * This is keyed to the one post-save revision rather than driven by "the snapshot carries no
   * treatment": a tool the operator picks after a save is not checkpointed until they save
   * progress, so an unsaved choice looks exactly the same and must not be swept away.
   */
  useEffect(() => {
    const revisionId = current?.revision.id ?? null;
    if (projectId === null || snapshot === null || revisionId === null) return;
    if (snapshot.workflowPhase !== 'complete' || snapshot.lastSuccessfulOutput === null) {
      freedOutputRevisionRef.current = null;
      return;
    }
    if (freedOutputRevisionRef.current === revisionId) return;
    freedOutputRevisionRef.current = revisionId;
    const step = existingVideo.steps[0];
    if (step) existingVideo.removeStep(step.id);
  }, [current?.revision.id, existingVideo, projectId, snapshot]);

  useEffect(() => {
    if (projectId === null || snapshot === null) return;
    const needsExistingVideoControls =
      snapshot.visualTreatment.kind !== 'none' || snapshot.selectedVoice !== null;
    if (
      !needsExistingVideoControls ||
      existingVideo.selection !== null ||
      existingVideo.phase === 'validating' ||
      !existingVideo.original
    ) {
      return;
    }
    const sourceKey = `${projectId}:${existingVideo.original.id}`;
    if (existingVideoSourceKeyRef.current === sourceKey) return;
    existingVideoSourceKeyRef.current = sourceKey;
    void existingVideo.adoptRecordedArtifact();
  }, [existingVideo, projectId, snapshot]);

  useEffect(() => {
    if (projectId === null || snapshot === null) return;
    const configKey = JSON.stringify({
      projectId,
      revisionId: current?.revision.id,
      visualTreatment: snapshot.visualTreatment,
      selectedCharacter: snapshot.selectedCharacter,
      selectedOutfit: snapshot.selectedOutfit,
      selectedVoice: snapshot.selectedVoice,
      savedVoiceRelationship:
        savedVoiceKey !== null && savedVoiceRelationship.key === savedVoiceKey
          ? savedVoiceRelationship.status
          : 'idle',
      selection: existingVideo.selection?.metadata.selectedAt ?? null,
      stepId: existingVideo.steps[0]?.id ?? null,
      referenceAssetId:
        studioSession.draft.referenceImage?.kind === 'persisted'
          ? studioSession.draft.referenceImage.assetId
          : null,
    });
    if (existingVideoConfigurationKeyRef.current === configKey) return;

    const voice = snapshot.selectedVoice;
    if (voice?.kind === 'local-effect') {
      existingVideo.selectLocalVoice(voice.effectId, localVoiceName(voice.effectId));
    } else if (voice?.kind === 'saved-voice') {
      if (
        savedVoiceRelationship.key === savedVoiceKey &&
        savedVoiceRelationship.status === 'available'
      ) {
        existingVideo.selectVoice(voice.voiceId, voice.voiceName);
      } else if (existingVideo.voiceSelection !== null) {
        existingVideo.clearVoice();
      }
    } else if (existingVideo.voiceSelection !== null) {
      existingVideo.clearVoice();
    }

    const visual = snapshot.visualTreatment;
    if (visual.kind === 'none' || existingVideo.selection === null) {
      existingVideoConfigurationKeyRef.current = configKey;
      return;
    }
    const modelId = visual.kind === 'character-swap' ? 'lucy-latest' : 'lucy-vton-latest';
    const step = existingVideo.steps[0] ?? null;
    if (step === null || step.modelId !== modelId) {
      if (step !== null) existingVideo.removeStep(step.id);
      existingVideo.addStep(modelId);
      return;
    }

    const parsedProvider = videoCharacterSwapProviderIdSchema.safeParse(visual.providerId);
    existingVideo.updateStep(step.id, {
      savedRecipeId:
        visual.kind === 'character-swap'
          ? // A variant is its own saved recipe; sending the parent id would silently drop it.
            (snapshot.selectedCharacter?.variantId ??
            snapshot.selectedCharacter?.characterId ??
            null)
          : (snapshot.selectedOutfit?.outfitId ?? null),
      prompt: snapshot.creativeIntent.appliedPrompt ?? snapshot.creativeIntent.userIntent,
      enhancePrompt: visual.kind === 'virtual-try-on' ? (visual.enhancePrompt ?? false) : false,
      referenceImage: studioSession.draft.referenceImage?.file ?? null,
      inputKind:
        visual.kind === 'character-swap'
          ? 'character'
          : (visual.inputKind ??
            (studioSession.draft.referenceImage ? 'reference-image' : 'prompt')),
      ...(parsedProvider.success ? { provider: parsedProvider.data } : {}),
      ...(visual.outputResolution ? { outputResolution: visual.outputResolution } : {}),
      characterName: snapshot.selectedCharacter?.characterLabel ?? null,
      characterVariantName: snapshot.selectedCharacter?.variantLabel ?? null,
    });
    existingVideoConfigurationKeyRef.current = configKey;
  }, [
    current?.revision.id,
    existingVideo,
    projectId,
    savedVoiceKey,
    savedVoiceRelationship,
    snapshot,
    studioSession.draft.referenceImage,
  ]);

  /**
   * Carries a creative selection out to the Project the moment it is made.
   *
   * Every other effect here runs inbound — snapshot to Studio — so before this one a character
   * chosen on the rail reached nothing: the Create task read "Not chosen" and the editor opened on
   * an empty step. Picking is an explicit selection boundary, which is exactly what
   * `createProjectCreativeProposal` is documented to be called from.
   *
   * Two guards keep it from fighting the inbound hydration that reads what it writes. Proposing
   * only when the derived proposal differs from the snapshot stops a hydration from echoing
   * straight back, and remembering what was last sent stops a re-render from re-proposing while
   * the autosave is still pending. `propose` alone is deliberate: it rides the existing coalescing
   * autosave, so a burst of picks writes one revision.
   */
  useEffect(() => {
    if (projectId === null || proposeCreative === null || current === null || snapshot === null) {
      return;
    }
    // An ephemeral reference cannot be persisted; `checkpoint` refuses it too, with an explanation.
    if (studioSession.draft.referenceImage?.kind === 'ephemeral') return;
    // Nothing is chosen here, so there is nothing to carry out. Without this, reopening a Project
    // would propose the empty Studio over the setup the Project already holds and erase it —
    // hydration stamps its key before the recipe it restores has actually landed. Clearing a
    // selection is a product decision (a saved output does it); it is not this effect's to make.
    if (handoff.state.activeRecipe === null && existingVideo.voiceSelection === null) return;
    // Hydration runs the other way and settles the Studio into the Project's own capture format and
    // creative selection. Proposing before it lands would write a revision for merely opening a
    // Project whose format differs from the one the Studio happens to be set to. Checked after the
    // two free guards above, because building this key is the expensive part of the effect.
    if (hydrationKeyRef.current !== creativeHydrationKey(projectId, current)) return;
    const proposal = createProjectCreativeProposal({
      current,
      draft: studioSession.draft,
      capturePreferences: studioSession.capturePreferences.applied,
      activeRecipe: handoff.state.activeRecipe,
      store: repository.getSnapshot().store,
      // Deliberately not the editor's step. The configuration effect above writes that step *from*
      // the snapshot, so reading it back here would let the Project write to itself: every inbound
      // update would provoke an outbound one, re-rendering the editor under the operator's cursor.
      // The step's own settings reach the Project through the checkpoint taken before a submission,
      // which is where they belong. This edge carries what the operator picked.
      visualStep: null,
      voiceSelection: existingVideo.voiceSelection,
    });
    // Compared against the pending write laid over the settled one, which is the session's own
    // record of what it is about to save. That covers both "the Project already agrees" and "this
    // was proposed a moment ago and has not landed yet" without a second copy of either fact.
    const pending = effectiveCreativeSnapshot(snapshot, pendingProposal);
    if (creativeChoices(pending) === creativeChoices(proposal)) return;
    proposeCreative(proposal);
  }, [
    current,
    existingVideo.voiceSelection,
    handoff.state.activeRecipe,
    pendingProposal,
    projectId,
    proposeCreative,
    repository,
    snapshot,
    studioSession.capturePreferences.applied,
    studioSession.draft,
  ]);

  useEffect(
    () => () => {
      historicalHydrationControllerRef.current?.abort('project-creative-adapter-unmounted');
    },
    [],
  );

  const checkpoint = useCallback(async (): Promise<boolean> => {
    const latest = projectSession?.getCurrent() ?? null;
    if (projectId === null || projectSession === null || latest === null || phase === 'saving') {
      return false;
    }
    if (studioSession.draft.referenceImage?.kind === 'ephemeral') {
      setCheckpoint(
        'error',
        'This reference is still temporary. Choose a saved reference, or remove it, before saving progress.',
      );
      return false;
    }
    setCheckpoint('saving', 'Saving your creative setup to this Project.');
    const proposal = createProjectCreativeProposal({
      current: latest,
      draft: studioSession.draft,
      capturePreferences: studioSession.capturePreferences.applied,
      activeRecipe: handoff.state.activeRecipe,
      store: repository.getSnapshot().store,
      visualStep: existingVideo.steps[0] ?? null,
      voiceSelection: existingVideo.voiceSelection,
    });
    if (!projectSession.propose(proposal)) {
      setCheckpoint('error', 'This Project is not ready to save progress yet.');
      return false;
    }
    const saved = await projectSession.flush();
    setCheckpoint(
      saved ? 'saved' : 'error',
      saved
        ? 'Progress saved. Saving on its own starts no paid AI work.'
        : 'Your changes are still here. Resolve the save error before trying again.',
    );
    return saved;
  }, [
    existingVideo,
    handoff.state.activeRecipe,
    phase,
    projectId,
    projectSession,
    repository,
    setCheckpoint,
    studioSession,
  ]);

  return {
    phase,
    message,
    resourceIssues,
    checkpoint,
  } as const;
};
