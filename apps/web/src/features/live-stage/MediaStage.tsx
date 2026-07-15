import { useEffect, useRef } from 'react';
import { useTheme, type CSSObject, type Theme } from '@emotion/react';
import { formatDuration } from '../recording';
import { modeLabel, type StudioMode, type SessionLifecycle } from '../media-session';

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

const figureStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  display: 'grid',
  minHeight: 'min(68dvh, 48rem)',
  margin: 0,
  overflow: 'hidden',
  border: `1px solid ${theme.colors.border}`,
  borderRadius: 'clamp(1rem, 2.4vw, 1.8rem)',
  background:
    'radial-gradient(circle at 70% 16%, rgba(98,230,194,.12), transparent 30%), linear-gradient(145deg, #111922, #070a0e)',
  boxShadow: theme.shadows.lifted,
  '@media (max-width: 63.99rem)': { minHeight: 'min(58dvh, 38rem)' },
  '@media (max-width: 39.99rem)': { minHeight: '46dvh', borderRadius: theme.radii.large },
});

const videoStyles = (): CSSObject => ({
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  transform: 'scaleX(-1)',
  background: '#050709',
});

const emptyStyles = (theme: Theme): CSSObject => ({
  placeSelf: 'center',
  zIndex: 1,
  maxWidth: '30rem',
  padding: theme.space.xl,
  textAlign: 'center',
  color: theme.colors.textMuted,
  '& strong': {
    display: 'block',
    marginBlockEnd: theme.space.xs,
    color: theme.colors.text,
    fontFamily: theme.type.display,
    fontSize: 'clamp(1.25rem, 2.5vw, 2rem)',
  },
});

const overlayStyles = (theme: Theme): CSSObject => ({
  position: 'relative',
  zIndex: 2,
  alignSelf: 'end',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: theme.space.xs,
  padding: `clamp(${theme.space.md}, 3vw, ${theme.space.xl})`,
  background: 'linear-gradient(transparent, rgba(3,6,9,.82))',
});

const badgeStyles = (theme: Theme, signal = false): CSSObject => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: theme.space.xxs,
  minHeight: '2rem',
  padding: '0.35rem 0.65rem',
  border: `1px solid ${signal ? theme.colors.signal : theme.colors.borderStrong}`,
  borderRadius: theme.radii.round,
  color: signal ? theme.colors.signal : theme.colors.text,
  background: 'rgba(9,13,18,.75)',
  backdropFilter: 'blur(12px)',
  fontFamily: signal ? theme.type.mono : theme.type.sans,
  fontSize: '0.74rem',
  fontWeight: 760,
  letterSpacing: signal ? '0.03em' : 0,
});

const dotStyles = (theme: Theme): CSSObject => ({
  width: '0.5rem',
  height: '0.5rem',
  borderRadius: '50%',
  background: theme.colors.danger,
  boxShadow: `0 0 0 .22rem ${theme.colors.dangerSoft}`,
});

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
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
    return () => {
      if (video.srcObject === stream) video.srcObject = null;
    };
  }, [stream]);

  return (
    <figure css={figureStyles(theme)} aria-label="Live studio stage">
      {stream ? (
        <video
          ref={videoRef}
          css={videoStyles()}
          muted
          playsInline
          autoPlay
          aria-label={transformed ? 'Live transformed camera preview' : 'Live local camera preview'}
        />
      ) : (
        <div css={emptyStyles(theme)}>
          <strong>Your stage is private until you start.</strong>
          Prepare a recipe, choose a reference, or begin with the local camera. No camera permission
          is requested while you create.
        </div>
      )}
      <figcaption css={overlayStyles(theme)}>
        <span css={badgeStyles(theme)}>{transformed ? 'Transformed output' : modeLabel(mode)}</span>
        <span
          role="status"
          aria-live="polite"
          aria-atomic="true"
          css={badgeStyles(theme, lifecycle === 'generating')}
        >
          {lifecycleLabel(lifecycle)}
        </span>
        {stream ? <span css={badgeStyles(theme)}>Live {formatDuration(liveSeconds)}</span> : null}
        {mode !== 'local' && generationSeconds > 0 ? (
          <span css={badgeStyles(theme, true)}>AI time {formatDuration(generationSeconds)}</span>
        ) : null}
        {recording ? (
          <span
            role="timer"
            aria-live="off"
            aria-label={`Recording elapsed time ${formatDuration(recordingSeconds)}`}
            css={badgeStyles(theme, true)}
          >
            <span css={dotStyles(theme)} aria-hidden="true" />
            Recording {formatDuration(recordingSeconds)}
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
};
