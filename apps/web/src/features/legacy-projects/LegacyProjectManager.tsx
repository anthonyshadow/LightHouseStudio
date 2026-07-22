import { useTheme } from '@emotion/react';
import { useCallback, useEffect, useRef, useState, type RefCallback } from 'react';
import type {
  LocalProjectRepository,
  ProjectStorageState,
  ProjectSummary,
} from '../guided-flow/types';
import { Button, StatusNotice } from '../../ui';
import { ConfirmationDialog } from '../character-builder/ConfirmationDialog';
import {
  managerHeaderStyles,
  managerStyles,
  projectActionsStyles,
  projectCardStyles,
  projectListStyles,
} from './LegacyProjectManager.styles';

const friendlyError = (caught: unknown, fallback: string): string =>
  caught instanceof Error && caught.message ? caught.message : fallback;

const safeExtension = (mimeType: string): string => {
  if (mimeType.includes('mp4')) return 'mp4';
  if (mimeType.includes('quicktime')) return 'mov';
  return 'webm';
};

const slug = (value: string): string =>
  value
    .toLocaleLowerCase()
    .normalize('NFKD')
    .replaceAll(/[^a-z0-9]+/gu, '-')
    .replaceAll(/^-|-$/gu, '') || 'character-video';

const readableFilename = (
  characterName: string,
  voiceName: string | null,
  mimeType: string,
): string => {
  const day = new Date().toISOString().slice(0, 10);
  return `${slug(characterName)}-${slug(voiceName ?? 'original')}-${day}.${safeExtension(mimeType)}`;
};

export interface LegacyProjectManagerProps {
  readonly repository: LocalProjectRepository;
  readonly storage: ProjectStorageState;
  readonly focusProjectId?: string | null;
  readonly onProjectCountChange?: (count: number) => void;
}

export const LegacyProjectManager = ({
  repository,
  storage,
  focusProjectId = null,
  onProjectCountChange,
}: LegacyProjectManagerProps) => {
  const theme = useTheme();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const deleteButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const returnFocusProjectIdRef = useRef<string | null>(null);
  const deleteInvokerRef = useRef<HTMLElement>(null);
  const focusedProjectIdRef = useRef<string | null>(null);
  const onProjectCountChangeRef = useRef(onProjectCountChange);
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingProjectId, setDownloadingProjectId] = useState<string | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<ProjectSummary | null>(null);
  const [confirmationProject, setConfirmationProject] = useState<ProjectSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    onProjectCountChangeRef.current = onProjectCountChange;
  }, [onProjectCountChange]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loadedProjects = await repository.list();
      setProjects(loadedProjects);
      onProjectCountChangeRef.current?.(loadedProjects.length);
    } catch (caught) {
      setError(friendlyError(caught, 'Legacy projects could not be loaded.'));
    } finally {
      setLoading(false);
    }
  }, [repository]);

  useEffect(() => {
    let active = true;
    void repository.list().then(
      (loadedProjects) => {
        if (!active) return;
        setProjects(loadedProjects);
        setLoading(false);
        onProjectCountChangeRef.current?.(loadedProjects.length);
      },
      (caught: unknown) => {
        if (!active) return;
        setError(friendlyError(caught, 'Legacy projects could not be loaded.'));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [repository]);

  useEffect(() => {
    if (loading || !focusProjectId || focusedProjectIdRef.current === focusProjectId) return;
    const target = rowRefs.current.get(focusProjectId);
    if (!target) return;
    target.focus();
    target.scrollIntoView?.({ block: 'nearest' });
    focusedProjectIdRef.current = focusProjectId;
  }, [focusProjectId, loading, projects]);

  const rowRef =
    (projectId: string): RefCallback<HTMLLIElement> =>
    (node) => {
      if (node) rowRefs.current.set(projectId, node);
      else rowRefs.current.delete(projectId);
    };

  const deleteButtonRef =
    (projectId: string): RefCallback<HTMLButtonElement> =>
    (node) => {
      if (!node) {
        deleteButtonRefs.current.delete(projectId);
        return;
      }
      deleteButtonRefs.current.set(projectId, node);
      if (returnFocusProjectIdRef.current !== projectId) return;
      returnFocusProjectIdRef.current = null;
      queueMicrotask(() => node.focus());
    };

  const downloadProject = async (projectId: string) => {
    if (downloadingProjectId || deleting) return;
    setDownloadingProjectId(projectId);
    setError(null);
    try {
      const project = await repository.load(projectId);
      if (!project) throw new Error('This local project is no longer available.');
      const artifactId =
        project.data.finalVariant === 'processed' && project.data.processedVideoArtifactId
          ? project.data.processedVideoArtifactId
          : project.data.originalVideoArtifactId;
      if (!artifactId) throw new Error('This project does not have a downloadable video yet.');
      const blob = await repository.readArtifact(projectId, artifactId);
      if (!blob) throw new Error('The saved video bytes are unavailable.');

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = readableFilename(
        project.data.characterName,
        project.data.finalVariant === 'processed' ? project.data.selectedVoiceName : null,
        blob.type,
      );
      try {
        anchor.click();
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }
    } catch (caught) {
      setError(friendlyError(caught, 'The project could not be downloaded.'));
    } finally {
      setDownloadingProjectId(null);
    }
  };

  const askToDelete = (project: ProjectSummary) => {
    if (downloadingProjectId || deleting) return;
    returnFocusProjectIdRef.current = project.id;
    deleteInvokerRef.current = deleteButtonRefs.current.get(project.id) ?? null;
    setConfirmationProject(project);
    setError(null);
    setDeleteCandidate(project);
  };

  const cancelDelete = () => {
    if (deleting) return;
    setDeleteCandidate(null);
  };

  const confirmDelete = async () => {
    if (!deleteCandidate || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await repository.deleteProject(deleteCandidate.id);
      returnFocusProjectIdRef.current = null;
      deleteInvokerRef.current = headingRef.current;
      setDeleteCandidate(null);
      await refresh();
    } catch (caught) {
      setError(friendlyError(caught, 'The project could not be deleted.'));
    } finally {
      setDeleting(false);
    }
  };

  const actionInProgress = downloadingProjectId !== null || deleting;
  return (
    <section aria-labelledby="legacy-project-manager-heading" css={managerStyles(theme)}>
      <header css={managerHeaderStyles(theme)}>
        <h2 id="legacy-project-manager-heading" ref={headingRef} tabIndex={-1}>
          Legacy projects
        </h2>
        <p>
          Download or permanently remove projects created in the retired Guided experience. They can
          no longer be reopened for editing.
        </p>
      </header>

      {!storage.durable ? (
        <StatusNotice tone="warning">
          {storage.notice ?? 'Durable browser project storage is unavailable.'}
        </StatusNotice>
      ) : null}
      {error ? (
        <StatusNotice role="alert" tone="danger">
          {error}
        </StatusNotice>
      ) : null}
      {loading ? <p role="status">Loading legacy projects…</p> : null}

      {!loading && !error && projects.length === 0 ? (
        <StatusNotice>No legacy projects are stored in this browser.</StatusNotice>
      ) : null}

      {projects.length > 0 ? (
        <ul css={projectListStyles(theme)}>
          {projects.map((project) => (
            <li
              key={project.id}
              ref={rowRef(project.id)}
              tabIndex={-1}
              data-focus-target={focusProjectId === project.id}
              css={projectCardStyles(theme)}
            >
              <div>
                <h3>{project.title}</h3>
                <p>
                  {project.checkpoint} · Updated {new Date(project.updatedAt).toLocaleString()}
                </p>
              </div>
              <div css={projectActionsStyles(theme)}>
                {project.hasOriginalVideo || project.hasProcessedVideo ? (
                  <Button
                    size="small"
                    aria-label={`Download ${project.title}`}
                    busy={downloadingProjectId === project.id}
                    disabled={actionInProgress && downloadingProjectId !== project.id}
                    onClick={() => void downloadProject(project.id)}
                  >
                    {downloadingProjectId === project.id ? 'Downloading…' : 'Download video'}
                  </Button>
                ) : null}
                <Button
                  ref={deleteButtonRef(project.id)}
                  size="small"
                  variant="danger"
                  aria-label={`Delete ${project.title}`}
                  disabled={actionInProgress}
                  onClick={() => askToDelete(project)}
                >
                  Delete
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <ConfirmationDialog
        open={deleteCandidate !== null}
        title={
          confirmationProject ? `Delete “${confirmationProject.title}”?` : 'Delete legacy project?'
        }
        description="This permanently removes the legacy project and all of its browser-local media. This action cannot be undone."
        confirmLabel={deleting ? 'Deleting…' : 'Delete permanently'}
        cancelLabel="Keep project"
        danger
        busy={deleting}
        returnFocusRef={deleteInvokerRef}
        onCancel={cancelDelete}
        onConfirm={() => void confirmDelete()}
      />
    </section>
  );
};
