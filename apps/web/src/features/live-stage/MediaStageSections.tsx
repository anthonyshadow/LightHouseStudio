import { useTheme } from '@emotion/react';
import type { RecordingDurationTiming } from '@studio/domain';
import type { ReactNode } from 'react';
import type { RealtimeSessionTiming } from '../media-session';
import { formatDuration } from '../recording/recordingHelpers';
import type { RecordingProcessingOperation } from '../recording/types';
import { AppIcon, VisuallyHidden } from '../../ui';
import {
  activityIndicatorStyles,
  badgeStyles,
  blockingCardStyles,
  blockingOverlayStyles,
  emptyIconStyles,
  emptyStyles,
  iconButtonStyles,
  statusDotStyles,
  toolbarGroupStyles,
  topToolbarStyles,
} from './MediaStage.styles';

type StatusTone = 'neutral' | 'accent' | 'recording' | 'warning';

export const MediaStageEmpty = ({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) => {
  const theme = useTheme();
  return (
    <div css={emptyStyles(theme)}>
      <span css={emptyIconStyles(theme)}>
        <AppIcon name="pictureInPicture" />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
      {action ? <div>{action}</div> : null}
    </div>
  );
};

export const MediaStageToolbar = ({
  recording,
  statusLabel,
  compactStatusLabel,
  statusTone,
  recordingTiming,
  realtimeTiming,
  realtimeTimingLabel,
  realtimeTimingTone,
  fullscreenSupported,
  fullscreen,
  onToggleFullscreen,
}: {
  recording: boolean;
  statusLabel: string;
  compactStatusLabel: string;
  statusTone: StatusTone;
  recordingTiming: RecordingDurationTiming;
  realtimeTiming: RealtimeSessionTiming | null;
  realtimeTimingLabel: string | null;
  realtimeTimingTone: StatusTone;
  fullscreenSupported: boolean;
  fullscreen: boolean;
  onToggleFullscreen: () => void;
}) => {
  const theme = useTheme();
  const showRealtimeTiming = realtimeTiming !== null && realtimeTimingLabel !== null;
  return (
    <div css={topToolbarStyles(theme, showRealtimeTiming)}>
      <div css={toolbarGroupStyles(theme, showRealtimeTiming)}>
        <span
          role={recording ? 'timer' : 'status'}
          aria-live={recording ? 'off' : 'polite'}
          aria-label={
            recording
              ? `Recording elapsed time ${formatDuration(
                  recordingTiming.elapsedSeconds,
                )}, maximum ${formatDuration(
                  recordingTiming.maximumSeconds,
                )}, ${formatDuration(recordingTiming.remainingSeconds)} remaining`
              : undefined
          }
          css={badgeStyles(theme, statusTone)}
          data-recording-duration-status={recording ? recordingTiming.status : undefined}
        >
          {!recording ? <VisuallyHidden>{statusLabel}</VisuallyHidden> : null}
          <span css={statusDotStyles(theme, statusTone)} aria-hidden="true" />
          <span data-stage-status-long aria-hidden="true">
            {statusLabel}
          </span>
          <span data-stage-status-short aria-hidden="true">
            {compactStatusLabel}
          </span>
        </span>
        {showRealtimeTiming && realtimeTiming ? (
          <span
            role="timer"
            aria-live="off"
            aria-label={`AI session maximum ${formatDuration(
              realtimeTiming.maximumSeconds,
            )}, elapsed ${formatDuration(realtimeTiming.elapsedSeconds)}, ${formatDuration(
              realtimeTiming.remainingSeconds,
            )} remaining`}
            css={badgeStyles(theme, realtimeTimingTone)}
            data-realtime-session-status={realtimeTiming.status}
          >
            <span css={statusDotStyles(theme, realtimeTimingTone)} aria-hidden="true" />
            <span>{realtimeTimingLabel}</span>
          </span>
        ) : null}
      </div>

      <div css={toolbarGroupStyles(theme)}>
        {fullscreenSupported ? (
          <button
            type="button"
            css={iconButtonStyles(theme)}
            aria-label={fullscreen ? 'Exit stage fullscreen' : 'View stage fullscreen'}
            aria-pressed={fullscreen}
            onClick={onToggleFullscreen}
          >
            <AppIcon name={fullscreen ? 'fullscreenExit' : 'fullscreen'} />
          </button>
        ) : null}
      </div>
    </div>
  );
};

export const MediaStageBlockingLayers = ({
  finalizingStartedAt,
  playbackLocked,
  playbackOperation,
  aiStarting,
  experienceLabel,
}: {
  finalizingStartedAt: number | null;
  playbackLocked: boolean;
  playbackOperation: RecordingProcessingOperation | null | undefined;
  aiStarting: boolean;
  experienceLabel?: string | undefined;
}) => {
  'use memo';

  const theme = useTheme();
  return (
    <>
      {finalizingStartedAt !== null ? (
        <div
          css={blockingOverlayStyles(theme, 'finalizing')}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-finalizing-started-at={finalizingStartedAt}
        >
          <span css={blockingCardStyles(theme)}>
            <span css={activityIndicatorStyles(theme)} aria-hidden="true" />
            <strong>Finalizing take…</strong>
            <span>Securing the final recording data before camera and AI resources close.</span>
          </span>
        </div>
      ) : null}

      {playbackLocked ? (
        <div
          css={blockingOverlayStyles(theme, 'processing')}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span css={blockingCardStyles(theme)}>
            <span css={activityIndicatorStyles(theme)} aria-hidden="true" />
            <strong>{playbackOperation?.title ?? 'Processing video…'}</strong>
            <span>
              {playbackOperation?.detail ??
                'Playback is paused until the current operation is ready.'}
            </span>
          </span>
        </div>
      ) : null}

      {aiStarting ? (
        <div
          css={[blockingOverlayStyles(theme, 'processing'), { pointerEvents: 'none' }]}
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span css={blockingCardStyles(theme)}>
            <span css={activityIndicatorStyles(theme)} aria-hidden="true" />
            <strong>Connecting to AI…</strong>
            <span>Preparing {experienceLabel ?? 'your selected experience'}</span>
          </span>
        </div>
      ) : null}
    </>
  );
};
