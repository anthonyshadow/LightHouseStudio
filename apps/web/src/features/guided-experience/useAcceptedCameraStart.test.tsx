// @vitest-environment jsdom

import { StrictMode, type PropsWithChildren } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { GuidedFlowPendingOperation } from '../guided-flow';
import { useAcceptedCameraStart } from './useAcceptedCameraStart';

const strictWrapper = ({ children }: PropsWithChildren) => <StrictMode>{children}</StrictMode>;

const acceptedCameraOperation = (id: string, baseRevision = 3): GuidedFlowPendingOperation => ({
  id,
  kind: 'start-camera-preview',
  baseRevision,
  rollbackStatus: 'live.ready',
});

describe('useAcceptedCameraStart', () => {
  it('does not acquire media without a reducer-accepted operation', () => {
    const startLocal = vi.fn(() => Promise.resolve());
    renderHook(
      ({ pending }: { pending: GuidedFlowPendingOperation | null }) =>
        useAcceptedCameraStart(pending, startLocal),
      { initialProps: { pending: null }, wrapper: strictWrapper },
    );

    expect(startLocal).not.toHaveBeenCalled();
  });

  it('starts media exactly once for each reducer-accepted operation', () => {
    const startLocal = vi.fn(() => Promise.resolve());
    const first = acceptedCameraOperation('camera-1');
    const { rerender } = renderHook(
      ({ pending }: { pending: GuidedFlowPendingOperation | null }) =>
        useAcceptedCameraStart(pending, startLocal),
      { initialProps: { pending: first }, wrapper: strictWrapper },
    );

    expect(startLocal).toHaveBeenCalledOnce();
    rerender({ pending: { ...first } });
    expect(startLocal).toHaveBeenCalledOnce();

    rerender({ pending: acceptedCameraOperation('camera-1', 4) });
    expect(startLocal).toHaveBeenCalledTimes(2);

    rerender({ pending: acceptedCameraOperation('camera-2') });
    expect(startLocal).toHaveBeenCalledTimes(3);
  });
});
