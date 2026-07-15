import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useEffect, useRef } from 'react';
import { Button, StatusNotice, Surface, type NoticeTone } from '../../ui';
import { formatDuration } from './recordingHelpers';
import type { RecordingSource } from './types';
import type { RecordingController } from './types';
import type { StudioMode } from '../media-session';

export type RecordingControlsProps = {
  recording: RecordingController;
  source: RecordingSource | null;
  mode: StudioMode;
  modelOutputReady: boolean;
  supported?: boolean;
  onStop(): Promise<void>;
};

const rowStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.sm,
  '& > button': { flex: '1 1 10rem' },
});

const detailsStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.space.sm,
  marginBlockEnd: theme.space.sm,
  color: theme.colors.textMuted,
  fontSize: '0.78rem',
  '& strong': { color: theme.colors.text },
});
const headingStyles = (theme: Theme): CSSObject => ({
  margin: `0 0 ${theme.space.sm}`,
  fontSize: '1rem',
});
const actionRowStyles = (theme: Theme): CSSObject => ({
  ...rowStyles(theme),
  marginTop: theme.space.sm,
});

const focusTargetStyles = (theme: Theme): CSSObject => ({
  marginBlock: theme.space.sm,
  borderRadius: theme.radii.medium,
  '&:focus': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
});

type RecordingNotice = {
  title: string;
  message: string;
  tone: NoticeTone;
};

const recordingNotice = (recording: RecordingController): RecordingNotice | null => {
  if (recording.lifecycle === 'recording') {
    return {
      title: 'Recording in progress',
      message: 'The current stage and selected audio source are being captured locally.',
      tone: 'neutral',
    };
  }
  if (recording.lifecycle === 'stopping') {
    return {
      title: 'Finalizing your take…',
      message: 'Keep this tab open while the browser finishes the local video file.',
      tone: 'warning',
    };
  }
  if (recording.lifecycle === 'recorded') {
    return {
      title: 'Take ready',
      message: 'Review and download the temporary take below before leaving this tab.',
      tone: 'success',
    };
  }
  if (recording.lifecycle === 'error') {
    return {
      title: 'Recording stopped',
      message: recording.processingError ?? 'The browser could not complete this recording.',
      tone: 'danger',
    };
  }
  return null;
};

export const RecordingControls = ({
  recording,
  source,
  mode,
  modelOutputReady,
  supported = 'MediaRecorder' in window,
  onStop,
}: RecordingControlsProps) => {
  const theme = useTheme();
  const actionRef = useRef<HTMLButtonElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const previousLifecycleRef = useRef(recording.lifecycle);
  const active = recording.lifecycle === 'recording' || recording.lifecycle === 'stopping';
  const processing = recording.processingState === 'processing';
  const notice = recordingNotice(recording);
  const unavailable =
    !supported || !source || (mode !== 'local' && !modelOutputReady) || processing;

  useEffect(() => {
    if (recording.lifecycle === previousLifecycleRef.current) return;
    previousLifecycleRef.current = recording.lifecycle;
    if (recording.lifecycle === 'recording') {
      actionRef.current?.focus();
      return;
    }
    if (
      recording.lifecycle === 'stopping' ||
      recording.lifecycle === 'recorded' ||
      recording.lifecycle === 'error'
    ) {
      noticeRef.current?.focus();
    }
  }, [recording.lifecycle]);

  const start = async () => {
    if (!source) return;
    if (recording.original && !recording.downloaded) {
      const proceed = window.confirm(
        'Starting another take replaces the current in-memory clip. Download it first if you want to keep it. Continue?',
      );
      if (!proceed) return;
    }
    if (recording.original) recording.discard();
    await recording.start(source, mode);
  };

  return (
    <Surface as="section" padding="compact" aria-labelledby="capture-heading">
      <h2 id="capture-heading" css={headingStyles(theme)}>
        Capture
      </h2>
      {source ? (
        <div css={detailsStyles(theme)}>
          <span>
            Video: <strong>{source.videoSource}</strong>
          </span>
          <span>
            Audio: <strong>{source.audioSource}</strong>
          </span>
          {active ? (
            <span>
              Take: <strong>{formatDuration(recording.elapsedSeconds)}</strong>
            </span>
          ) : null}
        </div>
      ) : null}
      {mode !== 'local' && !modelOutputReady ? (
        <StatusNotice tone="warning">
          Recording unlocks when transformed output has a live video track.
        </StatusNotice>
      ) : null}
      {!supported ? (
        <StatusNotice tone="warning" role="status" title="Recording unavailable">
          This browser can preview the camera but cannot create a local video file. Use a current
          browser with MediaRecorder support.
        </StatusNotice>
      ) : null}
      {processing ? (
        <StatusNotice tone="warning" role="status">
          Finish or cancel voice processing before replacing this take.
        </StatusNotice>
      ) : null}
      {notice ? (
        <div ref={noticeRef} id="recording-state" tabIndex={-1} css={focusTargetStyles(theme)}>
          <StatusNotice
            tone={notice.tone}
            title={notice.title}
            role={recording.lifecycle === 'error' ? 'alert' : 'status'}
            aria-live={recording.lifecycle === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
          >
            {notice.message}
          </StatusNotice>
        </div>
      ) : null}
      <div css={actionRowStyles(theme)}>
        {active ? (
          <Button
            ref={actionRef}
            id="record-take-action"
            variant="danger"
            busy={recording.lifecycle === 'stopping'}
            aria-describedby="recording-state"
            onClick={() => void onStop()}
          >
            {mode === 'local' ? 'Finish take' : 'Finish take & end AI'}
          </Button>
        ) : (
          <Button
            ref={actionRef}
            id="record-take-action"
            variant="primary"
            disabled={unavailable}
            aria-describedby={notice ? 'recording-state' : undefined}
            onClick={() => void start()}
          >
            Record a take
          </Button>
        )}
      </div>
    </Surface>
  );
};
