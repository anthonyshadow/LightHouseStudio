import type { SubtitleCue } from '@studio/domain';
import type { RefObject } from 'react';
import type { VideoEditSession } from './useVideoEditSession';

/**
 * Moves the stage's `<video>` and the session's playhead together. The video node stays the
 * authority on time; the session mirrors it so the timeline and the inspector agree.
 */
export const seekEditorVideo = (
  videoRef: RefObject<HTMLVideoElement | null>,
  session: Pick<VideoEditSession, 'setPlayheadMs'>,
  milliseconds: number,
  durationMs: number,
): void => {
  const bounded = Math.min(durationMs, Math.max(0, milliseconds));
  const video = videoRef.current;
  if (video) video.currentTime = bounded / 1_000;
  session.setPlayheadMs(bounded);
};

/** Selecting a cue also shows it: the stage seeks to where it starts. */
export const selectSubtitleCue = (
  videoRef: RefObject<HTMLVideoElement | null>,
  session: Pick<VideoEditSession, 'setPlayheadMs' | 'setSelectedSubtitleId'>,
  cue: SubtitleCue,
  durationMs: number,
): void => {
  session.setSelectedSubtitleId(cue.id);
  seekEditorVideo(videoRef, session, cue.startMs, durationMs);
};
