import {
  VIDEO_RESULT_MAX_BYTES,
  type SavedVideoDetail,
  type SavedVideoSummary,
} from '@studio/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError, apiFetch } from '../adapters/api-client/apiClient';
import { readBoundedBlob } from '../adapters/api-client/readBoundedBlob';
import { savedVideoContentUrl } from '../adapters/api-client/savedVideosApi';
import type { ExistingVideoSavedRecipe } from '../features/existing-video/ExistingVideoRecipeChooser';
import type { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import type { RecordingArtifact } from '../features/recording/types';
import type {
  SavedVideoCharacterAttribution,
  useSaveVideo,
} from '../features/saved-videos/useSaveVideo';
import { isVideoEditBusy } from '../features/video-editor/types';
import type { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import type { useTakeReviewFlow } from './useTakeReviewFlow';
import type { ConfirmationRequest } from './useConfirmationRequest';

type ExistingVideoController = ReturnType<typeof useExistingVideoWorkflow>;
type RecordingController = ReturnType<typeof useTakeReviewFlow>['recording'];
type SavedVideoSaveController = ReturnType<typeof useSaveVideo>;
type VideoEditorController = ReturnType<typeof useVideoEditSession>;

export type LoadedSavedVideoSource = Readonly<{
  videoId: string;
  currentVersionId: string;
  artifactId: string;
  characterName: string | null;
  characterVariantName: string | null;
}>;

export type PendingVideoSave =
  | Readonly<{
      intent: 'presented';
      artifact: RecordingArtifact;
      source: { readonly videoId: string; readonly versionId: string } | undefined;
      character: SavedVideoCharacterAttribution | null;
    }>
  | Readonly<{
      intent: 'video-edit-replacement';
      artifact: RecordingArtifact;
    }>;

interface UseStudioSavedVideoControllerOptions {
  readonly existingVideo: ExistingVideoController;
  readonly recording: RecordingController;
  readonly recordingActive: boolean;
  readonly comparedExistingVideoArtifact: RecordingArtifact | null;
  readonly videoEditor: VideoEditorController;
  readonly saveController: SavedVideoSaveController;
  readonly savedRecipes: readonly ExistingVideoSavedRecipe[];
  readonly recordingCharacterAttribution: SavedVideoCharacterAttribution | null;
  readonly navigateToStudio: () => void;
  readonly openVideoUpload: () => void;
  readonly openTakeReview: () => void;
  readonly closeOverlay: () => void;
  readonly focusStudio: () => void;
  readonly focusEditVideo: () => void;
  readonly confirmation: ConfirmationRequest;
}

export const useStudioSavedVideoController = ({
  existingVideo,
  recording,
  recordingActive,
  comparedExistingVideoArtifact,
  videoEditor,
  saveController,
  savedRecipes,
  recordingCharacterAttribution,
  navigateToStudio,
  openVideoUpload,
  openTakeReview,
  closeOverlay,
  focusStudio,
  focusEditVideo,
  confirmation,
}: UseStudioSavedVideoControllerOptions) => {
  const [pendingSave, setPendingSave] = useState<PendingVideoSave | null>(null);
  // Only an explicitly requested save records an outcome. The pre-edit save inside `commitVideoEdit`
  // also reaches `saved`, but it is a side effect of replacing the source, not a completed journey.
  const [saveOutcome, setSaveOutcome] = useState<SavedVideoDetail | null>(null);
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const [loadedSource, setLoadedSource] = useState<LoadedSavedVideoSource | null>(null);
  const galleryEditRequestedRef = useRef(false);
  const gallerySourceLoadControllerRef = useRef<AbortController | null>(null);

  const activeLoadedSource =
    !loadedSource ||
    !recording.original ||
    recording.original.id === loadedSource.artifactId ||
    recording.original.parentArtifactId === loadedSource.artifactId
      ? loadedSource
      : null;
  const presentedHasUnsavedChanges = Boolean(
    recording.presented &&
    !(
      saveController.state.status === 'saved' &&
      saveController.state.artifactId === recording.presented.id
    ) &&
    recording.presented.id !== activeLoadedSource?.artifactId,
  );
  const openVideoAdjust = useCallback(() => {
    const sourceArtifact = comparedExistingVideoArtifact ?? recording.presented;
    const metadata = existingVideo.currentMetadata;
    if (!sourceArtifact || !metadata || recordingActive || existingVideo.providerActive) return;
    closeOverlay();
    videoEditor.begin({ artifact: sourceArtifact, metadata });
    focusStudio();
  }, [
    closeOverlay,
    comparedExistingVideoArtifact,
    existingVideo.currentMetadata,
    existingVideo.providerActive,
    focusStudio,
    recording.presented,
    recordingActive,
    videoEditor,
  ]);

  const loadSavedVideo = useCallback(
    async (
      video: SavedVideoSummary,
      intent: 'play' | 'edit',
      options: Readonly<{
        preserveRoute?: boolean;
        enterReview?: boolean;
        signal?: AbortSignal;
      }> = {},
    ) => {
      if (recordingActive || existingVideo.providerActive) return;
      gallerySourceLoadControllerRef.current?.abort('replaced');
      const controller = new AbortController();
      gallerySourceLoadControllerRef.current = controller;
      const abortFromCaller = () => controller.abort(options.signal?.reason ?? 'cancelled');
      if (options.signal?.aborted) abortFromCaller();
      else options.signal?.addEventListener('abort', abortFromCaller, { once: true });
      try {
        const response = await apiFetch(savedVideoContentUrl(video.id), {
          cache: 'no-store',
          headers: { Accept: video.currentVersion.mimeType },
          signal: controller.signal,
        });
        const blob = await readBoundedBlob(response, {
          maximumBytes: VIDEO_RESULT_MAX_BYTES,
          signal: controller.signal,
          acceptsContentType: (contentType) => contentType === video.currentVersion.mimeType,
          createError: (failure) =>
            new ApiClientError(
              failure === 'too-large'
                ? 'The saved video exceeded the app-owned 300 MB safety limit.'
                : 'The saved video response was empty or invalid.',
              502,
              failure === 'too-large' ? 'result_too_large' : 'result_invalid',
            ),
          abortMessage: 'Saved video loading was cancelled.',
        });
        controller.signal.throwIfAborted();
        const file = new File([blob], video.currentVersion.filename, {
          type: video.currentVersion.mimeType,
          lastModified: new Date(video.currentVersion.createdAt).getTime(),
        });
        galleryEditRequestedRef.current = intent === 'edit';
        if (!options.preserveRoute) navigateToStudio();
        openVideoUpload();
        const artifact = await existingVideo.selectFile(file);
        if (artifact && !controller.signal.aborted) {
          setLoadedSource({
            videoId: video.id,
            currentVersionId: video.currentVersion.id,
            artifactId: artifact.id,
            characterName: video.currentVersion.characterName,
            characterVariantName: video.currentVersion.characterVariantName,
          });
          if (options.enterReview) openTakeReview();
          return true;
        }
        return false;
      } finally {
        options.signal?.removeEventListener('abort', abortFromCaller);
        if (gallerySourceLoadControllerRef.current === controller) {
          gallerySourceLoadControllerRef.current = null;
        }
      }
    },
    [existingVideo, navigateToStudio, openTakeReview, openVideoUpload, recordingActive],
  );

  const useSavedVideo = useCallback(
    async (video: SavedVideoSummary, intent: 'play' | 'edit') => {
      await loadSavedVideo(video, intent);
    },
    [loadSavedVideo],
  );

  const loadSavedVideoRoute = useCallback(
    async (video: SavedVideoSummary, signal: AbortSignal) => {
      const loaded = await loadSavedVideo(video, 'play', {
        preserveRoute: true,
        enterReview: true,
        signal,
      });
      if (!loaded && !signal.aborted) {
        throw new ApiClientError(
          'The saved video could not be prepared for review.',
          422,
          'video_invalid',
        );
      }
    },
    [loadSavedVideo],
  );

  useEffect(() => {
    if (
      !galleryEditRequestedRef.current ||
      existingVideo.phase !== 'ready' ||
      !existingVideo.selection
    ) {
      return;
    }
    galleryEditRequestedRef.current = false;
    openVideoAdjust();
  }, [existingVideo.phase, existingVideo.selection, openVideoAdjust]);

  const completedCharacterAttribution = useMemo(() => {
    if (existingVideo.completedStepCount < 1) return { applied: false, value: null } as const;
    const step = existingVideo.steps[existingVideo.completedStepCount - 1];
    if (step?.modelId !== 'lucy-latest') return { applied: false, value: null } as const;
    const recipe = step.savedRecipeId
      ? savedRecipes.find((candidate) => candidate.id === step.savedRecipeId)
      : undefined;
    return {
      applied: true,
      value:
        step.characterName || recipe?.characterName
          ? {
              characterName: step.characterName ?? recipe!.characterName!,
              characterVariantName:
                step.characterVariantName ?? recipe?.characterVariantName ?? null,
            }
          : null,
    } as const;
  }, [existingVideo.completedStepCount, existingVideo.steps, savedRecipes]);

  const presentedCharacter = useMemo(
    () =>
      recording.presented?.characterName
        ? {
            characterName: recording.presented.characterName,
            characterVariantName: recording.presented.characterVariantName ?? null,
          }
        : completedCharacterAttribution.applied
          ? completedCharacterAttribution.value
          : recording.presented?.sourceModeId === 'lucy-latest'
            ? recordingCharacterAttribution
            : activeLoadedSource?.characterName
              ? {
                  characterName: activeLoadedSource.characterName,
                  characterVariantName: activeLoadedSource.characterVariantName,
                }
              : null,
    [
      activeLoadedSource,
      completedCharacterAttribution,
      recording.presented,
      recordingCharacterAttribution,
    ],
  );

  const replaceLoadedSavedVideo = useCallback(async () => {
    const artifact = recording.presented;
    if (!artifact || !activeLoadedSource || artifact.id === activeLoadedSource.artifactId) return;
    if (
      !(await confirmation.ask({
        title: 'Replace the current gallery version with this result?',
        description: 'The previous version remains recoverable.',
        confirmLabel: 'Replace version',
      }))
    ) {
      return;
    }
    const video = await saveController.replace(
      artifact,
      activeLoadedSource,
      undefined,
      presentedCharacter,
    );
    if (video) {
      setLoadedSource((current) =>
        current?.videoId === video.id
          ? {
              ...current,
              currentVersionId: video.currentVersion.id,
              characterName: video.currentVersion.characterName,
              characterVariantName: video.currentVersion.characterVariantName,
            }
          : current,
      );
      setSaveOutcome(video);
    }
  }, [activeLoadedSource, confirmation, presentedCharacter, recording.presented, saveController]);

  const requestSavePresentedVideo = useCallback(() => {
    const artifact = recording.presented;
    if (!artifact) return;
    setPendingSave({
      intent: 'presented',
      artifact,
      source: activeLoadedSource
        ? {
            videoId: activeLoadedSource.videoId,
            versionId: activeLoadedSource.currentVersionId,
          }
        : undefined,
      character: presentedCharacter,
    });
  }, [activeLoadedSource, presentedCharacter, recording.presented]);

  const returnFromVideoEditor = useCallback(() => {
    videoEditor.close();
    setDiscardPromptOpen(false);
    openVideoUpload();
    focusEditVideo();
  }, [focusEditVideo, openVideoUpload, videoEditor]);

  const requestVideoEditDiscard = useCallback(() => {
    if (isVideoEditBusy(videoEditor.phase)) return;
    if (!videoEditor.dirty) {
      returnFromVideoEditor();
      return;
    }
    setDiscardPromptOpen(true);
  }, [returnFromVideoEditor, videoEditor.dirty, videoEditor.phase]);

  const commitVideoEdit = useCallback(
    async (saveCurrent: boolean, name?: string) => {
      const source = videoEditor.source;
      const candidate = videoEditor.candidate;
      if (!source || !candidate || videoEditor.phase !== 'awaiting-replacement') return;
      videoEditor.beginCommit();
      try {
        if (saveCurrent) {
          const saved = await saveController.save(
            source.artifact,
            name,
            activeLoadedSource
              ? {
                  videoId: activeLoadedSource.videoId,
                  versionId: activeLoadedSource.currentVersionId,
                }
              : undefined,
            presentedCharacter,
          );
          if (!saved) {
            videoEditor.failCommit(
              'The current video could not be saved, so it was not replaced. Your source remains unchanged.',
            );
            return;
          }
        }
        const validated = candidate.validated;
        const artifactId = `video-${crypto.randomUUID()}`;
        const artifact = recording.replaceSource({
          blob: validated.file,
          artifactMetadata: {
            id: artifactId,
            name: `Edited video · ${validated.metadata.selectedAt} · ${artifactId.slice(-8)}`,
            createdAt: validated.metadata.selectedAt,
            kind: 'edited',
            parentArtifactId: source.artifact.id,
            characterName:
              source.artifact.characterName ?? presentedCharacter?.characterName ?? null,
            characterVariantName:
              source.artifact.characterVariantName ??
              presentedCharacter?.characterVariantName ??
              null,
            mimeType: validated.mimeType,
            filename: validated.file.name,
            sourceModeId: 'local',
            startedAt: validated.metadata.selectedAt,
            durationMs: validated.metadata.durationMs,
          },
          takeMetadata: validated.metadata,
          audioSidecar: validated.audioSidecar,
        });
        existingVideo.replaceSource(validated, artifact);
        videoEditor.completeCommit(artifact.id);
        videoEditor.close();
        openVideoUpload();
      } catch {
        videoEditor.failCommit(
          'The edited video passed rendering but could not replace the current source. The current video remains unchanged.',
        );
      }
    },
    [
      activeLoadedSource,
      existingVideo,
      openVideoUpload,
      presentedCharacter,
      recording,
      saveController,
      videoEditor,
    ],
  );

  const requestSaveAndCommitVideoEdit = useCallback(() => {
    const source = videoEditor.source;
    if (!source || !videoEditor.candidate || videoEditor.phase !== 'awaiting-replacement') return;
    setPendingSave({ intent: 'video-edit-replacement', artifact: source.artifact });
  }, [videoEditor]);

  const confirmPendingSave = useCallback(
    (name?: string) => {
      const pending = pendingSave;
      if (!pending) return;
      setPendingSave(null);
      if (pending.intent === 'video-edit-replacement') {
        void commitVideoEdit(true, name);
        return;
      }
      void saveController
        .save(pending.artifact, name, pending.source, pending.character)
        .then((saved) => {
          if (saved) setSaveOutcome(saved);
        });
    },
    [commitVideoEdit, pendingSave, saveController],
  );

  const discardWork = useCallback(() => {
    gallerySourceLoadControllerRef.current?.abort('discard');
    gallerySourceLoadControllerRef.current = null;
    galleryEditRequestedRef.current = false;
    setPendingSave(null);
    setSaveOutcome(null);
    videoEditor.close();
    saveController.reset();
  }, [saveController, videoEditor]);

  return {
    activeLoadedSource,
    presentedHasUnsavedChanges,
    pendingSave,
    saveOutcome,
    discardPromptOpen,
    useSavedVideo,
    loadSavedVideoRoute,
    openVideoAdjust,
    replaceLoadedSavedVideo,
    requestSavePresentedVideo,
    dismissPendingSave: () => setPendingSave(null),
    dismissSaveOutcome: () => setSaveOutcome(null),
    confirmPendingSave,
    requestVideoEditDiscard,
    dismissVideoEditDiscard: () => setDiscardPromptOpen(false),
    returnFromVideoEditor,
    commitVideoEdit,
    requestSaveAndCommitVideoEdit,
    discardWork,
  } as const;
};
