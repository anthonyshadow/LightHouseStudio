import type { SavedVideoDetail } from '@studio/contracts';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ApiClientError } from '../adapters/api-client/apiClient';
import { getSavedVideo } from '../adapters/api-client/savedVideosApi';

export type DirectVideoLoadState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'loading'; videoId: string }>
  | Readonly<{ status: 'ready'; videoId: string }>
  | Readonly<{ status: 'error'; videoId: string; message: string }>;

type DirectVideoLoadResult =
  | Readonly<{ status: 'ready'; requestKey: string }>
  | Readonly<{ status: 'error'; requestKey: string; message: string }>;

const safeDirectVideoLoadMessage = (error: unknown): string =>
  error instanceof ApiClientError && [403, 404, 410].includes(error.status)
    ? 'This Saved Video is unavailable or has been removed.'
    : 'The Saved Video could not be loaded safely. Your Assets are unchanged.';

interface UseDirectSavedVideoRouteOptions {
  readonly videoId: string | null;
  /** History entry identity, so re-entering the same `/studio/<id>` URL re-hydrates it, mount or no. */
  readonly locationKey: string;
  readonly load: (detail: SavedVideoDetail, signal: AbortSignal) => Promise<void>;
  readonly reset: () => void;
}

/**
 * Hydrates a direct `/studio/<videoId>` entry into take review.
 *
 * `load` and `reset` are latched through a ref on purpose: the fetch must key on the route alone,
 * so a new callback identity from an unrelated re-render can never re-issue the request or wipe
 * work that is already loaded.
 */
export const useDirectSavedVideoRoute = ({
  videoId,
  locationKey,
  load,
  reset,
}: UseDirectSavedVideoRouteOptions): DirectVideoLoadState => {
  const requestKey = videoId === null ? null : `${locationKey}:${videoId}`;
  const [result, setResult] = useState<DirectVideoLoadResult | null>(null);
  const actionsRef = useRef({ load, reset });

  useLayoutEffect(() => {
    actionsRef.current = { load, reset };
  }, [load, reset]);

  useEffect(() => {
    if (videoId === null || requestKey === null) return;
    const controller = new AbortController();
    const currentRequestKey = requestKey;
    actionsRef.current.reset();
    void getSavedVideo(videoId, controller.signal)
      .then((detail) => actionsRef.current.load(detail, controller.signal))
      .then(() => {
        if (!controller.signal.aborted) {
          setResult({ status: 'ready', requestKey: currentRequestKey });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setResult({
            status: 'error',
            requestKey: currentRequestKey,
            message: safeDirectVideoLoadMessage(error),
          });
        }
      });
    return () => controller.abort('saved-video-route-changed');
  }, [requestKey, videoId]);

  return useMemo<DirectVideoLoadState>(
    () =>
      videoId === null || requestKey === null
        ? { status: 'idle' }
        : result?.requestKey !== requestKey
          ? { status: 'loading', videoId }
          : result.status === 'ready'
            ? { status: 'ready', videoId }
            : { status: 'error', videoId, message: result.message },
    [requestKey, result, videoId],
  );
};
