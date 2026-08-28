import { lazy, Suspense, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTheme } from '@emotion/react';
import type { MediaPersistence } from '@studio/contracts';
import { getRecordingDurationTiming } from '@studio/domain';
import type { LocalCaptureAspectRatio } from '../../application/types';
import { formatDuration } from '../recording/recordingHelpers';
import {
  type RealtimeSessionTiming,
  type SessionLifecycle,
  type StudioMode,
} from '../media-session';
import {
  framingGuideStyles,
  guideCornerStyles,
  stageControlsRegionStyles,
  stageFrameStyles,
  stageStyles,
  videoStyles,
} from './MediaStage.styles';
import { MediaStageBlockingLayers, MediaStageEmpty, MediaStageToolbar } from './MediaStageSections';
import { StageNoticeLayer } from './StageNoticeLayer';
import type { StageNotice } from './stageNotices';
import { describeStageMedia, type StagePresentation } from './stagePresentation';
import type { VideoEditStagePreviewContract } from '../video-editor/types';

const VideoEditStagePreview = lazy(() =>
  import('../video-editor/VideoEditStagePreview').then((module) => ({
    default: module.VideoEditStagePreview,
  })),
);

export type { StagePresentation } from './stagePresentation';

export type MediaStageProps = {
  presentation: StagePresentation;
  mode: StudioMode;
  /** Omitted until the capability read resolves; the idle stage then uses the wording that claims less. */
  mediaPersistence?: MediaPersistence | undefined;
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
  editPreview?: VideoEditStagePreviewContract;
  videoRef?: RefObject<HTMLVideoElement | null>;
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

/**
 * The second half of the idle description states where the operator's work comes to rest, so it
 * follows the deployment rather than the creative mode. Both wordings live here, keyed by the
 * capability value, so neither can drift from the other or from what the server reports.
 */
const MEDIA_PERSISTENCE_COPY: Readonly<Record<MediaPersistence, string>> = {
  'browser-only': 'Nothing leaves this browser in Local mode.',
  account: 'Work you save is stored in your account.',
};

const emptyCopy = (
  mode: StudioMode,
  mediaPersistence: MediaPersistence | undefined,
): { title: string; description: string } => {
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
    // The camera assurance holds in every deployment; only the storage sentence varies. An
    // unresolved capability falls to `account`, which claims nothing about staying local.
    description: `Camera and microphone remain off until you select Start camera. ${
      MEDIA_PERSISTENCE_COPY[mediaPersistence ?? 'account']
    }`,
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
  mediaPersistence,
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
  editPreview,
  videoRef: providedVideoRef,
}: MediaStageProps) => {
  const theme = useTheme();
  const figureRef = useRef<HTMLElement>(null);
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const videoRef = providedVideoRef ?? internalVideoRef;
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
  const copy = emptyCopy(stageMode, mediaPersistence);
  const statusTone = presentation.kind === 'playback' ? 'accent' : lifecycleTone(lifecycle);
  const playbackLocked = presentation.kind === 'playback' && presentation.controlsLocked;
  const editingPlayback = presentation.kind === 'playback' && editPreview !== undefined;
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
      video.controls = !playbackLocked && !editingPlayback;

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
  }, [editingPlayback, playbackLocked, playbackUrl, presentation.kind, stream, videoRef]);

  useEffect(
    () => () => {
      const video = videoRef.current;
      if (!video) return;
      video.pause();
      video.srcObject = null;
      video.removeAttribute('src');
    },
    [videoRef],
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
    const message = `This take could not be loaded for playback${detail}. Retry, save it, or discard it from Take Review.`;
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
            presentation.kind === 'playback' && !playbackLocked && !editingPlayback,
          )}
          muted={presentation.kind !== 'playback'}
          controls={presentation.kind === 'playback' && !playbackLocked && !editingPlayback}
          playsInline
          autoPlay={presentation.kind !== 'playback'}
          preload="metadata"
          tabIndex={
            presentation.kind === 'playback' && !playbackLocked && !editingPlayback ? 0 : -1
          }
          aria-hidden={!hasVisibleMedia || editingPlayback}
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

        {editingPlayback && editPreview ? (
          <Suspense fallback={null}>
            <VideoEditStagePreview videoRef={videoRef} contract={editPreview} />
          </Suspense>
        ) : null}

        {!hasVisibleMedia ? (
          <MediaStageEmpty title={copy.title} description={copy.description} action={idleAction} />
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

        <MediaStageToolbar
          recording={recording}
          statusLabel={statusLabel}
          compactStatusLabel={compactStatusLabel}
          statusTone={statusToneResolved}
          recordingTiming={recordingDurationTiming}
          realtimeTiming={showRealtimeTiming ? realtimeSessionTiming : null}
          realtimeTimingLabel={realtimeTimingLabel}
          realtimeTimingTone={realtimeTimingTone}
          fullscreenSupported={fullscreenSupported}
          fullscreen={fullscreen}
          onToggleFullscreen={toggleFullscreen}
        />

        <MediaStageBlockingLayers
          finalizingStartedAt={presentation.kind === 'finalizing' ? presentation.startedAt : null}
          playbackLocked={playbackLocked}
          playbackOperation={playbackOperation}
          aiStarting={aiStarting}
          experienceLabel={experienceLabel}
        />

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
