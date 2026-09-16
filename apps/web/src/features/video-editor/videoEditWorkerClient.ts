import type {
  CompositionRenderPlan,
  VideoEditWorkerRequest,
  VideoEditWorkerResponse,
} from './types';

/**
 * Runs one job on the render worker and settles with its file.
 *
 * The one owner of the worker protocol on the page side: a fresh module worker per job, an
 * operation id that lets stale responses be ignored, a cancel that is posted first and enforced
 * with `terminate` two seconds later if the worker does not acknowledge it, and a terminate on
 * every outcome. Both renders — one clip through its edit, an arrangement through its clips — go
 * through here, so a change to how a cancel is honoured cannot land on one and not the other.
 */

/** The sentence both renders throw when the browser cannot encode; the session hook says the same. */
export const VIDEO_EDIT_RENDER_UNSUPPORTED_MESSAGE =
  'This browser cannot render local video edits without blocking the Studio.';

type WithoutOperationId<T> = T extends { readonly operationId: number }
  ? Omit<T, 'operationId'>
  : never;

/** A render request minus the operation id, which the runner mints. */
export type VideoEditWorkerJob = WithoutOperationId<
  Exclude<VideoEditWorkerRequest, { type: 'cancel' }>
>;

export type VideoEditWorkerHooks = Readonly<{
  onProgress: (progress: number) => void;
  /** Only the stitched render posts one; a caller that does not expect it can leave this out. */
  onPlan?: ((plan: CompositionRenderPlan) => void) | undefined;
}>;

export type VideoEditWorkerOutcome = Readonly<{ blob: Blob; mimeType: 'video/mp4' }>;

let nextOperationId = 0;

export const runVideoEditWorker = (
  job: VideoEditWorkerJob,
  signal: AbortSignal,
  hooks: VideoEditWorkerHooks,
): Promise<VideoEditWorkerOutcome> => {
  const operationId = ++nextOperationId;
  const worker = new Worker(new URL('./videoEditRender.worker.ts', import.meta.url), {
    type: 'module',
  });
  return new Promise((resolve, reject) => {
    let settled = false;
    let cancellationTimer: number | null = null;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', cancel);
      if (cancellationTimer !== null) window.clearTimeout(cancellationTimer);
      worker.terminate();
      callback();
    };
    const cancel = () => {
      const message: VideoEditWorkerRequest = { type: 'cancel', operationId };
      worker.postMessage(message);
      cancellationTimer = window.setTimeout(() => {
        finish(() => reject(new DOMException('Video rendering was canceled.', 'AbortError')));
      }, 2_000);
    };
    worker.onmessage = (event: MessageEvent<VideoEditWorkerResponse>) => {
      const message = event.data;
      if (message.operationId !== operationId) return;
      if (message.type === 'progress') {
        hooks.onProgress(Math.max(0, Math.min(1, message.progress)));
        return;
      }
      if (message.type === 'plan') {
        hooks.onPlan?.(message.plan);
        return;
      }
      if (message.type === 'complete') {
        finish(() => resolve({ blob: message.blob, mimeType: message.mimeType }));
        return;
      }
      if (message.type === 'canceled') {
        finish(() => reject(new DOMException('Video rendering was canceled.', 'AbortError')));
        return;
      }
      finish(() => reject(new Error(message.message)));
    };
    worker.onerror = () => {
      finish(() => reject(new Error('The local video-rendering worker stopped unexpectedly.')));
    };
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) {
      cancel();
      return;
    }
    const message: VideoEditWorkerRequest = { ...job, operationId };
    worker.postMessage(message);
  });
};
