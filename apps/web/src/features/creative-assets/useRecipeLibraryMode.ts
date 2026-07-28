import { useCallback, useState } from 'react';
import type { ModelMode, StudioMode } from '../../application/types';

export const canReplaceDirtyLibraryMode = (
  dirty: boolean,
  confirmDiscard: () => boolean,
): boolean => !dirty || confirmDiscard();

export const useRecipeLibraryMode = (sessionMode: StudioMode) => {
  const [selectedMode, setSelectedMode] = useState<ModelMode>('lucy-2.5');
  const [dirty, setDirty] = useState(false);
  const mode = sessionMode !== 'local' && !dirty ? sessionMode : selectedMode;

  const changeMode = useCallback(
    (nextMode: ModelMode): boolean => {
      if (nextMode === mode) return true;
      if (
        !canReplaceDirtyLibraryMode(dirty, () =>
          window.confirm('Switch recipe models and discard the unsaved shelf form changes?'),
        )
      ) {
        return false;
      }
      setDirty(false);
      setSelectedMode(nextMode);
      return true;
    },
    [dirty, mode],
  );

  return { mode, dirty, setDirty, changeMode } as const;
};
