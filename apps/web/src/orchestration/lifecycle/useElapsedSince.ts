import { useEffect, useState } from 'react';

/** For a start stamp taken in this tab. No clock adjustment can move it. */
export const monotonicNow = () => performance.now();

/** For a start stamp that arrived as a wall-clock timestamp, typically from the server. */
export const wallClockNow = () => Date.now();

/**
 * Milliseconds since `startedAtMs`, re-rendering the calling component once a second.
 *
 * The tick belongs to whoever displays the number: a counter kept in state further up re-renders
 * everything below it once a second for the life of a job. Both callers own a single control or
 * paragraph, and both are mounted only while the work they describe is in flight, which is also
 * the interval's lifetime.
 *
 * `clock` is a parameter because the two callers measure different epochs, and it has to be one of
 * the two module-scope readers above — it keys the interval effect, so an arrow written in a render
 * body would tear the timer down and rebuild it on every render.
 */
export const useElapsedSince = (startedAtMs: number | null, clock: () => number): number => {
  const [nowMs, setNowMs] = useState(clock);

  useEffect(() => {
    // Nothing to count towards, so nothing to re-render for.
    if (startedAtMs === null) return;
    const interval = window.setInterval(() => setNowMs(clock()), 1_000);
    return () => window.clearInterval(interval);
  }, [clock, startedAtMs]);

  // Clamped because `nowMs` lags the stamp: a restart moves `startedAtMs` forward while the last
  // sample is up to a second old, and that has to read as zero rather than as a negative.
  return startedAtMs === null ? 0 : Math.max(0, nowMs - startedAtMs);
};
