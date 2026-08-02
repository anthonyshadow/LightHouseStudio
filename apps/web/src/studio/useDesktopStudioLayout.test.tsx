// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_STUDIO_LAYOUT_QUERY, useDesktopStudioLayout } from './useDesktopStudioLayout';

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

afterEach(() => {
  if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
  else Reflect.deleteProperty(window, 'matchMedia');
});

describe('useDesktopStudioLayout', () => {
  it('tracks the desktop breakpoint so only one capture-settings presentation is mounted', () => {
    let matches = false;
    let listener: (() => void) | null = null;
    const mediaQuery = {
      get matches() {
        return matches;
      },
      media: DESKTOP_STUDIO_LAYOUT_QUERY,
      addEventListener: vi.fn((_event: string, callback: () => void) => {
        listener = callback;
      }),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn().mockReturnValue(mediaQuery),
    });

    const { result, unmount } = renderHook(() => useDesktopStudioLayout());
    expect(result.current).toBe(false);

    act(() => {
      matches = true;
      listener?.();
    });
    expect(result.current).toBe(true);

    unmount();
    expect(mediaQuery.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });
});
