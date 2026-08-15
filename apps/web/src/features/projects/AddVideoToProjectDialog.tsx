import { useTheme } from '@emotion/react';
import type { ProjectContract, SavedVideoSummary } from '@studio/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { ApiClientError } from '../../adapters/api-client/apiClient';
import { projectWorkspacePath } from '../../app/paths';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import { getProject, reuseSavedVideoAsProjectSource } from './projectsApi';
import { projectQueryKeys, useProjectList } from './useProjectsController';

const messageForError = (error: unknown): string =>
  error instanceof ApiClientError || error instanceof Error
    ? error.message
    : 'The video could not be added to that Project.';

export const AddVideoToProjectDialog = ({
  video,
  returnFocusRef,
  onClose,
}: {
  readonly video: SavedVideoSummary;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly onClose: () => void;
}) => {
  const theme = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const projectsQuery = useProjectList('active');
  const projects = projectsQuery.data?.pages.flatMap((page) => page.projects) ?? [];
  const operationRef = useRef<{ readonly projectId: string; readonly key: string } | null>(null);
  const [busyProjectId, setBusyProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const finish = (projectId: string) => {
    onClose();
    void navigate(projectWorkspacePath(projectId));
  };

  const addToProject = async (project: ProjectContract) => {
    setBusyProjectId(project.id);
    setError(null);
    try {
      const current = await getProject(project.id);
      const source = current.revision.snapshot.presentedMedia;
      if (current.revision.snapshot.sourceAssetId !== null) {
        if (
          source?.kind === 'saved-video-version' &&
          source.savedVideoId === video.id &&
          source.videoVersionId === video.currentVersion.id
        ) {
          finish(project.id);
          return;
        }
        throw new Error(
          `“${project.title}” already has an immutable source. Choose an empty Project instead.`,
        );
      }
      const operationKey =
        operationRef.current?.projectId === project.id
          ? operationRef.current.key
          : crypto.randomUUID();
      operationRef.current = { projectId: project.id, key: operationKey };
      const response = await reuseSavedVideoAsProjectSource({
        projectId: project.id,
        operationKey,
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.project.currentRevisionNumber,
        savedVideoId: video.id,
        videoVersionId: video.currentVersion.id,
      });
      queryClient.setQueryData(projectQueryKeys.detail(project.id), {
        project: response.project,
        revision: response.revision,
      });
      await queryClient.invalidateQueries({ queryKey: projectQueryKeys.lists });
      operationRef.current = null;
      finish(project.id);
    } catch (caught) {
      setError(messageForError(caught));
    } finally {
      setBusyProjectId(null);
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="Add to Project"
      description={`Use the current Version of “${video.title}” as an empty Project's immutable source. The Asset remains reusable in other Projects.`}
      placement="bottom"
      size="wide"
      bodyMode="scroll"
      closeDisabled={busyProjectId !== null}
      closeOnBackdrop={busyProjectId === null}
      returnFocusRef={returnFocusRef}
    >
      {projectsQuery.isPending ? <p role="status">Loading Projects…</p> : null}
      {projectsQuery.isError ? (
        <StatusNotice role="alert" tone="danger" title="Projects unavailable">
          <p>Active Projects could not be loaded from the local API.</p>
          <Button size="small" onClick={() => void projectsQuery.refetch()}>
            Retry
          </Button>
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice role="alert" tone="warning" title="Video not added">
          {error}
        </StatusNotice>
      ) : null}
      {!projectsQuery.isPending && !projectsQuery.isError && projects.length === 0 ? (
        <StatusNotice tone="neutral" title="No active Projects">
          Create a Project first, then add this video from Assets or from the Project workspace.
        </StatusNotice>
      ) : null}
      {projects.length > 0 ? (
        <ul
          aria-label="Active Projects available for this video"
          css={{ display: 'grid', gap: theme.space.sm, margin: 0, padding: 0, listStyle: 'none' }}
        >
          {projects.map((project) => (
            <li key={project.id}>
              <Button
                variant="secondary"
                busy={busyProjectId === project.id}
                disabled={busyProjectId !== null}
                onClick={() => void addToProject(project)}
                css={{ width: '100%', minHeight: '3.5rem', justifyContent: 'space-between' }}
              >
                <span>{project.title}</span>
                <small>{project.campaignId === null ? 'No Campaign' : 'In a Campaign'}</small>
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      {projectsQuery.hasNextPage ? (
        <Button
          variant="quiet"
          busy={projectsQuery.isFetchingNextPage}
          onClick={() => void projectsQuery.fetchNextPage()}
        >
          Load more Projects
        </Button>
      ) : null}
    </OverlayPanel>
  );
};
