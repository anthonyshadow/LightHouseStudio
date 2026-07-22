import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTheme } from '@emotion/react';
import { formatDuration } from '../recording/recordingHelpers';
import { modeLabel, type SessionLifecycle, type StudioMode } from '../media-session';
import {
  activityIndicatorStyles,
  audioMeterStyles,
  audioTrackStyles,
  badgeStyles,
  blockingCardStyles,
  blockingOverlayStyles,
  bottomOverlayStyles,
  emptyIconStyles,
  emptyStyles,
  endStatusStyles,
  framingGuideStyles,
  guideCornerStyles,
  iconButtonStyles,
  stageStyles,
  statusDotStyles,
  toolbarGroupStyles,
  topToolbarStyles,
  videoStyles,
  visuallyHiddenTextStyles,
} from './MediaStage.styles';
import { StageNoticeLayer } from './StageNoticeLayer';
import type { StageNotice } from './stageNotices';
import { useAudioLevel } from './useAudioLevel';
import { describeStageMedia, type StagePresentation } from './stagePresentation';

export type { StagePresentation } from './stagePresentation';

export type MediaStageProps = {
  presentation: StagePresentation;
  mode: StudioMode;
  lifecycle: SessionLifecycle;
  liveSeconds: number;
  generationSeconds: number;
  recording: boolean;
  recordingSeconds: number;
  notices?: readonly StageNotice[];
  onPlaybackError?: (message: string) => void;
};

type LiveSnapshot = {
  stream: MediaStream;
  origin: 'local' | 'provider';
  mirrored: boolean;
};

const CameraIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <rect x="3.5" y="6.5" width="12" height="11" rx="2" stroke="currentColor" />
    <path d="m15.5 10 4-2v8l-4-2" stroke="currentColor" strokeLinejoin="round" />
  </svg>
);

const MicrophoneIcon = () => (
  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
    <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" />
    <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6" stroke="currentColor" />
  </svg>
);

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

const lifecycleLabel = (lifecycle: SessionLifecycle): string =>
  ({
    idle: 'Camera off',
    'requesting-media': 'Requesting camera',
    ready: 'Local preview',
    'requesting-token': 'Securing AI session',
    connecting: 'Connecting AI',
    connected: 'AI connected',
    generating: 'AI live',
    reconnecting: 'Reconnecting — local fallback',
    disconnected: 'AI disconnected — local fallback',
    error: 'Needs attention',
  })[lifecycle];

const lifecycleTone = (lifecycle: SessionLifecycle): 'neutral' | 'accent' | 'recording' =>
  ['ready', 'connected', 'generating'].includes(lifecycle) ? 'accent' : 'neutral';

const emptyCopy = (mode: StudioMode): { title: string; description: string } => {
  if (mode === 'lucy-2.5') {
    return {
      title: 'Your character, your story.',
      description:
        'Build a direction or add a portrait reference. Camera and AI remain off until you explicitly start.',
    };
  }
  if (mode === 'lucy-vton-3') {
    return {
      title: 'Your private try-on stage.',
      description:
        'Describe the garment or add a reference. Your camera and provider session remain off until you start.',
    };
  }
  return {
    title: 'Your private creative stage.',
    description:
      'Camera and microphone remain off until you start local preview. Nothing leaves this browser in Local mode.',
  };
};

const useTrackRevision = (stream: MediaStream | null): void => {
  const [, setRevision] = useState(0);

  useEffect(() => {
    if (!stream) return;
    const update = () => setRevision((current) => current + 1);
    const watchedTracks = new Set<MediaStreamTrack>();
    const watchTrack = (track: MediaStreamTrack) => {
      if (watchedTracks.has(track)) return;
      watchedTracks.add(track);
      track.addEventListener('ended', update);
      track.addEventListener('mute', update);
      track.addEventListener('unmute', update);
    };
    const unwatchTrack = (track: MediaStreamTrack) => {
      watchedTracks.delete(track);
      track.removeEventListener('ended', update);
      track.removeEventListener('mute', update);
      track.removeEventListener('unmute', update);
    };
    const handleTrackAdded = (event: MediaStreamTrackEvent) => {
      watchTrack(event.track);
      update();
    };
    const handleTrackRemoved = (event: MediaStreamTrackEvent) => {
      unwatchTrack(event.track);
      update();
    };

    for (const track of stream.getTracks()) watchTrack(track);
    stream.addEventListener('addtrack', handleTrackAdded);
    stream.addEventListener('removetrack', handleTrackRemoved);
    return () => {
      stream.removeEventListener('addtrack', handleTrackAdded);
      stream.removeEventListener('removetrack', handleTrackRemoved);
      for (const track of watchedTracks) unwatchTrack(track);
    };
  }, [stream]);
};

const AudioLevelMeter = ({
  stream,
  sourceLabel,
}: {
  stream: MediaStream | null;
  sourceLabel: string | null;
}) => {
  const theme = useTheme();
  const { hasAudio, level, metering } = useAudioLevel(stream);
  const percent = Math.round(level * 100);
  const label = sourceLabel ?? (hasAudio ? 'Live audio' : 'No live audio track');
  const meterProperties = { '--audio-level': `${percent}%` } as CSSProperties;

  return (
    <div
      data-stage-audio="true"
      css={audioMeterStyles(theme)}
      title={label}
      {...(metering
        ? {
            role: 'meter',
            'aria-label': 'Live audio level',
            'aria-valuemin': 0,
            'aria-valuemax': 100,
            'aria-valuenow': percent,
            'aria-valuetext': `${percent}% — ${label}`,
          }
        : {})}
    >
      <MicrophoneIcon />
      <span css={audioTrackStyles(theme)} style={meterProperties} aria-hidden="true" />
      <span css={visuallyHiddenTextStyles}>
        {hasAudio
          ? metering
            ? `Audio level ${percent}% from ${label}`
            : `${label} connected`
          : label}
      </span>
    </div>
  );
};

export const MediaStage = ({
  presentation,
  mode,
  lifecycle,
  liveSeconds,
  generationSeconds,
  recording,
  recordingSeconds,
  notices = [],
  onPlaybackError,
}: MediaStageProps) => {
  const theme = useTheme();
  const figureRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const boundKindRef = useRef<'idle' | 'stream' | 'playback'>('idle');
  const boundPlaybackUrlRef = useRef<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [lastLiveSnapshot, setLastLiveSnapshot] = useState<LiveSnapshot | null>(null);

  const playbackArtifact = presentation.kind === 'playback' ? presentation.artifact : null;
  const playbackUrl = playbackArtifact?.objectUrl ?? null;
  const playbackIdentity = playbackArtifact
    ? `${playbackArtifact.id}\u0000${playbackArtifact.objectUrl}`
    : null;
  const [playbackFailure, setPlaybackFailure] = useState<{
    identity: string | null;
    message: string | null;
  }>(() => ({ identity: playbackIdentity, message: null }));
  if (playbackFailure.identity !== playbackIdentity) {
    setPlaybackFailure({ identity: playbackIdentity, message: null });
  }
  const playbackError =
    playbackFailure.identity === playbackIdentity ? playbackFailure.message : null;
  const setPlaybackError = (message: string | null) => {
    setPlaybackFailure({ identity: playbackIdentity, message });
  };
  const livePresentation =
    presentation.kind === 'live'
      ? presentation
      : presentation.kind === 'finalizing'
        ? lastLiveSnapshot
        : null;
  const stream =
    presentation.kind === 'live'
      ? presentation.stream
      : presentation.kind === 'finalizing'
        ? (presentation.retainedStream ?? lastLiveSnapshot?.stream ?? null)
        : null;
  const transformed = livePresentation?.origin === 'provider';
  const details = describeStageMedia(presentation, stream, transformed);
  const stageMode = presentation.kind === 'idle' ? presentation.mode : mode;
  const copy = emptyCopy(stageMode);
  const statusTone = presentation.kind === 'playback' ? 'accent' : lifecycleTone(lifecycle);
  const mirrored =
    presentation.kind === 'live'
      ? presentation.mirrored
      : presentation.kind === 'finalizing'
        ? (lastLiveSnapshot?.mirrored ?? false)
        : false;
  const playbackLocked = presentation.kind === 'playback' && presentation.controlsLocked;
  const isFinalizing = presentation.kind === 'finalizing';
  const hasVisibleMedia = details.hasLiveVideo;
  useTrackRevision(stream);

  const currentLiveStream = presentation.kind === 'live' ? presentation.stream : null;
  const currentLiveOrigin = presentation.kind === 'live' ? presentation.origin : null;
  const currentLiveMirrored = presentation.kind === 'live' ? presentation.mirrored : false;
  if (
    currentLiveStream &&
    currentLiveOrigin &&
    (lastLiveSnapshot?.stream !== currentLiveStream ||
      lastLiveSnapshot.origin !== currentLiveOrigin ||
      lastLiveSnapshot.mirrored !== currentLiveMirrored)
  ) {
    setLastLiveSnapshot({
      stream: currentLiveStream,
      origin: currentLiveOrigin,
      mirrored: currentLiveMirrored,
    });
  } else if (presentation.kind === 'idle' && lastLiveSnapshot) {
    setLastLiveSnapshot(null);
  }

  const fullscreenSupported =
    typeof document !== 'undefined' &&
    document.fullscreenEnabled &&
    typeof Element !== 'undefined' &&
    'requestFullscreen' in Element.prototype;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let restorePlaybackPosition: (() => void) | null = null;

    if (playbackUrl) {
      const nextUrl = playbackUrl;
      const replacingPlayback =
        boundKindRef.current === 'playback' && boundPlaybackUrlRef.current !== nextUrl;
      const restoreTime = replacingPlayback ? video.currentTime : 0;

      video.pause();
      if (video.srcObject) video.srcObject = null;
      video.muted = false;
      video.autoplay = false;
      video.controls = !playbackLocked;

      if (boundPlaybackUrlRef.current !== nextUrl || video.getAttribute('src') !== nextUrl) {
        video.src = nextUrl;
        boundPlaybackUrlRef.current = nextUrl;
        boundKindRef.current = 'playback';

        if (restoreTime > 0) {
          restorePlaybackPosition = () => {
            const lastPlayableTime =
              Number.isFinite(video.duration) && video.duration > 0
                ? Math.max(0, video.duration - 0.001)
                : restoreTime;
            try {
              video.currentTime = Math.min(restoreTime, lastPlayableTime);
            } catch {
              // A malformed recording can reject seeking; playback error handling remains active.
            }
            video.pause();
          };
          video.addEventListener('loadedmetadata', restorePlaybackPosition, { once: true });
        }
      }

      if (playbackLocked) video.pause();
    } else if (stream) {
      if (boundKindRef.current === 'playback') {
        video.pause();
        video.removeAttribute('src');
        try {
          video.load();
        } catch {
          // Some test and embedded browser environments do not implement load().
        }
      }

      video.muted = true;
      video.autoplay = true;
      video.controls = false;
      if (video.srcObject !== stream) video.srcObject = stream;
      boundKindRef.current = 'stream';
      boundPlaybackUrlRef.current = null;
      try {
        void video.play().catch(() => undefined);
      } catch {
        // Some test and embedded browser environments throw synchronously here.
      }
    } else if (presentation.kind !== 'finalizing') {
      video.pause();
      if (video.srcObject) video.srcObject = null;
      if (boundKindRef.current === 'playback' || video.hasAttribute('src')) {
        video.removeAttribute('src');
        try {
          video.load();
        } catch {
          // Some test and embedded browser environments do not implement load().
        }
      }
      video.muted = true;
      video.autoplay = true;
      video.controls = false;
      boundKindRef.current = 'idle';
      boundPlaybackUrlRef.current = null;
    }

    return () => {
      if (restorePlaybackPosition) {
        video.removeEventListener('loadedmetadata', restorePlaybackPosition);
      }
    };
  }, [playbackLocked, playbackUrl, presentation.kind, stream]);

  useEffect(
    () => () => {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
    },
    [],
  );

  useEffect(() => {
    if (!fullscreenSupported) return;
    const update = () => setFullscreen(document.fullscreenElement === figureRef.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, [fullscreenSupported]);

  const toggleFullscreen = () => {
    const stage = figureRef.current;
    if (!stage) return;
    if (document.fullscreenElement === stage) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void stage.requestFullscreen().catch(() => undefined);
  };

  const handlePlaybackError = () => {
    if (presentation.kind !== 'playback') return;
    const mediaErrorCode = videoRef.current?.error?.code;
    const detail = mediaErrorCode ? ` (media error ${mediaErrorCode})` : '';
    const message = `This take could not be loaded for playback${detail}. Retry, download it, or discard it from Take Review.`;
    setPlaybackError(message);
    onPlaybackError?.(message);
  };

  const retryPlayback = () => {
    const video = videoRef.current;
    if (!video || presentation.kind !== 'playback') return;
    setPlaybackError(null);
    try {
      video.load();
    } catch {
      handlePlaybackError();
    }
  };

  const effectiveNotices: readonly StageNotice[] = playbackError
    ? [
        {
          id: 'stage-playback-error',
          severity: 'error',
          title: 'Playback unavailable',
          message: playbackError,
          priority: 1_000,
          action: { label: 'Retry', onAction: retryPlayback },
          onDismiss: () => setPlaybackError(null),
        },
        ...notices,
      ]
    : notices;

  const statusLabel =
    presentation.kind === 'playback'
      ? 'Recorded take'
      : presentation.kind === 'finalizing'
        ? 'Finalizing take'
        : lifecycleLabel(lifecycle);

  return (
    <figure
      ref={figureRef}
      css={stageStyles(theme, recording || isFinalizing)}
      aria-label="Studio media stage"
      aria-busy={
        isFinalizing ||
        playbackLocked ||
        ['requesting-media', 'requesting-token', 'connecting', 'reconnecting'].includes(lifecycle)
      }
      data-recording={recording ? 'true' : 'false'}
      data-stage-presentation={presentation.kind}
    >
      <video
        ref={videoRef}
        css={videoStyles(
          theme,
          hasVisibleMedia,
          mirrored,
          presentation.kind === 'playback' && !playbackLocked,
        )}
        muted={presentation.kind !== 'playback'}
        controls={presentation.kind === 'playback' && !playbackLocked}
        playsInline
        autoPlay={presentation.kind !== 'playback'}
        preload="metadata"
        tabIndex={presentation.kind === 'playback' && !playbackLocked ? 0 : -1}
        aria-hidden={!hasVisibleMedia}
        aria-disabled={playbackLocked || undefined}
        aria-label={
          presentation.kind === 'playback'
            ? 'Recorded take playback'
            : transformed
              ? 'Live transformed camera preview'
              : 'Live local camera preview'
        }
        onError={handlePlaybackError}
        onLoadedData={() => setPlaybackError(null)}
        data-media-fit="contain"
        data-mirrored={mirrored ? 'true' : 'false'}
        data-playback-locked={playbackLocked ? 'true' : 'false'}
        data-playback-artifact-id={playbackArtifact?.id}
      />

      {!hasVisibleMedia ? (
        <div css={emptyStyles(theme)}>
          <span css={emptyIconStyles(theme)}>
            <StageIcon />
          </span>
          <strong>{copy.title}</strong>
          <p>{copy.description}</p>
        </div>
      ) : null}

      <div
        css={framingGuideStyles(theme, hasVisibleMedia && presentation.kind !== 'playback')}
        aria-hidden="true"
      >
        <span css={guideCornerStyles('tl')} />
        <span css={guideCornerStyles('tr')} />
        <span css={guideCornerStyles('bl')} />
        <span css={guideCornerStyles('br')} />
      </div>

      <div css={topToolbarStyles(theme)}>
        <div css={toolbarGroupStyles(theme)}>
          <span css={badgeStyles(theme)} title={`${details.resolution} — ${details.videoSource}`}>
            <CameraIcon />
            <span>{details.resolution}</span>
          </span>
          {recording ? (
            <span
              role="timer"
              aria-live="off"
              aria-label={`Recording elapsed time ${formatDuration(recordingSeconds)}`}
              css={badgeStyles(theme, 'recording')}
            >
              <span css={statusDotStyles(theme, 'recording')} aria-hidden="true" />
              <span>REC {formatDuration(recordingSeconds)}</span>
            </span>
          ) : null}
        </div>

        <div css={toolbarGroupStyles(theme)}>
          {presentation.kind === 'playback' ? (
            <span css={badgeStyles(theme, 'accent')}>
              <span>Playback</span>
            </span>
          ) : mode !== 'local' && generationSeconds > 0 ? (
            <span css={badgeStyles(theme, 'accent')}>
              <span>AI {formatDuration(generationSeconds)}</span>
            </span>
          ) : null}
          {fullscreenSupported ? (
            <button
              type="button"
              css={iconButtonStyles(theme)}
              aria-label={fullscreen ? 'Exit stage fullscreen' : 'View stage fullscreen'}
              aria-pressed={fullscreen}
              onClick={toggleFullscreen}
            >
              <FullscreenIcon active={fullscreen} />
            </button>
          ) : null}
        </div>
      </div>

      {isFinalizing ? (
        <div
          css={blockingOverlayStyles(theme, 'finalizing')}
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-finalizing-started-at={presentation.startedAt}
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
            <strong>Processing voice treatment…</strong>
            <span>Playback is paused until the current treatment is ready.</span>
          </span>
        </div>
      ) : null}

      <StageNoticeLayer notices={effectiveNotices} />

      {presentation.kind !== 'playback' ? (
        <figcaption css={bottomOverlayStyles(theme)}>
          <span css={badgeStyles(theme)} title={details.videoSource}>
            <CameraIcon />
            <span>
              {mode === 'local'
                ? 'Local Camera'
                : transformed
                  ? `${modeLabel(mode)} · AI output`
                  : modeLabel(mode)}
            </span>
          </span>

          <AudioLevelMeter stream={stream} sourceLabel={details.audioSource} />

          <div css={endStatusStyles}>
            {hasVisibleMedia ? (
              <span
                data-live-timer="true"
                css={badgeStyles(theme)}
                aria-label={`Live for ${formatDuration(liveSeconds)}`}
              >
                <span>Live {formatDuration(liveSeconds)}</span>
              </span>
            ) : null}
            <span
              role="status"
              aria-live="polite"
              aria-atomic="true"
              css={badgeStyles(theme, statusTone)}
            >
              <span css={statusDotStyles(theme, statusTone)} aria-hidden="true" />
              <span>{statusLabel}</span>
            </span>
          </div>
        </figcaption>
      ) : null}
    </figure>
  );
};
