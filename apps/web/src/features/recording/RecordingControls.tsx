import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { useCallback, useEffect, useRef } from 'react';
import { Button, StatusNotice, Surface, type NoticeTone } from '../../ui';
import { formatDuration } from './recordingHelpers';
import type { RecordingController, RecordingSource } from './types';
import type { StudioMode } from '../media-session';

export type RecordingControlsProps = {
  recording: RecordingController;
  source: RecordingSource | null;
  mode: StudioMode;
  modelOutputReady: boolean;
  supported?: boolean;
  blockedReason?: string;
  onOpenSettings?(): void;
  onStop(): Promise<void>;
};

const captureSurfaceStyles = (theme: Theme): CSSObject => ({
  minWidth: 0,
  minHeight: 0,
  display: 'grid',
  gridTemplateColumns: 'auto minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: theme.space.md,
  padding: theme.space.sm,
  overflow: 'hidden',
  '@media (max-width: 79.99rem), (max-height: 48rem)': {
    gap: theme.space.xs,
    padding: theme.space.xs,
  },
  '@media (max-width: 39.99rem)': {
    gridTemplateColumns: 'minmax(0, 1fr) auto',
  },
});

const detailsStyles = (theme: Theme): CSSObject => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: theme.space.xs,
  minWidth: 0,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.caption,
  '& > span': {
    minWidth: 0,
    padding: `${theme.space.xs} ${theme.space.sm}`,
    border: `1px solid ${theme.colors.border}`,
    borderRadius: theme.radii.medium,
    background: theme.colors.surfaceSoft,
    overflow: 'hidden',
  },
  '& strong': {
    display: 'block',
    marginBlockStart: '0.15rem',
    color: theme.colors.text,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  '@media (max-width: 52rem), (max-height: 42rem)': {
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    '& > span:last-of-type': { display: 'none' },
  },
  '@media (max-width: 39.99rem)': { display: 'none' },
});
const headingStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  color: theme.colors.textMuted,
  fontSize: theme.fontSizes.caption,
  fontWeight: 800,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  whiteSpace: 'nowrap',
  '@media (max-width: 39.99rem)': { display: 'none' },
});
const actionRowStyles = (theme: Theme): CSSObject => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.space.xs,
  minWidth: 0,
  '& > button:first-of-type': {
    minWidth: 'clamp(8rem, 14vw, 11rem)',
  },
  '@media (max-width: 39.99rem)': {
    '& > button:first-of-type': { minWidth: '6.5rem' },
  },
});

const recordActionStyles = (theme: Theme, active: boolean): CSSObject => ({
  minHeight: active ? '3.2rem' : '3.4rem',
  borderRadius: theme.radii.round,
  color: theme.colors.text,
  borderColor: active ? theme.colors.recording : theme.colors.accent,
  background: `linear-gradient(135deg, ${theme.colors.recording}, ${theme.colors.danger})`,
  boxShadow: theme.shadows.recording,
  whiteSpace: 'nowrap',
  '@media (max-width: 39.99rem), (max-height: 36rem)': {
    minHeight: '2.75rem',
    paddingInline: theme.space.md,
  },
});

const settingsActionStyles = (): CSSObject => ({
  whiteSpace: 'nowrap',
  '@media (max-width: 52rem)': {
    width: '2.75rem',
    minWidth: '2.75rem',
    padding: 0,
    fontSize: 0,
    '&::before': { content: '"⚙"', fontSize: '1rem' },
  },
});

const noticeLayerStyles = (theme: Theme): CSSObject => ({
  gridColumn: '1 / -1',
  minWidth: 0,
  display: 'grid',
  gap: theme.space.xxs,
  marginBlockStart: `-${theme.space.xs}`,
  '& > *': { paddingBlock: theme.space.xs },
  '& > [data-disabled-reason]': { paddingBlock: theme.space.xxs },
  '@media (max-width: 39.99rem), (max-height: 48rem)': {
    marginBlockStart: 0,
    fontSize: theme.fontSizes.caption,
    '& > *': { paddingBlock: theme.space.xxs },
    '&[data-only-disabled-reason="true"]': {
      position: 'absolute',
      width: '1px',
      height: '1px',
      margin: '-1px',
      overflow: 'hidden',
    },
  },
});

const focusTargetStyles = (theme: Theme): CSSObject => ({
  marginBlock: theme.space.sm,
  borderRadius: theme.radii.medium,
  '&:focus': {
    outline: `2px solid ${theme.colors.focus}`,
    outlineOffset: '3px',
  },
});

const disabledReasonStyles = (theme: Theme): CSSObject => ({
  margin: 0,
  padding: `${theme.space.xxs} ${theme.space.xs}`,
  borderInlineStart: `2px solid ${theme.colors.warning}`,
  borderRadius: theme.radii.small,
  color: theme.colors.warning,
  background: theme.colors.warningSoft,
  fontSize: theme.fontSizes.caption,
  fontWeight: 680,
  lineHeight: 1.35,
  overflowWrap: 'anywhere',
  '@media (max-width: 39.99rem), (max-height: 48rem)': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    margin: '-1px',
    padding: 0,
    overflow: 'hidden',
    border: 0,
    clip: 'rect(0 0 0 0)',
    whiteSpace: 'nowrap',
  },
});

type RecordingNotice = {
  title: string;
  message: string;
  tone: NoticeTone;
};

type RecordingAvailability = Pick<
  RecordingControlsProps,
  'mode' | 'modelOutputReady' | 'source' | 'supported'
> & {
  blockedReason: string | undefined;
  processing: boolean;
};

const recordingUnavailableReason = ({
  supported,
  processing,
  blockedReason,
  source,
  mode,
  modelOutputReady,
}: RecordingAvailability): string | null => {
  if (!supported) return 'Recording is unavailable in this browser.';
  if (processing) return 'Finish or cancel voice processing before replacing this take.';
  if (blockedReason) return blockedReason;

  if (!source) {
    switch (mode) {
      case 'local':
        return 'Start local preview to enable Record.';
      case 'lucy-2.5':
        return 'Start Character AI and wait for live output to enable Record.';
      case 'lucy-vton-3':
        return 'Start Virtual Try-On AI and wait for live output to enable Record.';
    }
  }

  if (mode !== 'local' && !modelOutputReady) {
    return 'Recording unlocks when transformed output has a live video track.';
  }
  return null;
};

const captureResolutionLabel = (
  mode: StudioMode,
  settings: MediaTrackSettings | undefined,
): string => {
  if (!settings?.width || !settings.height) {
    return mode === 'local' ? '720p target · 30fps' : 'Provider managed';
  }
  const frameRate = settings.frameRate ? ` · ${Math.round(settings.frameRate)}fps` : '';
  return `${settings.width}×${settings.height}${frameRate}`;
};

const recordingNotice = (recording: RecordingController): RecordingNotice | null => {
  switch (recording.lifecycle) {
    case 'recording':
      return {
        title: 'Recording in progress',
        message: 'The current stage and selected audio source are being captured locally.',
        tone: 'neutral',
      };
    case 'stopping':
      return {
        title: 'Finalizing your take…',
        message: 'Keep this tab open while the browser finishes the local video file.',
        tone: 'warning',
      };
    case 'recorded':
      return {
        title: 'Take ready',
        message: 'Review and download the temporary take below before leaving this tab.',
        tone: 'success',
      };
    case 'error':
      return {
        title: 'Recording stopped',
        message: recording.processingError ?? 'The browser could not complete this recording.',
        tone: 'danger',
      };
    default:
      return null;
  }
};

export const RecordingControls = ({
  recording,
  source,
  mode,
  modelOutputReady,
  supported = 'MediaRecorder' in window,
  blockedReason,
  onOpenSettings,
  onStop,
}: RecordingControlsProps) => {
  const theme = useTheme();
  const actionRef = useRef<HTMLButtonElement>(null);
  const noticeRef = useRef<HTMLDivElement>(null);
  const previousLifecycleRef = useRef(recording.lifecycle);
  const active = recording.lifecycle === 'recording' || recording.lifecycle === 'stopping';
  const processing = recording.processingState === 'processing';
  const notice = recordingNotice(recording);
  const unavailableReason = recordingUnavailableReason({
    supported,
    processing,
    blockedReason,
    source,
    mode,
    modelOutputReady,
  });
  const unavailable = unavailableReason !== null;
  const videoTrack = source?.stream.getVideoTracks?.()[0];
  const audioTrack = source?.stream.getAudioTracks?.()[0];
  const videoSettings = videoTrack?.getSettings?.();
  const resolution = captureResolutionLabel(mode, videoSettings);

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

  const start = useCallback(async () => {
    if (!source) return;
    if (recording.original && !recording.downloaded) {
      const proceed = window.confirm(
        'Starting another take replaces the current in-memory clip. Download it first if you want to keep it. Continue?',
      );
      if (!proceed) return;
    }
    if (recording.original) recording.discard();
    await recording.start(source, mode);
  }, [mode, recording, source]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (
        event.code !== 'Space' ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        document.querySelector('[aria-modal="true"]')
      ) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          'input, textarea, select, button, a[href], summary, [contenteditable="true"], [role="button"], [role="tab"]',
        )
      ) {
        return;
      }

      if (recording.lifecycle === 'recording') {
        event.preventDefault();
        void onStop();
        return;
      }
      if (!active && !unavailable) {
        event.preventDefault();
        void start();
      }
    };

    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [active, onStop, recording.lifecycle, start, unavailable]);

  return (
    <Surface
      as="section"
      padding="compact"
      aria-labelledby="capture-heading"
      css={captureSurfaceStyles(theme)}
    >
      <h2 id="capture-heading" css={headingStyles(theme)}>
        {active ? 'Recording' : 'Capture controls'}
      </h2>
      {source ? (
        <div css={detailsStyles(theme)}>
          <span>
            Microphone
            <strong title={audioTrack?.label || source.audioSource}>
              {audioTrack?.label || source.audioSource}
            </strong>
          </span>
          <span>
            Camera
            <strong title={videoTrack?.label || source.videoSource}>
              {videoTrack?.label || source.videoSource}
            </strong>
          </span>
          <span>
            {active ? 'Elapsed time' : 'Resolution'}
            <strong title={active ? formatDuration(recording.elapsedSeconds) : resolution}>
              {active ? formatDuration(recording.elapsedSeconds) : resolution}
            </strong>
          </span>
        </div>
      ) : (
        <div css={detailsStyles(theme)}>
          <span>
            Microphone<strong>Not started</strong>
          </span>
          <span>
            Camera<strong>Not started</strong>
          </span>
          <span>
            Resolution<strong>720p target · 30fps</strong>
          </span>
        </div>
      )}
      <div css={actionRowStyles(theme)}>
        {active ? (
          <Button
            ref={actionRef}
            id="record-take-action"
            variant="danger"
            busy={recording.lifecycle === 'stopping'}
            aria-describedby="recording-state"
            aria-keyshortcuts="Space"
            css={recordActionStyles(theme, true)}
            onClick={() => void onStop()}
          >
            Finish take
          </Button>
        ) : (
          <Button
            ref={actionRef}
            id="record-take-action"
            variant="danger"
            disabled={unavailable}
            aria-describedby={
              [
                unavailableReason ? 'recording-disabled-reason' : null,
                notice ? 'recording-state' : null,
              ]
                .filter(Boolean)
                .join(' ') || undefined
            }
            title={unavailableReason ?? undefined}
            aria-keyshortcuts="Space"
            css={recordActionStyles(theme, false)}
            onClick={() => void start()}
          >
            Record a take
          </Button>
        )}
        {onOpenSettings ? (
          <Button
            variant="secondary"
            aria-label="Open capture settings"
            css={settingsActionStyles()}
            disabled={active}
            onClick={onOpenSettings}
          >
            More settings
          </Button>
        ) : null}
      </div>
      {unavailableReason || notice ? (
        <div
          data-only-disabled-reason={unavailableReason && !notice ? 'true' : undefined}
          css={noticeLayerStyles(theme)}
        >
          {unavailableReason ? (
            <p
              id="recording-disabled-reason"
              data-disabled-reason="true"
              role="status"
              css={disabledReasonStyles(theme)}
            >
              {unavailableReason}
            </p>
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
        </div>
      ) : null}
    </Surface>
  );
};
