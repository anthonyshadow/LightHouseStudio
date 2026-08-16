import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { APP_PATHS, studioCreatePath, type StudioCreationIntent } from '../app/paths';
import { getProject } from '../features/projects/projectsApi';

type ProjectVideoCreationContext =
  | Readonly<{ status: 'none' }>
  | Readonly<{ status: 'checking'; projectId: string }>
  | Readonly<{ status: 'ready'; projectId: string }>;

interface UseProjectVideoCreationContextOptions {
  readonly pathname: string;
  /**
   * History entry identity. The shell never unmounts, so verification is scoped per visit rather
   * than per mount: returning to the same URL later is a new entry and re-checks the Project.
   */
  readonly locationKey: string;
  readonly queryCreationIntent: StudioCreationIntent | null;
  readonly requestedCreationProjectId: string | null;
  readonly validCreationProjectId: string | null;
}

/**
 * Confirms that a `?projectId=` creation context still points at a Project the operator can add to.
 * An unparseable, inaccessible, archived or deleted Project silently degrades to standalone
 * creation rather than leaving the flow pointed at something it cannot attach to.
 *
 * Returns the verified Project id, or null while unverified or absent.
 */
export const useProjectVideoCreationContext = ({
  pathname,
  locationKey,
  queryCreationIntent,
  requestedCreationProjectId,
  validCreationProjectId,
}: UseProjectVideoCreationContextOptions): string | null => {
  const navigate = useNavigate();
  const requestKey =
    pathname === APP_PATHS.create && validCreationProjectId !== null
      ? `${locationKey}:${validCreationProjectId}`
      : null;
  const [verified, setVerified] = useState<{
    readonly requestKey: string;
    readonly projectId: string;
  } | null>(null);

  useEffect(() => {
    if (pathname !== APP_PATHS.create || requestedCreationProjectId === null) {
      return;
    }
    if (validCreationProjectId === null) {
      void navigate(
        studioCreatePath(queryCreationIntent ? { intent: queryCreationIntent } : undefined),
        {
          replace: true,
          state: null,
        },
      );
      return;
    }
    const projectId = validCreationProjectId;
    const currentRequestKey = requestKey;
    if (currentRequestKey === null) return;
    const controller = new AbortController();
    void getProject(projectId, controller.signal)
      .then((current) => {
        if (controller.signal.aborted) return;
        if (current.project.status !== 'archived' && current.project.status !== 'deleted') {
          setVerified({ requestKey: currentRequestKey, projectId });
          return;
        }
        void navigate(
          studioCreatePath(queryCreationIntent ? { intent: queryCreationIntent } : undefined),
          { replace: true, state: null },
        );
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        void navigate(
          studioCreatePath(queryCreationIntent ? { intent: queryCreationIntent } : undefined),
          { replace: true, state: null },
        );
      });
    return () => controller.abort('creation-context-changed');
  }, [
    navigate,
    pathname,
    queryCreationIntent,
    requestKey,
    requestedCreationProjectId,
    validCreationProjectId,
  ]);

  const context: ProjectVideoCreationContext =
    requestKey === null || validCreationProjectId === null
      ? { status: 'none' }
      : verified?.requestKey === requestKey
        ? { status: 'ready', projectId: validCreationProjectId }
        : { status: 'checking', projectId: validCreationProjectId };

  return context.status === 'ready' ? context.projectId : null;
};
