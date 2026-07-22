import { useCallback, useEffect, useState } from 'react';

export type LiveTimerController = {
  seconds: number;
  start: () => void;
  reset: () => void;
};

export const useLiveTimer = (): LiveTimerController => {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);

  const start = useCallback(() => {
    setStartedAt((current) => current ?? performance.now());
  }, []);

  const reset = useCallback(() => {
    setStartedAt(null);
    setSeconds(0);
  }, []);

  useEffect(() => {
    if (startedAt === null) return;
    const update = () =>
      setSeconds(Math.max(0, Math.floor((performance.now() - startedAt) / 1_000)));
    update();
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [startedAt]);

  return { seconds, start, reset };
};
