import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTheme } from '@emotion/react';
import { getRecordingDurationTiming } from '@studio/domain';
import type { LocalCaptureAspectRatio } from '../../application/types';
import { formatDuration } from '../recording/recordingHelpers';
import {
  type RealtimeSessionTiming,
  type SessionLifecycle,
  type StudioMode,
} from '../media-session';
import {
  activityIndicatorStyles,
  badgeStyles,
  blockingCardStyles,
  blockingOverlayStyles,
  emptyIconStyles,
  emptyStyles,
  framingGuideStyles,
  guideCornerStyles,
  iconButtonStyles,
  stageControlsRegionStyles,
  stageFrameStyles,
  stageStyles,
  statusDotStyles,
  toolbarGroupStyles,
  topToolbarStyles,
  videoStyles,
} from './MediaStage.styles';
import { StageNoticeLayer } from './StageNoticeLayer';
import type { StageNotice } from './stageNotices';
import { describeStageMedia, type StagePresentation } from './stagePresentation';

export type { StagePresentation } from './stagePresentation';

export type MediaStageProps = {
  presentation: StagePresentation;
  mode: StudioMode;
  lifecycle: SessionLifecycle;
  recording: boolean;
  recordingSeconds: number;
  aspectRatio?: LocalCaptureAspectRatio;
  realtimeSessionTiming?: RealtimeSessionTiming | null;
  controls?: ReactNode | ((state: StageControlVisibility) => ReactNode);
  idleAction?: ReactNode;
  experienceLabel?: string | undefined;
  notices?: readonly StageNotice[];
  onPlaybackError?: (message: string) => void;
  fullscreenTargetRef?: RefObject<HTMLElement | null>;
};

export type StageControlVisibility = {
  visible: boolean;
};

export const STAGE_CONTROLS_IDLE_TIMEOUT_MS = 3_000;

type LiveSnapshot = {
  stream: MediaStream;
  origin: 'local' | 'provider';
  mirrored: boolean;
};

type ResolvedLiveMedia = {
  livePresentation: LiveSnapshot | Extract<StagePresentation, { kind: 'live' }> | null;
  stream: MediaStream | null;
  mirrored: boolean;
};

const resolveLiveMedia = (
  presentation: StagePresentation,
  lastLiveSnapshot: LiveSnapshot | null,
): ResolvedLiveMedia => {
  if (presentation.kind === 'live') {
    return {
      livePresentation: presentation,
      stream: presentation.stream,
      mirrored: presentation.mirrored,
    };
  }
  if (presentation.kind === 'finalizing') {
    return {
      livePresentation: lastLiveSnapshot,
      stream: presentation.retainedStream ?? lastLiveSnapshot?.stream ?? null,
      mirrored: lastLiveSnapshot?.mirrored ?? false,
    };
  }
  return { livePresentation: null, stream: null, mirrored: false };
};

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

const lifecycleLabel = (
  lifecycle: SessionLifecycle,
  mode: StudioMode,
  experienceLabel?: string,
): string => {
  if (lifecycle === 'idle') return 'Studio idle';
  if (lifecycle === 'requesting-media') return mode === 'local' ? 'Starting camera' : 'Starting AI';
  if (lifecycle === 'ready') return 'Local preview';
  if (lifecycle === 'requesting-token' || lifecycle === 'connecting') return 'Starting AI';
  if (lifecycle === 'connected' || lifecycle === 'generating')
    return `AI active${experienceLabel ? ` · ${experienceLabel}` : ''}`;
  if (lifecycle === 'reconnecting') return 'Reconnecting AI · local preview';
  if (lifecycle === 'disconnected') return 'AI stopped · local preview';
  if (lifecycle === 'stopping-ai') return 'Stopping AI';
  if (lifecycle === 'stopping-media') return 'Stopping session';
  return 'Needs attention';
};

const lifecycleTone = (lifecycle: SessionLifecycle): 'neutral' | 'accent' | 'recording' =>
  ['ready', 'connected', 'generating'].includes(lifecycle) ? 'accent' : 'neutral';

const stageStatusLabel = (
  presentation: StagePresentation,
  recording: boolean,
  recordingSeconds: number,
  hasVisibleMedia: boolean,
  lifecycle: SessionLifecycle,
  mode: StudioMode,
  experienceLabel?: string,
): string => {
  if (presentation.kind === 'playback') return 'Recorded take';
  if (presentation.kind === 'finalizing') return 'Finalizing take';
  if (recording) return `Recording ${formatDuration(recordingSeconds)}`;
  if (presentation.kind === 'live' && !hasVisibleMedia) return 'Camera unavailable';
  return lifecycleLabel(lifecycle, mode, experienceLabel);
};

const compactStageStatusLabel = (
  presentation: StagePresentation,
  recording: boolean,
  recordingSeconds: number,
  hasVisibleMedia: boolean,
  lifecycle: SessionLifecycle,
): string => {
  if (presentation.kind === 'playback') return 'Take';
  if (presentation.kind === 'finalizing') return 'Finalizing';
  if (recording) return `REC ${formatDuration(recordingSeconds)}`;
  if (presentation.kind === 'live' && !hasVisibleMedia) return 'No camera';
  if (lifecycle === 'ready') return 'Live';
  if (lifecycle === 'connected' || lifecycle === 'generating') return 'AI live';
  if (lifecycle === 'requesting-media') return 'Starting';
  return 'Studio';
};

const formatRealtimeTiming = (timing: RealtimeSessionTiming | null): string | null => {
  if (!timing) return null;
  const maximum = formatDuration(timing.maximumSeconds);
  if (timing.status === 'completed') return `AI ${maximum} / ${maximum} · complete`;
  return `AI ${formatDuration(timing.elapsedSeconds)} / ${maximum} · ${formatDuration(
    timing.remainingSeconds,
  )} left`;
};

const emptyCopy = (mode: StudioMode): { title: string; description: string } => {
  if (mode === 'lucy-latest') {
    return {
      title: 'Your character, your story.',
      description:
        'Build a direction or add a portrait reference. Camera and AI remain off until you explicitly start.',
    };
  }
  if (mode === 'lucy-vton-latest') {
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

export const MediaStage = ({
  presentation,
  mode,
  lifecycle,
  recording,
  recordingSeconds,
  aspectRatio = '16:9',
  realtimeSessionTiming = null,
  controls,
  idleAction,
  experienceLabel,
  notices = [],
  onPlaybackError,
  fullscreenTargetRef,
}: MediaStageProps) => {
  const theme = useTheme();
  const figureRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const boundKindRef = useRef<'idle' | 'stream' | 'playback'>('idle');
  const boundPlaybackUrlRef = useRef<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [lastLiveSnapshot, setLastLiveSnapshot] = useState<LiveSnapshot | null>(null);
  const stageControlsIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
  const { livePresentation, stream, mirrored } = resolveLiveMedia(presentation, lastLiveSnapshot);
  const transformed = livePresentation?.origin === 'provider';
  const details = describeStageMedia(presentation, stream, transformed);
  const stageMode = presentation.kind === 'idle' ? presentation.mode : mode;
  const copy = emptyCopy(stageMode);
  const statusTone = presentation.kind === 'playback' ? 'accent' : lifecycleTone(lifecycle);
  const playbackLocked = presentation.kind === 'playback' && presentation.controlsLocked;
  const playbackOperation =
    presentation.kind === 'playback' ? presentation.processingOperation : null;
  const isFinalizing = presentation.kind === 'finalizing';
  const hasVisibleMedia = details.hasLiveVideo;
  const controlsAutoHideContext =
    presentation.kind === 'live' || presentation.kind === 'playback' ? presentation.kind : null;
  const stageControlsVisibilityContext = recording ? null : controlsAutoHideContext;
  const [stageControlsVisibility, setStageControlsVisibility] = useState({
    context: stageControlsVisibilityContext,
    visible: true,
  });
  if (stageControlsVisibility.context !== stageControlsVisibilityContext) {
    setStageControlsVisibility({ context: stageControlsVisibilityContext, visible: true });
  }
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
    const update = () =>
      setFullscreen(
        document.fullscreenElement === (fullscreenTargetRef?.current ?? figureRef.current),
      );
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, [fullscreenSupported, fullscreenTargetRef]);

  useEffect(() => {
    const clearIdleTimer = () => {
      if (stageControlsIdleTimerRef.current === null) return;
      clearTimeout(stageControlsIdleTimerRef.current);
      stageControlsIdleTimerRef.current = null;
    };

    if (stageControlsVisibilityContext === null) {
      return clearIdleTimer;
    }

    const scheduleHide = () => {
      clearIdleTimer();
      stageControlsIdleTimerRef.current = setTimeout(() => {
        stageControlsIdleTimerRef.current = null;
        setStageControlsVisibility((current) =>
          current.context === stageControlsVisibilityContext
            ? { context: stageControlsVisibilityContext, visible: false }
            : current,
        );
      }, STAGE_CONTROLS_IDLE_TIMEOUT_MS);
    };
    const revealControls = () => {
      setStageControlsVisibility({
        context: stageControlsVisibilityContext,
        visible: true,
      });
      scheduleHide();
    };
    const stage = figureRef.current;

    scheduleHide();
    stage?.addEventListener('pointermove', revealControls, { passive: true });
    stage?.addEventListener('pointerdown', revealControls, { passive: true });
    stage?.addEventListener('touchstart', revealControls, { passive: true });
    stage?.addEventListener('focusin', revealControls);
    window.addEventListener('keydown', revealControls);

    return () => {
      clearIdleTimer();
      stage?.removeEventListener('pointermove', revealControls);
      stage?.removeEventListener('pointerdown', revealControls);
      stage?.removeEventListener('touchstart', revealControls);
      stage?.removeEventListener('focusin', revealControls);
      window.removeEventListener('keydown', revealControls);
    };
  }, [stageControlsVisibilityContext]);

  const toggleFullscreen = () => {
    const fullscreenTarget = fullscreenTargetRef?.current ?? figureRef.current;
    if (!fullscreenTarget) return;
    if (document.fullscreenElement === fullscreenTarget) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    void fullscreenTarget.requestFullscreen().catch(() => undefined);
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

  const statusLabel = stageStatusLabel(
    presentation,
    recording,
    recordingSeconds,
    hasVisibleMedia,
    lifecycle,
    mode,
    experienceLabel,
  );
  const compactStatusLabel = compactStageStatusLabel(
    presentation,
    recording,
    recordingSeconds,
    hasVisibleMedia,
    lifecycle,
  );
  const recordingDurationTiming = getRecordingDurationTiming(recordingSeconds);
  const statusToneResolved = recording
    ? recordingDurationTiming.warning
      ? 'warning'
      : 'recording'
    : statusTone;
  const aiStarting =
    mode !== 'local' && ['requesting-media', 'requesting-token', 'connecting'].includes(lifecycle);
  const resolvedStageControlsVisible =
    stageControlsVisibilityContext === null || stageControlsVisibility.visible;
  const renderedControls =
    typeof controls === 'function' ? controls({ visible: resolvedStageControlsVisible }) : controls;
  const showRealtimeTiming =
    realtimeSessionTiming !== null &&
    presentation.kind !== 'playback' &&
    presentation.kind !== 'finalizing';
  const realtimeTimingLabel = formatRealtimeTiming(realtimeSessionTiming);
  const realtimeTimingTone =
    realtimeSessionTiming?.warning || realtimeSessionTiming?.status === 'limit-reached'
      ? 'warning'
      : 'accent';

  return (
    <figure
      ref={figureRef}
      css={stageStyles(theme)}
      aria-label="Studio media stage"
      aria-busy={
        isFinalizing ||
        playbackLocked ||
        ['requesting-media', 'requesting-token', 'connecting', 'reconnecting'].includes(lifecycle)
      }
      data-recording={recording ? 'true' : 'false'}
      data-media-stage-layout=""
      data-stage-presentation={presentation.kind}
      data-stage-aspect-ratio={aspectRatio}
    >
      <div
        css={stageFrameStyles(theme, recording || isFinalizing, aspectRatio)}
        data-stage-frame=""
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
            {idleAction ? <div>{idleAction}</div> : null}
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

        <div css={topToolbarStyles(theme, showRealtimeTiming)}>
          <div css={toolbarGroupStyles(theme, showRealtimeTiming)}>
            <span
              role={recording ? 'timer' : 'status'}
              aria-live={recording ? 'off' : 'polite'}
              aria-label={
                recording
                  ? `Recording elapsed time ${formatDuration(
                      recordingDurationTiming.elapsedSeconds,
                    )}, maximum ${formatDuration(
                      recordingDurationTiming.maximumSeconds,
                    )}, ${formatDuration(recordingDurationTiming.remainingSeconds)} remaining`
                  : statusLabel
              }
              css={badgeStyles(theme, statusToneResolved)}
              data-recording-duration-status={
                recording ? recordingDurationTiming.status : undefined
              }
            >
              <span css={statusDotStyles(theme, statusToneResolved)} aria-hidden="true" />
              <span data-stage-status-long>{statusLabel}</span>
              <span data-stage-status-short aria-hidden="true">
                {compactStatusLabel}
              </span>
            </span>
            {showRealtimeTiming && realtimeSessionTiming && realtimeTimingLabel ? (
              <span
                role="timer"
                aria-live="off"
                aria-label={`AI session maximum ${formatDuration(
                  realtimeSessionTiming.maximumSeconds,
                )}, elapsed ${formatDuration(
                  realtimeSessionTiming.elapsedSeconds,
                )}, ${formatDuration(realtimeSessionTiming.remainingSeconds)} remaining`}
                css={badgeStyles(theme, realtimeTimingTone)}
                data-realtime-session-status={realtimeSessionTiming.status}
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

        <StageNoticeLayer notices={effectiveNotices} />
      </div>

      {renderedControls ? (
        <div css={stageControlsRegionStyles()} data-stage-controls-region="">
          {renderedControls}
        </div>
      ) : null}
    </figure>
  );
};
