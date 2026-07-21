import { useTheme } from '@emotion/react';
import type { GuidedFlowStatus, ProjectStorageState } from '../guided-flow';
import { MediaStage, type MediaStageProps } from '../live-stage';
import { Button, StatusNotice } from '../../ui';
import {
  controlPanelStyles,
  readinessListStyles,
  stageFrameStyles,
  stageLayoutStyles,
} from './GuidedExperience.styles';
import { GuidedStageHeader } from './GuidedExperienceChrome';
import { GuidedSavedCharacterSummary } from './GuidedSavedCharacterSummary';
import type { CapabilityState } from '../../studio/StudioHeader';

type GuidedLiveMediaProps = Pick<
  MediaStageProps,
  'presentation' | 'lifecycle' | 'liveSeconds' | 'generationSeconds'
> & { readonly notices: NonNullable<MediaStageProps['notices']> };

type LiveStageCopy = Readonly<{
  heading: string;
  description: string;
}>;

const IDLE_DESCRIPTION = 'Camera, microphone, and AI remain off until you start them.';
const LOCAL_PREVIEW_DESCRIPTION =
  'Your camera and microphone are local. Start AI only when you are ready.';

const getLiveStageCopy = ({
  connected,
  aiConnecting,
  cameraPreviewReady,
  cameraStarting,
}: Readonly<{
  connected: boolean;
  aiConnecting: boolean;
  cameraPreviewReady: boolean;
  cameraStarting: boolean;
}>): LiveStageCopy => {
  if (connected) {
    return {
      heading: "You're live with AI",
      description: 'Talk naturally. Your character sees and responds to your performance.',
    };
  }
  if (aiConnecting) {
    return { heading: 'Connecting your character', description: LOCAL_PREVIEW_DESCRIPTION };
  }
  if (cameraPreviewReady) {
    return { heading: 'Local preview ready', description: LOCAL_PREVIEW_DESCRIPTION };
  }
  if (cameraStarting) {
    return { heading: 'Starting local preview', description: IDLE_DESCRIPTION };
  }
  return { heading: 'Ready when you are', description: IDLE_DESCRIPTION };
};

const getMediaReadinessLabel = (
  device: 'Camera' | 'Microphone',
  ready: boolean,
  supported: boolean,
): string => {
  if (ready) return `✓ ${device} ready`;
  if (supported) return `○ ${device} permission pending`;
  return `! ${device} unavailable`;
};

const getAiReadinessLabel = ({
  ready,
  checking,
  checkFailed,
  available,
}: Readonly<{
  ready: boolean;
  checking: boolean;
  checkFailed: boolean;
  available: boolean;
}>): string => {
  if (ready) return '✓ AI connected';
  if (checking) return '○ Checking AI availability';
  if (checkFailed) return '! AI status needs retry';
  return available ? '○ AI available' : '! AI is not configured';
};

export type GuidedLiveStageProps = GuidedLiveMediaProps &
  Readonly<{
    storage: ProjectStorageState;
    status: GuidedFlowStatus;
    characterName: string;
    referenceImageUrl: string | null;
    mediaSupported: boolean;
    cameraReady: boolean;
    microphoneReady: boolean;
    aiAvailable: boolean;
    aiConnected: boolean;
    capabilityState: CapabilityState;
    aiStartQueued: boolean;
    error: string | null;
    permissionPrimer: boolean;
    onRetryCapabilities: () => void;
    onConfirmCameraStart: () => void;
    onCancelPermissionPrimer: () => void;
    onContinueToRecord: () => void;
    onRequestCameraStart: () => void;
    onStartAi: () => void;
    onStopAi: () => void;
    onStopCamera: () => void;
    onEditCharacter: () => void;
  }>;

export const GuidedLiveStage = ({
  storage,
  status,
  characterName,
  referenceImageUrl,
  presentation,
  lifecycle,
  liveSeconds,
  generationSeconds,
  notices,
  mediaSupported,
  cameraReady,
  microphoneReady,
  aiAvailable,
  aiConnected,
  capabilityState,
  aiStartQueued,
  error,
  permissionPrimer,
  onRetryCapabilities,
  onConfirmCameraStart,
  onCancelPermissionPrimer,
  onContinueToRecord,
  onRequestCameraStart,
  onStartAi,
  onStopAi,
  onStopCamera,
  onEditCharacter,
}: GuidedLiveStageProps) => {
  const theme = useTheme();
  const ownsLocalMedia = cameraReady || microphoneReady;
  const localPreviewReady = cameraReady && microphoneReady;
  const connected = aiConnected;
  const aiConnecting = status === 'live.connecting';
  const cameraStarting =
    !localPreviewReady && (status === 'live.camera-starting' || ownsLocalMedia);
  const cameraPreviewReady = localPreviewReady && !aiConnecting && !connected;
  const aiChecking = capabilityState === 'loading';
  const aiCheckFailed = capabilityState === 'error';
  const aiReady = aiAvailable && connected;
  const canStopAi = connected || aiConnecting;
  const canStopCamera = canStopAi || cameraPreviewReady || cameraStarting;
  const copy = getLiveStageCopy({
    connected,
    aiConnecting,
    cameraPreviewReady,
    cameraStarting,
  });

  return (
    <>
      <GuidedStageHeader
        title="Go Live with AI"
        description="Start with your local camera preview, then connect AI only when you choose."
        storage={storage}
      />
      <div css={stageLayoutStyles(theme)}>
        <div css={stageFrameStyles(theme)}>
          <MediaStage
            presentation={presentation}
            mode="lucy-2.5"
            lifecycle={lifecycle}
            liveSeconds={liveSeconds}
            generationSeconds={generationSeconds}
            recording={false}
            recordingSeconds={0}
            notices={notices}
          />
        </div>
        <aside css={controlPanelStyles(theme)}>
          <GuidedSavedCharacterSummary
            characterName={characterName}
            referenceImageUrl={referenceImageUrl}
          />
          <h3>{copy.heading}</h3>
          <p>{copy.description}</p>
          <ul css={readinessListStyles(theme)}>
            <li data-ready={String(cameraReady)}>
              {getMediaReadinessLabel('Camera', cameraReady, mediaSupported)}
            </li>
            <li data-ready={String(microphoneReady)}>
              {getMediaReadinessLabel('Microphone', microphoneReady, mediaSupported)}
            </li>
            <li data-ready={String(aiReady)}>
              {getAiReadinessLabel({
                ready: aiReady,
                checking: aiChecking,
                checkFailed: aiCheckFailed,
                available: aiAvailable,
              })}
            </li>
          </ul>
          {aiCheckFailed ? (
            <StatusNotice role="alert" tone="warning">
              AI availability could not be checked. Your local camera preview will stay on while you
              retry.
              <Button size="small" variant="quiet" onClick={onRetryCapabilities}>
                Check Again
              </Button>
            </StatusNotice>
          ) : null}
          {capabilityState === 'ready' && !aiAvailable ? (
            <StatusNotice role="status" tone="warning">
              Realtime AI is not currently configured. Start AI Session will check again without
              restarting your camera.
            </StatusNotice>
          ) : null}
          {error ? (
            <StatusNotice role="alert" tone="danger">
              {error}
            </StatusNotice>
          ) : null}
          {permissionPrimer && !ownsLocalMedia ? (
            <StatusNotice title="Camera and microphone permission">
              First we start a private local preview. No AI token or connection is requested until
              you separately choose Start AI Session.
              <div
                css={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: theme.space.xs,
                  marginTop: theme.space.sm,
                  '& > button': { flex: '1 1 9rem' },
                }}
              >
                <Button variant="primary" onClick={onConfirmCameraStart}>
                  Continue &amp; Allow
                </Button>
                <Button variant="quiet" onClick={onCancelPermissionPrimer}>
                  Cancel
                </Button>
              </div>
            </StatusNotice>
          ) : (
            <>
              {connected ? (
                <Button variant="primary" onClick={onContinueToRecord}>
                  Continue to Record
                </Button>
              ) : null}
              {cameraPreviewReady ? (
                <Button variant="primary" busy={aiStartQueued} onClick={onStartAi}>
                  {aiStartQueued ? 'Checking AI Availability' : 'Start AI Session'}
                </Button>
              ) : null}
              {cameraStarting && !canStopAi ? (
                <Button variant="primary" busy disabled>
                  Starting Camera
                </Button>
              ) : null}
              {!canStopCamera ? (
                <Button variant="primary" disabled={!mediaSupported} onClick={onRequestCameraStart}>
                  Start Camera Preview
                </Button>
              ) : null}
              {canStopAi ? (
                <Button variant="secondary" onClick={onStopAi}>
                  Stop AI
                </Button>
              ) : null}
              {canStopCamera ? (
                <Button variant="quiet" onClick={onStopCamera}>
                  Stop Camera
                </Button>
              ) : null}
            </>
          )}
          <Button
            variant="quiet"
            disabled={cameraStarting || aiConnecting}
            onClick={onEditCharacter}
          >
            Edit Character
          </Button>
        </aside>
      </div>
    </>
  );
};
