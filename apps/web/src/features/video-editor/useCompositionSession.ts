import type { ProjectCurrentResponse } from '@studio/contracts';
import {
  compositionDurationMs,
  compositionPlacementAt,
  compositionPlacements,
  compositionSplitRefusal,
  compositionsEqual,
  moveClip,
  removeClip,
  setClipAudio,
  setClipTrim,
  splitCompositionAt,
  type Composition,
  type CompositionClip,
  type CompositionPlacement,
  type CompositionSplitRefusal,
  type VideoEditAudio,
} from '@studio/domain';
import { useCallback, useMemo, useState } from 'react';
import type { ProjectSessionPort } from '../projects/useProjectSession';

/** As many steps back as the single-clip editor keeps, and for the same reason: enough to undo a session. */
const COMPOSITION_HISTORY_LIMIT = 50;

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

  /*
   * The pending proposal first, then the settled snapshot. A staged arrangement is what the
   * operator is looking at, and reading the snapshot alone would make every gesture appear to
   * revert until the autosave landed.
   */
  const composition = session.proposal?.composition ?? current.revision.snapshot.composition;
  const placements = useMemo<readonly CompositionPlacement[]>(
    () => (composition === null ? [] : compositionPlacements(composition)),
    [composition],
  );
  const durationMs = composition === null ? 0 : compositionDurationMs(composition);

  /** Staged, not written: the session owns the write, its compare-and-set and its interval. */
  const stage = useCallback(
    (next: Composition | null, previous: Composition | null): boolean => {
      if (next !== null && previous !== null && compositionsEqual(next, previous)) return false;
      if (!session.propose({ composition: next })) return false;
      setHistory(({ past }) => ({
        past: [...past, previous].slice(-COMPOSITION_HISTORY_LIMIT),
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
    (gesture: (held: Composition) => Composition | null): boolean => {
      if (composition === null) return false;
      try {
        return stage(gesture(composition), composition);
      } catch {
        return false;
      }
    },
    [composition, stage],
  );

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
    (clip: CompositionClip): boolean =>
      composition !== null ? false : stage({ clips: [clip], subtitles: [] }, null),
    [composition, stage],
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
      if (!session.propose({ composition: previous })) return { past, future };
      return {
        past: past.slice(0, -1),
        future: [composition, ...future].slice(0, COMPOSITION_HISTORY_LIMIT),
      };
    });
  }, [composition, session]);

  const redo = useCallback(() => {
    setHistory(({ past, future }) => {
      const [next, ...rest] = future;
      if (next === undefined) return { past, future };
      if (!session.propose({ composition: next })) return { past, future };
      return { past: [...past, composition].slice(-COMPOSITION_HISTORY_LIMIT), future: rest };
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
    /** What the playhead is over, which is what the preview shows and what a split would cut. */
    placementAtPlayhead:
      composition === null ? null : compositionPlacementAt(composition, playheadMs),
    selectedClipId,
    selectedClip,
    select: setSelectedClipId,
    splitRefusal,
    split,
    arrange,
    move,
    remove,
    trim,
    audio,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  } as const;
};
