import type { ProjectCurrentResponse } from '@studio/contracts';
import {
  VIDEO_EDIT_HISTORY_LIMIT,
  compositionPlacements,
  type Composition,
  type CompositionPlacement,
  type ProjectMediaReference,
  type VideoEditAudio,
} from '@studio/domain';
import {
  appendClip,
  clipOverMedia,
  compositionIsFull,
  compositionOverMedia,
  compositionSplitRefusal,
  compositionsEqual,
  moveClip,
  removeClip,
  setClipAudio,
  setClipTrim,
  splitCompositionAt,
  type CompositionSplitRefusal,
} from '@studio/domain/composition';
import { useCallback, useMemo, useState } from 'react';
import type { ProjectSessionPort } from '../projects/useProjectSession';

interface CompositionHistory {
  readonly past: readonly (Composition | null)[];
  readonly future: readonly (Composition | null)[];
}

const EMPTY_HISTORY: CompositionHistory = { past: [], future: [] };

/**
 * The arrangement the timeline edits, and the gestures it makes on it.
 *
 * Deliberately not `useVideoEditSession`, and the difference is lifecycle rather than size. That one
 * owns one clip's worth of owned bytes, opens from the stage, renders once, and forgets — it
 * persists nothing, and what it eventually stores is a receipt for pixels already baked in. This
 * owns a durable server document: it is hydrated from the snapshot, staged through the Project
 * session's own proposal, autosaved on the session's interval, and read back on the next visit.
 * Widening one hook to cover both would put two lifecycles behind one owner.
 *
 * The undo stack is this hook's own rather than shared with the single-clip editor's. They hold
 * different types, normalize against different things, and the shared extraction is slice 4.5's —
 * duplicating one small stack deliberately is cheaper than reshaping the hook that sits behind the
 * editor's whole regression suite for no gain here.
 */
export const useCompositionSession = (
  session: ProjectSessionPort,
  current: ProjectCurrentResponse,
  createId: () => string = () => crypto.randomUUID(),
) => {
  const [history, setHistory] = useState<CompositionHistory>(EMPTY_HISTORY);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [playheadMs, setPlayheadMs] = useState(0);
  /**
   * A continuous gesture in flight — a slider being dragged — with the arrangement it started from.
   *
   * Held here rather than staged per input event, which is what a range control fires. Staged, one
   * drag of a trim handle proposed sixty arrangements a second, each one re-validating the whole
   * proposal, and pushed sixty undo entries — filling the history with tenth-of-a-second steps and
   * putting the arrangement the operator started from out of reach. This is the shape `EditRange`
   * was written for and the single-clip editor already uses: preview while it moves, one entry when
   * it lands.
   */
  const [gesture, setGesture] = useState<{
    readonly start: Composition;
    readonly value: Composition;
  } | null>(null);

  /*
   * The gesture in flight first, then the pending proposal, then the settled snapshot. A staged
   * arrangement is what the operator is looking at, and reading the snapshot alone would make every
   * gesture appear to revert until the autosave landed.
   */
  /*
   * `proposal === null` is the only "nothing is staged". A proposal's own `composition` is
   * required and nullable, so `??` would read a *deliberately* staged `null` — the last clip
   * removed, or an undo back past the first arrangement — as absent and fall through to the
   * arrangement the snapshot still holds. The surface then says the Project is no longer arranged
   * while the strip still shows a clip, and only the autosave landing makes it true.
   */
  const stored =
    session.proposal === null
      ? current.revision.snapshot.composition
      : session.proposal.composition;
  const composition = gesture?.value ?? stored;
  const placements = useMemo<readonly CompositionPlacement[]>(
    () => (composition === null ? [] : compositionPlacements(composition)),
    [composition],
  );
  // The prefix sum's last edge is the sequence length; re-reducing the clips would be a second pass.
  const durationMs = placements.at(-1)?.endMs ?? 0;

  /** Staged, not written: the session owns the write, its compare-and-set and its interval. */
  const stage = useCallback(
    (next: Composition | null, previous: Composition | null): boolean => {
      if (next !== null && previous !== null && compositionsEqual(next, previous)) return false;
      if (!session.propose({ composition: next })) return false;
      setHistory(({ past }) => ({
        past: [...past, previous].slice(-VIDEO_EDIT_HISTORY_LIMIT),
        future: [],
      }));
      return true;
    },
    [session],
  );

  /**
   * Runs one gesture over the arrangement as it stands.
   *
   * Gestures are refused rather than thrown here: the domain throws when asked for something it
   * cannot represent, and a control that reached that state is one this surface should not have
   * offered. Refusing keeps a bug in the editor from taking the operator's click out of the app.
   */
  const edit = useCallback(
    (change: (held: Composition) => Composition | null): boolean => {
      if (composition === null) return false;
      try {
        const next = change(composition);
        // Mid-gesture the arrangement is previewed, not staged: one proposal and one undo entry are
        // owed when it lands. A gesture never un-arranges, so `null` there is a refusal.
        if (gesture !== null) {
          if (next === null) return false;
          setGesture((held) => (held === null ? held : { ...held, value: next }));
          return true;
        }
        return stage(next, composition);
      } catch {
        return false;
      }
    },
    [composition, gesture, stage],
  );

  /** Opens a continuous gesture, remembering what it is changing away from. */
  const beginGesture = useCallback(() => {
    if (composition === null) return;
    setGesture((held) => held ?? { start: composition, value: composition });
  }, [composition]);

  /** Closes it, staging the whole drag as one change and one undo entry — or nothing, if it moved back. */
  const endGesture = useCallback(() => {
    setGesture((held) => {
      if (held !== null && !compositionsEqual(held.value, held.start)) {
        stage(held.value, held.start);
      }
      return null;
    });
  }, [stage]);

  const selectedClip = useMemo(
    () => placements.find(({ clip }) => clip.id === selectedClipId) ?? null,
    [placements, selectedClipId],
  );

  const splitRefusal = useMemo<CompositionSplitRefusal | null>(
    () => (composition === null ? 'empty' : compositionSplitRefusal(composition, playheadMs)),
    [composition, playheadMs],
  );

  const split = useCallback(() => {
    // The new half is the right one, so the selection stays on the clip the operator was pointing
    // at — which is the half that keeps the id.
    edit((held) => splitCompositionAt(held, playheadMs, createId));
  }, [createId, edit, playheadMs]);

  /**
   * Arranges a Project that never has been, from the media it is already working from.
   *
   * The first clip is made rather than found: a Project holds media long before anyone arranges it,
   * and `composition` stays `null` until someone does. Seeded on the operator's press instead of on
   * open, so looking at the arrangement writes no revision — and so the one clip they get is one
   * they asked for.
   */
  const arrange = useCallback(
    (media: ProjectMediaReference, durationMs: number): boolean =>
      composition !== null ? false : stage(compositionOverMedia(media, durationMs, createId), null),
    [composition, createId, stage],
  );

  /**
   * Adds one of the Project's videos as the last clip, the whole of it, and selects it. Answers
   * the new clip's id, or `null` when the add was refused, so the surface can put focus on it.
   *
   * At the end rather than after the selection or at the playhead: the strip is an ordered list
   * and the operator already has two ways to move a clip once it is there, where an insertion
   * point the surface had to explain would be a third idea for the same gesture. The playhead
   * moves to the new clip's start — where the sequence ended a moment ago — so the still and the
   * selection agree, as they do when a clip is chosen from the strip.
   */
  const add = useCallback(
    (media: ProjectMediaReference, mediaDurationMs: number): string | null => {
      const id = createId();
      const startsAtMs = durationMs;
      if (!edit((held) => appendClip(held, clipOverMedia(media, mediaDurationMs, id)))) return null;
      setSelectedClipId(id);
      setPlayheadMs(startsAtMs);
      return id;
    },
    [createId, durationMs, edit],
  );

  const move = useCallback(
    (clipId: string, toIndex: number) => edit((held) => moveClip(held, clipId, toIndex)),
    [edit],
  );

  const remove = useCallback(
    (clipId: string) => {
      const removed = edit((held) => removeClip(held, clipId));
      if (removed && clipId === selectedClipId) setSelectedClipId(null);
      return removed;
    },
    [edit, selectedClipId],
  );

  const trim = useCallback(
    (clipId: string, startMs: number, endMs: number) =>
      edit((held) => setClipTrim(held, clipId, { startMs, endMs })),
    [edit],
  );

  const audio = useCallback(
    (clipId: string, next: VideoEditAudio) => edit((held) => setClipAudio(held, clipId, next)),
    [edit],
  );

  /**
   * Steps the arrangement back through the same door every gesture used.
   *
   * An undo proposes the earlier arrangement rather than rewinding the session, because the session
   * may already have written the one being undone — a checkpoint is not reversible, and proposing
   * the earlier value is the honest way to get back to it.
   */
  const undo = useCallback(() => {
    setHistory(({ past, future }) => {
      const previous = past.at(-1);
      if (previous === undefined) return { past, future };
      // The boundary below says this is unreachable; the guard keeps it true if that changes.
      if (previous === null) return { past, future };
      if (!session.propose({ composition: previous })) return { past, future };
      return {
        past: past.slice(0, -1),
        future: [composition, ...future].slice(0, VIDEO_EDIT_HISTORY_LIMIT),
      };
    });
  }, [composition, session]);

  const redo = useCallback(() => {
    setHistory(({ past, future }) => {
      const [next, ...rest] = future;
      if (next === undefined) return { past, future };
      if (!session.propose({ composition: next })) return { past, future };
      return { past: [...past, composition].slice(-VIDEO_EDIT_HISTORY_LIMIT), future: rest };
    });
  }, [composition, session]);

  const seek = useCallback(
    (nextMs: number) => setPlayheadMs(Math.min(Math.max(nextMs, 0), durationMs)),
    [durationMs],
  );

  return {
    composition,
    placements,
    durationMs,
    playheadMs,
    seek,
    selectedClip,
    select: setSelectedClipId,
    splitRefusal,
    split,
    arrange,
    add,
    // Asked before the add is offered, the way the split's refusal is: a full arrangement gets a
    // disabled control with its reason, not a press that fails.
    atLimit: composition !== null && compositionIsFull(composition),
    beginGesture,
    endGesture,
    move,
    remove,
    trim,
    audio,
    undo,
    redo,
    /*
     * `null` in the history is the Project before it was arranged, which `arrange` records so the
     * entry counts. Stepping into it would land on the un-arranged screen, which is one button and
     * carries no Redo — a history nothing on screen could reach. The arrangement's own beginning is
     * where Undo stops.
     */
    canUndo: history.past.at(-1) != null,
    canRedo: history.future.length > 0,
  } as const;
};
