import { useTheme } from '@emotion/react';
import type { CreativeAssetStore } from '@studio/domain';
import { lazy, Suspense, useRef, type ReactNode, type RefObject } from 'react';
import type { BrowserCapabilities } from '../application/types';
import { CaptureSettingsPanel, RecordingAction, RecordingControls } from '../features/recording';
import { ownedRecordingArtifact } from '../features/recording/types';
import { cameraAvailabilityNotices } from '../features/recording/cameraAvailability';
import type { RecordingSource } from '../features/recording';
import type {
  SavedVideoCharacterAttribution,
  SaveVideoState,
} from '../features/saved-videos/useSaveVideo';
import { MediaStage, type MediaStageProps, type StagePresentation } from '../features/live-stage';
import type { StudioMode } from '../features/media-session';
import type { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import type { ProjectProcessingController } from '../features/projects/useProjectProcessingController';
import type { ProjectSessionPort } from '../features/projects/useProjectSession';
import type { useStudioSession } from '../orchestration/session';
import { projectVideoEditOutcome } from './projectVideoEditOutcome';
import { stageColumnStyles } from './StudioApp.styles';
import { StudioSessionControlBar } from './StudioSessionControlBar';
import type { useStudioProjectBridge } from './useStudioProjectBridge';
import type { useStudioSavedVideoController } from './useStudioSavedVideoController';
import type { useTakeReviewFlow } from './useTakeReviewFlow';

const VideoEditWorkspace = lazy(() =>
  import('../features/video-editor/VideoEditWorkspace').then((module) => ({
    default: module.VideoEditWorkspace,
  })),
);
const ProjectRouteSurface = lazy(() =>
  import('../features/projects/ProjectRouteSurface').then((module) => ({
    default: module.ProjectRouteSurface,
  })),
);

const deferredWorkspaceFallback = <p role="status">Loading studio tool…</p>;

interface StudioWorkspaceProps {
  readonly refs: {
    readonly fullscreen: RefObject<HTMLDivElement | null>;
    readonly uploadToggle: RefObject<HTMLButtonElement | null>;
  };
  readonly route: {
    readonly projectContextActive: boolean;
    readonly projectRecordingAvailable: boolean;
  };
  readonly controllers: {
    readonly session: ReturnType<typeof useStudioSession>;
    readonly takeReview: ReturnType<typeof useTakeReviewFlow>;
    readonly videoEditor: ReturnType<typeof useVideoEditSession>;
    readonly savedVideo: ReturnType<typeof useStudioSavedVideoController>;
    readonly project: ReturnType<typeof useStudioProjectBridge>;
    readonly projectProcessing: ProjectProcessingController;
  };
  readonly environment: {
    readonly browser: BrowserCapabilities;
    readonly desktopLayout: boolean;
    /** Whether the docked desktop capture settings are open. They rest collapsed. */
    readonly captureSettingsExpanded: boolean;
    readonly ownerUserId: string;
    readonly creativeStore: CreativeAssetStore;
    readonly onCreateProjectCharacter: (projectId: string) => void;
    readonly onCreateProjectOutfit: (projectId: string) => void;
  };
  readonly stage: {
    readonly presentation: StagePresentation;
    readonly aspectRatio: NonNullable<MediaStageProps['aspectRatio']>;
    readonly notices: NonNullable<MediaStageProps['notices']>;
    readonly editPreview: MediaStageProps['editPreview'] | null;
    readonly experienceLabel: string | undefined;
    readonly experienceImageAssetId: string | null;
    readonly recordingMode: StudioMode;
    readonly recordingCharacterAttribution: SavedVideoCharacterAttribution | null;
    readonly recordingSource: RecordingSource | null;
  };
  readonly activity: {
    readonly captureBlockedReason: string | undefined;
    readonly captureSettingsDisabledReason: string | undefined;
    readonly aiSessionActive: boolean;
  };
  /** Reports the workspace's Project session to the shell, which owns the one active slot. */
  readonly onProjectSessionChange: (session: ProjectSessionPort | null) => void;
  readonly creativeWorkspace: ReactNode;
  readonly projectCreativeCheckpoint: ReactNode;
  readonly saveVideoState: SaveVideoState;
  readonly actions: {
    readonly startLocalRecording: () => void;
    readonly closeTakeReview: () => void;
    readonly discardExistingVideoSelection: () => void;
    readonly openVoiceTreatments: () => void;
    readonly openAiExperience: () => void;
    readonly openExistingVideo: () => void;
    readonly openCaptureSettings: () => void;
    readonly toggleCaptureSettings: () => void;
    readonly startProjectRecording: () => void;
  };
}

export const StudioWorkspace = ({
  refs,
  route,
  controllers,
  environment,
  stage,
  activity,
  onProjectSessionChange,
  creativeWorkspace,
  projectCreativeCheckpoint,
  saveVideoState,
  actions,
}: StudioWorkspaceProps) => {
  const theme = useTheme();
  const editorVideoRef = useRef<HTMLVideoElement>(null);
  const { fullscreen: fullscreenWorkspaceRef, uploadToggle: uploadToggleRef } = refs;
  const { projectContextActive, projectRecordingAvailable } = route;
  const { session, takeReview, videoEditor, savedVideo, project, projectProcessing } = controllers;
  const {
    browser,
    desktopLayout: desktopStudioLayout,
    captureSettingsExpanded,
    ownerUserId,
  } = environment;
  const {
    presentation: stagePresentation,
    aspectRatio: stageAspectRatio,
    notices: stageNotices,
    editPreview: videoEditPreview,
    experienceLabel: currentExperienceLabel,
    experienceImageAssetId: currentExperienceImageAssetId,
    recordingMode: effectiveRecordingMode,
    recordingCharacterAttribution,
    recordingSource: activeRecordingSource,
  } = stage;
  const { captureBlockedReason, captureSettingsDisabledReason, aiSessionActive } = activity;
  const {
    startLocalRecording: onStartLocalRecording,
    closeTakeReview: onCloseTakeReview,
    discardExistingVideoSelection: onDiscardExistingVideoSelection,
    openVoiceTreatments: onOpenVoiceTreatments,
    openAiExperience: onOpenAiExperience,
    openExistingVideo: onOpenExistingVideo,
    openCaptureSettings: onOpenCaptureSettings,
    toggleCaptureSettings: onToggleCaptureSettings,
    startProjectRecording: onStartProjectRecording,
  } = actions;
  const {
    recording,
    recordingActive,
    reviewLocked,
    mediaLocked,
    finalizingStartedAt,
    finalizingStream,
    finishTake,
  } = takeReview;
  const videoEditing = videoEditor.phase !== 'closed';
  // The stage takes the settings column back whenever the docked panel is not actually open. Only
  // the standalone capture layout has one: the Project workspace and the editor own their columns.
  const captureSettingsCollapsed =
    desktopStudioLayout && !projectContextActive && !videoEditing && !captureSettingsExpanded;
  const captureIssues = cameraAvailabilityNotices({
    permissionState: session.capturePreferences.cameraPermissionState,
    devicesState: session.capturePreferences.devicesState,
    cameraCount: session.capturePreferences.cameraDevices.length,
  }).filter((notice) => notice.blocking);

  return (
    <>
      <div
        ref={fullscreenWorkspaceRef}
        css={stageColumnStyles(theme)}
        data-video-edit-active={videoEditing ? 'true' : 'false'}
        data-project-context={projectContextActive ? 'true' : undefined}
        data-capture-settings={captureSettingsCollapsed ? 'collapsed' : undefined}
      >
        <MediaStage
          videoRef={editorVideoRef}
          presentation={stagePresentation}
          mode={session.draft.mode}
          lifecycle={session.lifecycle}
          recording={recording.lifecycle === 'recording'}
          recordingSeconds={recording.elapsedSeconds}
          aspectRatio={stageAspectRatio}
          realtimeSessionTiming={session.realtimeSessionTiming}
          {...(currentExperienceLabel ? { experienceLabel: currentExperienceLabel } : {})}
          {...(projectContextActive
            ? {
                controls: ({ visible }: { visible: boolean }) =>
                  projectRecordingAvailable ? (
                    <div hidden={!visible} role="group" aria-label="Project recording controls">
                      <RecordingAction
                        recording={recording}
                        source={activeRecordingSource}
                        mode="local"
                        modelOutputReady={false}
                        supported={browser.mediaRecorder}
                        onStop={finishTake}
                      />
                    </div>
                  ) : null,
              }
            : !videoEditing
              ? {
                  controls: ({ visible }: { visible: boolean }) => (
                    <StudioSessionControlBar
                      session={session}
                      {...(currentExperienceLabel
                        ? { experienceLabel: currentExperienceLabel }
                        : {})}
                      experienceImageAssetId={currentExperienceImageAssetId}
                      recording={recording}
                      recordingMode={effectiveRecordingMode}
                      recordingCharacterAttribution={recordingCharacterAttribution}
                      recordingSource={activeRecordingSource}
                      recordingSupported={browser.mediaRecorder}
                      {...(captureBlockedReason
                        ? { recordingBlockedReason: captureBlockedReason }
                        : {})}
                      reviewingTake={stagePresentation.kind === 'playback'}
                      visible={visible}
                      controlsLocked={reviewLocked || finalizingStartedAt !== null}
                      onStopRecording={finishTake}
                      onStartLocalRecording={onStartLocalRecording}
                      onCloseTakeReview={onCloseTakeReview}
                      onDiscardTake={onDiscardExistingVideoSelection}
                      onOpenVoiceTreatments={onOpenVoiceTreatments}
                      onChooseAiExperience={onOpenAiExperience}
                      onChangeExperience={onOpenAiExperience}
                      onUploadVideo={onOpenExistingVideo}
                      uploadButtonRef={uploadToggleRef}
                      {...(ownedRecordingArtifact(recording.presented)
                        ? { onSaveVideo: savedVideo.requestSavePresentedVideo }
                        : {})}
                      saveVideoState={saveVideoState}
                      hasUnsavedChanges={savedVideo.presentedHasUnsavedChanges}
                      {...(savedVideo.activeLoadedSource &&
                      recording.presented?.id !== savedVideo.activeLoadedSource.artifactId
                        ? {
                            onReplaceSavedVideo: () => void savedVideo.replaceLoadedSavedVideo(),
                          }
                        : {})}
                    />
                  ),
                }
              : {})}
          notices={stageNotices}
          onPlaybackError={recording.repairPresentedObjectUrl}
          fullscreenTargetRef={fullscreenWorkspaceRef}
          {...(videoEditPreview ? { editPreview: videoEditPreview } : {})}
        />
        {videoEditing ? (
          <Suspense fallback={deferredWorkspaceFallback}>
            <VideoEditWorkspace
              session={videoEditor}
              videoRef={editorVideoRef}
              onRequestDiscard={savedVideo.requestVideoEditDiscard}
              {...(projectContextActive
                ? {
                    outcome: projectVideoEditOutcome(
                      project.session?.current?.revision.snapshot.localEdit ?? null,
                    ),
                  }
                : {})}
            />
          </Suspense>
        ) : projectContextActive ? (
          creativeWorkspace
        ) : (
          <>
            {creativeWorkspace}
            <RecordingControls
              recording={recording}
              source={activeRecordingSource}
              mode={effectiveRecordingMode}
              {...(!desktopStudioLayout ? { onOpenSettings: onOpenCaptureSettings } : {})}
              desktopSettingsExpanded={captureSettingsExpanded}
              onToggleDesktopSettings={onToggleCaptureSettings}
              captureIssues={captureIssues}
              desktopSettings={
                desktopStudioLayout ? (
                  <div
                    tabIndex={-1}
                    data-desktop-capture-settings=""
                    css={{
                      minWidth: 0,
                      minHeight: 0,
                      height: '100%',
                      overflow: 'hidden',
                      borderRadius: 'inherit',
                      '&:focus-visible': {
                        outline: `2px solid ${theme.colors.focus}`,
                        outlineOffset: '-2px',
                      },
                    }}
                  >
                    <CaptureSettingsPanel
                      controller={session.capturePreferences}
                      mode={session.draft.mode}
                      presentation="sidebar"
                      disabled={mediaLocked || aiSessionActive}
                      {...(captureSettingsDisabledReason
                        ? { disabledReason: captureSettingsDisabledReason }
                        : {})}
                    />
                  </div>
                ) : undefined
              }
            />
          </>
        )}
      </div>
      {projectContextActive ? (
        <Suspense fallback={<p role="status">Loading Projects workspace…</p>}>
          <ProjectRouteSurface
            workspaceMode
            ownerUserId={ownerUserId}
            creativeStore={environment.creativeStore}
            onCreateProjectCharacter={environment.onCreateProjectCharacter}
            onCreateProjectOutfit={environment.onCreateProjectOutfit}
            creativeCheckpoint={projectCreativeCheckpoint}
            processing={projectProcessing}
            sourceRuntime={project.sourceRuntime}
            recordingCandidate={project.recordingCandidate}
            recordingActive={
              recordingActive || finalizingStartedAt !== null || finalizingStream !== null
            }
            onStartRecording={onStartProjectRecording}
            onSourceActivityChange={project.handleSourceActivity}
            onWorkingMediaActivityChange={project.handleWorkingMediaActivity}
            onSessionChange={onProjectSessionChange}
          />
        </Suspense>
      ) : null}
    </>
  );
};
