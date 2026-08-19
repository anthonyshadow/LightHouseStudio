import { useTheme } from '@emotion/react';
import type { ProjectContract, SavedVideoSummary } from '@studio/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { projectWorkspacePath } from '../../app/paths';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import { safeProjectError } from './ProjectDialogs';
import { getProject, reuseSavedVideoAsProjectSource } from './projectsApi';
import { reconcileProject, useProjectList } from './useProjectsController';
import { useStableOperationKey } from './useStableOperationKey';

/** Raised locally so its operator-facing copy is distinguishable from transport-vetted errors. */
class ProjectSourceOccupiedError extends Error {}

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
  const operation = useStableOperationKey();
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
        throw new ProjectSourceOccupiedError(
          `“${project.title}” already has an original video. Choose an empty Project instead.`,
        );
      }
      // Mirrors the server's request fingerprint for `source-accept`. Keying on `projectId` alone
      // let one key outlive the request it was minted for: after a first attempt landed but lost
      // its response, the retry re-read a bumped `expectedVersion`, and the same key with a
      // different fingerprint is rejected as an `operation-key` conflict — so a retry of a
      // *succeeded* operation surfaced as a 409 instead of reconciling. Rotating the key with the
      // request lets the preflight above recognise the Project's own source and finish cleanly.
      const operationKey = operation.keyFor(
        JSON.stringify({
          projectId: project.id,
          expectedVersion: current.project.version,
          expectedRevisionNumber: current.project.currentRevisionNumber,
          savedVideoId: video.id,
          videoVersionId: video.currentVersion.id,
        }),
      );
      const response = await reuseSavedVideoAsProjectSource({
        projectId: project.id,
        operationKey,
        expectedVersion: current.project.version,
        expectedRevisionNumber: current.project.currentRevisionNumber,
        savedVideoId: video.id,
        videoVersionId: video.currentVersion.id,
      });
      await reconcileProject(queryClient, {
        project: response.project,
        revision: response.revision,
      });
      operation.reset();
      finish(project.id);
    } catch (caught) {
      setError(
        caught instanceof ProjectSourceOccupiedError ? caught.message : safeProjectError(caught),
      );
    } finally {
      setBusyProjectId(null);
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title="Use as Project source"
      description={`Make the current Version of “${video.title}” the source of a Project that does not have one yet. This is not an attachment: it becomes the video the Project is built from. The Asset stays reusable everywhere.`}
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
