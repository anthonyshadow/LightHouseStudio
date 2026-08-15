import type { AttachProjectAssetRequest } from '@studio/contracts';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { attachProjectAsset, detachProjectAsset, listProjectAssets } from './projectsApi';

const PAGE_SIZE = 24;

export const projectAssetQueryKeys = {
  all: ['projects', 'assets'] as const,
  project: (projectId: string) => ['projects', 'assets', projectId] as const,
  list: (projectId: string, kind: AttachProjectAssetRequest['kind'] | 'all') =>
    ['projects', 'assets', projectId, kind] as const,
};

export const useProjectAssetsController = (
  projectId: string,
  kind: AttachProjectAssetRequest['kind'] | 'all',
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
