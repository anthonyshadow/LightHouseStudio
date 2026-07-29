import type { RealtimeSessionTiming } from '../../application/types';

export const REALTIME_SESSION_WARNING_SECONDS = 30;

export type { RealtimeSessionTiming } from '../../application/types';

export type RealtimeSessionClock = Readonly<{
  reconcileProviderElapsed: (seconds: number) => void;
  handleProviderEnd: (seconds: number) => boolean;
  complete: () => RealtimeSessionTiming;
  dispose: () => void;
  hasReachedLimit: () => boolean;
}>;

type RealtimeSessionClockOptions = Readonly<{
  maximumSeconds: number;
  onTimingChange: (timing: RealtimeSessionTiming) => void;
  onLimitReached: () => void;
  now?: () => number;
  intervalMs?: number;
}>;

const boundedSeconds = (seconds: number, maximumSeconds: number): number =>
  Math.min(maximumSeconds, Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0)));

const timingAt = (
  status: RealtimeSessionTiming['status'],
  maximumSeconds: number,
  elapsedSeconds: number,
): RealtimeSessionTiming => {
  const boundedElapsed = boundedSeconds(elapsedSeconds, maximumSeconds);
  const remainingSeconds = Math.max(0, maximumSeconds - boundedElapsed);
  return {
    status,
    maximumSeconds,
    elapsedSeconds: boundedElapsed,
    remainingSeconds,
    warning:
      status === 'active' &&
      remainingSeconds > 0 &&
      remainingSeconds <= REALTIME_SESSION_WARNING_SECONDS,
  };
};

/**
 * Owns the user-visible active-session budget. Provider ticks can move the
 * display forward, but the monotonic clock never moves backward or resets
 * across an SDK-managed reconnect.
 */
export const createRealtimeSessionClock = ({
  maximumSeconds,
  onTimingChange,
  onLimitReached,
  now = () => performance.now(),
  intervalMs = 250,
}: RealtimeSessionClockOptions): RealtimeSessionClock => {
  const maximum = Math.max(1, Math.floor(maximumSeconds));
  const startedAt = now();
  let providerElapsedOffsetSeconds = 0;
  let lastTiming = timingAt('active', maximum, 0);
  let disposed = false;
  let limitReached = false;
  let timer: number | null = null;

  const clearTimer = () => {
    if (timer === null) return;
    window.clearInterval(timer);
    timer = null;
  };

  const emit = (timing: RealtimeSessionTiming) => {
    if (
      timing.status === lastTiming.status &&
      timing.elapsedSeconds === lastTiming.elapsedSeconds &&
      timing.warning === lastTiming.warning
    ) {
      return;
    }
    lastTiming = timing;
    onTimingChange(timing);
  };

  const reachLimit = () => {
    if (disposed || limitReached) return;
    limitReached = true;
    clearTimer();
    emit(timingAt('limit-reached', maximum, maximum));
    onLimitReached();
  };

  const update = () => {
    if (disposed || limitReached) return;
    const monotonicElapsedSeconds = Math.max(0, Math.floor((now() - startedAt) / 1_000));
    const elapsedSeconds = monotonicElapsedSeconds + providerElapsedOffsetSeconds;
    if (elapsedSeconds >= maximum) {
      reachLimit();
      return;
    }
    emit(timingAt('active', maximum, elapsedSeconds));
  };

  onTimingChange(lastTiming);
  timer = window.setInterval(update, Math.max(50, Math.floor(intervalMs)));

  return {
    reconcileProviderElapsed(seconds) {
      if (disposed || limitReached || !Number.isFinite(seconds) || seconds < 0) return;
      const monotonicElapsedSeconds = Math.max(0, Math.floor((now() - startedAt) / 1_000));
      providerElapsedOffsetSeconds = Math.max(
        providerElapsedOffsetSeconds,
        Math.floor(seconds) - monotonicElapsedSeconds,
      );
      update();
    },
    handleProviderEnd(seconds) {
      if (disposed) return false;
      const providerSeconds = boundedSeconds(seconds, maximum);
      const monotonicSeconds = boundedSeconds((now() - startedAt) / 1_000, maximum);
      const expected =
        Math.max(providerSeconds, monotonicSeconds + providerElapsedOffsetSeconds) >= maximum - 1;
      if (expected) reachLimit();
      return expected;
    },
    complete() {
      clearTimer();
      disposed = true;
      limitReached = true;
      lastTiming = timingAt('completed', maximum, maximum);
      onTimingChange(lastTiming);
      return lastTiming;
    },
    dispose() {
      clearTimer();
      disposed = true;
    },
    hasReachedLimit: () => limitReached,
  };
};
