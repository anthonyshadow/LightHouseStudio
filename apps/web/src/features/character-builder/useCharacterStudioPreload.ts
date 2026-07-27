import type { ReferenceImageAsset } from '@studio/contracts';
import { canonicalPrompt } from '@studio/domain';
import { useCallback } from 'react';
import { hydrateReferenceImage } from '../../adapters/api-client/apiClient';
import type { CreativeAssetRepository } from '../creative-assets/types';
import { confirmModeReplacement } from '../media-session/draftPolicy';
import type { StudioSessionController } from '../media-session/types';
import type {
  CharacterSaveProgress,
  CharacterSaveSnapshot,
  CharacterSaveStage,
} from './useCharacterBuilderController';

const referenceIdentity = (
  reference: StudioSessionController['draft']['referenceImage'],
): string | null =>
  reference?.kind === 'persisted'
    ? reference.assetId
    : reference
      ? 'session:ephemeral-reference'
      : null;

export type PreloadedCharacter = {
  readonly characterId: string;
  readonly snapshot: CharacterSaveSnapshot;
  readonly studioPrompt: string;
  readonly referenceImage: ReferenceImageAsset | null;
};

type UseCharacterStudioPreloadOptions = {
  readonly repository: CreativeAssetRepository;
  readonly session: StudioSessionController;
  readonly saveBlockedReason: string | undefined;
  readonly onStudioPreloaded: (preloaded: PreloadedCharacter) => void;
};

/** Persists a Character Builder result and atomically preloads its Studio recipe. */
export const useCharacterStudioPreload = ({
  repository,
  session,
  saveBlockedReason,
  onStudioPreloaded,
}: UseCharacterStudioPreloadOptions) =>
  useCallback(
    async (
      snapshot: CharacterSaveSnapshot,
      characterId: string,
      stage: CharacterSaveStage,
      progress: CharacterSaveProgress,
    ): Promise<void> => {
      if (saveBlockedReason) throw new Error(saveBlockedReason);
      if (
        session.draft.mode !== 'lucy-2.5' &&
        !confirmModeReplacement(session.draft, 'lucy-2.5', (message) => window.confirm(message))
      ) {
        throw new Error('Character save was cancelled. The resumable draft is unchanged.');
      }

      const referenceImage = snapshot.referenceImage;
      const hydratedReference = referenceImage
        ? await hydrateReferenceImage(referenceImage.assetId, referenceImage)
        : null;
      const studioPrompt =
        referenceImage?.source === 'generated'
          ? referenceImage.lucy25CharacterPrompt
          : snapshot.prompt;
      const currentReferenceId = referenceIdentity(session.draft.referenceImage);
      const incomingReferenceId = referenceImage?.assetId ?? null;
      const hasCurrentLucyRecipe =
        session.draft.mode === 'lucy-2.5' &&
        (canonicalPrompt(session.draft.prompt).length > 0 || currentReferenceId !== null);
      if (
        hasCurrentLucyRecipe &&
        (canonicalPrompt(session.draft.prompt) !== canonicalPrompt(studioPrompt) ||
          currentReferenceId !== incomingReferenceId) &&
        !window.confirm(
          'Replace the current Lucy 2.5 recipe in the Dock with this saved character? Your current Dock values will be replaced.',
        )
      ) {
        throw new Error('Character save was cancelled. The resumable draft is unchanged.');
      }

      repository.persistSavedCharacterPrompt({
        id: characterId,
        name: snapshot.name,
        prompt: snapshot.prompt,
        source: 'generator',
        promptIntent: snapshot.draft ? 'character-transform' : null,
        builderDraft: snapshot.draft,
        guidedDesign: snapshot.design,
        referenceImageStatus: referenceImage ? 'persisted-reference' : 'prompt-only',
        referenceImageAssetId: referenceImage?.assetId ?? null,
        uploadedReferenceImageAssetId: snapshot.uploadedReferenceImageAssetId,
        finalReferenceKind: snapshot.finalReferenceKind,
      });
      if (stage === 'intent') await progress.markCharacterPersisted();

      const preloaded = session.replaceRecipeDraft({
        mode: 'lucy-2.5',
        prompt: studioPrompt,
        referenceImage: hydratedReference,
        enhance: referenceImage?.source === 'generated',
      });
      if (!preloaded) {
        throw new Error(
          'Release the active camera or AI session, then retry preloading this saved character.',
        );
      }

      onStudioPreloaded({ characterId, snapshot, studioPrompt, referenceImage });
      await progress.markStudioPreloaded();
    },
    [onStudioPreloaded, repository, saveBlockedReason, session],
  );
