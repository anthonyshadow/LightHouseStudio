import type { VideoEditSpec } from '@studio/domain';
import {
  VIDEO_EDIT_RENDER_UNSUPPORTED_MESSAGE,
  runVideoEditWorker,
  type VideoEditWorkerOutcome,
} from './videoEditWorkerClient';
import { videoEditExportSupported } from './videoEditSupport';

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

export type RenderVideoEditResult = VideoEditWorkerOutcome;

export const renderVideoEdit = async ({
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
  // The same question the surfaces asked before offering this, and the same memoized answer, so by
  // the time anyone renders it costs nothing. Asking the weaker presence-only version here would
  // let a browser that cannot encode get all the way to a worker before finding out.
  if (!(await videoEditExportSupported())) {
    throw new Error(VIDEO_EDIT_RENDER_UNSUPPORTED_MESSAGE);
  }
  return runVideoEditWorker(
    {
      type: 'render',
      source,
      spec,
      sourceWidth,
      sourceHeight,
      requireAudio,
      targetResolution,
      includeAudio,
    },
    signal,
    { onProgress },
  );
};
