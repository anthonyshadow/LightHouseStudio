import type { SavedVideoVersion } from '@studio/contracts';
import type { ProjectExportSpecification } from '@studio/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import { readSavedVideoContent } from '../../adapters/api-client/savedVideosApi';
import { downloadBlobFile } from '../../adapters/browser-media/downloadBlobFile';
import { useExportPlacementRender } from '../export-placements';

export const PLACEMENT_READ_FAILURE =
  'This video could not be read to re-frame it. Download it as it is instead.';

export type SavedVideoPlacementDownloadInput = Readonly<{
  version: SavedVideoVersion;
  specification: ProjectExportSpecification;
}>;

/**
 * The one owner of "re-frame a retained Version for a placement and hand the file over".
 *
 * `useExportPlacementRender` deliberately owns no bytes, so every surface that offers a placement
 * download has to read the Version, render it, and give the result to the browser. That sequence —
 * with its abort, its failure copy and its `hasAudio` policy — is the same wherever it is offered,
 * and is stated here once rather than at each surface.
 *
 * It owns no bytes of its own either: the Blob exists only for the length of the call that hands
 * it over, and only the render phase, a failure message and the in-flight controller are kept.
 */
export const useSavedVideoPlacementDownload = () => {
  const render = useExportPlacementRender();
  const fetchRef = useRef<AbortController | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => () => fetchRef.current?.abort('unmount'), []);

  const cancel = useCallback(() => {
    fetchRef.current?.abort('cancelled');
    fetchRef.current = null;
    render.cancel();
    setFailure(null);
  }, [render]);

  const download = useCallback(
    async ({ version, specification }: SavedVideoPlacementDownloadInput): Promise<void> => {
      if (render.phase === 'rendering') return;
      setFailure(null);
      const controller = new AbortController();
      fetchRef.current = controller;
      let media: Blob;
      try {
        media = await readSavedVideoContent({
          videoId: version.videoId,
          versionId: version.id,
          mimeType: version.mimeType,
          signal: controller.signal,
          abortMessage: 'Preparing this download was cancelled.',
        });
      } catch {
        if (!controller.signal.aborted) setFailure(PLACEMENT_READ_FAILURE);
        return;
      } finally {
        if (fetchRef.current === controller) fetchRef.current = null;
      }
      const rendered = await render.render({
        media,
        specification,
        source: {
          width: version.width,
          height: version.height,
          durationMs: version.durationMs,
        },
        // The retained record does not state whether it carries audio, so an existing track is
        // kept rather than required.
        hasAudio: false,
        filename: version.filename,
      });
      if (rendered === null) return;
      // The Blob exists only for the length of the click that hands it over.
      downloadBlobFile(rendered.blob, rendered.filename);
    },
    [render],
  );

  return { render, failure, cancel, download } as const;
};
