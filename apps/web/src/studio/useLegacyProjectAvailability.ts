import { useCallback, useEffect, useMemo, useState } from 'react';
import { createLocalProjectRepository } from '../features/guided-flow/projectRepository';
import type { LocalProjectRepository, ProjectStorageState } from '../features/guided-flow/types';
import { useStrictModeSafeDisposable } from '../orchestration/lifecycle/useStrictModeSafeDisposable';

export type LegacyProjectAvailabilityOptions = Readonly<{
  repository?: LocalProjectRepository;
}>;

export const useLegacyProjectAvailability = ({
  repository: repositoryOverride,
}: LegacyProjectAvailabilityOptions = {}) => {
  const createdRepository = useMemo(
    () => repositoryOverride ?? createLocalProjectRepository(),
    [repositoryOverride],
  );
  const repository = useStrictModeSafeDisposable(createdRepository);
  const [storage, setStorage] = useState<ProjectStorageState>(() => repository.getStorageState());
  const [projectCount, setProjectCount] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const initializedStorage = await repository.initialize();
        if (!active) return;
        setStorage(initializedStorage);

        try {
          const projects = await repository.list();
          if (active) setProjectCount(projects.length);
        } catch {
          // The manager owns user-facing list errors when it is opened.
        }
      } catch {
        // The repository's current storage state remains the availability signal.
      }
    })();
    return () => {
      active = false;
    };
  }, [repository]);

  const synchronizeProjectCount = useCallback(
    (count: number) => {
      setProjectCount(count);
      setStorage(repository.getStorageState());
    },
    [repository],
  );

  return {
    repository,
    storage,
    projectCount,
    synchronizeProjectCount,
  } as const;
};
