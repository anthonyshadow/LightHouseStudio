import type { ProjectCurrentResponse } from '@studio/contracts';
import { projectMediaReferencesEqual } from '@studio/domain';
import { useQuery, type QueryClient } from '@tanstack/react-query';
import { getProjectSource, getProjectWorkingMedia } from './projectsApi';
import { projectQueryKeys } from './useProjectsController';

export type CurrentCut = Readonly<{
  contentUrl: string;
  mimeType: string;
  filename: string;
  width: number;
  height: number;
  durationMs: number;
  hasAudio: boolean;
}>;

/**
 * The cut as the save step and the placement chooser need it: where the bytes are and what frame
 * they have — never the bytes, so nothing here keeps a large Blob alive. Both the source and a
 * working-media adoption answer with the same fields.
 */
export const currentCutOf = (media: CurrentCut): CurrentCut => ({
  contentUrl: media.contentUrl,
  mimeType: media.mimeType,
  filename: media.filename,
  width: media.width,
  height: media.height,
  durationMs: media.durationMs,
  hasAudio: media.hasAudio,
});

/**
 * Describes the cut the stage is showing, wherever this Project keeps it.
 *
 * Only an edit or a previous save writes a working-media adoption, so the ordinary path — upload a
 * source, choose a placement, save — has none and asking for one 404s. The snapshot says which it
 * is, so this asks the matching surface rather than assuming the edited case.
 */
export const describeCurrentCut = async (
  latest: ProjectCurrentResponse,
  signal: AbortSignal,
): Promise<CurrentCut> => {
  const { workingMedia } = latest.revision.snapshot;
  const source = await getProjectSource(latest.project.id, signal);
  const sourceReference =
    source.source.savedVideoId !== null && source.source.videoVersionId !== null
      ? {
          kind: 'saved-video-version' as const,
          savedVideoId: source.source.savedVideoId,
          videoVersionId: source.source.videoVersionId,
        }
      : { kind: 'asset' as const, assetId: latest.revision.snapshot.sourceAssetId ?? '' };
  return currentCutOf(
    projectMediaReferencesEqual(workingMedia, sourceReference)
      ? source.source
      : (await getProjectWorkingMedia(latest.project.id, signal)).media,
  );
};

/**
 * One query per cut, keyed by the media the revision presents rather than by the revision: a
 * placement change autosaves a new revision, but the bytes it points at have not moved, and the
 * source controller that hydrates the stage seeds this key with the answer it already fetched.
 */
// The presented media reference *is* the cut's identity, and the key carries it whole.
// eslint-disable-next-line @tanstack/query/exhaustive-deps
const currentCutQuery = (current: ProjectCurrentResponse) => ({
  queryKey: projectQueryKeys.currentCut(
    current.project.id,
    current.revision.snapshot.presentedMedia,
  ),
  queryFn: ({ signal }: { signal: AbortSignal }) => describeCurrentCut(current, signal),
  staleTime: Infinity,
});

/** The cut's whereabouts and frame for a save, from the cache when the chooser already asked. */
export const ensureCurrentCut = (
  queryClient: QueryClient,
  current: ProjectCurrentResponse,
): Promise<CurrentCut> => queryClient.ensureQueryData(currentCutQuery(current));

export const useProjectCurrentCut = (
  current: ProjectCurrentResponse,
  enabled: boolean,
): CurrentCut | null => {
  const query = useQuery({ ...currentCutQuery(current), enabled });
  return query.data ?? null;
};
