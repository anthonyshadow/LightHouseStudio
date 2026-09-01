import type { ProjectContract, ProjectCurrentResponse } from '@studio/contracts';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { useStableOperationKey } from './useStableOperationKey';
import {
  archiveProject,
  createProject,
  duplicateProject,
  getProject,
  listProjects,
  moveProjectToCampaign,
  renameProject,
  restoreProject,
  tombstoneProject,
} from './projectsApi';

const PROJECT_PAGE_SIZE = 20;

export const projectQueryKeys = {
  lists: ['projects', 'list'] as const,
  list: (lifecycle: 'active' | 'archived') => ['projects', 'list', lifecycle] as const,
  detail: (projectId: string) => ['projects', 'detail', projectId] as const,
  /** The most recent Version this Project has saved, whether or not it is still its current cut. */
  latestOutput: (projectId: string) => ['projects', 'latest-output', projectId] as const,
};

/**
 * The single owner of how a freshly authoritative Project lands in the cache: the detail entry is
 * replaced outright (the response *is* the new truth, so refetching it would only race), and the
 * lists are invalidated because a mutation can move a Project between lifecycle or Campaign pages.
 */
export const reconcileProject = async (
  queryClient: QueryClient,
  current: ProjectCurrentResponse,
): Promise<ProjectCurrentResponse> => {
  queryClient.setQueryData(projectQueryKeys.detail(current.project.id), current);
  await queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists });
  return current;
};

const lifecycleForProject = (project: ProjectContract): 'active' | 'archived' =>
  project.archivedAt === null ? 'active' : 'archived';

/**
 * `search` is part of the key, not just the request: a term identifies a different result set, so
 * its pages — and the cursors that walk them — must never be mixed with another term's.
 */
export const useProjectList = (
  lifecycle: 'active' | 'archived',
  campaignId?: string,
  search?: string,
) =>
  useInfiniteQuery({
    queryKey: [...projectQueryKeys.list(lifecycle), campaignId ?? 'all', search ?? ''],
    queryFn: ({ pageParam, signal }) =>
      listProjects({
        lifecycle,
        ...(campaignId === undefined ? {} : { campaignId }),
        ...(search === undefined ? {} : { search }),
        pageSize: PROJECT_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    placeholderData: keepPreviousData,
  });

export const useProjectsController = () => {
  const queryClient = useQueryClient();
  const createOperation = useStableOperationKey();
  const namedCreateOperation = useStableOperationKey();
  const duplicateOperation = useStableOperationKey();

  const reconcile = useCallback(
    (current: ProjectCurrentResponse) => reconcileProject(queryClient, current),
    [queryClient],
  );

  const invalidateProject = useCallback(
    async (projectId: string) => {
      await queryClient.invalidateQueries({ queryKey: projectQueryKeys.detail(projectId) });
      await queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists });
    },
    [queryClient],
  );

  const createMutation = useMutation({
    mutationFn: async (campaignId: string | null = null) =>
      createProject(
        'Untitled Project',
        createOperation.keyFor(JSON.stringify({ kind: 'create', campaignId })),
        campaignId,
      ),
    onSuccess: async (current) => {
      createOperation.reset();
      await reconcile(current);
    },
  });

  /**
   * The key is keyed on where the Project is being created, never on its title.
   *
   * A create has no version to compare against, so its idempotency key is the only thing standing
   * between a lost response and a duplicate. The dialog stays open on failure with the title still
   * editable, and an operator who tweaks it and retries means "the same creation, said better" —
   * folding the title into the key would mint a fresh one and commit a second Project.
   */
  const createNamedMutation = useMutation({
    mutationFn: async (input: { readonly title: string; readonly campaignId: string | null }) =>
      createProject(
        input.title,
        namedCreateOperation.keyFor(
          JSON.stringify({ kind: 'create-named', campaignId: input.campaignId }),
        ),
        input.campaignId,
      ),
    onSuccess: async (current) => {
      namedCreateOperation.reset();
      await reconcile(current);
    },
  });

  /**
   * A duplicate is a create, so it carries a create's idempotency: the key identifies which
   * Project is being copied and where, and is retained across retries until the attempt settles,
   * so a lost response — or a retry with an edited title — cannot produce two copies.
   */
  const duplicateMutation = useMutation({
    mutationFn: async (input: {
      readonly projectId: string;
      readonly title: string;
      readonly campaignId: string | null;
      readonly expectedVersion: number;
    }) =>
      duplicateProject(
        input.projectId,
        {
          title: input.title,
          campaignId: input.campaignId,
          expectedVersion: input.expectedVersion,
        },
        duplicateOperation.keyFor(
          JSON.stringify({
            kind: 'duplicate',
            projectId: input.projectId,
            campaignId: input.campaignId,
          }),
        ),
      ),
    onSuccess: async (current) => {
      duplicateOperation.reset();
      await reconcile(current);
    },
  });

  const renameMutation = useMutation({
    mutationFn: (input: {
      readonly projectId: string;
      readonly expectedVersion: number;
      readonly title: string;
    }) => renameProject(input.projectId, input.title, input.expectedVersion),
    onSuccess: reconcile,
    onError: (_error, input) => invalidateProject(input.projectId),
  });

  const archiveMutation = useMutation({
    mutationFn: (input: { readonly projectId: string; readonly expectedVersion: number }) =>
      archiveProject(input.projectId, input.expectedVersion),
    onSuccess: reconcile,
    onError: (_error, input) => invalidateProject(input.projectId),
  });

  const restoreMutation = useMutation({
    mutationFn: (input: { readonly projectId: string; readonly expectedVersion: number }) =>
      restoreProject(input.projectId, input.expectedVersion),
    onSuccess: reconcile,
    onError: (_error, input) => invalidateProject(input.projectId),
  });
  const tombstoneMutation = useMutation({
    mutationFn: (input: { readonly projectId: string; readonly expectedVersion: number }) =>
      tombstoneProject(input.projectId, input.expectedVersion),
    onSuccess: async (current) => {
      queryClient.removeQueries({ queryKey: projectQueryKeys.detail(current.project.id) });
      await queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists });
    },
    onError: (_error, input) => invalidateProject(input.projectId),
  });
  const moveMutation = useMutation({
    mutationFn: (input: {
      readonly projectId: string;
      readonly campaignId: string | null;
      readonly expectedVersion: number;
    }) => moveProjectToCampaign(input.projectId, input.campaignId, input.expectedVersion),
    onSuccess: reconcile,
    onError: (_error, input) => invalidateProject(input.projectId),
  });
  const renameMutateAsync = renameMutation.mutateAsync;
  const archiveMutateAsync = archiveMutation.mutateAsync;
  const restoreMutateAsync = restoreMutation.mutateAsync;

  const latestProject = useCallback(
    async (projectId: string): Promise<ProjectCurrentResponse> => {
      const current = await getProject(projectId);
      // Lists are invalidated by `reconcile` once the follow-up mutation lands; a read
      // that changes nothing does not need to refetch them.
      queryClient.setQueryData(projectQueryKeys.detail(projectId), current);
      return current;
    },
    [queryClient],
  );

  const renameLatest = useCallback(
    async (projectId: string, title: string): Promise<ProjectCurrentResponse> => {
      const current = await latestProject(projectId);
      if (current.project.title === title.trim()) return current;
      return renameMutateAsync({
        projectId,
        title,
        expectedVersion: current.project.version,
      });
    },
    [latestProject, renameMutateAsync],
  );

  const changeLatestLifecycle = useCallback(
    async (
      projectId: string,
      targetLifecycle: 'active' | 'archived',
    ): Promise<ProjectCurrentResponse> => {
      const current = await latestProject(projectId);
      if (lifecycleForProject(current.project) === targetLifecycle) return current;
      const mutateAsync = targetLifecycle === 'archived' ? archiveMutateAsync : restoreMutateAsync;
      return mutateAsync({
        projectId,
        expectedVersion: current.project.version,
      });
    },
    [archiveMutateAsync, latestProject, restoreMutateAsync],
  );

  return {
    createMutation,
    createNamedMutation,
    duplicateMutation,
    renameMutation,
    archiveMutation,
    restoreMutation,
    tombstoneMutation,
    moveMutation,
    latestProject,
    renameLatest,
    changeLatestLifecycle,
  } as const;
};
