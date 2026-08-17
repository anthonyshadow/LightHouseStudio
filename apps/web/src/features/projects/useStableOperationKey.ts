import { useCallback, useMemo, useRef } from 'react';

/**
 * The single owner of "when does a Project mutation mint a fresh idempotency key".
 *
 * Idempotency keys are load-bearing: a retry of the *same* logical operation must carry the *same*
 * key so the server replays its recorded result instead of doing the work twice, while a genuinely
 * different request must carry a fresh one. Every caller derives a signature from the facts that
 * define the operation (project id, expected version, expected revision, the payload identity) and
 * the key rotates exactly when that signature changes.
 *
 * `reset` is called once an operation has been durably accepted, so the next attempt — which is a
 * new operation even at an identical signature — starts from a fresh key.
 */
export type StableOperationKey = {
  readonly keyFor: (signature: string) => string;
  readonly reset: () => void;
};

export const useStableOperationKey = (): StableOperationKey => {
  const pendingRef = useRef<{ signature: string; key: string } | null>(null);

  const keyFor = useCallback((signature: string): string => {
    const pending = pendingRef.current;
    if (pending?.signature === signature) return pending.key;
    const key = crypto.randomUUID();
    pendingRef.current = { signature, key };
    return key;
  }, []);

  const reset = useCallback(() => {
    pendingRef.current = null;
  }, []);

  return useMemo(() => ({ keyFor, reset }), [keyFor, reset]);
};
