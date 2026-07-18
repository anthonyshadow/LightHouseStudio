import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import {
  createEmptyDraft,
  type AppliedRealtimeState,
  type SessionDraft,
  type StudioMode,
} from '../../features/media-session';
import { hasPendingChanges, revertToAppliedDraft } from './realtimeSnapshot';

export type SessionDraftState = {
  draft: SessionDraft;
  draftRef: RefObject<SessionDraft>;
  applied: AppliedRealtimeState | null;
  setApplied: Dispatch<SetStateAction<AppliedRealtimeState | null>>;
  pendingChanges: boolean;
  selectDraft(mode: StudioMode): void;
  replaceWithEmptyDraft(mode: StudioMode): void;
  revertDraft(): void;
  updatePrompt(prompt: string): void;
  updateEnhancement(enhance: boolean): void;
  updateImage(image: File | null, previewUrl: string | null): void;
};

const revokePreview = (previewUrl: string | null): void => {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
};

export const useSessionDraftState = (): SessionDraftState => {
  const [activeMode, setActiveMode] = useState<StudioMode>('local');
  const [drafts, setDrafts] = useState<Record<StudioMode, SessionDraft>>(() => ({
    local: createEmptyDraft('local'),
    'lucy-2.5': createEmptyDraft('lucy-2.5'),
    'lucy-vton-3': createEmptyDraft('lucy-vton-3'),
  }));
  const draft = drafts[activeMode];
  const [applied, setApplied] = useState<AppliedRealtimeState | null>(null);
  const activeModeRef = useRef(activeMode);
  const draftRef = useRef(draft);
  const draftsRef = useRef(drafts);

  useEffect(() => {
    activeModeRef.current = activeMode;
    draftRef.current = draft;
    draftsRef.current = drafts;
  }, [activeMode, draft, drafts]);

  const selectDraft = useCallback((mode: StudioMode) => {
    const currentMode = activeModeRef.current;
    if (currentMode === mode) return;
    activeModeRef.current = mode;
    setDrafts((current) => {
      const departing = current[currentMode];
      revokePreview(departing.imagePreviewUrl);
      return {
        ...current,
        [currentMode]: {
          ...departing,
          image: null,
          imagePreviewUrl: null,
        },
      };
    });
    setActiveMode(mode);
  }, []);

  const replaceWithEmptyDraft = useCallback((mode: StudioMode) => {
    setDrafts((current) => {
      revokePreview(current[mode].imagePreviewUrl);
      return { ...current, [mode]: createEmptyDraft(mode) };
    });
    activeModeRef.current = mode;
    setActiveMode(mode);
  }, []);

  const updatePrompt = useCallback((prompt: string) => {
    const mode = activeModeRef.current;
    setDrafts((current) => ({
      ...current,
      [mode]: { ...current[mode], prompt },
    }));
  }, []);

  const updateEnhancement = useCallback((enhance: boolean) => {
    const mode = activeModeRef.current;
    setDrafts((current) => ({
      ...current,
      [mode]: { ...current[mode], enhance },
    }));
  }, []);

  const updateImage = useCallback((image: File | null, previewUrl: string | null) => {
    const mode = activeModeRef.current;
    setDrafts((current) => {
      const active = current[mode];
      if (active.imagePreviewUrl !== previewUrl) revokePreview(active.imagePreviewUrl);
      return {
        ...current,
        [mode]: { ...active, image, imagePreviewUrl: previewUrl },
      };
    });
  }, []);

  const revertDraft = useCallback(() => {
    if (!applied) return;
    const mode = activeModeRef.current;
    setDrafts((current) => {
      const active = current[mode];
      revokePreview(active.imagePreviewUrl);
      const reverted = revertToAppliedDraft(active, applied);
      return {
        ...current,
        [mode]: {
          ...reverted,
          imagePreviewUrl: reverted.image ? URL.createObjectURL(reverted.image) : null,
        },
      };
    });
  }, [applied]);

  useEffect(
    () => () => {
      for (const storedDraft of Object.values(draftsRef.current)) {
        revokePreview(storedDraft.imagePreviewUrl);
      }
    },
    [],
  );

  return useMemo(
    () => ({
      draft,
      draftRef,
      applied,
      setApplied,
      pendingChanges: hasPendingChanges(draft, applied),
      selectDraft,
      replaceWithEmptyDraft,
      revertDraft,
      updatePrompt,
      updateEnhancement,
      updateImage,
    }),
    [
      draft,
      applied,
      selectDraft,
      replaceWithEmptyDraft,
      revertDraft,
      updatePrompt,
      updateEnhancement,
      updateImage,
    ],
  );
};
