import type { ProjectPreviewContract } from '@studio/contracts';
import { savedVideoThumbnailUrl } from '../../adapters/api-client/savedVideosApi';

/**
 * Poster URLs for a page of Projects, keyed by Project id.
 *
 * The references come with the list response, so a surface resolves every poster it shows without
 * asking a second question — and a Project with nothing to show is simply absent from the map.
 *
 * The URL carries the Version the Project points at as its cache key, while the route serves
 * whichever poster is current for that Video. That is the same bargain the Videos library makes:
 * repairing a poster changes the URL, so every surface showing it refetches without tracking
 * staleness by hand.
 */
export const projectPosterUrls = (
  pages: ReadonlyArray<{ readonly previews: readonly ProjectPreviewContract[] }> | undefined,
): ReadonlyMap<string, string> =>
  new Map(
    (pages ?? [])
      .flatMap((page) => page.previews)
      .map((preview) => [
        preview.projectId,
        savedVideoThumbnailUrl(preview.savedVideoId, preview.videoVersionId),
      ]),
  );
