import { useTheme } from '@emotion/react';
import { formatDuration } from '@studio/domain';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Button } from '../../ui';
import { media } from '../../ui/media';

type VideoPlayerProps = Readonly<{
  /** `null` while there is nothing to show; the element is emptied and reloaded, releasing a blob. */
  src: string | null;
  title: string;
  poster?: string | undefined;
  /** For a surface that has to reach the element itself — seeking it, or pausing it on close. */
  videoRef?: RefObject<HTMLVideoElement | null> | undefined;
  onLoadedData?: (() => void) | undefined;
  onError?: (() => void) | undefined;
}>;

const playableDuration = (video: HTMLVideoElement): number =>
  Number.isFinite(video.duration) ? Math.max(0, video.duration) : 0;

const playableTime = (video: HTMLVideoElement, duration: number): number =>
  Math.min(duration, Math.max(0, Number.isFinite(video.currentTime) ? video.currentTime : 0));

/**
 * The one video player in the product.
 *
 * Every surface that shows a finished or borrowed video renders this: the Project source picker,
 * the Project assets strip, Project history, the Videos library preview and the upload panel. It
 * exists because those surfaces used to be split between a native `<video controls>` and this
 * transport, so the same object wore two chromes in one product. The live capture stage is the one
 * exception and stays its own thing — it owns the camera, not a file.
 *
 * The source is attached imperatively rather than through the `src` attribute so a blob URL is
 * paused, detached and reloaded when it changes or the player unmounts.
 */
export const VideoPlayer = ({
  src,
  title,
  poster,
  videoRef: externalRef,
  onLoadedData,
  onError,
}: VideoPlayerProps) => {
  const theme = useTheme();
  const ownRef = useRef<HTMLVideoElement>(null);
  const videoRef = externalRef ?? ownRef;
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.pause();
    if (src === null) video.removeAttribute('src');
    else video.src = src;
    video.load();
    setPlaying(false);
    setCurrentTime(0);
    return () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [src, videoRef]);

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
      <div css={{ display: 'grid', minWidth: 0, minHeight: 0, placeItems: 'center' }}>
        {/* Saved local videos may not include a captions track. */}
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <video
          ref={videoRef}
          poster={poster}
          playsInline
          preload="metadata"
          aria-label={`Preview of ${title}`}
          css={{
            width: '100%',
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
          onLoadedData={onLoadedData}
          onError={onError}
        />
      </div>

      <div
        role="group"
        aria-label="Video controls"
        css={{
          minWidth: 0,
          // A grid, not a wrapping row: the transport is one line at every width the player is
          // given, including the upload panel's narrow source column, where wrapping used to put
          // Mute on a line of its own.
          display: 'grid',
          gridTemplateColumns: 'auto auto minmax(2rem, 1fr) auto',
          alignItems: 'center',
          gap: theme.space.sm,
          padding: theme.space.sm,
          borderBlockStart: `1px solid ${theme.colors.borderStrong}`,
          background: theme.colors.overlaySurface,
          boxShadow: theme.shadows.soft,
          '& input': {
            minWidth: 0,
            width: '100%',
            accentColor: theme.colors.accent,
          },
          '& input:focus-visible': {
            outline: `2px solid ${theme.colors.focus}`,
            outlineOffset: '2px',
          },
          [media.down('tablet')]: {
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
