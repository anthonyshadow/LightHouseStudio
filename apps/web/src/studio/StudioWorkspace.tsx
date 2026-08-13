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
  readonly mainRef: RefObject<HTMLElement | null>;
  readonly fullscreenWorkspaceRef: RefObject<HTMLDivElement | null>;
  readonly organizationRouteActive: boolean;
  readonly projectContextActive: boolean;
  readonly projectRouteActive: boolean;
  readonly campaignRouteActive: boolean;
  readonly projectRecordingAvailable: boolean;
  readonly showFirstSuccessGuide: boolean;
  readonly onDismissFirstSuccessGuide: () => void;
  readonly desktopStudioLayout: boolean;
  readonly session: ReturnType<typeof useStudioSession>;
  readonly takeReview: ReturnType<typeof useTakeReviewFlow>;
  readonly videoEditor: ReturnType<typeof useVideoEditSession>;
  readonly savedVideo: ReturnType<typeof useStudioSavedVideoController>;
  readonly project: ReturnType<typeof useStudioProjectBridge>;
  readonly browser: BrowserCapabilities;
  readonly stagePresentation: StagePresentation;
  readonly stageAspectRatio: NonNullable<MediaStageProps['aspectRatio']>;
  readonly stageNotices: NonNullable<MediaStageProps['notices']>;
  readonly videoEditPreview: MediaStageProps['editPreview'] | null;
  readonly currentExperienceLabel: string | undefined;
  readonly currentExperienceImageAssetId: string | null;
  readonly effectiveRecordingMode: StudioMode;
  readonly recordingCharacterAttribution: SavedVideoCharacterAttribution | null;
  readonly activeRecordingSource: RecordingSource | null;
  readonly captureBlockedReason: string | undefined;
  readonly captureSettingsDisabledReason: string | undefined;
  readonly aiSessionActive: boolean;
  readonly creativeWorkspace: ReactNode;
  readonly saveVideoState: SaveVideoState;
  readonly uploadToggleRef: RefObject<HTMLButtonElement | null>;
  readonly onStartExistingVideoRecording: () => void;
  readonly onCloseTakeReview: () => void;
  readonly onDiscardExistingVideoSelection: () => void;
  readonly onOpenVoiceTreatments: () => void;
  readonly onOpenAiExperience: () => void;
  readonly onOpenExistingVideo: () => void;
  readonly onOpenCaptureSettings: () => void;
  readonly onStartProjectRecording: () => void;
}

export const StudioWorkspace = ({
  mainRef,
  fullscreenWorkspaceRef,
  organizationRouteActive,
  projectContextActive,
  projectRouteActive,
  campaignRouteActive,
  projectRecordingAvailable,
  showFirstSuccessGuide,
  onDismissFirstSuccessGuide,
  desktopStudioLayout,
  session,
  takeReview,
  videoEditor,
  savedVideo,
  project,
  browser,
  stagePresentation,
  stageAspectRatio,
  stageNotices,
  videoEditPreview,
  currentExperienceLabel,
  currentExperienceImageAssetId,
  effectiveRecordingMode,
  recordingCharacterAttribution,
  activeRecordingSource,
  captureBlockedReason,
  captureSettingsDisabledReason,
  aiSessionActive,
  creativeWorkspace,
  saveVideoState,
  uploadToggleRef,
  onStartExistingVideoRecording,
  onCloseTakeReview,
  onDiscardExistingVideoSelection,
  onOpenVoiceTreatments,
  onOpenAiExperience,
  onOpenExistingVideo,
  onOpenCaptureSettings,
  onStartProjectRecording,
}: StudioWorkspaceProps) => {
  const theme = useTheme();
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
                    <div hidden={!visible} aria-label="Project recording controls">
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
        {projectContextActive ? null : videoEditing ? (
          <Suspense fallback={deferredWorkspaceFallback}>
            <VideoEditWorkspace
              session={videoEditor}
              onRequestDiscard={savedVideo.requestVideoEditDiscard}
            />
          </Suspense>
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
            sourceRuntime={project.sourceRuntime}
            recordingCandidate={project.recordingCandidate}
            recordingActive={
              recordingActive || finalizingStartedAt !== null || finalizingStream !== null
            }
            onStartRecording={onStartProjectRecording}
            onSourceActivityChange={project.handleSourceActivity}
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
