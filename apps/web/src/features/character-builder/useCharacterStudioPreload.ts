import type { ReferenceImageAsset } from '@studio/contracts';
import { canonicalPrompt } from '@studio/domain';
import { useCallback } from 'react';
import { hydrateReferenceImage } from '../../adapters/api-client/apiClient';
import type { CreativeAssetRepository } from '../creative-assets/types';
import {
  MODE_REPLACEMENT_CONFIRMATION,
  modeReplacementNeedsConfirmation,
} from '../media-session/draftPolicy';
import type { StudioSessionController } from '../media-session/types';
import type {
  CharacterSaveProgress,
  CharacterSaveSnapshot,
} from './characterBuilderControllerSupport';
import type { CharacterSaveStage } from './characterBuilderPersistence';
import { persistCharacterSaveSnapshot } from './persistCharacterSaveSnapshot';
import type { ConfirmationRequest } from '../../ui';

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
  readonly confirmation: ConfirmationRequest;
  readonly onStudioPreloaded: (preloaded: PreloadedCharacter) => void;
};

/** Persists a Character Builder result and atomically preloads its Studio recipe. */
export const useCharacterStudioPreload = ({
  repository,
  session,
  saveBlockedReason,
  confirmation,
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
        session.draft.mode !== 'lucy-latest' &&
        modeReplacementNeedsConfirmation(session.draft, 'lucy-latest') &&
        !(await confirmation.ask(MODE_REPLACEMENT_CONFIRMATION))
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
        session.draft.mode === 'lucy-latest' &&
        (canonicalPrompt(session.draft.prompt).length > 0 || currentReferenceId !== null);
      if (
        hasCurrentLucyRecipe &&
        (canonicalPrompt(session.draft.prompt) !== canonicalPrompt(studioPrompt) ||
          currentReferenceId !== incomingReferenceId) &&
        !(await confirmation.ask({
          title: 'Replace the current Character settings?',
          description: 'This saved Character replaces your current AI settings.',
          confirmLabel: 'Replace settings',
          danger: true,
        }))
      ) {
        throw new Error('Character save was cancelled. The resumable draft is unchanged.');
      }

      await persistCharacterSaveSnapshot(repository, snapshot, characterId);
      if (stage === 'intent') await progress.markCharacterPersisted();

      const preloaded = session.replaceRecipeDraft({
        mode: 'lucy-latest',
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
    [confirmation, onStudioPreloaded, repository, saveBlockedReason, session],
  );
