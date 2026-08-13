import type { ProjectContract, ProjectCurrentResponse } from '@studio/contracts';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef } from 'react';
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  moveProjectToCampaign,
  renameProject,
  restoreProject,
} from './projectsApi';

const PROJECT_PAGE_SIZE = 20;

export const projectQueryKeys = {
  all: ['projects'] as const,
  lists: ['projects', 'list'] as const,
  list: (lifecycle: 'active' | 'archived') => ['projects', 'list', lifecycle] as const,
  detail: (projectId: string) => ['projects', 'detail', projectId] as const,
};

const lifecycleForProject = (project: ProjectContract): 'active' | 'archived' =>
  project.archivedAt === null ? 'active' : 'archived';

export const useProjectList = (lifecycle: 'active' | 'archived', campaignId?: string) =>
  useInfiniteQuery({
    queryKey: [...projectQueryKeys.list(lifecycle), campaignId ?? 'all'],
    queryFn: ({ pageParam, signal }) =>
      listProjects({
        lifecycle,
        ...(campaignId === undefined ? {} : { campaignId }),
        pageSize: PROJECT_PAGE_SIZE,
        ...(pageParam ? { cursor: pageParam } : {}),
        signal,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
  });

export const useProjectsController = () => {
  const queryClient = useQueryClient();
  const pendingCreateKey = useRef<string | null>(null);

  const reconcile = useCallback(
    async (current: ProjectCurrentResponse) => {
      queryClient.setQueryData(projectQueryKeys.detail(current.project.id), current);
      await queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists });
      return current;
    },
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
    mutationFn: async (campaignId: string | null = null) => {
      const operationKey = pendingCreateKey.current ?? crypto.randomUUID();
      pendingCreateKey.current = operationKey;
      return createProject('Untitled Project', operationKey, campaignId);
    },
    onSuccess: async (current) => {
      pendingCreateKey.current = null;
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
      queryClient.setQueryData(projectQueryKeys.detail(projectId), current);
      await queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists });
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
    renameMutation,
    archiveMutation,
    restoreMutation,
    moveMutation,
    latestProject,
    renameLatest,
    changeLatestLifecycle,
  } as const;
};
