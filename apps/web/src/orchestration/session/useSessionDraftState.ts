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
  type RecipeDraftReplacement,
  type SessionDraft,
  type SessionReferenceImage,
  type StudioMode,
} from '../../features/media-session';
import { hasPendingChanges, revertToAppliedDraft } from './realtimeSnapshot';

export type SessionDraftState = {
  draft: SessionDraft;
  draftRef: RefObject<SessionDraft>;
  applied: AppliedRealtimeState | null;
  setApplied: Dispatch<SetStateAction<AppliedRealtimeState | null>>;
  pendingChanges: boolean;
  selectDraft: (mode: StudioMode) => void;
  replaceRecipeDraft: (replacement: RecipeDraftReplacement) => void;
  replaceWithEmptyDraft: (mode: StudioMode) => void;
  revertDraft: () => void;
  updatePrompt: (prompt: string) => void;
  updateEnhancement: (enhance: boolean) => void;
  updateReferenceImage: (referenceImage: SessionReferenceImage | null) => void;
};

const revokeReference = (referenceImage: SessionReferenceImage | null): void => {
  if (referenceImage?.kind === 'ephemeral') URL.revokeObjectURL(referenceImage.previewUrl);
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
      revokeReference(departing.referenceImage);
      return {
        ...current,
        [currentMode]: {
          ...departing,
          referenceImage: null,
        },
      };
    });
    setActiveMode(mode);
  }, []);

  const replaceWithEmptyDraft = useCallback((mode: StudioMode) => {
    setDrafts((current) => {
      revokeReference(current[mode].referenceImage);
      return { ...current, [mode]: createEmptyDraft(mode) };
    });
    activeModeRef.current = mode;
    setActiveMode(mode);
  }, []);

  const replaceRecipeDraft = useCallback((replacement: RecipeDraftReplacement) => {
    const nextDraft: SessionDraft = {
      mode: replacement.mode,
      prompt: replacement.prompt,
      referenceImage: replacement.referenceImage,
      enhance: replacement.enhance ?? false,
    };
    const previousMode = activeModeRef.current;
    setDrafts((current) => {
      const replaced = current[replacement.mode];
      if (replaced.referenceImage !== replacement.referenceImage) {
        revokeReference(replaced.referenceImage);
      }
      if (previousMode !== replacement.mode) {
        revokeReference(current[previousMode].referenceImage);
      }
      return {
        ...current,
        ...(previousMode !== replacement.mode
          ? {
              [previousMode]: {
                ...current[previousMode],
                referenceImage: null,
              },
            }
          : {}),
        [replacement.mode]: nextDraft,
      };
    });
    activeModeRef.current = replacement.mode;
    draftRef.current = nextDraft;
    setActiveMode(replacement.mode);
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

  const updateReferenceImage = useCallback((referenceImage: SessionReferenceImage | null) => {
    const mode = activeModeRef.current;
    setDrafts((current) => {
      const active = current[mode];
      if (active.referenceImage !== referenceImage) revokeReference(active.referenceImage);
      return {
        ...current,
        [mode]: { ...active, referenceImage },
      };
    });
  }, []);

  const revertDraft = useCallback(() => {
    if (!applied) return;
    const mode = activeModeRef.current;
    setDrafts((current) => {
      const active = current[mode];
      revokeReference(active.referenceImage);
      const reverted = revertToAppliedDraft(active, applied);
      const referenceImage = reverted.referenceImage;
      return {
        ...current,
        [mode]: {
          ...reverted,
          referenceImage:
            referenceImage?.kind === 'ephemeral'
              ? {
                  kind: 'ephemeral',
                  file: referenceImage.file,
                  previewUrl: URL.createObjectURL(referenceImage.file),
                }
              : referenceImage,
        },
      };
    });
  }, [applied]);

  useEffect(
    () => () => {
      for (const storedDraft of Object.values(draftsRef.current)) {
        revokeReference(storedDraft.referenceImage);
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
      replaceRecipeDraft,
      replaceWithEmptyDraft,
      revertDraft,
      updatePrompt,
      updateEnhancement,
      updateReferenceImage,
    }),
    [
      draft,
      applied,
      selectDraft,
      replaceRecipeDraft,
      replaceWithEmptyDraft,
      revertDraft,
      updatePrompt,
      updateEnhancement,
      updateReferenceImage,
    ],
  );
};
