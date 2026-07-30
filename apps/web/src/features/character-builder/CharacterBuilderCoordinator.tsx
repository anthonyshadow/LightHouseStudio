import type { RefObject } from 'react';
import { CharacterBuilderPanel } from './CharacterBuilderPanel';
import {
  useCharacterBuilderController,
  type UseCharacterBuilderControllerOptions,
} from './useCharacterBuilderController';

export type CharacterBuilderCoordinatorProps = UseCharacterBuilderControllerOptions & {
  readonly returnFocusRef?: RefObject<HTMLElement | null>;
  readonly referenceImageProvider?: 'openai' | 'bfl' | 'wiro' | null;
  readonly referenceImageModel?: string | null;
  readonly referenceImageOptimizerModel?: string | null;
};

export const CharacterBuilderCoordinator = ({
  open,
  returnFocusRef,
  referenceImageProvider,
  referenceImageModel,
  referenceImageOptimizerModel,
  ...options
}: CharacterBuilderCoordinatorProps) => {
  const controller = useCharacterBuilderController({ open, ...options });
  return (
    <CharacterBuilderPanel
      open={open}
      {...(returnFocusRef ? { returnFocusRef } : {})}
      {...(referenceImageProvider !== undefined ? { referenceImageProvider } : {})}
      {...(referenceImageModel !== undefined ? { referenceImageModel } : {})}
      {...(referenceImageOptimizerModel !== undefined ? { referenceImageOptimizerModel } : {})}
      {...controller}
    />
  );
};
