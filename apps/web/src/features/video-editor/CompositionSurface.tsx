import { useTheme } from '@emotion/react';
import type { ProjectCurrentResponse } from '@studio/contracts';
import {
  VIDEO_EDIT_AUDIO_LEVEL_MAX,
  VIDEO_EDIT_MINIMUM_TRIM_MS,
  clipMediaMsAt,
  compositionsEqual,
  type CompositionPlacement,
  type CompositionSplitRefusal,
} from '@studio/domain';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { Button, StatusNotice, VisuallyHidden } from '../../ui';
import {
  clipMediaOf,
  type ProjectClipMedia,
  type ProjectClipMediaCatalogue,
  type ProjectClipMediaEntry,
} from '../projects/projectClipMedia';
import type { ProjectClipMediaCatalogueStatus } from '../projects/useProjectMediaController';
import type { ProjectSessionPort } from '../projects/useProjectSession';
import { VideoPlayer } from '../video-player/VideoPlayer';
import { CompositionClipPicker } from './CompositionClipPicker';
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
import type { CompositionRenderPlan } from './types';
import { useCompositionRender } from './useCompositionRender';
import { useCompositionSession } from './useCompositionSession';
import { useVideoEditExportSupport } from './useVideoEditExportSupport';
import { renderProgressStyles } from './VideoEditWorkspace.styles';

const SPLIT_REASON_ID = 'composition-split-reason';
const ARRANGEMENT_FULL_REASON_ID = 'composition-full-reason';

/**
 * Why the cut the operator is pointing at cannot be made, in words rather than as a dead control.
 *
 * Each reason carries the notice that says it, because a full arrangement refuses the split and the
 * add for the one reason: that one names the shared notice, both controls describe themselves by
 * it, and it is said once rather than twice in slightly different words one above the other.
 */
const SPLIT_REFUSAL_NOTICE: Record<
  CompositionSplitRefusal,
  { readonly id: string; readonly title: string; readonly text: string }
> = {
  empty: {
    id: SPLIT_REASON_ID,
    title: 'Cannot split here',
    text: 'Arrange at least one clip before splitting.',
  },
  'at-cut': {
    id: SPLIT_REASON_ID,
    title: 'Cannot split here',
    text: 'The playhead is already on a cut. Move it inside a clip to split there.',
  },
  'too-short': {
    id: SPLIT_REASON_ID,
    title: 'Cannot split here',
    text: 'A split here would leave a clip under a tenth of a second.',
  },
  'at-limit': {
    id: ARRANGEMENT_FULL_REASON_ID,
    title: 'Arrangement full',
    text: 'This arrangement holds as many clips as it can. Remove a clip before splitting or adding another.',
  },
};

const MEDIA_MISSING_NOTICE =
  'This clip stands over media this Project can no longer open. Remove it, or restore the video it came from.';

/**
 * An add the session would not stage. The session's own message goes to the Project route, which
 * this surface hides while it has the stage, so the refusal is said here or not at all.
 */
const ADD_REFUSED_NOTICE = 'That video could not be added. Your arrangement is unchanged.';

const RENDER_UNSUPPORTED_NOTICE =
  'This browser cannot render this arrangement without blocking the Studio. Your clips are unchanged, and you can keep arranging.';

const unresolvedRenderNotice = (count: number): string =>
  count === 1
    ? '1 clip stands over media this Project can no longer open. Remove it, or restore the video, before rendering.'
    : `${count} clips stand over media this Project can no longer open. Remove them, or restore the videos, before rendering.`;

const frameLabel = (plan: CompositionRenderPlan): string =>
  `${plan.video.target.width}×${plan.video.target.height}`;

const soundLabel = (channels: number): string => (channels === 1 ? 'mono' : 'stereo');

/**
 * What the render did to one clip, in the words the plan's labels stand for. Nothing for a clip
 * the render left exactly as it was.
 */
const clipRenderNotices = (
  plan: CompositionRenderPlan,
  placement: CompositionPlacement,
  held: ProjectClipMedia | null,
): readonly string[] => {
  const notices: string[] = [];
  const video = plan.video.clips[placement.index];
  if (video === 'scaled') notices.push(`Scaled to the arrangement's ${frameLabel(plan)} frame.`);
  if (video === 'letterboxed') {
    notices.push(
      `Shown with bars: its shape differs from the arrangement's ${frameLabel(plan)} frame.`,
    );
  }
  const audio = plan.audio?.clips[placement.index];
  if (plan.audio && audio !== undefined) {
    const rate = `${plan.audio.target.sampleRate / 1_000} kHz`;
    const layout = soundLabel(plan.audio.target.numberOfChannels);
    if (audio === 'resampled' || audio === 'resampled-and-remixed') {
      notices.push(`Its sound is resampled to ${rate}.`);
    }
    if (audio === 'remixed' || audio === 'resampled-and-remixed') {
      notices.push(`Its sound is folded to ${layout}.`);
    }
    if (audio === 'silence') {
      notices.push(
        placement.clip.audio.muted
          ? 'Muted: silent in the render.'
          : held?.hasAudio === false
            ? 'This clip has no sound; it is silent in the render.'
            : 'Silent in the render.',
      );
    }
  }
  return notices;
};

export interface CompositionSurfaceProps {
  readonly current: ProjectCurrentResponse;
  readonly session: ProjectSessionPort;
  /** Everything a clip may stand over, already resolved, in the order the Project lists it. */
  readonly media: ProjectClipMediaCatalogue;
  /** Where the read behind `media` has got to, so an empty list of videos to add can say why. */
  readonly mediaStatus: ProjectClipMediaCatalogueStatus;
  /** Asks for the Project's media again after a failed read. */
  readonly onRetryMedia: () => void;
  readonly archived: boolean;
  readonly onClose: () => void;
  /** Whether a render is in flight, for the guard that must not abandon a worker. */
  readonly onRenderingChange?: ((busy: boolean) => void) | undefined;
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
 * Two previews, deliberately. While arranging, the selected clip is shown at its in-point, still.
 * **Render arrangement** produces the stitched file through the worker and plays *that*: it is the
 * one preview that is exactly what the arrangement produces — same frame, same sound, same burned-in
 * cues — where a live player crossing cuts would be an approximation that disagrees with the file.
 * The rendered file is kept nowhere; saving an arrangement is the next slice's.
 */
export const CompositionSurface = ({
  current,
  session,
  media,
  mediaStatus,
  onRetryMedia,
  archived,
  onClose,
  onRenderingChange,
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
    add,
    atLimit,
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
  // Asked only once there is something to render: the probe encodes a frame to answer.
  const supported = useVideoEditExportSupport(arrangement !== null);
  const render = useCompositionRender();
  const rendering = render.phase === 'rendering' || render.phase === 'validating';
  // Hoisted above the rows: Emotion serialises each of these on every call and the strip runs to
  // `COMPOSITION_CLIP_LIMIT`, so a selected boolean is two objects rather than one per clip.
  const captionCss = clipStripCaptionStyles(theme);
  const tileCss = clipTileStyles(theme, false);
  const selectedTileCss = clipTileStyles(theme, true);
  const stripRef = useRef<HTMLUListElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const addClipRef = useRef<HTMLButtonElement>(null);
  /* The clip a reorder should hand focus back to, held in a ref: the effect below has to run
   * after the strip re-renders, and writing state there would cascade a second render for a value
   * nothing paints. */
  const focusClipIdRef = useRef<string | null>(null);
  /*
   * What the live region says, with a count beside it: React writes nothing to the DOM when the
   * same string is set twice, and a screen reader announces a live region only when it changes —
   * so the text is remounted on every announcement, and "Clip removed" twice is heard twice.
   */
  const [announced, setAnnounced] = useState({ text: '', nonce: 0 });
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const [pickingClip, setPickingClip] = useState(false);
  /**
   * What the last choice from the picker did, held until the panel has gone.
   *
   * While a panel is closing, the page behind it is still `inert` and `aria-hidden`: a live region
   * written then is written where nothing can hear it, and the new clip's tile cannot take focus.
   * The panel says when it has left, and both happen then.
   */
  const [addOutcome, setAddOutcome] = useState<{
    readonly clipId: string | null;
    readonly notice: string;
  } | null>(null);
  const announce = useCallback(
    (text: string) => setAnnounced((held) => ({ text, nonce: held.nonce + 1 })),
    [],
  );
  /** The strip's tile for a clip, which is the focusable thing a clip id names. */
  const clipTile = useCallback(
    (clipId: string): HTMLElement | null =>
      stripRef.current?.querySelector<HTMLElement>(`[data-clip-id="${clipId}"]`) ?? null,
    [],
  );
  // A render reads the arrangement as it stands; no gesture may change it underneath.
  const blocked = archived || rendering;

  const selectedMedia = useMemo(
    () => (selectedClip === null ? null : clipMediaOf(media, selectedClip.clip.media)),
    [media, selectedClip],
  );
  /** Every clip's media in sequence order, `null` where this browser cannot open it. */
  const clipMedia = useMemo(
    () => placements.map((placement) => clipMediaOf(media, placement.clip.media)),
    [media, placements],
  );
  const unresolved = clipMedia.filter((held) => held === null).length;
  const stale =
    render.ready !== null &&
    arrangement !== null &&
    !compositionsEqual(render.ready.renderedFrom, arrangement);

  useEffect(() => {
    onRenderingChange?.(rendering);
    return () => onRenderingChange?.(false);
  }, [onRenderingChange, rendering]);

  // Derived rather than set: the phase is the fact, and the live region reads it directly. Only
  // the ready state needs a voice here — the progress region announces the render starting, and
  // the failure notice is an alert of its own.
  const renderAnnouncement = render.phase === 'ready' ? 'The arrangement is rendered.' : '';

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
    clipTile(clipId)?.focus();
  }, [clipTile, placements]);

  const moveBy = useCallback(
    (placement: CompositionPlacement, delta: number) => {
      if (blocked) return;
      const toIndex = placement.index + delta;
      if (toIndex < 0 || toIndex >= placements.length) return;
      if (!move(placement.clip.id, toIndex)) return;
      focusClipIdRef.current = placement.clip.id;
      announce(`Clip moved to position ${toIndex + 1} of ${placements.length}.`);
    },
    [announce, blocked, move, placements.length],
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

  const startRender = useCallback(() => {
    if (arrangement === null || rendering) return;
    const resolved = clipMedia.filter((held): held is ProjectClipMedia => held !== null);
    if (resolved.length !== clipMedia.length) return;
    setPlaybackFailed(false);
    void render.render(arrangement, resolved);
  }, [arrangement, clipMedia, render, rendering]);

  /*
   * A chosen video becomes the last clip and the selected one; the strip re-renders under the
   * closing panel, so the result is said aloud the way a reorder is. The count named is the count
   * after the add — the position the new clip holds.
   */
  const chooseClip = useCallback(
    (entry: ProjectClipMediaEntry) => {
      setPickingClip(false);
      const added = add(entry.reference, entry.media.durationMs);
      const count = placements.length + 1;
      setAddOutcome({
        clipId: added,
        notice:
          added === null
            ? ADD_REFUSED_NOTICE
            : `Added “${entry.media.filename}” as clip ${count} of ${count}.`,
      });
    },
    [add, placements.length],
  );

  const onPickerExited = useCallback(() => {
    if (addOutcome === null) return;
    // The panel has already handed focus back to the control that opened it; a clip that was
    // added takes it from there, because that control is disabled once the arrangement is full —
    // which is exactly the add that must not drop focus on the page.
    if (addOutcome.clipId !== null) clipTile(addOutcome.clipId)?.focus();
    announce(addOutcome.notice);
  }, [addOutcome, announce, clipTile]);

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
                disabled={archived}
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

  const splitReason = splitRefusal === null ? null : SPLIT_REFUSAL_NOTICE[splitRefusal];
  /*
   * The render control is refused with a stated reason, the way the split is: a disabled button
   * with no sentence beside it is a dead end. `null` from the probe is still asking, and says
   * nothing — the same treatment the editor gives it.
   */
  const renderRefusal =
    supported === false
      ? { title: 'Local render unavailable', text: RENDER_UNSUPPORTED_NOTICE }
      : unresolved > 0
        ? { title: 'Media unavailable', text: unresolvedRenderNotice(unresolved) }
        : null;
  const canRender = supported === true && unresolved === 0 && !rendering;
  // A plan describes the arrangement it was made from; after a gesture its per-clip facts would
  // be read against clips that have moved, so they are shown only while the two still agree.
  const plan = stale ? null : render.plan;

  let preview: ReactNode;
  if (render.ready !== null) {
    const { ready } = render;
    preview = (
      <>
        <VideoPlayer
          src={ready.url}
          title="Rendered arrangement"
          onError={() => setPlaybackFailed(true)}
        />
        <small>
          {`Rendered from ${ready.renderedFrom.clips.length} ${ready.renderedFrom.clips.length === 1 ? 'clip' : 'clips'} · ${formatVideoEditTimelineTime(ready.plan.durationMs)} · ${frameLabel(ready.plan)}. This is exactly what the arrangement produces. The file is not kept anywhere; saving an arrangement comes next.`}
        </small>
        {stale ? (
          <StatusNotice role="status" tone="warning" title="Arrangement changed">
            This preview was rendered before your last change. Render again to see the arrangement
            as it is now.
          </StatusNotice>
        ) : null}
        {playbackFailed ? (
          <StatusNotice role="alert" tone="danger" title="Playback failed">
            This browser could not play the rendered file. Render again, or try another browser.
          </StatusNotice>
        ) : null}
        <div css={captionCss}>
          <Button variant="primary" disabled={!canRender} onClick={startRender}>
            Render again
          </Button>
          <Button variant="quiet" onClick={render.discard}>
            Back to editing
          </Button>
        </div>
      </>
    );
  } else if (selectedClip === null) {
    preview = (
      <StatusNotice role="status" tone="neutral" title="No clip selected">
        Choose a clip above to see it and change it.
      </StatusNotice>
    );
  } else if (selectedMedia === null) {
    preview = (
      <StatusNotice role="alert" tone="warning" title="Media unavailable">
        {MEDIA_MISSING_NOTICE}
      </StatusNotice>
    );
  } else {
    preview = (
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
          Showing the selected clip. Render the arrangement to play it through its cuts, exactly as
          it will be.
        </small>
      </>
    );
  }

  return (
    <section css={compositionSurfaceStyles(theme)} data-composition-surface>
      <header css={captionCss}>
        <h2>Arrange</h2>
        <span>
          {`${placements.length} ${placements.length === 1 ? 'clip' : 'clips'} · ${formatVideoEditTimelineTime(durationMs)}`}
          {plan === null ? '' : ` · renders at ${frameLabel(plan)}`}
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
          const held = clipMedia[placement.index] ?? null;
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
          aria-describedby={splitReason?.id}
        >
          Split at playhead
        </Button>
        <Button
          ref={addClipRef}
          disabled={blocked || atLimit}
          onClick={() => {
            setAddOutcome(null);
            setPickingClip(true);
          }}
          aria-describedby={atLimit ? ARRANGEMENT_FULL_REASON_ID : undefined}
        >
          Add a clip
        </Button>
        <Button variant="quiet" disabled={!canUndo || rendering} onClick={undo}>
          Undo
        </Button>
        <Button variant="quiet" disabled={!canRedo || rendering} onClick={redo}>
          Redo
        </Button>
        <Button
          variant="primary"
          disabled={!canRender}
          onClick={startRender}
          aria-describedby={renderRefusal === null ? undefined : 'composition-render-reason'}
        >
          Render arrangement
        </Button>
      </div>
      {splitReason === null ? null : (
        <StatusNotice id={splitReason.id} role="status" tone="neutral" title={splitReason.title}>
          {splitReason.text}
        </StatusNotice>
      )}
      {addOutcome?.clipId === null ? (
        <StatusNotice role="alert" tone="danger" title="Clip not added">
          {ADD_REFUSED_NOTICE}
        </StatusNotice>
      ) : null}
      {renderRefusal === null ? null : (
        <StatusNotice
          id="composition-render-reason"
          role="status"
          tone="warning"
          title={renderRefusal.title}
        >
          {renderRefusal.text}
        </StatusNotice>
      )}
      {rendering ? (
        <div css={renderProgressStyles(theme)} role="status" aria-live="polite">
          <span>
            <strong>
              {render.phase === 'validating'
                ? 'Checking the rendered file'
                : 'Rendering the arrangement'}
            </strong>
            <span>{`${Math.round(render.progress * 100)}%`}</span>
          </span>
          <progress max={1} value={render.progress} />
          {plan === null ? null : (
            <small>
              {`Rendering at ${frameLabel(plan)}${plan.audio === null ? ', without sound' : `, sound at ${plan.audio.target.sampleRate / 1_000} kHz ${soundLabel(plan.audio.target.numberOfChannels)}`}.`}
            </small>
          )}
          <Button size="small" variant="quiet" onClick={render.cancel}>
            Cancel render
          </Button>
          <small>Leaving this surface cancels the render. Nothing is saved.</small>
        </div>
      ) : null}
      {render.phase === 'error' && render.error !== null ? (
        <StatusNotice role="alert" tone="danger" title="Render failed">
          {`${render.error} Nothing in this Project was changed.`}
          <div css={captionCss}>
            <Button size="small" disabled={!canRender} onClick={startRender}>
              Try again
            </Button>
            <Button size="small" variant="quiet" onClick={render.discard}>
              Dismiss
            </Button>
          </div>
        </StatusNotice>
      ) : null}
      {plan?.audio?.fellBack ? (
        <StatusNotice role="status" tone="neutral" title="Sound format">
          {`Sound is encoded at ${plan.audio.target.sampleRate / 1_000} kHz ${soundLabel(plan.audio.target.numberOfChannels)} because this browser cannot encode the clips' own format.`}
        </StatusNotice>
      ) : null}

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
        <div css={compositionPreviewStyles(theme)}>{preview}</div>

        <div css={compositionInspectorStyles(theme)}>
          {selectedClip === null ? null : (
            <>
              <h3>{selectedMedia?.filename ?? 'Unavailable media'}</h3>
              {plan === null
                ? null
                : clipRenderNotices(plan, selectedClip, selectedMedia).map((notice) => (
                    <small key={notice} data-clip-render-notice>
                      {notice}
                    </small>
                  ))}
              <EditRange
                label="Clip starts at"
                value={selectedClip.clip.trim.startMs}
                minimum={0}
                maximum={Math.max(selectedClip.clip.trim.endMs - VIDEO_EDIT_MINIMUM_TRIM_MS, 0)}
                step={10}
                format={formatVideoEditTimelineTime}
                disabled={blocked}
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
                disabled={blocked}
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
                disabled={blocked}
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
                  announce(
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
              This Project is archived. Restore it to change its arrangement. You can still render a
              preview of it.
            </StatusNotice>
          ) : null}
        </div>
      </div>

      <CompositionClipPicker
        open={pickingClip}
        media={media}
        status={mediaStatus}
        onRetry={onRetryMedia}
        composition={arrangement}
        returnFocusRef={addClipRef}
        onClose={() => setPickingClip(false)}
        onExited={onPickerExited}
        onChoose={chooseClip}
      />

      {/* `status` is what makes these live; an `aria-live` attribute on the primitive is dropped. */}
      <VisuallyHidden role="status">
        <span key={announced.nonce}>{announced.text}</span>
      </VisuallyHidden>
      <VisuallyHidden role="status">{renderAnnouncement}</VisuallyHidden>
    </section>
  );
};
