import type { ProjectSessionProposalContract } from '@studio/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { checkpointProject, getProject } from './projectsApi';
import { ProjectSessionController, type ProjectSessionPhase } from './projectSessionController';
import { projectQueryKeys } from './useProjectsController';

export interface ProjectSessionPort {
  readonly projectId: string;
  readonly phase: ProjectSessionPhase;
  readonly hasLocalProposal: boolean;
  readonly message: string | null;
  readonly propose: (proposal: Partial<ProjectSessionProposalContract>) => boolean;
  readonly flush: () => Promise<boolean>;
  readonly retry: () => Promise<boolean>;
  readonly discard: () => boolean;
}

export const useProjectSession = (projectId: string) => {
  const queryClient = useQueryClient();
  const pendingDisposal = useRef<{
    readonly controller: ProjectSessionController;
    readonly timer: ReturnType<typeof setTimeout>;
  } | null>(null);
  const controller = useMemo(
    () =>
      new ProjectSessionController(projectId, {
        load: getProject,
        save: (id, current, proposal, signal) =>
          checkpointProject(
            id,
            {
              expectedVersion: current.project.version,
              expectedRevisionNumber: current.project.currentRevisionNumber,
              proposal,
            },
            signal,
          ),
        publish: (current) => {
          queryClient.setQueryData(projectQueryKeys.detail(current.project.id), current);
          void queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists });
        },
      }),
    [projectId, queryClient],
  );
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  useEffect(() => {
    if (pendingDisposal.current?.controller === controller) {
      clearTimeout(pendingDisposal.current.timer);
      pendingDisposal.current = null;
    }
    void controller.hydrate();
    return () => {
      const timer = setTimeout(() => {
        controller.dispose();
        if (pendingDisposal.current?.controller === controller) pendingDisposal.current = null;
      }, 0);
      pendingDisposal.current = { controller, timer };
    };
  }, [controller]);

  const port = useMemo<ProjectSessionPort>(
    () => ({
      projectId,
      phase: snapshot.phase,
      hasLocalProposal: snapshot.hasLocalProposal,
      message: snapshot.message,
      propose: controller.propose,
      flush: controller.flush,
      retry: controller.retry,
      discard: controller.discard,
    }),
    [controller, projectId, snapshot.hasLocalProposal, snapshot.message, snapshot.phase],
  );

  return {
    ...snapshot,
    port,
    acceptCurrent: controller.acceptCurrent,
    retry: controller.retry,
    discard: controller.discard,
  } as const;
};
