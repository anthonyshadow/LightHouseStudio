import { useTheme } from '@emotion/react';
import type { ProjectContract } from '@studio/contracts';
import { formatDateTime } from '@studio/domain';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { projectPath, projectWorkspacePath } from '../../app/paths';
import {
  ActionMenu,
  Button,
  emptyExampleStyles,
  EmptyStatePreview,
  ListSearchField,
  SearchEmptyState,
  StatusNotice,
  useListSearch,
} from '../../ui';
import {
  NewProjectDialog,
  DeleteProjectDialog,
  DuplicateProjectDialog,
  ProjectLifecycleDialog,
  RenameProjectDialog,
  safeProjectError,
  type ProjectLifecycleAction as LifecycleAction,
} from './ProjectDialogs';
import {
  projectsGroupFilterStyles,
  projectsSearchRowStyles,
  projectsHeaderActionsStyles,
  projectsLedgerEmptyStyles,
  projectsLedgerLayoutStyles,
  projectsLedgerListStyles,
  projectsLedgerRowStyles,
  projectsLedgerSectionStyles,
  projectsWorkspaceHeaderStyles,
  projectsWorkspaceInnerStyles,
} from './ProjectsListSurface.styles';
import { projectPosterUrls } from './projectPosterPresentation';
import { stepForSnapshot } from './ProjectWorkflowProgress';
import { projectCountLabel, projectStatusLabel } from './projectStatusPresentation';
import { useProjectList } from './useProjectsController';
import { WorkPosterTile } from './WorkPosterTile';
import { KIND_ICONS } from './ProjectAssetThumbnail';

interface ProjectListSectionProps {
  readonly lifecycle: 'active' | 'archived';
  readonly campaignId?: string;
  readonly search?: string;
  readonly onClearSearch: () => void;
  readonly heading?: string;
  readonly onOpen: (project: ProjectContract) => void;
  readonly onRename: (project: ProjectContract, trigger: HTMLButtonElement | null) => void;
  readonly onDuplicate: (project: ProjectContract, trigger: HTMLButtonElement | null) => void;
  readonly onLifecycle: (
    action: LifecycleAction,
    project: ProjectContract,
    trigger: HTMLButtonElement | null,
  ) => void;
  readonly onDelete: (project: ProjectContract, trigger: HTMLButtonElement | null) => void;
}

const ProjectListSection = ({
  lifecycle,
  campaignId,
  search,
  onClearSearch,
  heading,
  onOpen,
  onRename,
  onDuplicate,
  onLifecycle,
  onDelete,
}: ProjectListSectionProps) => {
  const theme = useTheme();
  const query = useProjectList(lifecycle, campaignId, search);
  const projects = useMemo(
    () => query.data?.pages.flatMap((page) => page.projects) ?? [],
    [query.data],
  );
  const posters = useMemo(() => projectPosterUrls(query.data?.pages), [query.data]);
  const archived = lifecycle === 'archived';
  const total = query.data?.pages.at(-1)?.total ?? null;

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
        {/* Polite, so a settled search states its result count without interrupting typing. */}
        <span role="status" aria-live="polite">
          {total === null ? null : projectCountLabel(total, archived, search)}
        </span>
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
          {search === undefined ? (
            <>
              {archived ? null : <EmptyStatePreview />}
              <strong>{archived ? 'No archived Projects' : 'No active Projects yet'}</strong>
              <p>
                {archived
                  ? campaignId === 'none'
                    ? 'Archived Projects with no Campaign appear here and can be restored.'
                    : 'Archived work appears here and can be restored.'
                  : 'Start a Project to keep one video and all the work you do on it together. Naming it is optional — you can rename it later.'}
              </p>
              {archived ? null : (
                <p data-empty-example css={emptyExampleStyles(theme)}>
                  For example: a “Product demo” Project holding one original video, its Character
                  Swap runs, and every saved cut.
                </p>
              )}
            </>
          ) : (
            <SearchEmptyState
              noun={`${archived ? 'archived ' : ''}Projects`}
              term={search}
              onClear={onClearSearch}
            />
          )}
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
                  <span data-project-poster="">
                    {/* Decorative: the heading beside it already names the Project. */}
                    <WorkPosterTile
                      decorative
                      playBadge
                      icon={KIND_ICONS.video}
                      thumbnailUrl={posters.get(project.id) ?? null}
                      emptyCaption="No preview yet"
                      failedCaption="Preview didn’t load"
                      label={project.title}
                      kindNoun="Project"
                      unavailable={false}
                    />
                  </span>
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
                  <ActionMenu
                    label={`More actions for ${project.title}`}
                    items={[
                      ...(archived
                        ? []
                        : [
                            {
                              id: 'rename',
                              label: 'Rename',
                              onSelect: (trigger: HTMLButtonElement | null) =>
                                onRename(project, trigger),
                            },
                          ]),
                      {
                        id: 'duplicate',
                        label: 'Duplicate Project',
                        onSelect: (trigger) => onDuplicate(project, trigger),
                      },
                      {
                        id: archived ? 'restore' : 'archive',
                        label: archived ? 'Restore' : 'Archive',
                        danger: !archived,
                        onSelect: (trigger) =>
                          onLifecycle(archived ? 'restore' : 'archive', project, trigger),
                      },
                      ...(archived
                        ? [
                            {
                              id: 'delete',
                              label: 'Delete',
                              danger: true,
                              onSelect: (trigger: HTMLButtonElement | null) =>
                                onDelete(project, trigger),
                            },
                          ]
                        : []),
                    ]}
                  />
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
  const [duplicateProject, setDuplicateProject] = useState<ProjectContract | null>(null);
  const [announcement, setAnnouncement] = useState<string | null>(null);
  const [activeGroup, setActiveGroup] = useState<'all' | 'none'>('all');
  const [creating, setCreating] = useState(false);
  const search = useListSearch();
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
    setDuplicateProject(null);
  };
  const closeCreateDialog = () => {
    setCreating(false);
    clearRouteCreateIntent();
  };
  const openProject = (project: ProjectContract) => {
    void navigate(projectPath(project.id));
  };
  const openRenameDialog = (project: ProjectContract, trigger: HTMLButtonElement | null) => {
    dialogReturnRef.current = trigger;
    setRenameProject(project);
  };
  const openLifecycleDialog = (
    action: LifecycleAction,
    project: ProjectContract,
    trigger: HTMLButtonElement | null,
  ) => {
    dialogReturnRef.current = trigger;
    setLifecycleDialog({ action, project });
  };
  const openDeleteDialog = (project: ProjectContract, trigger: HTMLButtonElement | null) => {
    dialogReturnRef.current = trigger;
    setDeleteProject(project);
  };
  const openDuplicateDialog = (project: ProjectContract, trigger: HTMLButtonElement | null) => {
    dialogReturnRef.current = trigger;
    setDuplicateProject(project);
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

      <div css={projectsSearchRowStyles(theme)}>
        <ListSearchField
          label="Search Projects by name"
          placeholder="Project name"
          search={search}
        />
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
          {...(search.term === undefined ? {} : { search: search.term })}
          onClearSearch={search.clear}
          onOpen={openProject}
          onRename={openRenameDialog}
          onDuplicate={openDuplicateDialog}
          onLifecycle={openLifecycleDialog}
          onDelete={openDeleteDialog}
        />
        {/* The filter applies to both sections, or half the screen contradicts the other half. */}
        <ProjectListSection
          lifecycle="archived"
          {...(activeGroup === 'none'
            ? { campaignId: 'none' as const, heading: 'Archived · No Campaign' }
            : {})}
          {...(search.term === undefined ? {} : { search: search.term })}
          onClearSearch={search.clear}
          onOpen={openProject}
          onRename={openRenameDialog}
          onDuplicate={openDuplicateDialog}
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
      {duplicateProject ? (
        <DuplicateProjectDialog
          project={duplicateProject}
          returnFocusRef={dialogReturnRef}
          onClose={closeDialog}
          onDuplicated={(current) => {
            setAnnouncement(`${current.project.title} created. Nothing has been generated yet.`);
            closeDialog();
            // Opened on the step the copy is actually ready for, matching how the workspace itself
            // decides where a Project stands.
            void navigate(
              projectWorkspacePath(current.project.id, stepForSnapshot(current.revision.snapshot)),
            );
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
