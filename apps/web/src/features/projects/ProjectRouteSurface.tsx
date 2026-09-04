import { useTheme } from '@emotion/react';
import { useLocation } from 'react-router';
import { isProjectWorkspacePath, projectIdFromPath } from '../../app/paths';
import { useRouteViewState } from '../../app/useRouteViewState';
import { ProjectDetailSurface, type ProjectRouteSurfaceProps } from './ProjectDetailSurface';
import { projectWorkspaceRouteStyles } from './ProjectRouteSurface.styles';
import { ProjectsListSurface } from './ProjectsListSurface';
import { pageScrollRegionStyles } from '../../ui/primitives/PageShell.styles';

export type {
  ProjectCreateOperationId,
  ProjectCreateRuntime,
  ProjectCreativeResourceKind,
} from './ProjectCreateTaskPanel';
export type { ProjectRecordingCandidate } from './ProjectSourceSection';
export type { ProjectRouteSurfaceProps } from './ProjectDetailSurface';

export const ProjectRouteSurface = (props: ProjectRouteSurfaceProps = {}) => {
  const theme = useTheme();
  const location = useLocation();
  const projectId = projectIdFromPath(location.pathname);
  const workspaceMode = props.workspaceMode ?? isProjectWorkspacePath(location.pathname);
  const { routeRef, onScroll } = useRouteViewState<HTMLDivElement>({
    storageKey: 'lightframeProjectRouteView',
  });

  return (
    <div
      ref={routeRef}
      onScroll={onScroll}
      /*
       * The workspace lays itself out inside the shell's grid and each of its columns scrolls
       * separately. Every other Project route is an ordinary page, and this element is its
       * scrollport — `main` clips — so both take the shared region rather than restating it. The
       * overview had its own copy of those properties and quietly lost `overflow-y`, which left
       * the page below the fold unreachable.
       */
      css={
        projectId !== null && workspaceMode
          ? projectWorkspaceRouteStyles()
          : pageScrollRegionStyles(theme)
      }
      data-project-route=""
    >
      {projectId === null ? (
        <ProjectsListSurface />
      ) : (
        <ProjectDetailSurface projectId={projectId} {...props} workspaceMode={workspaceMode} />
      )}
    </div>
  );
};
