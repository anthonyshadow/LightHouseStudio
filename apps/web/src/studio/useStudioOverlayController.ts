import { useCallback, useMemo, useReducer } from 'react';

export type ActiveOverlay =
  | 'ai-settings'
  | 'capture-settings'
  | 'take-review'
  | 'voice-treatments'
  | 'workshop'
  | 'character-builder'
  | 'character-selector'
  | 'saved-characters'
  | 'character-wardrobe'
  | 'outfit-selector'
  | 'outfit-builder'
  | 'ai-experience'
  | 'video-upload'
  | null;

type OverlayAction =
  | { readonly type: 'open'; readonly overlay: Exclude<ActiveOverlay, null> }
  | { readonly type: 'close' }
  | { readonly type: 'close-if'; readonly overlays: readonly Exclude<ActiveOverlay, null>[] }
  | { readonly type: 'toggle'; readonly overlay: Exclude<ActiveOverlay, null> };

export const studioOverlayReducer = (
  current: ActiveOverlay,
  action: OverlayAction,
): ActiveOverlay => {
  switch (action.type) {
    case 'open':
      return action.overlay;
    case 'close':
      return null;
    case 'close-if':
      return current !== null && action.overlays.includes(current) ? null : current;
    case 'toggle':
      return current === action.overlay ? null : action.overlay;
  }
};

export const useStudioOverlayController = (initial: ActiveOverlay) => {
  const [active, dispatch] = useReducer(studioOverlayReducer, initial);
  const open = useCallback((overlay: Exclude<ActiveOverlay, null>) => {
    dispatch({ type: 'open', overlay });
  }, []);
  const close = useCallback(() => {
    dispatch({ type: 'close' });
  }, []);
  const closeIf = useCallback((overlays: readonly Exclude<ActiveOverlay, null>[]) => {
    dispatch({ type: 'close-if', overlays });
  }, []);
  const toggle = useCallback((overlay: Exclude<ActiveOverlay, null>) => {
    dispatch({ type: 'toggle', overlay });
  }, []);

  return useMemo(
    () => ({ active, open, close, closeIf, toggle }) as const,
    [active, close, closeIf, open, toggle],
  );
};
