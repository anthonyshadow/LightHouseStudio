// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAwaitableQuestion } from './useAwaitableQuestion';

describe('useAwaitableQuestion', () => {
  it('resolves true only when the question is explicitly confirmed', async () => {
    const { result } = renderHook(() => useAwaitableQuestion<string>());

    let answer: Promise<boolean>;
    act(() => {
      answer = result.current.ask('Discard the draft?');
    });
    expect(result.current.pending).toBe('Discard the draft?');

    act(() => result.current.confirm());
    await expect(answer!).resolves.toBe(true);
    // Answering clears the question, so the dialog cannot linger past its own resolution.
    expect(result.current.pending).toBeNull();
  });

  it('resolves false when cancelled', async () => {
    const { result } = renderHook(() => useAwaitableQuestion<string>());

    let answer: Promise<boolean>;
    act(() => {
      answer = result.current.ask('Discard the draft?');
    });
    act(() => result.current.cancel());

    await expect(answer!).resolves.toBe(false);
    expect(result.current.pending).toBeNull();
  });

  it('declines a superseded question rather than leaving its caller waiting', async () => {
    const { result } = renderHook(() => useAwaitableQuestion<string>());

    let first: Promise<boolean>;
    let second: Promise<boolean>;
    act(() => {
      first = result.current.ask('First question.');
      second = result.current.ask('Second question.');
    });
    expect(result.current.pending).toBe('Second question.');

    await expect(first!).resolves.toBe(false);

    act(() => result.current.confirm());
    await expect(second!).resolves.toBe(true);
  });

  it('declines a question still open at unmount, and any asked afterwards', async () => {
    const { result, unmount } = renderHook(() => useAwaitableQuestion<string>());

    let answer: Promise<boolean>;
    act(() => {
      answer = result.current.ask('Discard the draft?');
    });
    const settled = vi.fn();
    void answer!.then(settled);

    unmount();

    await expect(answer!).resolves.toBe(false);
    expect(settled).toHaveBeenCalledWith(false);
    // An unmounted owner has no dialog left to answer with, so asking again must not hang.
    await expect(result.current.ask('Too late?')).resolves.toBe(false);
  });
});
