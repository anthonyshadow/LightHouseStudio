import { useTheme } from '@emotion/react';
import type { ProjectCurrentResponse } from '@studio/contracts';
import {
  VIDEO_EDIT_AUDIO_LEVEL_MAX,
  VIDEO_EDIT_MINIMUM_TRIM_MS,
  clipMediaMsAt,
  type CompositionPlacement,
  type CompositionSplitRefusal,
} from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Button, StatusNotice, VisuallyHidden } from '../../ui';
import { clipMediaOf, type ProjectClipMedia } from '../projects/projectClipMedia';
import type { ProjectSessionPort } from '../projects/useProjectSession';
import { EditRange } from './EditRange';
import {
  clipStripCaptionStyles,
  clipStripStyles,
  clipTileStyles,
  compositionInspectorStyles,
  compositionLayoutStyles,
  compositionPreviewStyles,
  compositionSurfaceStyles,
} from './CompositionSurface.styles';
import { formatVideoEditTimelineTime } from './types';
import { useCompositionSession } from './useCompositionSession';

/** Why the cut the operator is pointing at cannot be made, in words rather than as a dead control. */
const SPLIT_REFUSAL_NOTICE: Record<CompositionSplitRefusal, string> = {
  empty: 'Arrange at least one clip before splitting.',
  'at-cut': 'The playhead is already on a cut. Move it inside a clip to split there.',
  'too-short': 'A split here would leave a clip under a tenth of a second.',
  'at-limit': 'This arrangement is full. Remove a clip before splitting another.',
};

const MEDIA_MISSING_NOTICE =
  'This clip stands over media this Project can no longer open. Remove it, or restore the video it came from.';

export interface CompositionSurfaceProps {
  readonly current: ProjectCurrentResponse;
  readonly session: ProjectSessionPort;
  /** Everything a clip may stand over, already resolved. */
  readonly media: ReadonlyMap<string, ProjectClipMedia>;
  readonly archived: boolean;
  readonly onClose: () => void;
  /** Deterministic ids in tests; the browser's own everywhere else. */
  readonly createId?: (() => string) | undefined;
}

/**
 * The composition editor: one arrangement, the clips it holds, and the gestures that change them.
 *
 * It takes the surface over rather than sitting in a panel beside the Project — the same thing the
 * single-clip editor does, through the same `data-video-edit-active` mechanism the workspace grid
 * already reacts to. A multi-clip strip does not fit a 25rem inspector column, and the operator is
 * doing one thing here.
 *
 * The preview shows the selected clip at its in-point, still. Playing *through* the cuts needs a
 * second element, a sequence clock and audio hand-off, which is what slice 4.2 builds along with
 * the stitched render it has to agree with; showing one clip honestly is better than a playhead
 * that lies about what the output will be.
 */
export const CompositionSurface = ({
  current,
  session,
  media,
  archived,
  onClose,
  createId,
}: CompositionSurfaceProps) => {
  const theme = useTheme();
  // One minter for the surface and the session, so a test that pins ids pins all of them.
  const mintId = useMemo(() => createId ?? (() => crypto.randomUUID()), [createId]);
  const {
    composition: arrangement,
    placements,
    durationMs,
    playheadMs,
    seek,
    selectedClip,
    select,
    splitRefusal,
    split,
    arrange,
    beginGesture,
    endGesture,
    move,
    remove,
    trim,
    audio,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useCompositionSession(session, current, mintId);
  // Hoisted above the rows: Emotion serialises each of these on every call and the strip runs to
  // `COMPOSITION_CLIP_LIMIT`, so a selected boolean is two objects rather than one per clip.
  const captionCss = clipStripCaptionStyles(theme);
  const tileCss = clipTileStyles(theme, false);
  const selectedTileCss = clipTileStyles(theme, true);
  const stripRef = useRef<HTMLUListElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  /* The clip a reorder should hand focus back to, held in a ref: the effect below has to run
   * after the strip re-renders, and writing state there would cascade a second render for a value
   * nothing paints. */
  const focusClipIdRef = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const blocked = archived;

  const selectedMedia = useMemo(
    () => (selectedClip === null ? null : clipMediaOf(media, selectedClip.clip.media)),
    [media, selectedClip],
  );

  // Selecting a clip moves the playhead to its start, so the two never disagree about what is on
  // screen — and the preview below seeks to the same instant from the other direction.
  const selectPlacement = useCallback(
    (placement: CompositionPlacement) => {
      select(placement.clip.id);
      seek(placement.startMs);
    },
    [seek, select],
  );

  /*
   * A move is announced rather than shown moving: the strip re-orders under the operator, and a
   * screen reader that only hears the new focus target cannot tell a reorder from a plain move of
   * the cursor. Focus follows the clip itself, keyed on the list so it lands after the re-render.
   */
  useEffect(() => {
    const clipId = focusClipIdRef.current;
    if (clipId === null) return;
    focusClipIdRef.current = null;
    stripRef.current?.querySelector<HTMLElement>(`[data-clip-id="${clipId}"]`)?.focus();
  }, [placements]);

  const moveBy = useCallback(
    (placement: CompositionPlacement, delta: number) => {
      const toIndex = placement.index + delta;
      if (toIndex < 0 || toIndex >= placements.length) return;
      if (!move(placement.clip.id, toIndex)) return;
      focusClipIdRef.current = placement.clip.id;
      setAnnouncement(`Clip moved to position ${toIndex + 1} of ${placements.length}.`);
    },
    [move, placements.length],
  );

  const onStripKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, placement: CompositionPlacement) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (step !== 0) {
        event.preventDefault();
        // Alt reorders; the bare arrow moves the selection, which is the listbox pattern's own
        // split between "which option" and "do something to it".
        if (event.altKey) {
          moveBy(placement, step);
          return;
        }
        const next = placements[placement.index + step];
        if (next !== undefined) selectPlacement(next);
        return;
      }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault();
        const next = event.key === 'Home' ? placements[0] : placements.at(-1);
        if (next !== undefined) selectPlacement(next);
      }
    },
    [moveBy, placements, selectPlacement],
  );

  // The preview is a still: one element at the selected clip's in-point, seeked whenever the clip
  // or the playhead moves inside it.
  useEffect(() => {
    const video = videoRef.current;
    if (video === null || selectedClip === null || selectedMedia === null) return;
    const mediaMs = clipMediaMsAt(selectedClip, playheadMs);
    const seconds = mediaMs / 1_000;
    if (Number.isFinite(seconds) && Math.abs(video.currentTime - seconds) > 0.05) {
      video.currentTime = seconds;
    }
  }, [playheadMs, selectedClip, selectedMedia]);

  if (arrangement === null) {
    /*
     * A Project holds media long before anyone arranges it, so the first clip is made here rather
     * than found. It stands over the cut the revision presents — the video the Project is already
     * working from — trimmed to the whole of it, which is the arrangement that renders to exactly
     * what the Project produces today.
     */
    const presented = current.revision.snapshot.presentedMedia;
    const presentedMedia = presented === null ? null : clipMediaOf(media, presented);
    return (
      <section css={compositionSurfaceStyles(theme)} data-composition-surface>
        <header css={captionCss}>
          <h2>Arrange</h2>
          <Button variant="quiet" onClick={onClose}>
            Back to the Project
          </Button>
        </header>
        {presented === null || presentedMedia === null ? (
          <StatusNotice role="status" tone="neutral" title="Nothing to arrange yet">
            This Project has no video to arrange. Add media to it first, and its first clip is made
            from the video it works from.
          </StatusNotice>
        ) : (
          <>
            <StatusNotice role="status" tone="neutral" title="Not arranged yet">
              {`This Project works from “${presentedMedia.filename}”. Arranging it starts with that video as one clip, which you can then split, trim and add to. Nothing changes until you do.`}
            </StatusNotice>
            <div>
              <Button
                variant="primary"
                disabled={blocked}
                onClick={() => arrange(presented, presentedMedia.durationMs)}
              >
                Arrange this video
              </Button>
            </div>
          </>
        )}
      </section>
    );
  }

  return (
    <section css={compositionSurfaceStyles(theme)} data-composition-surface>
      <header css={captionCss}>
        <h2>Arrange</h2>
        <span>
          {`${placements.length} ${placements.length === 1 ? 'clip' : 'clips'} · ${formatVideoEditTimelineTime(durationMs)}`}
        </span>
        <Button variant="quiet" onClick={onClose}>
          Back to the Project
        </Button>
      </header>

      <ul
        ref={stripRef}
        css={clipStripStyles(theme)}
        role="listbox"
        aria-orientation="horizontal"
        aria-label="Clips in this arrangement"
      >
        {placements.map((placement) => {
          const held = clipMediaOf(media, placement.clip.media);
          const selected = placement.clip.id === selectedClip?.clip.id;
          const label = held?.filename ?? 'Unavailable media';
          return (
            <li key={placement.clip.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                data-clip-id={placement.clip.id}
                data-unresolved={held === null}
                // Roving tabindex: one stop for the whole strip, and the arrows move within it.
                tabIndex={selected ? 0 : -1}
                css={selected ? selectedTileCss : tileCss}
                onClick={() => selectPlacement(placement)}
                onKeyDown={(event) => onStripKeyDown(event, placement)}
              >
                <span>{label}</span>
                <small>
                  {`Clip ${placement.index + 1} of ${placements.length} · ${formatVideoEditTimelineTime(
                    placement.endMs - placement.startMs,
                  )}`}
                </small>
                {held === null ? <small>Unavailable</small> : null}
              </button>
            </li>
          );
        })}
      </ul>

      <div css={captionCss}>
        <Button
          disabled={blocked || splitRefusal !== null}
          onClick={split}
          aria-describedby={splitRefusal === null ? undefined : 'composition-split-reason'}
        >
          Split at playhead
        </Button>
        <Button variant="quiet" disabled={!canUndo} onClick={undo}>
          Undo
        </Button>
        <Button variant="quiet" disabled={!canRedo} onClick={redo}>
          Redo
        </Button>
      </div>
      {splitRefusal === null ? null : (
        <StatusNotice
          id="composition-split-reason"
          role="status"
          tone="neutral"
          title="Cannot split here"
        >
          {SPLIT_REFUSAL_NOTICE[splitRefusal]}
        </StatusNotice>
      )}

      <EditRange
        label="Playhead"
        value={playheadMs}
        minimum={0}
        maximum={Math.max(durationMs, 1)}
        step={10}
        format={formatVideoEditTimelineTime}
        onStart={() => undefined}
        onChange={seek}
        onCommit={() => undefined}
      />

      <div css={compositionLayoutStyles(theme)}>
        <div css={compositionPreviewStyles(theme)}>
          {selectedClip === null ? (
            <StatusNotice role="status" tone="neutral" title="No clip selected">
              Choose a clip above to see it and change it.
            </StatusNotice>
          ) : selectedMedia === null ? (
            <StatusNotice role="alert" tone="warning" title="Media unavailable">
              {MEDIA_MISSING_NOTICE}
            </StatusNotice>
          ) : (
            <>
              {/* A clip's own media carries no captions track; subtitles are the arrangement's. */}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRef}
                src={selectedMedia.contentUrl}
                preload="metadata"
                controls={false}
                aria-label={`Preview of ${selectedMedia.filename}`}
              />
              <small>
                Showing the selected clip. Playing the whole arrangement through its cuts comes with
                stitched rendering.
              </small>
            </>
          )}
        </div>

        <div css={compositionInspectorStyles(theme)}>
          {selectedClip === null ? null : (
            <>
              <h3>{selectedMedia?.filename ?? 'Unavailable media'}</h3>
              <EditRange
                label="Clip starts at"
                value={selectedClip.clip.trim.startMs}
                minimum={0}
                maximum={Math.max(selectedClip.clip.trim.endMs - VIDEO_EDIT_MINIMUM_TRIM_MS, 0)}
                step={10}
                format={formatVideoEditTimelineTime}
                onStart={() => undefined}
                onChange={(value) =>
                  trim(selectedClip.clip.id, value, selectedClip.clip.trim.endMs)
                }
                onCommit={() => undefined}
              />
              <EditRange
                label="Clip ends at"
                value={selectedClip.clip.trim.endMs}
                minimum={selectedClip.clip.trim.startMs + VIDEO_EDIT_MINIMUM_TRIM_MS}
                maximum={Math.max(
                  selectedMedia?.durationMs ?? selectedClip.clip.trim.endMs,
                  selectedClip.clip.trim.endMs,
                )}
                step={10}
                format={formatVideoEditTimelineTime}
                onStart={beginGesture}
                onChange={(value) =>
                  trim(selectedClip.clip.id, selectedClip.clip.trim.startMs, value)
                }
                onCommit={endGesture}
              />
              <EditRange
                label="Clip volume"
                value={selectedClip.clip.audio.level}
                minimum={0}
                maximum={VIDEO_EDIT_AUDIO_LEVEL_MAX}
                step={1}
                format={(value) => `${value}%`}
                onStart={beginGesture}
                onChange={(level) =>
                  audio(selectedClip.clip.id, { ...selectedClip.clip.audio, level })
                }
                onCommit={endGesture}
              />
              <Button
                variant="quiet"
                disabled={blocked}
                onClick={() =>
                  audio(selectedClip.clip.id, {
                    ...selectedClip.clip.audio,
                    muted: !selectedClip.clip.audio.muted,
                  })
                }
              >
                {selectedClip.clip.audio.muted ? 'Unmute this clip' : 'Mute this clip'}
              </Button>
              <div css={captionCss}>
                <Button
                  variant="quiet"
                  disabled={blocked || selectedClip.index === 0}
                  onClick={() => moveBy(selectedClip, -1)}
                >
                  Move earlier
                </Button>
                <Button
                  variant="quiet"
                  disabled={blocked || selectedClip.index === placements.length - 1}
                  onClick={() => moveBy(selectedClip, 1)}
                >
                  Move later
                </Button>
              </div>
              <Button
                variant="danger"
                disabled={blocked}
                onClick={() => {
                  const wasLast = placements.length === 1;
                  if (!remove(selectedClip.clip.id)) return;
                  setAnnouncement(
                    wasLast
                      ? 'The last clip was removed, so this Project is no longer arranged.'
                      : 'Clip removed from the arrangement.',
                  );
                }}
              >
                Remove this clip
              </Button>
            </>
          )}
          {archived ? (
            <StatusNotice role="status" tone="warning" title="Read-only Project">
              This Project is archived. Restore it to change its arrangement.
            </StatusNotice>
          ) : null}
        </div>
      </div>

      <VisuallyHidden aria-live="polite">{announcement}</VisuallyHidden>
    </section>
  );
};
