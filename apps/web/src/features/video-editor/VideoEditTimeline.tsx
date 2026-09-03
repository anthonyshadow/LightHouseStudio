import { useTheme } from '@emotion/react';
import { moveSubtitleCue, type SubtitleCue } from '@studio/domain';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { AppIcon, Button } from '../../ui';
import { seekEditorVideo, selectSubtitleCue } from './seekEditorVideo';
import type { VideoEditSession } from './useVideoEditSession';
import { formatVideoEditTimelineTime, subtitleCueLabel } from './types';
import {
  SUBTITLE_ROW_HEIGHT,
  playheadStyles,
  subtitleCueStyles,
  subtitleLaneStyles,
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

type CueDrag = Readonly<{ id: string; clientX: number; startMs: number }>;

/**
 * The lane row each cue takes: the first row whose last cue ended before this one starts — the
 * interval colouring every timeline uses — so overlapping cues sit one above another.
 */
const subtitleLaneRows = (
  cues: readonly SubtitleCue[],
): Readonly<{ rows: readonly number[]; rowCount: number }> => {
  const rowEnds: number[] = [];
  const rows = cues.map((cue) => {
    const row = rowEnds.findIndex((end) => end <= cue.startMs);
    if (row === -1) {
      rowEnds.push(cue.endMs);
      return rowEnds.length - 1;
    }
    rowEnds[row] = cue.endMs;
    return row;
  });
  return { rows, rowCount: rowEnds.length };
};

export type VideoEditTimelineProps = Readonly<{
  session: VideoEditSession;
  videoRef: RefObject<HTMLVideoElement | null>;
}>;

export const VideoEditTimeline = ({ session, videoRef }: VideoEditTimelineProps) => {
  const theme = useTheme();
  // One styled object for every cue block; only the inline geometry differs between them.
  const cueStyles = subtitleCueStyles(theme);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<TrimEdge | null>(null);
  const cueDragRef = useRef<CueDrag | null>(null);
  const [playing, setPlaying] = useState(false);
  const durationMs = session.source?.metadata.durationMs ?? 0;
  const playheadMs = clamp(session.playheadMs, 0, durationMs);
  const percent = (value: number) => (durationMs > 0 ? (value / durationMs) * 100 : 0);
  const startPercent = percent(session.draft.trim.startMs);
  const endPercent = percent(session.draft.trim.endMs);
  const playheadPercent = percent(playheadMs);
  const cues = session.draft.subtitles;
  const showLane = cues.length > 0 || session.activeTool === 'subtitles';
  const { rows, rowCount } = subtitleLaneRows(cues);

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
    (nextMs: number) => seekEditorVideo(videoRef, session, nextMs, durationMs),
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

  /** Moves a whole cue, keeping its length; the lane never retimes an edge. */
  const moveCue = (cue: SubtitleCue, startMs: number) => {
    const moved = moveSubtitleCue(cue, startMs, { durationMs });
    session.previewSpec({
      ...session.draft,
      subtitles: session.draft.subtitles.map((entry) => (entry.id === cue.id ? moved : entry)),
    });
  };

  const finishCueDrag = () => {
    if (!cueDragRef.current) return;
    cueDragRef.current = null;
    session.commitTransaction();
  };

  const handleCueKey = (cue: SubtitleCue, event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      session.removeSubtitleCue(cue.id);
      return;
    }
    const direction = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
    if (!direction) return;
    event.preventDefault();
    session.beginTransaction();
    moveCue(cue, cue.startMs + direction * (event.shiftKey ? 10 : 1) * FRAME_DURATION_MS);
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
          {showLane ? (
            <div
              css={subtitleLaneStyles(theme, rowCount)}
              role="group"
              aria-label="Subtitles on the timeline"
            >
              {cues.map((cue, index) => (
                <button
                  key={cue.id}
                  type="button"
                  css={cueStyles}
                  // Geometry inline: it changes per cue and per drag, and the styled part does not.
                  style={{
                    insetInlineStart: `${percent(cue.startMs)}%`,
                    width: `max(1.25rem, ${percent(cue.endMs) - percent(cue.startMs)}%)`,
                    insetBlockStart: `calc(0.125rem + ${rows[index]} * ${SUBTITLE_ROW_HEIGHT})`,
                  }}
                  data-row={rows[index]}
                  aria-label={`Subtitle ${index + 1}: ${subtitleCueLabel(cue)}, ${formatVideoEditTimelineTime(cue.startMs)} to ${formatVideoEditTimelineTime(cue.endMs)}`}
                  aria-pressed={cue.id === session.selectedSubtitleId}
                  onClick={() => selectSubtitleCue(videoRef, session, cue, durationMs)}
                  onPointerDown={(event) => {
                    cueDragRef.current = {
                      id: cue.id,
                      clientX: event.clientX,
                      startMs: cue.startMs,
                    };
                    session.beginTransaction();
                    event.currentTarget.setPointerCapture?.(event.pointerId);
                  }}
                  onPointerMove={(event) => {
                    const drag = cueDragRef.current;
                    const bounds = trackRef.current?.getBoundingClientRect();
                    if (drag?.id !== cue.id || !bounds?.width) return;
                    const deltaMs = ((event.clientX - drag.clientX) / bounds.width) * durationMs;
                    moveCue(cue, drag.startMs + deltaMs);
                  }}
                  onPointerUp={finishCueDrag}
                  onPointerCancel={finishCueDrag}
                  onKeyDown={(event) => handleCueKey(cue, event)}
                  onKeyUp={(event) => {
                    if (event.key.startsWith('Arrow')) session.commitTransaction();
                  }}
                  onBlur={session.commitTransaction}
                >
                  <span>{subtitleCueLabel(cue)}</span>
                </button>
              ))}
            </div>
          ) : null}
          <p css={timelineHintStyles(theme)}>
            Click to seek. Use Left or Right Arrow to step one frame; hold Shift for ten frames.
            {showLane
              ? ' A subtitle on the lane moves with Left or Right Arrow, and Delete removes it.'
              : ''}
          </p>
        </div>
      </div>
    </section>
  );
};
