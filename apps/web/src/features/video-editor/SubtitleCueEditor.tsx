import { useTheme } from '@emotion/react';
import {
  SUBTITLE_CUE_LIMIT,
  SUBTITLE_CUE_PLACEMENTS,
  SUBTITLE_CUE_TEXT_MAX_LENGTH,
  retimeSubtitleCue,
  subtitleCueBounds,
  type SubtitleCue,
  type SubtitleCueEdge,
  type SubtitleCuePlacement,
} from '@studio/domain';
import { useEffect, useRef } from 'react';
import { AppIcon, Button, SegmentedControl, TextAreaField } from '../../ui';
import { EditRange } from './EditRange';
import { formatVideoEditTimelineTime, subtitleCueLabel } from './types';
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

export interface SubtitleCueEditorProps {
  readonly cues: readonly SubtitleCue[];
  readonly selectedCueId: string | null;
  /** The clock a cue's edges are bounded against: one source's duration, or the sequence's. */
  readonly timelineDurationMs: number;
  readonly playheadMs: number;
  readonly addLabel: string;
  readonly emptyNotice: string;
  /** One extra line under a row: "Outside the trim", or which clip a cue falls over. */
  readonly describeCue?: ((cue: SubtitleCue) => string | null) | undefined;
  readonly disabled?: boolean | undefined;
  /** Answers the new cue's id, so it can be opened for typing, or `null` if it was refused. */
  readonly onAdd: () => string | null;
  readonly onSelectCue: (cue: SubtitleCue) => void;
  readonly onPreviewCue: (cue: SubtitleCue) => void;
  readonly onApplyCue: (cue: SubtitleCue) => void;
  readonly onBeginEdit: () => void;
  readonly onCommitEdit: (cueId: string) => void;
  readonly onRemoveCue: (cueId: string) => void;
}

/**
 * A list of cues and an editor for the selected one, against whatever clock it is given.
 *
 * One component for the single clip and for the arrangement, because a cue list is a cue list: what
 * differs between them is the clock its edges are bounded against, what each row has to say beside
 * the text, and what happens when an edit is committed. All three are the caller's.
 *
 * Text edits preview on every keystroke and commit once per focus, the way a slider gesture does;
 * adding, repositioning and deleting are single entries. What a cue may *be* — how far an edge can
 * move, how long a new one is — is the domain's, and neither adapter restates it.
 */
export const SubtitleCueEditor = ({
  cues,
  selectedCueId,
  timelineDurationMs,
  playheadMs,
  addLabel,
  emptyNotice,
  describeCue,
  disabled = false,
  onAdd,
  onSelectCue,
  onPreviewCue,
  onApplyCue,
  onBeginEdit,
  onCommitEdit,
  onRemoveCue,
}: SubtitleCueEditorProps) => {
  const theme = useTheme();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const focusRequestRef = useRef<string | null>(null);
  const selectedIndex = cues.findIndex((cue) => cue.id === selectedCueId);
  const selected = selectedIndex === -1 ? null : cues[selectedIndex]!;
  /*
   * A cue can outlive a shortened timeline — the composition's normalizer deliberately never
   * clamps one — so the end edge's ceiling has to admit where the cue already is, or the slider
   * would pin it backwards on sight.
   */
  const source = { durationMs: Math.max(timelineDurationMs, selected?.endMs ?? 0) };

  useEffect(() => {
    if (selected !== null && focusRequestRef.current === selected.id) {
      focusRequestRef.current = null;
      textRef.current?.focus();
      // Selected, not just focused: a cue minted with placeholder text is replaced by the first
      // keystroke rather than typed around.
      textRef.current?.select();
    }
  }, [selected]);

  return (
    <>
      <Button
        size="small"
        variant="secondary"
        disabled={disabled || cues.length >= SUBTITLE_CUE_LIMIT}
        onClick={() => {
          const id = onAdd();
          if (id !== null) focusRequestRef.current = id;
        }}
      >
        <AppIcon name="plus" width="1rem" height="1rem" />
        {addLabel}
      </Button>
      {cues.length === 0 ? (
        <p css={subtitleEmptyStyles(theme)}>{emptyNotice}</p>
      ) : (
        <ol css={subtitleListStyles(theme)} aria-label="Subtitles">
          {cues.map((cue, index) => {
            const note = describeCue?.(cue) ?? null;
            return (
              <li key={cue.id}>
                <button
                  type="button"
                  aria-pressed={cue.id === selected?.id}
                  onClick={() => onSelectCue(cue)}
                >
                  <span>{index + 1}</span>
                  <span>{subtitleCueLabel(cue)}</span>
                  <span>
                    {formatVideoEditTimelineTime(cue.startMs)}–
                    {formatVideoEditTimelineTime(cue.endMs)}
                  </span>
                  {note === null ? null : <span>{note}</span>}
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
            disabled={disabled}
            maxLength={SUBTITLE_CUE_TEXT_MAX_LENGTH}
            value={selected.text}
            hint={`${selected.text.length} of ${SUBTITLE_CUE_TEXT_MAX_LENGTH} characters, up to three lines.`}
            onFocus={onBeginEdit}
            onChange={(event) => onPreviewCue({ ...selected, text: event.currentTarget.value })}
            onBlur={() => onCommitEdit(selected.id)}
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
                  disabled={disabled}
                  onStart={onBeginEdit}
                  onChange={(value) =>
                    onPreviewCue(retimeSubtitleCue(selected, edge, value, source))
                  }
                  onCommit={() => onCommitEdit(selected.id)}
                />
                <Button
                  size="small"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() => onApplyCue(retimeSubtitleCue(selected, edge, playheadMs, source))}
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
            onChange={(placement) => onApplyCue({ ...selected, placement })}
          />
          <Button
            size="small"
            variant="quiet"
            data-editor-discard=""
            disabled={disabled}
            onClick={() => onRemoveCue(selected.id)}
          >
            <AppIcon name="trash" width="1rem" height="1rem" />
            Delete subtitle
          </Button>
        </section>
      ) : null}
    </>
  );
};
