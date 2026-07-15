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
  const [draft, setDraft] = useState<SessionDraft>(() => createEmptyDraft('local'));
  const [applied, setApplied] = useState<AppliedRealtimeState | null>(null);
  const draftRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  const replaceWithEmptyDraft = useCallback((mode: StudioMode) => {
    setDraft((current) => {
      revokePreview(current.imagePreviewUrl);
      return createEmptyDraft(mode);
    });
  }, []);

  const updatePrompt = useCallback((prompt: string) => {
    setDraft((current) => ({ ...current, prompt }));
  }, []);

  const updateEnhancement = useCallback((enhance: boolean) => {
    setDraft((current) => ({ ...current, enhance }));
  }, []);

  const updateImage = useCallback((image: File | null, previewUrl: string | null) => {
    setDraft((current) => {
      if (current.imagePreviewUrl !== previewUrl) revokePreview(current.imagePreviewUrl);
      return { ...current, image, imagePreviewUrl: previewUrl };
    });
  }, []);

  const revertDraft = useCallback(() => {
    if (!applied) return;
    setDraft((current) => {
      revokePreview(current.imagePreviewUrl);
      const reverted = revertToAppliedDraft(current, applied);
      return {
        ...reverted,
        imagePreviewUrl: reverted.image ? URL.createObjectURL(reverted.image) : null,
      };
    });
  }, [applied]);

  useEffect(
    () => () => {
      revokePreview(draftRef.current.imagePreviewUrl);
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
      replaceWithEmptyDraft,
      revertDraft,
      updatePrompt,
      updateEnhancement,
      updateImage,
    }),
    [
      draft,
      applied,
      replaceWithEmptyDraft,
      revertDraft,
      updatePrompt,
      updateEnhancement,
      updateImage,
    ],
  );
};
