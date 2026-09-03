import { useTheme } from '@emotion/react';
import {
  SUBTITLE_CUE_LIMIT,
  SUBTITLE_CUE_PLACEMENTS,
  SUBTITLE_CUE_TEXT_MAX_LENGTH,
  createSubtitleCueAt,
  retimeSubtitleCue,
  subtitleCueBounds,
  type SubtitleCue,
  type SubtitleCueEdge,
  type SubtitleCuePlacement,
} from '@studio/domain';
import { useEffect, useRef, type RefObject } from 'react';
import { AppIcon, Button, SegmentedControl, TextAreaField } from '../../ui';
import { EditRange } from './EditRange';
import { selectSubtitleCue } from './seekEditorVideo';
import { formatVideoEditTimelineTime, subtitleCueLabel } from './types';
import type { VideoEditSession } from './useVideoEditSession';
import {
  subtitleEditorStyles,
  subtitleEmptyStyles,
  subtitleListStyles,
} from './VideoEditWorkspace.styles';

const PLACEMENT_LABELS: Record<SubtitleCuePlacement, string> = {
  top: 'Top',
  middle: 'Middle',
  bottom: 'Bottom',
};

const PLACEMENT_OPTIONS = SUBTITLE_CUE_PLACEMENTS.map((value) => ({
  value,
  label: PLACEMENT_LABELS[value],
}));

const EDGES: readonly Readonly<{ edge: SubtitleCueEdge; label: string; playhead: string }>[] = [
  { edge: 'start', label: 'Subtitle start', playhead: 'Set start to playhead' },
  { edge: 'end', label: 'Subtitle end', playhead: 'Set end to playhead' },
];

type Props = Readonly<{
  session: VideoEditSession;
  videoRef: RefObject<HTMLVideoElement | null>;
}>;

/**
 * The Subtitles tool: a list of cues, and an editor for the selected one. Text edits preview on
 * every keystroke but commit as one undo entry per focus, the way a slider gesture does; adding,
 * repositioning and deleting are single entries. What a cue may be — where a new one starts, how
 * far an edge can move — is the domain's; this states the gestures.
 */
export const SubtitleToolSettings = ({ session, videoRef }: Props) => {
  const theme = useTheme();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const focusRequestRef = useRef<string | null>(null);
  const cues = session.draft.subtitles;
  const selectedIndex = cues.findIndex((cue) => cue.id === session.selectedSubtitleId);
  const selected = selectedIndex === -1 ? null : cues[selectedIndex]!;
  const source = { durationMs: session.source?.metadata.durationMs ?? 0 };
  const { trim } = session.draft;

  useEffect(() => {
    if (selected !== null && focusRequestRef.current === selected.id) {
      focusRequestRef.current = null;
      textRef.current?.focus();
    }
  }, [selected]);

  if (!session.source) return null;

  const replaceCue = (next: SubtitleCue, mode: 'apply' | 'preview') => {
    const subtitles = cues.map((cue) => (cue.id === next.id ? next : cue));
    const spec = { ...session.draft, subtitles };
    if (mode === 'apply') session.applySpec(spec);
    else session.previewSpec(spec);
  };
  const addAtPlayhead = () => {
    const cue = createSubtitleCueAt(session.draft, session.playheadMs, crypto.randomUUID());
    focusRequestRef.current = cue.id;
    session.applySpec({ ...session.draft, subtitles: [...cues, cue] });
    session.setSelectedSubtitleId(cue.id);
  };

  return (
    <>
      <Button
        size="small"
        variant="secondary"
        disabled={cues.length >= SUBTITLE_CUE_LIMIT}
        onClick={addAtPlayhead}
      >
        <AppIcon name="plus" width="1rem" height="1rem" />
        Add subtitle at playhead
      </Button>
      {cues.length === 0 ? (
        <p css={subtitleEmptyStyles(theme)}>
          No subtitles yet. Move the playhead to where the first line should appear, then add one.
          Subtitles are burned into the render exactly as the preview shows them.
        </p>
      ) : (
        <ol css={subtitleListStyles(theme)} aria-label="Subtitles">
          {cues.map((cue, index) => {
            const outsideTrim = cue.endMs <= trim.startMs || cue.startMs >= trim.endMs;
            return (
              <li key={cue.id}>
                <button
                  type="button"
                  aria-pressed={cue.id === selected?.id}
                  onClick={() => selectSubtitleCue(videoRef, session, cue, source.durationMs)}
                >
                  <span>{index + 1}</span>
                  <span>{subtitleCueLabel(cue)}</span>
                  <span>
                    {formatVideoEditTimelineTime(cue.startMs)}–
                    {formatVideoEditTimelineTime(cue.endMs)}
                  </span>
                  {outsideTrim ? <span>Outside the trim</span> : null}
                </button>
              </li>
            );
          })}
        </ol>
      )}
      {selected ? (
        <section css={subtitleEditorStyles(theme)} aria-label={`Subtitle ${selectedIndex + 1}`}>
          <TextAreaField
            ref={textRef}
            label="Text"
            rows={3}
            maxLength={SUBTITLE_CUE_TEXT_MAX_LENGTH}
            value={selected.text}
            hint={`${selected.text.length} of ${SUBTITLE_CUE_TEXT_MAX_LENGTH} characters, up to three lines.`}
            onFocus={session.beginTransaction}
            onChange={(event) =>
              replaceCue({ ...selected, text: event.currentTarget.value }, 'preview')
            }
            onBlur={session.commitTransaction}
          />
          {EDGES.map(({ edge, label, playhead }) => {
            const bounds = subtitleCueBounds(selected, edge, source);
            return (
              <div key={edge} css={{ display: 'contents' }}>
                <EditRange
                  label={label}
                  value={edge === 'start' ? selected.startMs : selected.endMs}
                  minimum={bounds.minimum}
                  maximum={bounds.maximum}
                  step={10}
                  onStart={session.beginTransaction}
                  onChange={(value) =>
                    replaceCue(retimeSubtitleCue(selected, edge, value, source), 'preview')
                  }
                  onCommit={session.commitTransaction}
                />
                <Button
                  size="small"
                  variant="secondary"
                  onClick={() =>
                    replaceCue(
                      retimeSubtitleCue(selected, edge, session.playheadMs, source),
                      'apply',
                    )
                  }
                >
                  {playhead}
                </Button>
              </div>
            );
          })}
          <SegmentedControl
            label="Placement"
            value={selected.placement}
            options={PLACEMENT_OPTIONS}
            columns={3}
            onChange={(placement) => replaceCue({ ...selected, placement }, 'apply')}
          />
          <Button
            size="small"
            variant="quiet"
            data-editor-discard=""
            onClick={() => session.removeSubtitleCue(selected.id)}
          >
            <AppIcon name="trash" width="1rem" height="1rem" />
            Delete subtitle
          </Button>
        </section>
      ) : null}
    </>
  );
};
