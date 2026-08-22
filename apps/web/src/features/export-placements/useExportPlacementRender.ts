import {
  projectExportFilename,
  projectExportVideoEditSpec,
  type ProjectExportSpecification,
  type VideoEditSourceGeometry,
} from '@studio/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderVideoEdit, videoEditRenderingSupported } from '../video-editor/renderVideoEdit';
import { videoEditPreviewSupported } from '../video-editor/videoEditShader';

/**
 * The same capability gate the local editor applies, because this is the same render path.
 *
 * Deliberately not memoised at module scope: probing costs a throwaway WebGL context, but caching
 * it there would make the capability un-mockable per test. Callers mount this hook only on the
 * surface that offers a placement, so the probe runs when that surface opens rather than with the
 * library around it.
 */
export const exportPlacementRenderSupported = (): boolean =>
  videoEditPreviewSupported() && videoEditRenderingSupported();

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
 */
export const useExportPlacementRender = () => {
  const [phase, setPhase] = useState<ExportPlacementRenderPhase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  // A browser capability, not a property of any one render, so it is measured once.
  const supported = useMemo(() => exportPlacementRenderSupported(), []);

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
      if (!supported) {
        setError(
          'This browser cannot re-frame a video without blocking the Studio. It keeps its original shape.',
        );
        setPhase('error');
        return null;
      }
      const controller = new AbortController();
      controllerRef.current = controller;
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
    [supported],
  );

  return { phase, progress, error, supported, render, cancel, reset } as const;
};
