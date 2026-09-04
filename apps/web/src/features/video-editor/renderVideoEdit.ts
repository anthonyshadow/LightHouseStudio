import type { VideoEditSpec } from '@studio/domain';
import type { VideoEditWorkerRequest, VideoEditWorkerResponse } from './types';
import { videoEditRenderingApisPresent } from './videoEditSupport';

export type RenderVideoEditInput = Readonly<{
  source: Blob;
  spec: VideoEditSpec;
  sourceWidth: number;
  sourceHeight: number;
  requireAudio: boolean;
  /**
   * An exact destination size for the cropped frame. Omitted, the crop's own size is kept — the
   * local editor's behaviour. A placement export supplies one, which is the only scaling this
   * path performs.
   */
  targetResolution?: { readonly width: number; readonly height: number } | null;
  /** Omitted or `true`, an existing audio track is transcoded; `false` drops it. */
  includeAudio?: boolean;
  signal: AbortSignal;
  onProgress: (progress: number) => void;
}>;

export type RenderVideoEditResult = Readonly<{ blob: Blob; mimeType: 'video/mp4' }>;

let nextOperationId = 0;

export const renderVideoEdit = ({
  source,
  spec,
  sourceWidth,
  sourceHeight,
  requireAudio,
  targetResolution = null,
  includeAudio = true,
  signal,
  onProgress,
}: RenderVideoEditInput): Promise<RenderVideoEditResult> => {
  // The cheap half of the question. Whether the codec actually works is `videoEditExportSupported`,
  // which the surfaces offering this ask before they offer it, and the worker asks again itself.
  if (!videoEditRenderingApisPresent()) {
    return Promise.reject(
      new Error('This browser cannot render local video edits without blocking the Studio.'),
    );
  }
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
        onProgress(Math.max(0, Math.min(1, message.progress)));
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
    const message: VideoEditWorkerRequest = {
      type: 'render',
      operationId,
      source,
      spec,
      sourceWidth,
      sourceHeight,
      requireAudio,
      targetResolution,
      includeAudio,
    };
    worker.postMessage(message);
  });
};
