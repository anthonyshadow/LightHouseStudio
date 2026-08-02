import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import type { RefObject } from 'react';
import { referenceImageContentUrl } from '../adapters/api-client/apiClient';
import { Button } from '../ui';
import { fadingVisibilityAnimationStyles } from '../ui/animationStyles';
import type { StudioMode, StudioSessionController } from '../features/media-session';
import {
  RecordingAction,
  type RecordingController,
  type RecordingSource,
} from '../features/recording';
import { TakeReviewActions } from '../features/take-review/TakeReviewActions';

type StudioSessionControlBarProps = {
  session: StudioSessionController;
  experienceLabel?: string | undefined;
  experienceImageAssetId?: string | null | undefined;
  recording: RecordingController;
  recordingMode: StudioMode;
  recordingSource: RecordingSource | null;
  recordingSupported: boolean;
  recordingBlockedReason?: string | undefined;
  reviewingTake: boolean;
  visible?: boolean;
  controlsLocked?: boolean;
  onStopRecording: () => Promise<void>;
  onStartLocalRecording?: () => void;
  onCloseTakeReview: () => void;
  onDiscardTake?: () => void;
  onOpenVoiceTreatments: () => void;
  onChooseAiExperience: () => void;
  onChangeExperience: () => void;
  onUploadVideo?: () => void;
  onEditVideo?: () => void;
  uploadButtonRef?: RefObject<HTMLButtonElement | null>;
};

const MicrophoneIcon = ({ muted }: { muted: boolean }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" />
    <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6" stroke="currentColor" />
    {muted ? <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.8" /> : null}
  </svg>
);

const CameraIcon = ({ off }: { off: boolean }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <rect x="3.5" y="6.5" width="12" height="11" rx="2" stroke="currentColor" />
    <path d="m15.5 10 4-2v8l-4-2" stroke="currentColor" strokeLinejoin="round" />
    {off ? <path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.8" /> : null}
  </svg>
);

const SwitchCameraIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path d="M7 7h10l-2.5-2.5M17 17H7l2.5 2.5" stroke="currentColor" />
    <path d="m17 7 2.5 2.5M7 17l-2.5-2.5" stroke="currentColor" />
  </svg>
);

const SparkIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path
      d="M12 3c.55 4.05 2.95 6.45 7 7-4.05.55-6.45 2.95-7 7-.55-4.05-2.95-6.45-7-7 4.05-.55 6.45-2.95 7-7Z"
      stroke="currentColor"
      strokeLinejoin="round"
    />
  </svg>
);

const UploadIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5" stroke="currentColor" />
    <path d="M4 14v4a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-4" stroke="currentColor" />
  </svg>
);

const StopIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <rect x="6.5" y="6.5" width="11" height="11" rx="1.5" stroke="currentColor" />
  </svg>
);

const barStyles = (theme: Theme, visible: boolean): CSSObject => ({
  position: 'relative',
  zIndex: theme.layers.stageChrome,
  width: '100%',
  maxWidth: '48rem',
  marginInline: 'auto',
  display: 'grid',
  gap: theme.space.xs,
  padding: theme.space.xs,
  border: `1px solid ${theme.colors.borderStrong}`,
  borderRadius: theme.radii.large,
  background: `color-mix(in srgb, ${theme.colors.overlaySurface} 92%, transparent)`,
  boxShadow: theme.shadows.lifted,
  backdropFilter: 'blur(16px)',
  ...fadingVisibilityAnimationStyles(theme, visible, 'translateY(0)', 'translateY(0.75rem)'),
  '&[data-session-state="idle"]': {
    maxWidth: '34rem',
    padding: theme.space.xs,
    borderRadius: '1.4rem',
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    padding: '0.35rem',
    borderRadius: theme.radii.medium,
  },
});

const identityStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'grid',
  gridTemplateColumns: '2rem minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.xs,
  paddingInline: theme.space.xxs,
  '& img, & > span:first-of-type': {
    width: '2rem',
    height: '2rem',
    display: 'grid',
    placeItems: 'center',
    border: `1px solid ${theme.colors.borderStrong}`,
    borderRadius: theme.radii.small,
    background: theme.colors.surfaceStrong,
    objectFit: 'cover',
  },
  '& strong': {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: theme.fontSizes.caption,
  },
  '& button': {
    minHeight: '2rem',
    paddingInline: theme.space.xs,
    color: theme.colors.accentStrong,
    border: 0,
    background: 'transparent',
    font: 'inherit',
    fontSize: theme.fontSizes.metadata,
    fontWeight: 800,
    cursor: 'pointer',
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    gridTemplateColumns: '1.65rem minmax(0, 1fr) auto',
    '& img, & > span:first-of-type': { width: '1.65rem', height: '1.65rem' },
  },
});

const actionRowStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'center',
  gap: theme.space.xs,
  minWidth: 0,
  '& > button': { minHeight: '2.8rem', whiteSpace: 'nowrap' },
  '& > button:first-of-type': { flex: '1 1 11rem' },
  '& svg': { width: '1.05rem', height: '1.05rem', flex: '0 0 auto' },
  '& > button[data-icon-only-control="true"]': {
    minWidth: '3rem',
    flex: '0 0 3rem',
    padding: 0,
  },
  '& > button[data-icon-only-control="true"] svg': {
    width: '1.45rem',
    height: '1.45rem',
  },
  '& [data-ai-label-short]': { display: 'none' },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    gap: '0.3rem',
    '& > button': {
      minWidth: '2.75rem',
      minHeight: '2.75rem',
      paddingInline: '0.65rem',
    },
    '& > button:first-of-type': { minWidth: 0, flex: '1 1 auto' },
    '& [data-secondary-label]': {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
    },
    '&[data-local-recording-primary="true"] [data-secondary-label]': {
      position: 'static',
      width: 'auto',
      height: 'auto',
      overflow: 'visible',
      clip: 'auto',
    },
    '& [data-upload-label]': {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
    },
    '& > button[data-upload-action="true"]': {
      width: '2.75rem',
      minWidth: '2.75rem',
      flex: '0 0 2.75rem',
      padding: 0,
    },
  },
  '@media (max-width: 20rem)': {
    '& > button': { paddingInline: '0.5rem' },
    '& > button:first-of-type': { fontSize: '0.72rem' },
    '& [data-ai-label-long]': { display: 'none' },
    '& [data-ai-label-short]': { display: 'inline' },
  },
});

const recordingRowStyles = (theme: Theme): CSSObject => ({
  ...actionRowStyles(theme),
  '& [data-secondary-label]': {
    position: 'static',
    width: 'auto',
    height: 'auto',
    overflow: 'visible',
    clip: 'auto',
  },
});

const idleRowStyles = (theme: Theme): CSSObject => ({
  ...actionRowStyles(theme),
  '& > button:first-of-type': {
    flex: '1 1 18rem',
    minWidth: 0,
    minHeight: '3.2rem',
    fontSize: theme.fontSizes.label,
  },
  '& > button[data-upload-action="true"]': {
    flex: '0 0 auto',
    minHeight: '3.2rem',
  },
});

const cameraToolsStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: theme.space.xs,
  paddingInline: theme.space.xxs,
  '& button': {
    minWidth: '2.75rem',
    minHeight: '2.75rem',
    paddingInline: theme.space.sm,
  },
  '& svg': { width: '1.2rem', height: '1.2rem' },
  '& output': {
    minWidth: '4.5rem',
    color: theme.colors.text,
    fontFamily: theme.type.mono,
    fontSize: theme.fontSizes.caption,
    textAlign: 'center',
  },
  '& [data-camera-control-error]': {
    color: theme.colors.warning,
    fontSize: theme.fontSizes.caption,
  },
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    gap: '0.3rem',
    '& button': { paddingInline: '0.55rem' },
    '& [data-switch-camera-label]': {
      position: 'absolute',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
      clip: 'rect(0 0 0 0)',
    },
    '& output': { minWidth: '3.7rem' },
  },
});

const isStartingAi = (session: StudioSessionController): boolean =>
  session.draft.mode !== 'local' &&
  ['requesting-media', 'requesting-token', 'connecting'].includes(session.lifecycle);

const transitionLabel = (session: StudioSessionController): string | null => {
  if (session.lifecycle === 'stopping-ai') return 'Stopping AI…';
  if (session.lifecycle === 'stopping-media') return 'Stopping camera…';
  if (isStartingAi(session)) return 'Starting AI…';
  if (session.lifecycle === 'requesting-media' && !session.localStream) return 'Starting camera…';
  return null;
};

export const StudioSessionControlBar = ({
  session,
  experienceLabel,
  experienceImageAssetId,
  recording,
  recordingMode,
  recordingSource,
  recordingSupported,
  recordingBlockedReason,
  reviewingTake,
  visible = true,
  controlsLocked = false,
  onStopRecording,
  onStartLocalRecording,
  onCloseTakeReview,
  onDiscardTake,
  onOpenVoiceTreatments,
  onChooseAiExperience,
  onChangeExperience,
  onUploadVideo,
  onEditVideo,
  uploadButtonRef,
}: StudioSessionControlBarProps) => {
  const theme = useTheme();
  const transition = transitionLabel(session);
  const aiActive = ['connected', 'generating', 'reconnecting'].includes(session.lifecycle);
  const aiStarting = isStartingAi(session);
  const aiExperienceSelected = Boolean(experienceLabel);
  const localRecordingPrimary = !aiActive && !aiStarting && !aiExperienceSelected;
  const localActive = Boolean(session.localStream);
  const recordingActive = recording.lifecycle === 'recording' || recording.lifecycle === 'stopping';
  const takeReviewActive = reviewingTake && Boolean(recording.presented);
  const controlsVisible = visible || recordingActive || takeReviewActive;
  const cameraControls = session.cameraControls;
  const cameraZoom = cameraControls?.zoom ?? null;
  const switchCameraLabel = cameraControls?.nextFacingMode
    ? `Switch to ${cameraControls.nextFacingMode === 'environment' ? 'rear' : 'front'} camera`
    : undefined;
  const showCameraTools =
    localActive &&
    !recordingActive &&
    !takeReviewActive &&
    !aiActive &&
    !aiStarting &&
    Boolean(cameraControls?.nextFacingMode || cameraControls?.zoom);
  const endDisabled = controlsLocked || recordingActive || aiStarting || Boolean(transition);
  const stopAiDisabled = controlsLocked || recordingActive;
  const recordingAction = (
    <RecordingAction
      recording={recording}
      source={recordingSource}
      mode={recordingMode}
      modelOutputReady={session.transformedVideoUsable}
      supported={recordingSupported}
      {...(recordingBlockedReason ? { blockedReason: recordingBlockedReason } : {})}
      onStop={onStopRecording}
    />
  );

  return (
    <section
      css={barStyles(theme, controlsVisible)}
      aria-label="Studio session controls"
      aria-hidden={controlsVisible ? undefined : true}
      data-control-visibility={controlsVisible ? 'visible' : 'hidden'}
      data-session-state={
        takeReviewActive ? 'review' : !localActive ? 'idle' : recordingActive ? 'recording' : 'live'
      }
      inert={!controlsVisible}
    >
      {takeReviewActive ? (
        <TakeReviewActions
          recording={recording}
          presentation="control-bar"
          onCloseTake={onCloseTakeReview}
          {...(onDiscardTake ? { onDiscardTake } : {})}
          {...(onEditVideo ? { onEditVideo, editVideoButtonRef: uploadButtonRef } : {})}
          onOpenVoiceTreatments={onOpenVoiceTreatments}
        />
      ) : (
        <>
          {experienceLabel && localActive && !recordingActive ? (
            <div css={identityStyles(theme)}>
              {experienceImageAssetId ? (
                <img
                  src={referenceImageContentUrl(experienceImageAssetId)}
                  alt=""
                  width="32"
                  height="32"
                />
              ) : (
                <span aria-hidden="true">✦</span>
              )}
              <strong>{experienceLabel}</strong>
              <button
                type="button"
                disabled={controlsLocked || aiStarting}
                onClick={onChangeExperience}
              >
                Change
              </button>
            </div>
          ) : null}

          {showCameraTools && cameraControls ? (
            <div css={cameraToolsStyles(theme)} role="group" aria-label="Camera controls">
              {switchCameraLabel ? (
                <Button
                  type="button"
                  variant="secondary"
                  busy={cameraControls.switching}
                  disabled={controlsLocked || cameraControls.switching}
                  aria-label={switchCameraLabel}
                  title={switchCameraLabel}
                  onClick={() => void cameraControls.switchCamera()}
                >
                  <SwitchCameraIcon />
                  <span data-switch-camera-label>Switch camera</span>
                </Button>
              ) : null}
              {cameraZoom ? (
                <>
                  <Button
                    type="button"
                    variant="quiet"
                    aria-label="Zoom camera out"
                    disabled={
                      controlsLocked ||
                      cameraControls.switching ||
                      cameraZoom.value <= cameraZoom.min
                    }
                    onClick={() => void cameraControls.setZoom(cameraZoom.value - cameraZoom.step)}
                  >
                    −
                  </Button>
                  <output aria-live="polite">
                    Zoom {cameraZoom.value.toFixed(1).replace(/\.0$/u, '')}×
                  </output>
                  <Button
                    type="button"
                    variant="quiet"
                    aria-label="Zoom camera in"
                    disabled={
                      controlsLocked ||
                      cameraControls.switching ||
                      cameraZoom.value >= cameraZoom.max
                    }
                    onClick={() => void cameraControls.setZoom(cameraZoom.value + cameraZoom.step)}
                  >
                    +
                  </Button>
                </>
              ) : null}
              {cameraControls.error ? (
                <span data-camera-control-error role="alert">
                  {cameraControls.error}
                </span>
              ) : null}
            </div>
          ) : null}

          {!localActive ? (
            <div css={idleRowStyles(theme)}>
              <Button
                variant="primary"
                busy={session.lifecycle === 'requesting-media'}
                disabled={controlsLocked || Boolean(transition)}
                onClick={() => {
                  if (onStartLocalRecording) onStartLocalRecording();
                  else void session.startLocal();
                }}
              >
                <CameraIcon off={false} />
                {transition ?? 'Record New Video'}
              </Button>
              <Button
                ref={uploadButtonRef}
                data-upload-action="true"
                variant="secondary"
                disabled={controlsLocked || Boolean(transition)}
                onClick={onEditVideo ?? onUploadVideo}
              >
                <UploadIcon />
                <span data-upload-label>{onEditVideo ? 'Edit video' : 'Upload Video'}</span>
              </Button>
            </div>
          ) : transition && !aiStarting ? (
            <div css={idleRowStyles(theme)}>
              <Button variant="secondary" busy>
                {transition}
              </Button>
            </div>
          ) : recordingActive ? (
            <div css={recordingRowStyles(theme)} data-recording-controls="dominant">
              {recordingAction}
            </div>
          ) : (
            <div
              css={actionRowStyles(theme)}
              data-local-recording-primary={localRecordingPrimary ? 'true' : undefined}
            >
              {aiStarting ? (
                <Button variant="primary" busy>
                  Starting AI…
                </Button>
              ) : aiActive ? (
                <Button
                  variant="danger"
                  disabled={stopAiDisabled}
                  title={recordingActive ? 'Stop recording before stopping AI.' : undefined}
                  onClick={() => void session.stopModel()}
                >
                  <StopIcon />
                  Stop AI
                </Button>
              ) : !localRecordingPrimary ? (
                <Button
                  variant="primary"
                  disabled={controlsLocked || recordingActive}
                  onClick={onChooseAiExperience}
                >
                  <SparkIcon />
                  <span data-ai-label-long>Start AI</span>
                  <span data-ai-label-short aria-hidden="true">
                    AI
                  </span>
                </Button>
              ) : (
                recordingAction
              )}

              <Button
                data-icon-only-control="true"
                variant={session.microphoneEnabled ? 'secondary' : 'danger'}
                aria-pressed={!session.microphoneEnabled}
                aria-label={session.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
                title={session.microphoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
                disabled={controlsLocked}
                onClick={session.toggleMicrophone}
              >
                <MicrophoneIcon muted={!session.microphoneEnabled} />
              </Button>
              <Button
                data-icon-only-control="true"
                variant={session.cameraEnabled ? 'secondary' : 'danger'}
                aria-pressed={!session.cameraEnabled}
                aria-label={session.cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
                title={session.cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
                disabled={controlsLocked}
                onClick={session.toggleCamera}
              >
                <CameraIcon off={!session.cameraEnabled} />
              </Button>

              {!localRecordingPrimary ? recordingAction : null}

              {aiStarting ? (
                <Button variant="secondary" onClick={() => void session.stopModel()}>
                  Cancel
                </Button>
              ) : (
                <Button
                  variant="danger"
                  disabled={endDisabled}
                  title={recordingActive ? 'Stop recording before closing the session.' : undefined}
                  onClick={() => void session.stopCamera()}
                >
                  <StopIcon />
                  Close
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
};
