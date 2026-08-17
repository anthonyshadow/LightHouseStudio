import { useCallback, useEffect, useRef, useState } from 'react';
import { useAwaitableQuestion } from './useAwaitableQuestion';
import type { SavedCharacterPrompt } from '../features/creative-assets/types';
import {
  createCharacterEditDraftValue,
  createCharacterCopyDraftValue,
  prepareCharacterBuilderLaunch,
  type PrepareCharacterBuilderLaunchOptions,
} from '../features/character-builder/characterBuilderLaunch';
import type {
  CharacterBuilderDraftValueV1,
  CharacterBuilderTarget,
} from '../features/character-builder/characterBuilderPersistence';

export type CharacterBuilderLaunch = Readonly<{
  target: CharacterBuilderTarget;
  initialValue?: CharacterBuilderDraftValueV1;
  replaceCreateDraft?: boolean;
}>;

export type CharacterBuilderLaunchPreparer = (
  options: PrepareCharacterBuilderLaunchOptions,
) => Promise<boolean>;

export type CharacterBuilderLaunchControllerOptions = Readonly<{
  blockedReason?: string;
  ownerUserId?: string;
  onOpen: () => void;
  prepareLaunch?: CharacterBuilderLaunchPreparer;
}>;

const fallbackLaunchError = 'The Character Builder draft could not be prepared. Try again.';

export const useCharacterBuilderLaunchController = ({
  blockedReason,
  ownerUserId,
  onOpen,
  prepareLaunch = prepareCharacterBuilderLaunch,
}: CharacterBuilderLaunchControllerOptions) => {
  const [launch, setLaunch] = useState<CharacterBuilderLaunch>({
    target: { kind: 'create' },
  });
  const [launchError, setLaunchError] = useState<string | null>(null);
  const launchPendingRef = useRef(false);
  const operationGenerationRef = useRef(0);
  const mountedRef = useRef(true);

  // The prompt carries only its message: this flow renders its own dialog, so it needs the
  // awaitable plumbing rather than the shell's confirmation copy.
  const discard = useAwaitableQuestion<string>();
  const { pending: discardPrompt, ask: requestDiscard } = discard;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      operationGenerationRef.current += 1;
      launchPendingRef.current = false;
    };
  }, []);

  const launchCharacterBuilder = useCallback(
    async (nextLaunch: CharacterBuilderLaunch): Promise<void> => {
      if (blockedReason || launchPendingRef.current) return;
      launchPendingRef.current = true;
      const operationGeneration = ++operationGenerationRef.current;
      setLaunchError(null);
      try {
        const ready = await prepareLaunch({
          target: nextLaunch.target,
          replaceCreateDraft: nextLaunch.replaceCreateDraft ?? false,
          confirmDiscard: requestDiscard,
          ...(ownerUserId ? { ownerUserId } : {}),
        });
        if (
          !ready ||
          !mountedRef.current ||
          operationGenerationRef.current !== operationGeneration
        ) {
          return;
        }
        setLaunch(nextLaunch);
        onOpen();
      } catch (error) {
        if (mountedRef.current && operationGenerationRef.current === operationGeneration) {
          setLaunchError(error instanceof Error ? error.message : fallbackLaunchError);
        }
      } finally {
        if (operationGenerationRef.current === operationGeneration) {
          launchPendingRef.current = false;
        }
      }
    },
    [blockedReason, onOpen, ownerUserId, prepareLaunch, requestDiscard],
  );

  const openNewCharacter = useCallback(() => {
    void launchCharacterBuilder({ target: { kind: 'create' } });
  }, [launchCharacterBuilder]);

  const editCharacter = useCallback(
    (asset: SavedCharacterPrompt) => {
      void launchCharacterBuilder({
        target: {
          kind: 'edit',
          characterId: asset.id,
          originalName: asset.name,
          originalPrompt: asset.prompt,
        },
        initialValue: createCharacterEditDraftValue(asset),
      });
    },
    [launchCharacterBuilder],
  );

  const copyCharacter = useCallback(
    (asset: SavedCharacterPrompt) => {
      void launchCharacterBuilder({
        target: { kind: 'create' },
        initialValue: createCharacterCopyDraftValue(asset),
        replaceCreateDraft: true,
      });
    },
    [launchCharacterBuilder],
  );

  const dismissLaunchError = useCallback(() => setLaunchError(null), []);

  return {
    launch,
    discardPrompt,
    launchError,
    launchCharacterBuilder,
    openNewCharacter,
    editCharacter,
    copyCharacter,
    resolveDiscard: (confirmed: boolean) => (confirmed ? discard.confirm() : discard.cancel()),
    dismissLaunchError,
  } as const;
};
