import { useTheme } from '@emotion/react';
import type { RecordingDurationTiming } from '@studio/domain';
import type { ReactNode } from 'react';
import type { RealtimeSessionTiming } from '../media-session';
import { formatDuration } from '../recording/recordingHelpers';
import type { RecordingProcessingOperation } from '../recording/types';
import { VisuallyHidden } from '../../ui';
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

const StageIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <path
      d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3m13 5h3a2 2 0 0 0 2-2v-3"
      stroke="currentColor"
      strokeLinecap="round"
    />
    <rect x="8" y="8" width="8" height="8" rx="2.5" stroke="currentColor" />
  </svg>
);

const FullscreenIcon = ({ active }: { active: boolean }) => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    {active ? (
      <path
        d="M9 4v3a2 2 0 0 1-2 2H4m11-5v3a2 2 0 0 0 2 2h3M9 20v-3a2 2 0 0 0-2-2H4m11 5v-3a2 2 0 0 1 2-2h3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ) : (
      <path
        d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    )}
  </svg>
);

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
        <StageIcon />
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
            <FullscreenIcon active={fullscreen} />
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
