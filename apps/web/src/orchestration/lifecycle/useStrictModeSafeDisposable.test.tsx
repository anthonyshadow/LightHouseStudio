// @vitest-environment jsdom

import { StrictMode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useStrictModeSafeDisposable } from './useStrictModeSafeDisposable';

describe('useStrictModeSafeDisposable', () => {
  it('survives StrictMode effect replay and closes once after the real unmount', async () => {
    const resource = { close: vi.fn() };
    const { unmount } = renderHook(() => useStrictModeSafeDisposable(resource), {
      wrapper: StrictMode,
    });

    await Promise.resolve();
    expect(resource.close).not.toHaveBeenCalled();

    unmount();
    await waitFor(() => expect(resource.close).toHaveBeenCalledOnce());
  });
});
