import type { AttachProjectAssetRequest } from '@studio/contracts';
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
// From the narrow module rather than the barrel: the shell's creation launcher mounts this, and
// the barrel would put every Project media call in every authenticated route's static closure.
import { attachProjectAsset, detachProjectAsset, listProjectAssets } from './projectAssetsApi';

const PAGE_SIZE = 24;

export const projectAssetQueryKeys = {
  project: (projectId: string) => ['projects', 'assets', projectId] as const,
  list: (projectId: string, kind: AttachProjectAssetRequest['kind'] | 'all') =>
    ['projects', 'assets', projectId, kind] as const,
};

/**
 * Attaching an asset from outside the Project surfaces — Studio character/outfit/voice creation,
 * the video attachment flow — still has to invalidate the cache the Project Assets grid reads. One
 * owner for the pair, so a new attach path cannot leave the grid stale.
 */
export const attachProjectAssetAndSync = async (
  queryClient: QueryClient,
  projectId: string,
  input: AttachProjectAssetRequest,
  signal?: AbortSignal,
) => {
  const result = await attachProjectAsset(projectId, input, signal);
  await queryClient.invalidateQueries({ queryKey: projectAssetQueryKeys.project(projectId) });
  return result;
};

export const useProjectAssetsController = (
  projectId: string,
  kind: AttachProjectAssetRequest['kind'] | 'all',
  /**
   * `enabled: false` keeps the hook mounted without asking. A surface that only sometimes has a
   * Project — a picker that promotes attachments when it is given one — must still call the hook
   * unconditionally, and a query for a Project id it does not have would be a guaranteed 404.
   */
  options: { readonly enabled?: boolean } = {},
) => {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: projectAssetQueryKeys.list(projectId, kind),
    queryFn: ({ pageParam, signal }) =>
      listProjectAssets({
        projectId,
        ...(kind === 'all' ? {} : { kind }),
        ...(pageParam ? { cursor: pageParam } : {}),
        pageSize: PAGE_SIZE,
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    enabled: options.enabled ?? true,
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: projectAssetQueryKeys.project(projectId) });
  const attachMutation = useMutation({
    mutationFn: (input: AttachProjectAssetRequest) => attachProjectAsset(projectId, input),
    onSuccess: invalidate,
  });
  const detachMutation = useMutation({
    mutationFn: (membershipId: string) => detachProjectAsset(projectId, membershipId),
    onSuccess: invalidate,
  });
  return { query, attachMutation, detachMutation } as const;
};
