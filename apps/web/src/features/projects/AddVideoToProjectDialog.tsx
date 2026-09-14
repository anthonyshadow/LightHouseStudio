import { useTheme } from '@emotion/react';
import type { ProjectContract, SavedVideoSummary } from '@studio/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { useState, type RefObject } from 'react';
import { useNavigate } from 'react-router';
import { projectWorkspacePath } from '../../app/paths';
import { Button, OverlayPanel, StatusNotice } from '../../ui';
import { safeProjectError } from './ProjectDialogs';
import {
  addSavedVideoAsProjectSource,
  listProjectSources,
  projectHoldsSavedVideoVersion,
} from './projectsApi';
import { reconcileProject, reconcileProjectMedia, useProjectList } from './useProjectsController';
import { useStableOperationKey } from './useStableOperationKey';
import { PROJECT_ADD_VIDEO_ACTION_LABEL } from './projectProcessingPresentation';

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
      /*
       * One read for both answers. The collection response carries the Project and its current
       * revision beside what it holds, so this is the compare-and-set the add below needs *and*
       * the check that the Project does not already hold this exact Version — which is what makes
       * a retry after a lost answer converge instead of storing the same video twice.
       */
      const held = await listProjectSources(project.id);
      if (projectHoldsSavedVideoVersion(held.sources, video)) {
        finish(project.id);
        return;
      }
      // Mirrors the server's request fingerprint for `source-accept`. Keying on `projectId` alone
      // let one key outlive the request it was minted for: after a first attempt landed but lost
      // its response, the retry re-read a bumped `expectedVersion`, and the same key with a
      // different fingerprint is rejected as an `operation-key` conflict — so a retry of a
      // *succeeded* operation surfaced as a 409 instead of reconciling. Rotating the key with the
      // request lets the preflight above recognise media the Project already holds and finish
      // cleanly.
      const operationKey = operation.keyFor(
        JSON.stringify({
          projectId: project.id,
          expectedVersion: held.project.version,
          expectedRevisionNumber: held.project.currentRevisionNumber,
          savedVideoId: video.id,
          videoVersionId: video.currentVersion.id,
        }),
      );
      const response = await addSavedVideoAsProjectSource({
        projectId: project.id,
        operationKey,
        expectedVersion: held.project.version,
        expectedRevisionNumber: held.project.currentRevisionNumber,
        savedVideoId: video.id,
        videoVersionId: video.currentVersion.id,
      });
      await reconcileProjectMedia(queryClient, project.id);
      await reconcileProject(queryClient, {
        project: response.project,
        revision: response.revision,
      });
      operation.reset();
      finish(project.id);
    } catch (caught) {
      setError(safeProjectError(caught));
    } finally {
      setBusyProjectId(null);
    }
  };

  return (
    <OverlayPanel
      open
      onClose={onClose}
      title={PROJECT_ADD_VIDEO_ACTION_LABEL}
      description={`Make the current Version of “${video.title}” part of a Project’s media. This is not an attachment: the Project works from it, as its original video where it has none yet and as more material beside the original where it does. The Asset stays reusable everywhere.`}
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
