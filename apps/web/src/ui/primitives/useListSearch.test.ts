// @vitest-environment jsdom

import { LIST_SEARCH_MAX_LENGTH, LIST_SEARCH_MIN_LENGTH } from '@studio/contracts';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useListSearch } from './useListSearch';

describe('useListSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('settles on a term only once typing pauses, so a keystroke is not a request', () => {
    const { result } = renderHook(() => useListSearch());

    act(() => {
      result.current.setValue('la');
    });
    expect(result.current.value).toBe('la');
    expect(result.current.term).toBeUndefined();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.term).toBeUndefined();

    // Still typing: the pending term is replaced, not queued behind the first one — so the earlier
    // keystroke never becomes a request of its own.
    act(() => {
      result.current.setValue('launch');
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current.term).toBeUndefined();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.term).toBe('launch');
  });

  it('holds the last term below the minimum instead of flickering back to everything', () => {
    const { result } = renderHook(() => useListSearch());

    act(() => {
      result.current.setValue('launch');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.term).toBe('launch');

    act(() => {
      result.current.setValue('l');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.value).toBe('l');
    expect(result.current.term).toBe('launch');
    expect(result.current.hint).toBe(`Search begins after ${LIST_SEARCH_MIN_LENGTH} characters.`);
  });

  it('restores the whole list the moment the term is cleared, without waiting out the debounce', () => {
    const { result } = renderHook(() => useListSearch());

    act(() => {
      result.current.setValue('launch');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.term).toBe('launch');

    act(() => {
      result.current.clear();
    });
    expect(result.current.value).toBe('');
    expect(result.current.term).toBeUndefined();

    // Whitespace is not a search either.
    act(() => {
      result.current.setValue('   ');
    });
    expect(result.current.term).toBeUndefined();
  });

  it('trims the term it reports and states the length the contract will accept', () => {
    const { result } = renderHook(() => useListSearch());

    act(() => {
      result.current.setValue('  launch  ');
    });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current.term).toBe('launch');
    expect(result.current.maxLength).toBe(LIST_SEARCH_MAX_LENGTH);
  });
});
