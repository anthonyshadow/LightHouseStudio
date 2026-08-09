import type { VideoJobStatusResponse } from '@studio/contracts';
import { QueryObserver, type QueryClient, type QueryObserverResult } from '@tanstack/react-query';
import { fetchVideoJob } from '../../adapters/api-client/videoJobsApi';

const DEFAULT_POLL_INTERVAL_MS = 1_500;

export const videoJobQueryKeys = {
  status: (jobId: string) => ['video-jobs', jobId, 'status'] as const,
};

export const isTerminalVideoJobStatus = (status: VideoJobStatusResponse): boolean =>
  status.status === 'ready' || status.status === 'failed' || status.status === 'expired';

const pollInterval = (status?: VideoJobStatusResponse): number =>
  Math.max(1, status?.nextPollAfterMs ?? DEFAULT_POLL_INTERVAL_MS);

const abortError = (signal: AbortSignal): Error =>
  signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Video processing status check was canceled.', 'AbortError');

const normalizedError = (error: unknown): Error =>
  error instanceof Error ? error : new Error('Video job status polling failed.');

export const removeVideoJobStatus = (queryClient: QueryClient, jobId: string): void => {
  queryClient.removeQueries({ queryKey: videoJobQueryKeys.status(jobId), exact: true });
};

export const pollVideoJobStatus = ({
  queryClient,
  jobId,
  initialStatus,
  signal,
  onStatus,
}: Readonly<{
  queryClient: QueryClient;
  jobId: string;
  initialStatus?: VideoJobStatusResponse | null;
  signal: AbortSignal;
  onStatus: (status: VideoJobStatusResponse) => void;
}>): Promise<VideoJobStatusResponse> => {
  if (signal.aborted) return Promise.reject(abortError(signal));

  const seededStatus = initialStatus?.jobId === jobId ? initialStatus : undefined;
  if (seededStatus && isTerminalVideoJobStatus(seededStatus)) {
    try {
      onStatus(seededStatus);
      return Promise.resolve(seededStatus);
    } catch (error) {
      return Promise.reject(normalizedError(error));
    }
  }
  const queryKey = videoJobQueryKeys.status(jobId);
  const observer = new QueryObserver<
    VideoJobStatusResponse,
    Error,
    VideoJobStatusResponse,
    VideoJobStatusResponse,
    typeof queryKey
  >(queryClient, {
    queryKey,
    queryFn: ({ signal: querySignal }) => fetchVideoJob(jobId, querySignal),
    retry: false,
    ...(seededStatus ? { initialData: seededStatus, initialDataUpdatedAt: Date.now() } : {}),
    staleTime: seededStatus ? pollInterval(seededStatus) : 0,
    refetchInterval: (query) => {
      const current = query.state.data;
      return current && isTerminalVideoJobStatus(current) ? false : pollInterval(current);
    },
    refetchIntervalInBackground: true,
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let lastNotifiedStatus: VideoJobStatusResponse | undefined;

    const cleanup = () => {
      signal.removeEventListener('abort', handleAbort);
      observer.destroy();
    };
    const resolveOnce = (status: VideoJobStatusResponse) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(status);
    };
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(normalizedError(error));
    };
    const handleAbort = () => rejectOnce(abortError(signal));
    const handleResult = (result: QueryObserverResult<VideoJobStatusResponse, Error>) => {
      if (settled) return;
      const current = result.data;
      if (current && current !== lastNotifiedStatus) {
        lastNotifiedStatus = current;
        try {
          onStatus(current);
        } catch (error) {
          rejectOnce(error);
          return;
        }
      }
      if (current && isTerminalVideoJobStatus(current)) {
        resolveOnce(current);
      } else if (result.isError && !result.isFetching) {
        rejectOnce(result.error);
      }
    };

    signal.addEventListener('abort', handleAbort, { once: true });
    observer.subscribe(handleResult);
    handleResult(observer.getCurrentResult());
  });
};
