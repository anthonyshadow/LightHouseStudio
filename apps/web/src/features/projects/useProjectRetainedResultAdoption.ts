import type { AdoptProjectWorkingMediaRequest } from '@studio/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useState } from 'react';
import { ProjectApiConflictError, reuseProjectWorkingMedia } from './projectsApi';
import type { ProjectSessionPort } from './useProjectSession';
import { useStableOperationKey } from './useStableOperationKey';

/**
 * Making a retained result the current cut, from wherever it is offered.
 *
 * Two surfaces need this now — the History list and the processing notice — and both must flush the
 * pending session, carry the same CAS tokens, mint one idempotency key per distinct attempt, and
 * refuse a response that did not actually become current. Duplicating that would be duplicating the
 * concurrency rules, so it lives here once.
 */
export const useProjectRetainedResultAdoption = (session: ProjectSessionPort) => {
  const projectId = session.projectId;
  const queryClient = useQueryClient();
  const operation = useStableOperationKey();
  const [busyItemKey, setBusyItemKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const adoptMedia = useCallback(
    async (media: AdoptProjectWorkingMediaRequest['media'], label: string, itemKey: string) => {
      setError(null);
      setMessage(null);
      if (!(await session.flush())) {
        setError('Save or discard your pending Project changes before changing the current cut.');
        return;
      }
      const latest = session.getCurrent();
      if (latest === null) return;
      const signature = JSON.stringify({
        projectId,
        expectedVersion: latest.project.version,
        expectedRevisionNumber: latest.revision.revisionNumber,
        media,
      });
      const operationKey = operation.keyFor(signature);
      setBusyItemKey(itemKey);
      try {
        const response = await reuseProjectWorkingMedia({
          projectId,
          operationKey,
          expectedVersion: latest.project.version,
          expectedRevisionNumber: latest.revision.revisionNumber,
          media,
          localEdit: null,
        });
        if (!response.isCurrent) {
          throw new ProjectApiConflictError('The Project advanced after this adoption.', {
            kind: 'revision',
            projectId,
            expectedRevisionNumber: response.revision.revisionNumber,
            actualRevisionNumber: response.project.currentRevisionNumber,
          });
        }
        operation.reset();
        session.acceptCurrent({ project: response.project, revision: response.revision });
        setMessage(
          `${label} is now the current cut. Your original video and the video’s current version were not changed.`,
        );
        await queryClient.invalidateQueries({ queryKey: ['projects', 'history', projectId] });
      } catch (caught) {
        setError(
          caught instanceof ProjectApiConflictError
            ? 'The Project changed before this older result could be used. Refresh and try again.'
            : 'This older result could not be used in the Project.',
        );
      } finally {
        setBusyItemKey(null);
      }
    },
    [operation, projectId, queryClient, session],
  );

  return { adoptMedia, busyItemKey, message, error } as const;
};
