import { useTheme } from '@emotion/react';
import type { GuidedFlowStatus, ProjectStorageState } from '../guided-flow';
import { MediaStage, type MediaStageProps } from '../live-stage';
import { formatDuration, type RecordingArtifact, type RecordingAudioSidecar } from '../recording';
import { Button, StatusNotice } from '../../ui';
import {
  controlPanelStyles,
  countdownStyles,
  detailsGridStyles,
  recordButtonStyles,
  stageFrameStyles,
  stageLayoutStyles,
  timerStyles,
} from './GuidedExperience.styles';
import { GuidedStageHeader } from './GuidedExperienceChrome';
import { RECORDING_LIMIT_SECONDS, RECORDING_WARNING_SECONDS } from './guidedExperienceModel';

type GuidedRecordMediaProps = Pick<
  MediaStageProps,
  'presentation' | 'lifecycle' | 'liveSeconds' | 'generationSeconds'
> & { readonly notices: NonNullable<MediaStageProps['notices']> };

export type GuidedRecordStageProps = GuidedRecordMediaProps &
  Readonly<{
    storage: ProjectStorageState;
    status: GuidedFlowStatus;
    recordingSeconds: number;
    countdownValue: number | null;
    refreshingForRecord: boolean;
    error: string | null;
    sidecar: Pick<RecordingAudioSidecar, 'state' | 'error'>;
    original: RecordingArtifact | null;
    recordingSourceAvailable: boolean;
    transformedVideoUsable: boolean;
    onUseTake: () => void;
    onReRecord: () => void;
    onStopRecording: () => void;
    onStartRecording: () => void;
    onPracticeAgain: () => void;
    onStopAi: () => void;
    onStopCamera: () => void;
  }>;

export const GuidedRecordStage = ({
  storage,
  status,
  presentation,
  lifecycle,
  liveSeconds,
  generationSeconds,
  notices,
  recordingSeconds,
  countdownValue,
  refreshingForRecord,
  error,
  sidecar,
  original,
  recordingSourceAvailable,
  transformedVideoUsable,
  onUseTake,
  onReRecord,
  onStopRecording,
  onStartRecording,
  onPracticeAgain,
  onStopAi,
  onStopCamera,
}: GuidedRecordStageProps) => {
  const theme = useTheme();
  const recordingActive = status === 'record.recording';
  const inReview = status === 'record.review';
  const remaining = Math.max(0, RECORDING_LIMIT_SECONDS - recordingSeconds);
  const warning = recordingActive && remaining <= RECORDING_WARNING_SECONDS;

  return (
    <>
      <GuidedStageHeader
        title="Record Your Take"
        description="Record with one click, review it here, then choose the take you want."
        storage={storage}
      />
      <div css={stageLayoutStyles(theme)}>
        <div css={[stageFrameStyles(theme), { position: 'relative' }]}>
          <MediaStage
            presentation={presentation}
            mode="lucy-2.5"
            lifecycle={lifecycle}
            liveSeconds={liveSeconds}
            generationSeconds={generationSeconds}
            recording={recordingActive}
            recordingSeconds={recordingSeconds}
            notices={notices}
          />
          {status === 'record.countdown' && countdownValue ? (
            <div
              role="status"
              aria-live="assertive"
              aria-label={`Recording starts in ${countdownValue}`}
              css={countdownStyles(theme)}
            >
              {countdownValue}
            </div>
          ) : null}
        </div>
        <aside css={controlPanelStyles(theme)}>
          <h3>
            {inReview
              ? 'Review your take'
              : status === 'record.finalizing'
                ? 'Preparing your take'
                : recordingActive
                  ? 'Recording'
                  : 'Ready to record'}
          </h3>
          {!inReview ? (
            <span
              role="timer"
              aria-live={warning ? 'assertive' : 'off'}
              css={timerStyles(theme, warning)}
            >
              {recordingActive ? `${formatDuration(recordingSeconds)} / 5:00` : '0:00 / 5:00'}
            </span>
          ) : null}
          {warning ? (
            <StatusNotice role="alert" tone="warning">
              {remaining} seconds remaining. Recording stops safely at five minutes.
            </StatusNotice>
          ) : null}
          {refreshingForRecord ? (
            <StatusNotice role="status">
              Refreshing the AI session before countdown so the full five-minute take remains
              available…
            </StatusNotice>
          ) : null}
          {error ? (
            <StatusNotice role="alert" tone="danger">
              {error}
            </StatusNotice>
          ) : null}
          {sidecar.state === 'error' && sidecar.error ? (
            <StatusNotice tone="warning">
              {sidecar.error} You can keep the original video or re-record for voice replacement.
            </StatusNotice>
          ) : null}
          {inReview && original ? (
            <>
              <dl css={detailsGridStyles(theme)}>
                <div>
                  <dt>Duration</dt>
                  <dd>{formatDuration(original.durationMs / 1_000)}</dd>
                </div>
                <div>
                  <dt>Audio</dt>
                  <dd>{sidecar.state === 'ready' ? 'Voice ready' : 'Original only'}</dd>
                </div>
                <div>
                  <dt>Quality</dt>
                  <dd>Looks ready to review</dd>
                </div>
              </dl>
              <Button variant="primary" onClick={onUseTake}>
                Use This Take
              </Button>
              <Button variant="secondary" onClick={onReRecord}>
                Re-record
              </Button>
            </>
          ) : recordingActive ? (
            <>
              <Button variant="danger" css={recordButtonStyles(theme)} onClick={onStopRecording}>
                Stop Recording
              </Button>
              <Button variant="secondary" onClick={onStopAi}>
                Stop AI
              </Button>
              <Button variant="quiet" onClick={onStopCamera}>
                Stop Camera
              </Button>
            </>
          ) : status === 'record.finalizing' ? (
            <>
              <Button variant="secondary" busy disabled>
                Preparing Your Take
              </Button>
              <Button variant="quiet" onClick={onStopCamera}>
                Stop Camera
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="danger"
                css={recordButtonStyles(theme)}
                disabled={
                  !recordingSourceAvailable ||
                  !transformedVideoUsable ||
                  status !== 'record.ready' ||
                  refreshingForRecord
                }
                onClick={onStartRecording}
              >
                Start Recording
              </Button>
              {status === 'record.ready' ? (
                <Button variant="quiet" onClick={onPracticeAgain}>
                  Practice Again
                </Button>
              ) : null}
              <Button variant="secondary" onClick={onStopAi}>
                Stop AI
              </Button>
              <Button variant="quiet" onClick={onStopCamera}>
                Stop Camera
              </Button>
            </>
          )}
        </aside>
      </div>
    </>
  );
};
