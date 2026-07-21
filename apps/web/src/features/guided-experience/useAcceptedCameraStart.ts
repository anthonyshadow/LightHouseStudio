import { useEffect, useRef } from 'react';
import type { GuidedFlowPendingOperation } from '../guided-flow';

type AcceptedCameraOperation = GuidedFlowPendingOperation | null;

/** Starts local media only after the reducer has accepted the matching camera operation. */
export const useAcceptedCameraStart = (
  pending: AcceptedCameraOperation,
  startLocal: () => Promise<void>,
): void => {
  const startedOperationRef = useRef<string | null>(null);

  useEffect(() => {
    if (!pending || pending.kind !== 'start-camera-preview') return;
    const operationKey = `${pending.id}:${pending.baseRevision}`;
    if (startedOperationRef.current === operationKey) return;
    startedOperationRef.current = operationKey;
    void startLocal();
  }, [pending, startLocal]);
};
