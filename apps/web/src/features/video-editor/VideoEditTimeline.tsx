import { useTheme } from '@emotion/react';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppIcon, Button } from '../../ui';
import type { VideoEditSession } from './useVideoEditSession';
import { formatVideoEditTimelineTime } from './types';
import {
  playheadStyles,
  timelineBodyStyles,
  timelineHintStyles,
  timelineLabelsStyles,
  timelineSelectionStyles,
  timelineStyles,
  timelineTrackStyles,
  trimHandleStyles,
} from './VideoEditTimeline.styles';

const MINIMUM_TRIM_MS = 100;
const FRAME_DURATION_MS = 1_000 / 30;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

type TrimEdge = 'in' | 'out';

export type VideoEditTimelineProps = Readonly<{
  session: VideoEditSession;
  videoRef: RefObject<HTMLVideoElement | null>;
}>;

export const VideoEditTimeline = ({ session, videoRef }: VideoEditTimelineProps) => {
  const theme = useTheme();
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<TrimEdge | null>(null);
  const [playing, setPlaying] = useState(false);
  const durationMs = session.source?.metadata.durationMs ?? 0;
  const playheadMs = clamp(session.playheadMs, 0, durationMs);
  const percent = (value: number) => (durationMs > 0 ? (value / durationMs) * 100 : 0);
  const startPercent = percent(session.draft.trim.startMs);
  const endPercent = percent(session.draft.trim.endMs);
  const playheadPercent = percent(playheadMs);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const update = () => setPlaying(!video.paused);
    update();
    video.addEventListener('play', update);
    video.addEventListener('pause', update);
    video.addEventListener('ended', update);
    return () => {
      video.removeEventListener('play', update);
      video.removeEventListener('pause', update);
      video.removeEventListener('ended', update);
    };
  }, [videoRef]);

  const seek = useCallback(
    (nextMs: number) => {
      const bounded = clamp(nextMs, 0, durationMs);
      const video = videoRef.current;
      if (video) video.currentTime = bounded / 1_000;
      session.setPlayheadMs(bounded);
    },
    [durationMs, session, videoRef],
  );

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      const currentMs = video.currentTime * 1_000;
      if (currentMs < session.draft.trim.startMs || currentMs >= session.draft.trim.endMs) {
        seek(session.draft.trim.startMs);
      }
      void video.play().catch(() => undefined);
      return;
    }
    video.pause();
  };

  const updateTrim = useCallback(
    (edge: TrimEdge, nextMs: number) => {
      const trim = session.draft.trim;
      const value =
        edge === 'in'
          ? clamp(nextMs, 0, trim.endMs - MINIMUM_TRIM_MS)
          : clamp(nextMs, trim.startMs + MINIMUM_TRIM_MS, durationMs);
      session.previewSpec({
        ...session.draft,
        trim: edge === 'in' ? { ...trim, startMs: value } : { ...trim, endMs: value },
      });
    },
    [durationMs, session],
  );

  const trimFromPointer = (edge: TrimEdge, clientX: number) => {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds?.width) return;
    updateTrim(edge, ((clientX - bounds.left) / bounds.width) * durationMs);
  };

  const finishTrim = () => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    session.commitTransaction();
  };

  const handleTrimKey = (edge: TrimEdge, event: React.KeyboardEvent<HTMLButtonElement>) => {
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    session.beginTransaction();
    const current = edge === 'in' ? session.draft.trim.startMs : session.draft.trim.endMs;
    updateTrim(edge, current + direction * (event.shiftKey ? 10 : 1) * FRAME_DURATION_MS);
  };

  if (!session.source) return null;

  return (
    <section
      css={timelineStyles(theme)}
      aria-labelledby="video-editor-timeline-title"
      data-video-edit-timeline=""
    >
      <header>
        <h2 id="video-editor-timeline-title">Timeline</h2>
        <output>
          {formatVideoEditTimelineTime(playheadMs)} / {formatVideoEditTimelineTime(durationMs)}
        </output>
      </header>
      <div css={timelineBodyStyles(theme)}>
        <Button
          variant="primary"
          aria-label={playing ? 'Pause edited preview' : 'Play edited preview'}
          onClick={togglePlayback}
        >
          <AppIcon name={playing ? 'pause' : 'play'} width="1rem" height="1rem" />
        </Button>
        <div>
          <div css={timelineLabelsStyles(theme)}>
            <span>IN {formatVideoEditTimelineTime(session.draft.trim.startMs)}</span>
            <span>OUT {formatVideoEditTimelineTime(session.draft.trim.endMs)}</span>
          </div>
          <div ref={trackRef} css={timelineTrackStyles(theme)} aria-label="Editable video timeline">
            <span
              css={timelineSelectionStyles(theme, startPercent, endPercent)}
              aria-hidden="true"
            />
            <span css={playheadStyles(theme, playheadPercent)} aria-hidden="true">
              <output>{formatVideoEditTimelineTime(playheadMs)}</output>
            </span>
            <input
              type="range"
              min={0}
              max={durationMs}
              step={FRAME_DURATION_MS}
              value={playheadMs}
              aria-label="Timeline playhead. Use left and right arrows to step one frame."
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                seek(
                  playheadMs +
                    (event.key === 'ArrowLeft' ? -1 : 1) *
                      (event.shiftKey ? 10 : 1) *
                      FRAME_DURATION_MS,
                );
              }}
              onChange={(event) => seek(Number(event.currentTarget.value))}
            />
            {(['in', 'out'] as const).map((edge) => {
              const edgePercent = edge === 'in' ? startPercent : endPercent;
              return (
                <button
                  key={edge}
                  type="button"
                  css={trimHandleStyles(theme, edgePercent, edge)}
                  aria-label={`Drag trim ${edge} point`}
                  onPointerDown={(event) => {
                    draggingRef.current = edge;
                    session.beginTransaction();
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                    trimFromPointer(edge, event.clientX);
                  }}
                  onPointerMove={(event) => {
                    if (draggingRef.current === edge) trimFromPointer(edge, event.clientX);
                  }}
                  onPointerUp={finishTrim}
                  onPointerCancel={finishTrim}
                  onKeyDown={(event) => handleTrimKey(edge, event)}
                  onKeyUp={(event) => {
                    if (event.key.startsWith('Arrow')) session.commitTransaction();
                  }}
                  onBlur={session.commitTransaction}
                />
              );
            })}
          </div>
          <p css={timelineHintStyles(theme)}>
            Click to seek. Use Left or Right Arrow to step one frame; hold Shift for ten frames.
          </p>
        </div>
      </div>
    </section>
  );
};
