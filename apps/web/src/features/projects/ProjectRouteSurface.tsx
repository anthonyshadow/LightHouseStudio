import { useTheme } from '@emotion/react';
import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import { isProjectWorkspacePath, projectIdFromPath } from '../../app/paths';
import { ProjectDetailSurface, type ProjectRouteSurfaceProps } from './ProjectDetailSurface';
import {
  projectOverviewRouteStyles,
  projectsIndexRouteStyles,
  projectWorkspaceRouteStyles,
} from './ProjectRouteSurface.styles';
import { ProjectsListSurface } from './ProjectsListSurface';

export type { ProjectRecordingCandidate } from './ProjectSourceSection';
export type { ProjectRouteSurfaceProps } from './ProjectDetailSurface';

export const ProjectRouteSurface = (props: ProjectRouteSurfaceProps = {}) => {
  const theme = useTheme();
  const location = useLocation();
  const projectId = projectIdFromPath(location.pathname);
  const workspaceMode = props.workspaceMode ?? isProjectWorkspacePath(location.pathname);
  const routeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (routeRef.current) routeRef.current.scrollTop = 0;
  }, [location.pathname]);

  return (
    <div
      ref={routeRef}
      css={
        projectId === null
          ? projectsIndexRouteStyles(theme)
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
