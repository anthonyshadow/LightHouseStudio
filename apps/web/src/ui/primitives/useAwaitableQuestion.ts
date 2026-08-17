import { useCallback, useEffect, useRef, useState } from 'react';

export interface AwaitableQuestion<Q> {
  /** The question currently on screen, or `null` when nothing is being asked. */
  readonly pending: Q | null;
  /** Poses a question and resolves to the operator's answer. */
  readonly ask: (question: Q) => Promise<boolean>;
  readonly confirm: () => void;
  readonly cancel: () => void;
}

/**
 * A yes/no question the caller can `await`, rendered by a real dialog rather than `window.confirm`.
 *
 * `window.confirm` blocks the main thread, cannot be themed, is invisible to the overlay stack's
 * focus-return contract, and needs `window` stubbed to test. Modelling the question as a promise
 * keeps call sites reading top-to-bottom — `if (!(await ask(…))) return;` — while the answer comes
 * from whatever dialog the caller chooses to render for its `pending` value.
 *
 * A superseded question, and one still open at unmount, both resolve to `false`. Declining is the
 * only safe default: a caller that never hears back must neither proceed with the destructive
 * branch nor hang forever waiting.
 *
 * Generic over the payload so one mechanism serves both a bare prompt string and a full set of
 * dialog options — the plumbing is the shared part, the copy is not.
 */
export const useAwaitableQuestion = <Q>(): AwaitableQuestion<Q> => {
  const [pending, setPending] = useState<Q | null>(null);
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);
  const mountedRef = useRef(true);

  const settle = useCallback((confirmed: boolean) => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    setPending(null);
    resolve?.(confirmed);
  }, []);

  const ask = useCallback((question: Q): Promise<boolean> => {
    if (!mountedRef.current) return Promise.resolve(false);
    return new Promise<boolean>((resolve) => {
      resolveRef.current?.(false);
      resolveRef.current = resolve;
      setPending(question);
    });
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      resolveRef.current?.(false);
      resolveRef.current = null;
    };
  }, []);

  return {
    pending,
    ask,
    confirm: useCallback(() => settle(true), [settle]),
    cancel: useCallback(() => settle(false), [settle]),
  };
};
