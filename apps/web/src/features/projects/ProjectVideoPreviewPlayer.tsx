import { useTheme } from '@emotion/react';
import { formatDuration } from '@studio/domain';
import { useRef, useState } from 'react';
import { Button } from '../../ui';

type ProjectVideoPreviewPlayerProps = Readonly<{
  src: string;
  title: string;
}>;

const playableDuration = (video: HTMLVideoElement): number =>
  Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0;

const playableTime = (video: HTMLVideoElement, duration: number): number =>
  Math.min(duration, Math.max(0, Number.isFinite(video.currentTime) ? video.currentTime : 0));

export const ProjectVideoPreviewPlayer = ({ src, title }: ProjectVideoPreviewPlayerProps) => {
  const theme = useTheme();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  const syncTimeline = () => {
    const video = videoRef.current;
    if (!video) return;
    const nextDuration = playableDuration(video);
    setDuration(nextDuration);
    setCurrentTime(playableTime(video, nextDuration));
  };

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) {
      video.pause();
      return;
    }
    if (duration > 0 && video.currentTime >= duration) {
      video.currentTime = 0;
      setCurrentTime(0);
    }
    void video.play().catch(() => setPlaying(false));
  };

  const toggleMuted = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  };

  return (
    <div
      css={{
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        display: 'grid',
        gridTemplateRows: 'minmax(0, 1fr) auto',
        overflow: 'hidden',
        borderRadius: theme.radii.medium,
        background: theme.colors.canvas,
      }}
    >
      <div css={{ minWidth: 0, minHeight: 0, placeItems: 'center' }}>
        {/* Saved local videos may not include a captions track. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          src={src}
          playsInline
          preload="metadata"
          aria-label={`Preview of ${title}`}
          css={{
            height: '100%',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
          }}
          onLoadedMetadata={syncTimeline}
          onDurationChange={syncTimeline}
          onTimeUpdate={syncTimeline}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            syncTimeline();
          }}
          onVolumeChange={() => setMuted(videoRef.current?.muted ?? false)}
        />
      </div>

      <div
        role="group"
        aria-label="Video controls"
        css={{
          minWidth: 0,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: theme.space.sm,
          padding: theme.space.sm,
          borderBlockStart: `1px solid ${theme.colors.borderStrong}`,
          background: theme.colors.overlaySurface,
          boxShadow: theme.shadows.soft,
          '& input': {
            minWidth: '8rem',
            flex: '1 1 12rem',
            accentColor: theme.colors.accent,
          },
          '& input:focus-visible': {
            outline: `2px solid ${theme.colors.focus}`,
            outlineOffset: '2px',
          },
          [`@media (max-width: ${theme.breakpoints.tablet})`]: {
            gap: theme.space.xs,
            padding: theme.space.xs,
          },
        }}
      >
        <Button
          size="small"
          variant="primary"
          aria-label={playing ? 'Pause video' : 'Play video'}
          onClick={togglePlayback}
        >
          {playing ? 'Pause' : 'Play'}
        </Button>
        <span
          aria-label="Video elapsed and total time"
          css={{
            color: theme.colors.textMuted,
            fontFamily: theme.type.mono,
            fontSize: theme.fontSizes.caption,
            whiteSpace: 'nowrap',
          }}
        >
          {formatDuration(currentTime * 1_000)} / {formatDuration(duration * 1_000)}
        </span>
        <input
          type="range"
          min={0}
          max={duration}
          step={0.1}
          value={currentTime}
          disabled={duration <= 0}
          aria-label="Video position"
          onChange={(event) => {
            const video = videoRef.current;
            if (!video) return;
            const nextTime = Number(event.currentTarget.value);
            video.currentTime = nextTime;
            setCurrentTime(nextTime);
          }}
        />
        <Button size="small" variant="quiet" onClick={toggleMuted}>
          {muted ? 'Unmute' : 'Mute'}
        </Button>
      </div>
    </div>
  );
};
