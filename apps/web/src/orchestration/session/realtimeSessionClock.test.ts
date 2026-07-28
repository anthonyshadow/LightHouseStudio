// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRealtimeSessionClock, type RealtimeSessionTiming } from './realtimeSessionClock';

afterEach(() => {
  vi.useRealTimers();
});

describe('realtime session clock', () => {
  it('uses monotonic elapsed time, warns at 30 seconds, and completes once at the boundary', () => {
    vi.useFakeTimers();
    let now = 10_000;
    const timings: RealtimeSessionTiming[] = [];
    const onLimitReached = vi.fn();
    const clock = createRealtimeSessionClock({
      maximumSeconds: 300,
      now: () => now,
      intervalMs: 100,
      onTimingChange: (timing) => timings.push(timing),
      onLimitReached,
    });

    now += 269_000;
    vi.advanceTimersByTime(100);
    expect(timings.at(-1)).toMatchObject({
      elapsedSeconds: 269,
      remainingSeconds: 31,
      warning: false,
    });

    now += 1_000;
    vi.advanceTimersByTime(100);
    expect(timings.at(-1)).toMatchObject({
      elapsedSeconds: 270,
      remainingSeconds: 30,
      warning: true,
    });

    now += 30_000;
    vi.advanceTimersByTime(100);
    expect(timings.at(-1)).toMatchObject({
      status: 'limit-reached',
      elapsedSeconds: 300,
      remainingSeconds: 0,
    });
    expect(onLimitReached).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(5_000);
    expect(onLimitReached).toHaveBeenCalledOnce();
    clock.dispose();
  });

  it('reconciles forward-only provider ticks without resetting the reconnect budget', () => {
    vi.useFakeTimers();
    let now = 0;
    const timings: RealtimeSessionTiming[] = [];
    const clock = createRealtimeSessionClock({
      maximumSeconds: 300,
      now: () => now,
      onTimingChange: (timing) => timings.push(timing),
      onLimitReached: vi.fn(),
    });

    clock.reconcileProviderElapsed(45);
    clock.reconcileProviderElapsed(12);
    expect(timings.at(-1)?.elapsedSeconds).toBe(45);

    now = 15_000;
    vi.advanceTimersByTime(250);
    expect(timings.at(-1)?.elapsedSeconds).toBe(60);
    clock.dispose();
  });

  it('classifies only a boundary end as expected and cancels all late work on dispose', () => {
    vi.useFakeTimers();
    let now = 0;
    const onTimingChange = vi.fn();
    const onLimitReached = vi.fn();
    const clock = createRealtimeSessionClock({
      maximumSeconds: 300,
      now: () => now,
      onTimingChange,
      onLimitReached,
    });

    expect(clock.handleProviderEnd(120)).toBe(false);
    expect(onLimitReached).not.toHaveBeenCalled();
    expect(clock.handleProviderEnd(299)).toBe(true);
    expect(onLimitReached).toHaveBeenCalledOnce();

    clock.dispose();
    now = 600_000;
    vi.advanceTimersByTime(10_000);
    expect(onLimitReached).toHaveBeenCalledOnce();
  });
});
