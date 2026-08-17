import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { useStudioHandoff } from '../app/shell/useStudioHandoff';
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
  /**
   * Reads the Studio runtime's ports, or null when none is mounted. Called at the moment of use,
   * never captured: a Character created from the Characters library picks its destination while no
   * runtime exists and is saved later inside one.
   */
  readonly readPorts: ReturnType<typeof useStudioHandoff>['readPorts'];
  readonly activityBlockedReason: string | undefined;
  readonly openBlockedReason: string | undefined;
  readonly studioSaveBlockedReason: string | undefined;
  readonly openOverlay: (overlay: Exclude<ActiveOverlay, null>) => void;
  readonly closeOverlay: () => void;
  readonly confirmation: ConfirmationRequest;
}

export const useStudioCharacterWorkflow = ({
  ownerUserId,
  repository,
  store,
  readPorts,
  activityBlockedReason,
  openBlockedReason,
  studioSaveBlockedReason,
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
      const upload = readPorts()?.existingVideoCharacter;
      if (activityBlockedReason || upload === undefined || upload.providerActive) return;
      if (!upload.isCharacterSwapStep(stepId)) return;
      setDestination({ kind: 'existing-video', stepId });
      openNewCharacter();
    },
    [activityBlockedReason, openNewCharacter, readPorts],
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
      const upload = readPorts()?.existingVideoCharacter;
      if (destination.kind !== 'existing-video' || upload === undefined) {
        throw new Error('The upload character destination is no longer available.');
      }
      if (!upload.isCharacterSwapStep(destination.stepId)) {
        throw new Error('The Character Swap step is no longer available.');
      }

      if (stage === 'intent') {
        await persistCharacterSaveSnapshot(repository, snapshot, characterId);
        await progress.markCharacterPersisted();
      }

      await upload.applyCharacterToStep(destination.stepId, snapshot, characterId);
      await progress.markStudioPreloaded();
    },
    [destination, existingVideoSaveBlockedReason, readPorts, repository],
  );

  /**
   * The Studio destination is chosen where no runtime may exist — `character.openNew()` runs on
   * `/assets/characters` and navigates — and reached where one does. Resolving the port at save
   * time rather than at render is what makes that sequence work.
   */
  const saveStudioCharacter = useCallback<SaveCharacter>(
    async (snapshot, characterId, stage, progress) => {
      const save = readPorts()?.saveStudioCharacter;
      if (save === undefined) throw new Error('The Studio character destination is not available.');
      await save(snapshot, characterId, stage, progress);
    },
    [readPorts],
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
      const upload = readPorts()?.existingVideoCharacter;
      if (upload === undefined || upload.providerActive) return;
      const character = repository
        .getSnapshot()
        .store.savedCharacterPrompts.find((candidate) => candidate.id === characterId);
      if (!upload.isCharacterSwapStep(stepId) || !character) return;
      setWardrobeCharacterId(character.id);
      setWardrobeExistingVideoStepId(stepId);
      setWardrobeDirty(false);
      openOverlay('character-wardrobe');
    },
    [openOverlay, readPorts, repository],
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
    if (wardrobeExistingVideoStepId && readPorts()?.existingVideoCharacter.hasSelection) {
      setWardrobeExistingVideoStepId(null);
      openOverlay('video-upload');
      return;
    }
    closeOverlay();
  }, [
    closeOverlay,
    confirmation,
    openOverlay,
    readPorts,
    wardrobeDirty,
    wardrobeExistingVideoStepId,
  ]);

  const finishWardrobeVariantForExistingVideo = useCallback(() => {
    if (!wardrobeExistingVideoStepId || !readPorts()?.existingVideoCharacter.hasSelection) return;
    setWardrobeDirty(false);
    setWardrobeExistingVideoStepId(null);
    openOverlay('video-upload');
  }, [openOverlay, readPorts, wardrobeExistingVideoStepId]);

  const dismissBuilder = useCallback(() => {
    if (destination.kind === 'existing-video' && readPorts()?.existingVideoCharacter.hasSelection) {
      openOverlay('video-upload');
      return;
    }
    closeOverlay();
  }, [closeOverlay, destination, openOverlay, readPorts]);

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
