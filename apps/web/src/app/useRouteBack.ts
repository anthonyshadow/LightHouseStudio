import { useCallback } from 'react';
import { useNavigate } from 'react-router';

type RouterHistoryState = Readonly<{ idx?: unknown }>;

/** Uses the browser's actual previous entry, with a safe in-app fallback for direct entry. */
export const useRouteBack = () => {
  const navigate = useNavigate();

  return useCallback(
    (fallback: string) => {
      const state = window.history.state as RouterHistoryState | null;
      if (typeof state?.idx === 'number' && state.idx > 0) {
        void navigate(-1);
        return;
      }
      void navigate(fallback, { replace: true });
    },
    [navigate],
  );
};
