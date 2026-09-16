import type { Composition } from '@studio/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { validateEditedVideoOutput } from '../existing-video/videoValidation';
import type { ProjectClipMedia } from '../projects/projectClipMedia';
import { compositionRenderMediaOf, renderComposition } from './renderComposition';
import type { CompositionRenderPlan } from './types';

export type CompositionRenderPhase = 'idle' | 'rendering' | 'validating' | 'ready' | 'error';

/** A rendered arrangement the surface can play: the file, a URL for it, and what it was made from. */
export interface CompositionRenderReady {
  readonly blob: Blob;
  readonly url: string;
  readonly plan: CompositionRenderPlan;
  /** So a gesture after the render can be told from the arrangement it shows. */
  readonly renderedFrom: Composition;
}

/** The validator's file name; nothing is saved under it. */
const PREVIEW_FILENAME = 'arrangement.mp4';

/**
 * One arrangement render at a time: asked for, watched, cancelled, played, let go.
 *
 * Its own hook rather than a widening of `useCompositionSession`, which owns a durable server
 * document, or of `useVideoEditSession`, which is mounted on every Studio route and owns one clip's
 * bytes for the inverse lifecycle. This owns transient bytes for as long as the surface shows
 * them: the Blob, an object URL made for it as the render settles and revoked by the next render,
 * a discard or the unmount, and the plan the worker decided before paying for anything.
 *
 * The rendered file is validated before it is shown, the way the single-clip editor validates
 * before offering adoption, against the plan's own frame and the sequence length — which is the
 * claim "this preview is exactly what the arrangement produces" being checked rather than assumed.
 */
export const useCompositionRender = () => {
  const [phase, setPhase] = useState<CompositionRenderPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [plan, setPlan] = useState<CompositionRenderPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<CompositionRenderReady | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  /** The file on show, for the unmount to revoke without a stale closure. */
  const readyRef = useRef<CompositionRenderReady | null>(null);

  /** Lets the file on show go, URL included. */
  const letGo = useCallback(() => {
    const held = readyRef.current;
    if (held !== null) {
      URL.revokeObjectURL(held.url);
      readyRef.current = null;
    }
    setReady(null);
  }, []);

  useEffect(
    () => () => {
      controllerRef.current?.abort('unmount');
      const held = readyRef.current;
      if (held !== null) URL.revokeObjectURL(held.url);
    },
    [],
  );

  const render = useCallback(
    async (composition: Composition, media: readonly ProjectClipMedia[]): Promise<void> => {
      if (controllerRef.current !== null) return;
      // Claimed before the first await, so two presses in one frame cannot both spawn a worker.
      const controller = new AbortController();
      controllerRef.current = controller;
      setError(null);
      setPlan(null);
      letGo();
      setProgress(0);
      setPhase('rendering');
      try {
        const outcome = await renderComposition({
          composition,
          media: media.map(compositionRenderMediaOf),
          signal: controller.signal,
          onProgress: setProgress,
          onPlan: setPlan,
        });
        // A cancel that lands as the worker finishes still resolves the file; it is a cancel all
        // the same, and the catch below is the one place that says so.
        controller.signal.throwIfAborted();
        setPhase('validating');
        await validateEditedVideoOutput(
          outcome.blob,
          {
            width: outcome.plan.video.target.width,
            height: outcome.plan.video.target.height,
            durationMs: outcome.plan.durationMs,
            requireAudio: outcome.plan.audio !== null,
            filename: PREVIEW_FILENAME,
          },
          controller.signal,
        );
        controller.signal.throwIfAborted();
        setProgress(1);
        const next: CompositionRenderReady = {
          blob: outcome.blob,
          url: URL.createObjectURL(outcome.blob),
          plan: outcome.plan,
          renderedFrom: composition,
        };
        readyRef.current = next;
        setReady(next);
        setPhase('ready');
      } catch (renderError) {
        // A plan describes a file; with none coming, keeping it would leave the frame it named on
        // show and its per-clip facts readable against clips that have since moved.
        setPlan(null);
        // A cancel is not an error: the operator asked, and the arrangement is as it was.
        if (controller.signal.aborted) {
          setProgress(0);
          setPhase('idle');
          return;
        }
        setError(
          renderError instanceof Error
            ? renderError.message
            : 'The browser could not render this arrangement.',
        );
        setPhase('error');
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [letGo],
  );

  /** Asks the worker to stop; the phase settles once it has, or once the client gives up on it. */
  const cancel = useCallback(() => {
    controllerRef.current?.abort('cancelled');
  }, []);

  /** Lets the rendered file go and returns to the arrangement as it is. */
  const discard = useCallback(() => {
    letGo();
    setPlan(null);
    setError(null);
    setProgress(0);
    setPhase('idle');
  }, [letGo]);

  return { phase, progress, plan, error, ready, render, cancel, discard } as const;
};
