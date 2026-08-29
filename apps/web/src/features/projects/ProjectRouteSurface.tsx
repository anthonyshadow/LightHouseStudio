import { useTheme } from '@emotion/react';
import { useLocation } from 'react-router';
import { isProjectWorkspacePath, projectIdFromPath } from '../../app/paths';
import { useRouteViewState } from '../../app/useRouteViewState';
import { ProjectDetailSurface, type ProjectRouteSurfaceProps } from './ProjectDetailSurface';
import {
  projectOverviewRouteStyles,
  projectWorkspaceRouteStyles,
} from './ProjectRouteSurface.styles';
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
      css={
        projectId === null
          ? pageScrollRegionStyles(theme)
          : workspaceMode
            ? projectWorkspaceRouteStyles()
            : projectOverviewRouteStyles(theme)
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
