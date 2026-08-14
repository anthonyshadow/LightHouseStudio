import { useTheme } from '@emotion/react';
import { lazy, Suspense, type ReactNode, type RefObject } from 'react';
import type { BrowserCapabilities } from '../application/types';
import { CaptureSettingsPanel, RecordingAction, RecordingControls } from '../features/recording';
import type { RecordingSource } from '../features/recording';
import type {
  SavedVideoCharacterAttribution,
  SaveVideoState,
} from '../features/saved-videos/useSaveVideo';
import { MediaStage, type MediaStageProps, type StagePresentation } from '../features/live-stage';
import type { StudioMode } from '../features/media-session';
import type { useVideoEditSession } from '../features/video-editor/useVideoEditSession';
import type { ProjectProcessingController } from '../features/projects/useProjectProcessingController';
import type { useStudioSession } from '../orchestration/session';
import { Button } from '../ui';
import { firstSuccessGuideStyles, mainGridStyles, stageColumnStyles } from './StudioApp.styles';
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
const CampaignRouteSurface = lazy(() =>
  import('../features/campaigns/CampaignRouteSurface').then((module) => ({
    default: module.CampaignRouteSurface,
  })),
);

const deferredWorkspaceFallback = <p role="status">Loading studio tool…</p>;

interface StudioWorkspaceProps {
  readonly refs: {
    readonly main: RefObject<HTMLElement | null>;
    readonly fullscreen: RefObject<HTMLDivElement | null>;
    readonly uploadToggle: RefObject<HTMLButtonElement | null>;
  };
  readonly route: {
    readonly organizationActive: boolean;
    readonly projectContextActive: boolean;
    readonly projectActive: boolean;
    readonly campaignActive: boolean;
    readonly projectRecordingAvailable: boolean;
  };
  readonly guide: {
    readonly visible: boolean;
    readonly dismiss: () => void;
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
    readonly ownerUserId: string;
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
  readonly creativeWorkspace: ReactNode;
  readonly projectCreativeCheckpoint: ReactNode;
  readonly saveVideoState: SaveVideoState;
  readonly actions: {
    readonly startExistingVideoRecording: () => void;
    readonly closeTakeReview: () => void;
    readonly discardExistingVideoSelection: () => void;
    readonly openVoiceTreatments: () => void;
    readonly openAiExperience: () => void;
    readonly openExistingVideo: () => void;
    readonly openCaptureSettings: () => void;
    readonly startProjectRecording: () => void;
  };
}

export const StudioWorkspace = ({
  refs,
  route,
  guide,
  controllers,
  environment,
  stage,
  activity,
  creativeWorkspace,
  projectCreativeCheckpoint,
  saveVideoState,
  actions,
}: StudioWorkspaceProps) => {
  const theme = useTheme();
  const { main: mainRef, fullscreen: fullscreenWorkspaceRef, uploadToggle: uploadToggleRef } = refs;
  const {
    organizationActive: organizationRouteActive,
    projectContextActive,
    projectActive: projectRouteActive,
    campaignActive: campaignRouteActive,
    projectRecordingAvailable,
  } = route;
  const { visible: showFirstSuccessGuide, dismiss: onDismissFirstSuccessGuide } = guide;
  const { session, takeReview, videoEditor, savedVideo, project, projectProcessing } = controllers;
  const { browser, desktopLayout: desktopStudioLayout, ownerUserId } = environment;
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
    startExistingVideoRecording: onStartExistingVideoRecording,
    closeTakeReview: onCloseTakeReview,
    discardExistingVideoSelection: onDiscardExistingVideoSelection,
    openVoiceTreatments: onOpenVoiceTreatments,
    openAiExperience: onOpenAiExperience,
    openExistingVideo: onOpenExistingVideo,
    openCaptureSettings: onOpenCaptureSettings,
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

  return (
    <main ref={mainRef} id="studio-main" tabIndex={-1} css={mainGridStyles(projectContextActive)}>
      <div
        ref={fullscreenWorkspaceRef}
        hidden={organizationRouteActive && !projectContextActive}
        css={stageColumnStyles(theme)}
        data-video-edit-active={videoEditing ? 'true' : 'false'}
        data-project-context={projectContextActive ? 'true' : undefined}
      >
        <MediaStage
          presentation={stagePresentation}
          mode={session.draft.mode}
          lifecycle={session.lifecycle}
          recording={recording.lifecycle === 'recording'}
          recordingSeconds={recording.elapsedSeconds}
          aspectRatio={stageAspectRatio}
          realtimeSessionTiming={session.realtimeSessionTiming}
          idleAction={
            !projectContextActive && stagePresentation.kind === 'idle' && showFirstSuccessGuide ? (
              <aside
                aria-label="First take guide"
                data-first-success-guide=""
                css={firstSuccessGuideStyles(theme)}
              >
                <strong data-guide-title>Create a video</strong>
                <span data-guide-copy>
                  <span data-guide-primary-long>
                    <span data-guide-step-number aria-hidden="true">
                      1
                    </span>
                    <span>Record New Video or Upload Video → review</span>
                  </span>
                  <span data-guide-upload>
                    <span data-guide-step-number aria-hidden="true">
                      2
                    </span>
                    <span>Virtual Try On · Character Swap · Voice → Save</span>
                  </span>
                </span>
                <Button
                  size="small"
                  variant="quiet"
                  aria-label="Dismiss first take guide"
                  onClick={onDismissFirstSuccessGuide}
                >
                  <span data-guide-dismiss-long>Dismiss</span>
                  <span data-guide-dismiss-short aria-hidden="true">
                    ×
                  </span>
                </Button>
              </aside>
            ) : null
          }
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
                      onStartLocalRecording={onStartExistingVideoRecording}
                      onCloseTakeReview={onCloseTakeReview}
                      onDiscardTake={onDiscardExistingVideoSelection}
                      onOpenVoiceTreatments={onOpenVoiceTreatments}
                      onChooseAiExperience={onOpenAiExperience}
                      onChangeExperience={onOpenAiExperience}
                      onUploadVideo={onOpenExistingVideo}
                      uploadButtonRef={uploadToggleRef}
                      {...(recording.presented
                        ? { onSaveVideo: savedVideo.requestSavePresentedVideo }
                        : {})}
                      saveVideoState={saveVideoState}
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
              onRequestDiscard={savedVideo.requestVideoEditDiscard}
              projectMode={projectContextActive}
              appliedProjectEdit={project.session?.current?.revision.snapshot.localEdit ?? null}
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
      {projectRouteActive ? (
        <Suspense fallback={<p role="status">Loading Projects workspace…</p>}>
          <ProjectRouteSurface
            ownerUserId={ownerUserId}
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
            onSessionChange={project.handleSession}
          />
        </Suspense>
      ) : null}
      {campaignRouteActive ? (
        <Suspense fallback={<p role="status">Loading Campaigns workspace…</p>}>
          <CampaignRouteSurface />
        </Suspense>
      ) : null}
    </main>
  );
};
