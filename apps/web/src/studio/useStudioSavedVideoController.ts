import type { SavedVideoDetail, SavedVideoSummary } from '@studio/contracts';
import type { ProjectExportSpecification, VideoEditSourceGeometry } from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError } from '../adapters/api-client/apiClient';
import { readSavedVideoContent } from '../adapters/api-client/savedVideosApi';
import { useExportPlacementRender } from '../features/export-placements';
import type { ExistingVideoSavedRecipe } from '../features/existing-video/ExistingVideoRecipeChooser';
import type { useExistingVideoWorkflow } from '../features/existing-video/useExistingVideoWorkflow';
import {
  ownedRecordingArtifact,
  type PresentedRecordingArtifact,
  type RecordingArtifact,
} from '../features/recording/types';
import type {
  SavedVideoCharacterAttribution,
  useSaveVideo,
} from '../features/saved-videos/useSaveVideo';
import type { SavedVideoThumbnailChoice } from '../features/saved-videos/thumbnailSource';
import { isVideoEditBusy } from '../features/video-editor/types';
import type { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import type { useTakeReviewFlow } from './useTakeReviewFlow';
import type { ConfirmationRequest } from '../ui';

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
      /**
       * The frame as it was measured when this save was asked for, so a placement is previewed and
       * rendered against exactly that, not against whatever the workflow moved on to.
       */
      geometry: VideoEditSourceGeometry | null;
      hasAudio: boolean;
    }>
  | Readonly<{
      intent: 'video-edit-replacement';
      artifact: RecordingArtifact;
    }>;

interface UseStudioSavedVideoControllerOptions {
  readonly existingVideo: ExistingVideoController;
  readonly recording: RecordingController;
  readonly recordingActive: boolean;
  readonly comparedExistingVideoArtifact: PresentedRecordingArtifact | null;
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

const safeSavedVideoLoadMessage = (error: unknown): string =>
  error instanceof ApiClientError && [403, 404, 410].includes(error.status)
    ? 'That video is unavailable or has been removed. Your Assets are unchanged.'
    : 'That video could not be opened in Studio. Your Assets are unchanged.';

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
  // The capability is shown only in the save dialog, which exists only while a save is pending, so
  // that is when it is worth measuring. Probing on every Studio entry made the browser encode a
  // 720p frame while the camera was still coming up, to answer a question nothing on screen asked.
  const placementRender = useExportPlacementRender(pendingSave !== null);
  // Only an explicitly requested save records an outcome. The pre-edit save inside `commitVideoEdit`
  // also reaches `saved`, but it is a side effect of replacing the source, not a completed journey.
  const [saveOutcome, setSaveOutcome] = useState<SavedVideoDetail | null>(null);
  const [discardPromptOpen, setDiscardPromptOpen] = useState(false);
  const [loadFailure, setLoadFailure] = useState<string | null>(null);
  const [loadedSource, setLoadedSource] = useState<LoadedSavedVideoSource | null>(null);
  const galleryEditRequestedRef = useRef(false);
  const gallerySourceLoadControllerRef = useRef<AbortController | null>(null);
  // Set when an editor session begins, read when it ends: a session entered from the
  // "Use existing video" chooser returns there on exit; a direct workspace launch does not.
  const editorReturnRef = useRef<'video-upload' | 'workspace'>('video-upload');

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
  const openVideoAdjust = useCallback(
    (options?: Readonly<{ returnTo?: 'video-upload' | 'workspace' }>) => {
      // Declares owned bytes: the editor renders from the complete media. With an active
      // existing-video selection the presented artifact is always owned.
      const sourceArtifact = ownedRecordingArtifact(
        comparedExistingVideoArtifact ?? recording.presented,
      );
      const metadata = existingVideo.currentMetadata;
      if (!sourceArtifact || !metadata || recordingActive || existingVideo.providerActive) return;
      // Where leaving the editor lands depends on how it was entered: a session begun from the
      // "Use existing video" chooser returns there; a direct workspace launch returns to the
      // workspace, because opening a chooser nobody visited is a dead end.
      editorReturnRef.current = options?.returnTo ?? 'video-upload';
      closeOverlay();
      videoEditor.begin({ artifact: sourceArtifact, metadata });
      focusStudio();
    },
    [
      closeOverlay,
      comparedExistingVideoArtifact,
      existingVideo.currentMetadata,
      existingVideo.providerActive,
      focusStudio,
      recording.presented,
      recordingActive,
      videoEditor,
    ],
  );

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
        const blob = await readSavedVideoContent({
          videoId: video.id,
          mimeType: video.currentVersion.mimeType,
          signal: controller.signal,
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

  /**
   * The entry the Assets gallery reaches, which always arrives here *after* the shell has already
   * navigated to Studio — the gallery is unmounted by then and cannot report anything. A failure
   * would otherwise leave the operator on an empty stage with no explanation, so it is caught and
   * published as a stage notice instead.
   */
  const useSavedVideo = useCallback(
    async (video: SavedVideoSummary, intent: 'play' | 'edit') => {
      setLoadFailure(null);
      try {
        await loadSavedVideo(video, intent);
      } catch (error) {
        setLoadFailure(safeSavedVideoLoadMessage(error));
      }
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
    // Declares owned bytes: replacing a gallery version uploads the complete media.
    const artifact = ownedRecordingArtifact(recording.presented);
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
    const video = await saveController.replace(artifact, activeLoadedSource, {
      character: presentedCharacter,
    });
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
    // Declares owned bytes: saving retains the complete media.
    const artifact = ownedRecordingArtifact(recording.presented);
    if (!artifact) return;
    const metadata = existingVideo.currentMetadata;
    placementRender.reset();
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
      geometry: metadata
        ? { width: metadata.width, height: metadata.height, durationMs: metadata.durationMs }
        : null,
      hasAudio: metadata?.hasAudio ?? false,
    });
  }, [
    activeLoadedSource,
    existingVideo.currentMetadata,
    placementRender,
    presentedCharacter,
    recording.presented,
  ]);

  const returnFromVideoEditor = useCallback(() => {
    videoEditor.close();
    setDiscardPromptOpen(false);
    // A session entered directly from a workspace launch returns to that workspace; reopening the
    // "Use existing video" chooser is only right when the session began there.
    if (editorReturnRef.current === 'video-upload') openVideoUpload();
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
    async (saveCurrent: boolean, name?: string, thumbnail?: SavedVideoThumbnailChoice) => {
      const source = videoEditor.source;
      const candidate = videoEditor.candidate;
      if (!source || !candidate || videoEditor.phase !== 'awaiting-replacement') return;
      videoEditor.beginCommit();
      try {
        if (saveCurrent) {
          const saved = await saveController.save(source.artifact, {
            title: name,
            ...(activeLoadedSource
              ? {
                  source: {
                    videoId: activeLoadedSource.videoId,
                    versionId: activeLoadedSource.currentVersionId,
                  },
                }
              : {}),
            character: presentedCharacter,
            thumbnail,
          });
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
        videoEditor.completeCommit();
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
    async (
      name?: string,
      thumbnail?: SavedVideoThumbnailChoice,
      placement?: ProjectExportSpecification | null,
    ) => {
      const pending = pendingSave;
      if (!pending) return;
      if (pending.intent === 'video-edit-replacement') {
        setPendingSave(null);
        void commitVideoEdit(true, name, thumbnail);
        return;
      }
      // A placement re-frames the bytes before they are retained, so the dialog stays open and
      // cancellable until the render settles. A failed or cancelled render saves nothing.
      let reframed: { readonly blob: Blob; readonly filename: string } | null = null;
      if (placement != null && pending.geometry !== null) {
        const rendered = await placementRender.render({
          media: pending.artifact.media,
          specification: placement,
          source: pending.geometry,
          hasAudio: pending.hasAudio,
          filename: pending.artifact.filename,
        });
        if (rendered === null) return;
        reframed = rendered;
      }
      setPendingSave(null);
      const saved = await saveController.save(pending.artifact, {
        title: name,
        source: pending.source,
        character: pending.character,
        thumbnail,
        ...(reframed ? { media: reframed, keyScope: placement?.aspect } : {}),
      });
      if (saved) setSaveOutcome(saved);
    },
    [commitVideoEdit, pendingSave, placementRender, saveController],
  );

  const discardWork = useCallback(() => {
    gallerySourceLoadControllerRef.current?.abort('discard');
    gallerySourceLoadControllerRef.current = null;
    galleryEditRequestedRef.current = false;
    placementRender.cancel();
    setPendingSave(null);
    setSaveOutcome(null);
    videoEditor.close();
    saveController.reset();
  }, [placementRender, saveController, videoEditor]);

  return {
    activeLoadedSource,
    presentedHasUnsavedChanges,
    pendingSave,
    placementRender,
    saveOutcome,
    discardPromptOpen,
    loadFailure,
    dismissLoadFailure: () => setLoadFailure(null),
    useSavedVideo,
    loadSavedVideoRoute,
    openVideoAdjust,
    replaceLoadedSavedVideo,
    requestSavePresentedVideo,
    dismissPendingSave: () => {
      placementRender.cancel();
      setPendingSave(null);
    },
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
