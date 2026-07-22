import type { RefObject } from 'react';
import type { LocalProjectRepository } from '../guided-flow/types';
import { CharacterBuilderPanel } from './CharacterBuilderPanel';
import {
  useCharacterBuilderController,
  type CharacterSaveProgress,
  type CharacterSaveSnapshot,
  type CharacterSaveStage,
} from './useCharacterBuilderController';

export interface CharacterBuilderCoordinatorProps {
  readonly open: boolean;
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly generationAvailable: boolean;
  readonly editAvailable: boolean;
  readonly saveBlockedReason?: string | undefined;
  readonly legacyRepository?: LocalProjectRepository | undefined;
  readonly onSaveCharacter: (
    snapshot: CharacterSaveSnapshot,
    characterId: string,
    stage: CharacterSaveStage,
    progress: CharacterSaveProgress,
  ) => Promise<void>;
  readonly onDismiss: () => void;
}

export const CharacterBuilderCoordinator = ({
  open,
  returnFocusRef,
  ...options
}: CharacterBuilderCoordinatorProps) => {
  const controller = useCharacterBuilderController({ open, ...options });
  return (
    <CharacterBuilderPanel
      open={open}
      {...(returnFocusRef ? { returnFocusRef } : {})}
      {...controller}
    />
  );
};
