import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { hydrateReferenceImage } from '../adapters/api-client/apiClient';
import type {
  CharacterSaveProgress,
  CharacterSaveSnapshot,
} from '../features/character-builder/characterBuilderControllerSupport';
import type { CharacterSaveStage } from '../features/character-builder/characterBuilderPersistence';
import { persistCharacterSaveSnapshot } from '../features/character-builder/persistCharacterSaveSnapshot';
import type {
  CreativeAssetRepository,
  CreativeAssetStore,
  SavedCharacterPrompt,
} from '../features/creative-assets/types';
import {
  savedCharacterStepInput,
  type useExistingVideoWorkflow,
} from '../features/existing-video/useExistingVideoWorkflow';
import { useCharacterBuilderLaunchController } from './useCharacterBuilderLaunchController';
import type { ActiveOverlay } from './useStudioOverlayController';
import { attachProjectAssetAndSync } from '../features/projects/useProjectAssetsController';
import type { ConfirmationRequest } from '../ui';

export type CharacterBuilderDestination =
  | Readonly<{ kind: 'studio' }>
  | Readonly<{ kind: 'existing-video'; stepId: string }>
  | Readonly<{ kind: 'project'; projectId: string }>;

type SaveCharacter = (
  snapshot: CharacterSaveSnapshot,
  characterId: string,
  stage: CharacterSaveStage,
  progress: CharacterSaveProgress,
) => Promise<void>;

interface UseStudioCharacterWorkflowOptions {
  readonly ownerUserId: string;
  readonly repository: CreativeAssetRepository;
  readonly store: CreativeAssetStore;
  readonly existingVideo: ReturnType<typeof useExistingVideoWorkflow>;
  readonly activityBlockedReason: string | undefined;
  readonly openBlockedReason: string | undefined;
  readonly studioSaveBlockedReason: string | undefined;
  readonly saveStudioCharacter: SaveCharacter;
  readonly openOverlay: (overlay: Exclude<ActiveOverlay, null>) => void;
  readonly closeOverlay: () => void;
  readonly confirmation: ConfirmationRequest;
}

export const useStudioCharacterWorkflow = ({
  ownerUserId,
  repository,
  store,
  existingVideo,
  activityBlockedReason,
  openBlockedReason,
  studioSaveBlockedReason,
  saveStudioCharacter,
  openOverlay,
  closeOverlay,
  confirmation,
}: UseStudioCharacterWorkflowOptions) => {
  const queryClient = useQueryClient();
  const [destination, setDestination] = useState<CharacterBuilderDestination>({ kind: 'studio' });
  const [wardrobeCharacterId, setWardrobeCharacterId] = useState<string | null>(null);
  const [wardrobeExistingVideoStepId, setWardrobeExistingVideoStepId] = useState<string | null>(
    null,
  );
  const [wardrobeDirty, setWardrobeDirty] = useState(false);
  const discardWardrobeDirty = useCallback(() => setWardrobeDirty(false), []);

  const openBuilderOverlay = useCallback(() => openOverlay('character-builder'), [openOverlay]);
  const {
    launch,
    discardPrompt,
    launchError,
    openNewCharacter,
    editCharacter,
    copyCharacter,
    resolveDiscard,
    dismissLaunchError,
  } = useCharacterBuilderLaunchController({
    ownerUserId,
    ...(activityBlockedReason ? { blockedReason: activityBlockedReason } : {}),
    onOpen: openBuilderOverlay,
  });

  const openNew = useCallback(() => {
    if (openBlockedReason) return;
    setDestination({ kind: 'studio' });
    openNewCharacter();
  }, [openBlockedReason, openNewCharacter]);

  const edit = useCallback(
    (asset: Parameters<typeof editCharacter>[0]) => {
      if (openBlockedReason) return;
      setDestination({ kind: 'studio' });
      editCharacter(asset);
    },
    [editCharacter, openBlockedReason],
  );

  const copy = useCallback(
    (asset: Parameters<typeof copyCharacter>[0]) => {
      if (openBlockedReason) return;
      setDestination({ kind: 'studio' });
      copyCharacter(asset);
    },
    [copyCharacter, openBlockedReason],
  );

  const createForExistingVideo = useCallback(
    (stepId: string) => {
      if (activityBlockedReason || existingVideo.providerActive) return;
      const step = existingVideo.steps.find((candidate) => candidate.id === stepId);
      if (step?.modelId !== 'lucy-latest') return;
      setDestination({ kind: 'existing-video', stepId });
      openNewCharacter();
    },
    [activityBlockedReason, existingVideo.providerActive, existingVideo.steps, openNewCharacter],
  );

  const openNewForProject = useCallback(
    (projectId: string) => {
      if (openBlockedReason) return;
      setDestination({ kind: 'project', projectId });
      openNewCharacter();
    },
    [openBlockedReason, openNewCharacter],
  );

  const existingVideoSaveBlockedReason = activityBlockedReason;
  const saveBlockedReason =
    destination.kind === 'existing-video'
      ? existingVideoSaveBlockedReason
      : destination.kind === 'project'
        ? undefined
        : studioSaveBlockedReason;

  const saveExistingVideoCharacter = useCallback<SaveCharacter>(
    async (snapshot, characterId, stage, progress) => {
      if (existingVideoSaveBlockedReason) throw new Error(existingVideoSaveBlockedReason);
      if (destination.kind !== 'existing-video') {
        throw new Error('The upload character destination is no longer available.');
      }
      const step = existingVideo.steps.find(
        (candidate) => candidate.id === destination.stepId && candidate.modelId === 'lucy-latest',
      );
      if (!step) throw new Error('The Character Swap step is no longer available.');

      if (stage === 'intent') {
        await persistCharacterSaveSnapshot(repository, snapshot, characterId);
        await progress.markCharacterPersisted();
      }

      const reference = snapshot.referenceImage
        ? await hydrateReferenceImage(snapshot.referenceImage.assetId, snapshot.referenceImage)
        : null;
      existingVideo.updateStep(step.id, {
        savedRecipeId: characterId,
        characterName: snapshot.name,
        characterVariantName: null,
        ...savedCharacterStepInput(snapshot.prompt, reference?.file ?? null),
      });
      await progress.markStudioPreloaded();
    },
    [destination, existingVideo, existingVideoSaveBlockedReason, repository],
  );

  const saveProjectCharacter = useCallback<SaveCharacter>(
    async (snapshot, characterId, stage, progress) => {
      if (destination.kind !== 'project') {
        throw new Error('The Project character destination is no longer available.');
      }
      if (stage === 'intent') {
        await persistCharacterSaveSnapshot(repository, snapshot, characterId);
        await progress.markCharacterPersisted();
      }
      await attachProjectAssetAndSync(queryClient, destination.projectId, {
        kind: 'character',
        resourceId: characterId,
      });
      await progress.markStudioPreloaded();
    },
    [destination, queryClient, repository],
  );

  const wardrobeCharacter = wardrobeCharacterId
    ? (store.savedCharacterPrompts.find((item) => item.id === wardrobeCharacterId) ?? null)
    : null;

  const openWardrobe = useCallback(
    (character: SavedCharacterPrompt) => {
      setWardrobeCharacterId(character.id);
      setWardrobeExistingVideoStepId(null);
      setWardrobeDirty(false);
      openOverlay('character-wardrobe');
    },
    [openOverlay],
  );

  const openWardrobeForExistingVideo = useCallback(
    (stepId: string, characterId: string) => {
      if (existingVideo.providerActive) return;
      const step = existingVideo.steps.find(
        (candidate) => candidate.id === stepId && candidate.modelId === 'lucy-latest',
      );
      const character = repository
        .getSnapshot()
        .store.savedCharacterPrompts.find((candidate) => candidate.id === characterId);
      if (!step || !character) return;
      setWardrobeCharacterId(character.id);
      setWardrobeExistingVideoStepId(stepId);
      setWardrobeDirty(false);
      openOverlay('character-wardrobe');
    },
    [existingVideo.providerActive, existingVideo.steps, openOverlay, repository],
  );

  const closeWardrobe = useCallback(async () => {
    if (
      wardrobeDirty &&
      !(await confirmation.ask({
        title: 'Discard the unfinished wardrobe variant?',
        description: 'The variant has not been saved and cannot be recovered.',
        confirmLabel: 'Discard variant',
        cancelLabel: 'Keep editing',
        danger: true,
      }))
    ) {
      return;
    }
    setWardrobeDirty(false);
    if (wardrobeExistingVideoStepId && existingVideo.selection) {
      setWardrobeExistingVideoStepId(null);
      openOverlay('video-upload');
      return;
    }
    closeOverlay();
  }, [
    closeOverlay,
    confirmation,
    existingVideo.selection,
    openOverlay,
    wardrobeDirty,
    wardrobeExistingVideoStepId,
  ]);

  const finishWardrobeVariantForExistingVideo = useCallback(() => {
    if (!wardrobeExistingVideoStepId || !existingVideo.selection) return;
    setWardrobeDirty(false);
    setWardrobeExistingVideoStepId(null);
    openOverlay('video-upload');
  }, [existingVideo.selection, openOverlay, wardrobeExistingVideoStepId]);

  const dismissBuilder = useCallback(() => {
    if (destination.kind === 'existing-video' && existingVideo.selection) {
      openOverlay('video-upload');
      return;
    }
    closeOverlay();
  }, [closeOverlay, destination, existingVideo.selection, openOverlay]);

  return {
    destination,
    launch,
    discardPrompt,
    launchError,
    resolveDiscard,
    dismissLaunchError,
    openNew,
    edit,
    copy,
    createForExistingVideo,
    openNewForProject,
    saveBlockedReason,
    saveCharacter:
      destination.kind === 'existing-video'
        ? saveExistingVideoCharacter
        : destination.kind === 'project'
          ? saveProjectCharacter
          : saveStudioCharacter,
    dismissBuilder,
    wardrobeCharacter,
    wardrobeExistingVideoStepId,
    wardrobeDirty,
    setWardrobeDirty,
    discardWardrobeDirty,
    openWardrobe,
    openWardrobeForExistingVideo,
    closeWardrobe,
    finishWardrobeVariantForExistingVideo,
  } as const;
};
