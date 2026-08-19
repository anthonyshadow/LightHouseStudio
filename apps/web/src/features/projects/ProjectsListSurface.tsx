import { useTheme } from '@emotion/react';
import type { ProjectContract } from '@studio/contracts';
import { formatDateTime } from '@studio/domain';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { projectPath } from '../../app/paths';
import { Button, StatusNotice } from '../../ui';
import {
  NewProjectDialog,
  DeleteProjectDialog,
  ProjectLifecycleDialog,
  RenameProjectDialog,
  safeProjectError,
  type ProjectLifecycleAction as LifecycleAction,
} from './ProjectDialogs';
import {
  projectsGroupFilterStyles,
  projectsHeaderActionsStyles,
  projectsLedgerEmptyStyles,
  projectsLedgerLayoutStyles,
  projectsLedgerListStyles,
  projectsLedgerRowStyles,
  projectsLedgerSectionStyles,
  projectsWorkspaceHeaderStyles,
  projectsWorkspaceInnerStyles,
} from './ProjectsListSurface.styles';
import { projectStatusLabel } from './projectStatusPresentation';
import { useProjectList } from './useProjectsController';

interface ProjectListSectionProps {
  readonly lifecycle: 'active' | 'archived';
  readonly campaignId?: string;
  readonly heading?: string;
  readonly onOpen: (project: ProjectContract) => void;
  readonly onRename: (project: ProjectContract, trigger: HTMLButtonElement) => void;
  readonly onLifecycle: (
    action: LifecycleAction,
    project: ProjectContract,
    trigger: HTMLButtonElement,
  ) => void;
  readonly onDelete: (project: ProjectContract, trigger: HTMLButtonElement) => void;
}

const ProjectListSection = ({
  lifecycle,
  campaignId,
  heading,
  onOpen,
  onRename,
  onLifecycle,
  onDelete,
}: ProjectListSectionProps) => {
  const theme = useTheme();
  const query = useProjectList(lifecycle, campaignId);
  const projects = useMemo(
    () => query.data?.pages.flatMap((page) => page.projects) ?? [],
    [query.data],
  );
  const archived = lifecycle === 'archived';

  return (
    <section
      css={projectsLedgerSectionStyles(theme)}
      aria-labelledby={`${lifecycle}-${campaignId ?? 'all'}-projects-heading`}
      data-project-ledger-section={lifecycle}
    >
      <header>
        <h3 id={`${lifecycle}-${campaignId ?? 'all'}-projects-heading`}>
          {heading ?? (archived ? 'Archived' : 'Active Projects')}
        </h3>
        <span>{projects.length} loaded</span>
      </header>
      {query.isPending ? <p role="status">Loading {lifecycle} Projects…</p> : null}
      {query.isError ? (
        <StatusNotice role="alert" tone="danger" title="Projects unavailable">
          <p>{safeProjectError(query.error)}</p>
          <Button size="small" onClick={() => void query.refetch()}>
            Retry
          </Button>
        </StatusNotice>
      ) : null}
      {!query.isPending && !query.isError && projects.length === 0 ? (
        <div css={projectsLedgerEmptyStyles(theme)}>
          <strong>{archived ? 'No archived Projects' : 'No active Projects yet'}</strong>
          <p>
            {archived
              ? campaignId === 'none'
                ? 'Archived Projects with no Campaign appear here and can be restored.'
                : 'Archived work appears here and can be restored.'
              : 'Start a Project to keep one video and all the work you do on it together. Naming it is optional — you can rename it later.'}
          </p>
        </div>
      ) : null}
      {projects.length > 0 ? (
        <ul
          css={projectsLedgerListStyles()}
          aria-label={heading ?? `${archived ? 'Archived' : 'Active'} Projects`}
        >
          {projects.map((project) => (
            <li key={project.id}>
              <article css={projectsLedgerRowStyles(theme)} data-project-ledger-row="">
                <div data-project-identity>
                  <h4>{project.title}</h4>
                </div>
                <div data-project-meta>
                  <span data-project-status>{projectStatusLabel(project.status)}</span>
                  <span data-project-updated>
                    Updated{' '}
                    <time dateTime={project.updatedAt}>{formatDateTime(project.updatedAt)}</time>
                  </span>
                </div>
                <div data-project-actions>
                  <Button
                    size="small"
                    variant="primary"
                    data-project-action="open"
                    onClick={() => onOpen(project)}
                  >
                    Open
                  </Button>
                  {!archived ? (
                    <Button
                      size="small"
                      data-project-action="rename"
                      onClick={(event) => onRename(project, event.currentTarget)}
                    >
                      Rename
                    </Button>
                  ) : null}
                  <Button
                    size="small"
                    variant={archived ? 'secondary' : 'quiet'}
                    data-project-action={archived ? 'restore' : 'archive'}
                    onClick={(event) =>
                      onLifecycle(archived ? 'restore' : 'archive', project, event.currentTarget)
                    }
                  >
                    {archived ? 'Restore' : 'Archive'}
                  </Button>
                  {archived ? (
                    <Button
                      size="small"
                      variant="danger"
                      data-project-action="delete"
                      onClick={(event) => onDelete(project, event.currentTarget)}
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </article>
            </li>
          ))}
        </ul>
      ) : null}
      {query.hasNextPage ? (
        <Button
          variant="quiet"
          busy={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Load more {lifecycle} Projects
        </Button>
      ) : null}
    </section>
  );
};

export const ProjectsListSurface = () => {
  const theme = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogReturnRef = useRef<HTMLElement | null>(null);
  const [renameProject, setRenameProject] = useState<ProjectContract | null>(null);
  const [lifecycleDialog, setLifecycleDialog] = useState<{
    readonly action: LifecycleAction;
    readonly project: ProjectContract;
  } | null>(null);
  const [deleteProject, setDeleteProject] = useState<ProjectContract | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<'all' | 'none'>('all');
  const [creating, setCreating] = useState(false);
  const routeCreateRequested =
    (location.state as { readonly createIntent?: string } | null)?.createIntent === 'project';
  const setHeadingRef = useCallback(
    (node: HTMLHeadingElement | null) => {
      headingRef.current = node;
      if (routeCreateRequested) dialogReturnRef.current = node;
    },
    [routeCreateRequested],
  );
  /**
   * Drops `createIntent` from this history entry. Every path that closes the dialog must call it —
   * a successful create used to skip it, so Back from the new Project re-opened the dialog over a
   * list that already contained it.
   */
  const clearRouteCreateIntent = () => {
    if (routeCreateRequested) void navigate(location.pathname, { replace: true, state: null });
  };

  const closeDialog = () => {
    setRenameProject(null);
    setLifecycleDialog(null);
    setDeleteProject(null);
  };
  const closeCreateDialog = () => {
    setCreating(false);
    clearRouteCreateIntent();
  };
  const openProject = (project: ProjectContract) => {
    void navigate(projectPath(project.id));
  };
  const openRenameDialog = (project: ProjectContract, trigger: HTMLButtonElement) => {
    dialogReturnRef.current = trigger;
    setRenameProject(project);
  };
  const openLifecycleDialog = (
    action: LifecycleAction,
    project: ProjectContract,
    trigger: HTMLButtonElement,
  ) => {
    dialogReturnRef.current = trigger;
    setLifecycleDialog({ action, project });
  };
  const openDeleteDialog = (project: ProjectContract, trigger: HTMLButtonElement) => {
    dialogReturnRef.current = trigger;
    setDeleteProject(project);
  };

  return (
    <div css={projectsWorkspaceInnerStyles(theme)} data-project-index="">
      <header css={projectsWorkspaceHeaderStyles(theme)}>
        <div>
          <h1 ref={setHeadingRef} tabIndex={-1}>
            Projects
          </h1>
          <p>Keep focused video work together. Start as a collection, become a workspace.</p>
        </div>
        <div css={projectsHeaderActionsStyles(theme)} data-project-header-actions="">
          <Button
            variant="primary"
            data-project-create="named"
            onClick={(event) => {
              dialogReturnRef.current = event.currentTarget;
              setCreating(true);
            }}
          >
            New Project
          </Button>
        </div>
      </header>

      <div role="status" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>

      <div css={projectsGroupFilterStyles(theme)} aria-label="Project groups">
        <Button
          variant="quiet"
          data-project-group="all"
          aria-pressed={activeGroup === 'all'}
          onClick={() => setActiveGroup('all')}
        >
          All Active
        </Button>
        <Button
          variant="quiet"
          data-project-group="none"
          aria-pressed={activeGroup === 'none'}
          onClick={() => setActiveGroup('none')}
        >
          No Campaign
        </Button>
      </div>

      <div css={projectsLedgerLayoutStyles(theme)}>
        <ProjectListSection
          lifecycle="active"
          {...(activeGroup === 'none'
            ? { campaignId: 'none' as const, heading: 'No Campaign' }
            : {})}
          onOpen={openProject}
          onRename={openRenameDialog}
          onLifecycle={openLifecycleDialog}
          onDelete={openDeleteDialog}
        />
        {/* The filter applies to both sections, or half the screen contradicts the other half. */}
        <ProjectListSection
          lifecycle="archived"
          {...(activeGroup === 'none'
            ? { campaignId: 'none' as const, heading: 'Archived · No Campaign' }
            : {})}
          onOpen={openProject}
          onRename={openRenameDialog}
          onLifecycle={openLifecycleDialog}
          onDelete={openDeleteDialog}
        />
      </div>

      {renameProject ? (
        <RenameProjectDialog
          project={renameProject}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onRenamed={(current) => {
            setAnnouncement(`Project renamed to ${current.project.title}.`);
            closeDialog();
          }}
        />
      ) : null}
      {creating || routeCreateRequested ? (
        <NewProjectDialog
          returnFocusRef={dialogReturnRef}
          onClose={closeCreateDialog}
          onCreated={(current) => {
            clearRouteCreateIntent();
            setAnnouncement(`${current.project.title} created.`);
            void navigate(projectPath(current.project.id));
          }}
        />
      ) : null}
      {lifecycleDialog ? (
        <ProjectLifecycleDialog
          action={lifecycleDialog.action}
          project={lifecycleDialog.project}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onChanged={(current, action) => {
            setAnnouncement(
              `${current.project.title} ${action === 'archive' ? 'archived' : 'restored'}.`,
            );
            closeDialog();
            window.requestAnimationFrame(() => headingRef.current?.focus());
          }}
        />
      ) : null}
      {deleteProject ? (
        <DeleteProjectDialog
          project={deleteProject}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onDeleted={(title) => {
            setAnnouncement(`${title} deleted.`);
            closeDialog();
            window.requestAnimationFrame(() => headingRef.current?.focus());
          }}
        />
      ) : null}
    </div>
  );
};
