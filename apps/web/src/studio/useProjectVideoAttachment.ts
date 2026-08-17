import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { projectPath } from '../app/paths';
import { attachProjectAssetAndSync } from '../features/projects/useProjectAssetsController';

export type ProjectVideoAttachmentState =
  | Readonly<{ status: 'idle' }>
  | Readonly<{ status: 'attaching'; projectId: string; videoId: string }>
  | Readonly<{ status: 'error'; projectId: string; videoId: string; message: string }>;

interface UseProjectVideoAttachmentOptions {
  /** The verified Project this creation flow belongs to, or null for standalone creation. */
  readonly projectId: string | null;
  /** The Video that has just been saved to Assets, or null when nothing is newly saved. */
  readonly savedVideoId: string | null;
}

/**
 * Attaches an explicitly saved Video to the Project the creation flow was launched from, then
 * returns to Project detail.
 *
 * The save to Assets has already succeeded by the time this runs, so a failed attachment is
 * recoverable rather than fatal: the Video is kept and the operator is offered a retry. The attempt
 * key makes each (project, video, retry) triple run exactly once, so a re-render cannot duplicate
 * the membership.
 */
export const useProjectVideoAttachment = ({
  projectId,
  savedVideoId,
}: UseProjectVideoAttachmentOptions) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [state, setState] = useState<ProjectVideoAttachmentState>({ status: 'idle' });
  const [retryCount, setRetryCount] = useState(0);
  const attemptRef = useRef<string | null>(null);

  useEffect(() => {
    if (projectId === null || savedVideoId === null) return;
    const attemptKey = `${projectId}:${savedVideoId}:${retryCount}`;
    if (attemptRef.current === attemptKey) return;
    attemptRef.current = attemptKey;
    const controller = new AbortController();
    setState({ status: 'attaching', projectId, videoId: savedVideoId });
    void attachProjectAssetAndSync(
      queryClient,
      projectId,
      { kind: 'video', resourceId: savedVideoId },
      controller.signal,
    )
      .then(() => {
        if (!controller.signal.aborted) {
          setState({ status: 'idle' });
          void navigate(projectPath(projectId), { replace: true });
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            projectId,
            videoId: savedVideoId,
            message:
              'The Video was saved to Assets, but its Project association could not be completed.',
          });
        }
      });
    return () => controller.abort('project-video-context-changed');
  }, [navigate, projectId, queryClient, retryCount, savedVideoId]);

  const retry = useCallback(() => setRetryCount((current) => current + 1), []);

  return { state, retry } as const;
};
