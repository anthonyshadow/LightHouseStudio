import {
  projectExportFilename,
  projectExportVideoEditSpec,
  type ProjectExportSpecification,
  type VideoEditSourceGeometry,
} from '@studio/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { renderVideoEdit } from '../video-editor/renderVideoEdit';
import { useVideoEditExportSupport } from '../video-editor/useVideoEditExportSupport';
import { videoEditSupported } from '../video-editor/videoEditSupport';

export type ExportPlacementRenderPhase = 'idle' | 'rendering' | 'error';

export type ExportPlacementRenderInput = Readonly<{
  media: Blob;
  specification: ProjectExportSpecification;
  source: VideoEditSourceGeometry;
  hasAudio: boolean;
  filename: string;
}>;

export type ExportPlacementRenderResult = Readonly<{ blob: Blob; filename: string }>;

/**
 * Renders one placement through the local editor's worker, reporting progress and honouring a
 * cancel. It owns no bytes of its own: the caller keeps the source, and the rendered Blob is handed
 * straight back so nothing is pinned here beyond the render itself.
 *
 * `offersPlacements` says whether this caller will ever show the capability to anyone. A surface
 * that only drives renders — Studio's save controller, a success panel with no placement to state —
 * still gets `render`, which checks for itself, without making the browser encode a probe frame
 * during camera acquisition to answer a question it never asks.
 */
export const useExportPlacementRender = (offersPlacements = true) => {
  const [phase, setPhase] = useState<ExportPlacementRenderPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const supported = useVideoEditExportSupport(offersPlacements);

  useEffect(() => () => controllerRef.current?.abort('unmount'), []);

  const cancel = useCallback(() => {
    controllerRef.current?.abort('cancelled');
    controllerRef.current = null;
    setProgress(0);
    setError(null);
    setPhase('idle');
  }, []);

  const reset = useCallback(() => {
    setError(null);
    setProgress(0);
    setPhase('idle');
  }, []);

  const render = useCallback(
    async ({
      media,
      specification,
      source,
      hasAudio,
      filename,
    }: ExportPlacementRenderInput): Promise<ExportPlacementRenderResult | null> => {
      if (controllerRef.current !== null) return null;
      /*
       * Claimed before the first await, not after. The capability question below suspends, and a
       * guard that only holds across synchronous code is no guard at all once it does: two clicks
       * in the same frame both passed the check and both spawned a worker, and only the second was
       * cancellable.
       */
      const controller = new AbortController();
      controllerRef.current = controller;
      // Asked rather than read: a caller that never offers a placement never subscribed, and the
      // answer is memoized, so by the time anyone renders this costs nothing.
      if (!(await videoEditSupported())) {
        controllerRef.current = null;
        setError(
          'This browser cannot re-frame a video without blocking the Studio. It keeps its original shape.',
        );
        setPhase('error');
        return null;
      }
      setError(null);
      setProgress(0);
      setPhase('rendering');
      try {
        // The domain rule decides whether this placement can be produced at all, and its message is
        // what the operator reads when it cannot.
        const spec = projectExportVideoEditSpec(specification, source);
        if (spec === null || specification.resolution === null) {
          setPhase('idle');
          return null;
        }
        const rendered = await renderVideoEdit({
          source: media,
          spec,
          sourceWidth: source.width,
          sourceHeight: source.height,
          requireAudio: hasAudio && specification.includeAudio,
          targetResolution: specification.resolution,
          includeAudio: specification.includeAudio,
          signal: controller.signal,
          onProgress: setProgress,
        });
        if (controller.signal.aborted) return null;
        setProgress(1);
        setPhase('idle');
        return {
          blob: rendered.blob,
          filename: projectExportFilename(filename, specification),
        };
      } catch (renderError) {
        if (controller.signal.aborted) return null;
        setError(
          renderError instanceof Error
            ? renderError.message
            : 'The browser could not re-frame this video. Your video is unchanged.',
        );
        setPhase('error');
        return null;
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
      }
    },
    [],
  );

  return { phase, progress, error, supported, render, cancel, reset } as const;
};
