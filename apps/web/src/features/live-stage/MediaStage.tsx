import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTheme } from '@emotion/react';
import { formatDuration } from '../recording/recordingHelpers';
import { modeLabel, type SessionLifecycle, type StudioMode } from '../media-session';
import {
  audioMeterStyles,
  audioTrackStyles,
  badgeStyles,
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
import { useAudioLevel } from './useAudioLevel';

export type MediaStageProps = {
  stream: MediaStream | null;
  mode: StudioMode;
  lifecycle: SessionLifecycle;
  transformed: boolean;
  liveSeconds: number;
  generationSeconds: number;
  recording: boolean;
  recordingSeconds: number;
};

type StreamDetails = {
  hasLiveVideo: boolean;
  resolution: string;
  videoSource: string;
  audioSource: string | null;
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

const isFinitePositive = (value: number | undefined): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const formatFrameRate = (frameRate: number): string =>
  Number.isInteger(frameRate) ? String(frameRate) : frameRate.toFixed(2).replace(/0+$/, '');

const trackSettings = (track: MediaStreamTrack): MediaTrackSettings => {
  try {
    return track.getSettings();
  } catch {
    return {};
  }
};

const describeStream = (stream: MediaStream | null, transformed: boolean): StreamDetails => {
  const videoTrack = stream?.getVideoTracks().find((track) => track.readyState === 'live') ?? null;
  const audioTrack = stream?.getAudioTracks().find((track) => track.readyState === 'live') ?? null;

  if (!videoTrack) {
    return {
      hasLiveVideo: false,
      resolution: 'Video idle',
      videoSource: transformed ? 'AI output unavailable' : 'Camera off',
      audioSource: audioTrack?.label.trim() || (audioTrack ? 'Live audio' : null),
    };
  }

  const settings = trackSettings(videoTrack);
  const size =
    isFinitePositive(settings.width) && isFinitePositive(settings.height)
      ? `${Math.round(settings.width)} × ${Math.round(settings.height)}`
      : 'Live video';
  const resolution = isFinitePositive(settings.frameRate)
    ? `${size} · ${formatFrameRate(settings.frameRate)} fps`
    : size;

  return {
    hasLiveVideo: true,
    resolution,
    videoSource: transformed ? 'AI output' : videoTrack.label.trim() || 'Local camera',
    audioSource: audioTrack
      ? transformed
        ? 'Provider audio'
        : audioTrack.label.trim() || 'Microphone'
      : null,
  };
};

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
  stream,
  mode,
  lifecycle,
  transformed,
  liveSeconds,
  generationSeconds,
  recording,
  recordingSeconds,
}: MediaStageProps) => {
  const theme = useTheme();
  const figureRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  useTrackRevision(stream);
  const details = describeStream(stream, transformed);
  const copy = emptyCopy(mode);
  const statusTone = lifecycleTone(lifecycle);
  const mirrored = details.hasLiveVideo && !transformed;
  const fullscreenSupported =
    typeof document !== 'undefined' &&
    document.fullscreenEnabled &&
    typeof Element !== 'undefined' &&
    'requestFullscreen' in Element.prototype;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) {
      try {
        void video.play().catch(() => undefined);
      } catch {
        // Some test and embedded browser environments throw synchronously here.
      }
    }
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);

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

  return (
    <figure
      ref={figureRef}
      css={stageStyles(theme, recording)}
      aria-label="Live studio stage"
      aria-busy={['requesting-media', 'requesting-token', 'connecting', 'reconnecting'].includes(
        lifecycle,
      )}
      data-recording={recording ? 'true' : 'false'}
    >
      <video
        ref={videoRef}
        css={videoStyles(theme, details.hasLiveVideo, mirrored)}
        muted
        playsInline
        autoPlay
        aria-hidden={!details.hasLiveVideo}
        aria-label={transformed ? 'Live transformed camera preview' : 'Live local camera preview'}
        data-media-fit="contain"
        data-mirrored={mirrored ? 'true' : 'false'}
      />

      {!details.hasLiveVideo ? (
        <div css={emptyStyles(theme)}>
          <span css={emptyIconStyles(theme)}>
            <StageIcon />
          </span>
          <strong>{copy.title}</strong>
          <p>{copy.description}</p>
        </div>
      ) : null}

      <div css={framingGuideStyles(theme, details.hasLiveVideo)} aria-hidden="true">
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
          {mode !== 'local' && generationSeconds > 0 ? (
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
          {details.hasLiveVideo ? (
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
            <span>{lifecycleLabel(lifecycle)}</span>
          </span>
        </div>
      </figcaption>
    </figure>
  );
};
