import { useTheme } from '@emotion/react';
import { useCallback, useEffect, useState } from 'react';
import type { LocalProjectRepository, ProjectStorageState, ProjectSummary } from '../guided-flow';
import { Button, StatusNotice } from '../../ui';
import {
  contentCardStyles,
  guidedPageStyles,
  guidedShellStyles,
  guidedTopLineStyles,
  projectListStyles,
  quietNavStyles,
} from './GuidedExperience.styles';
import { friendlyError, readableFilename } from './guidedExperienceModel';

export const GuidedProjectBrowser = ({
  repository,
  storage,
}: {
  repository: LocalProjectRepository;
  storage: ProjectStorageState;
}) => {
  const theme = useTheme();
  const [projects, setProjects] = useState<readonly ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    void repository
      .list()
      .then(setProjects)
      .catch((caught: unknown) => setError(friendlyError(caught, 'Projects could not be loaded.')))
      .finally(() => setLoading(false));
  }, [repository]);

  useEffect(refresh, [refresh]);

  const downloadProject = async (projectId: string) => {
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
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (caught) {
      setError(friendlyError(caught, 'The project could not be downloaded.'));
    }
  };

  const deleteProject = async (project: ProjectSummary) => {
    if (
      !window.confirm(`Delete ${project.title} and its saved local media? This cannot be undone.`)
    )
      return;
    try {
      await repository.deleteProject(project.id);
      refresh();
    } catch (caught) {
      setError(friendlyError(caught, 'The project could not be deleted.'));
    }
  };

  return (
    <div css={guidedPageStyles(theme)}>
      <div css={guidedShellStyles(theme)}>
        <header css={guidedTopLineStyles(theme)}>
          <div>
            <h1>
              My <span>Projects</span>
            </h1>
            <p css={{ margin: '.25rem 0 0', color: theme.colors.textMuted }}>
              Browser-local projects and immutable original recordings.
            </p>
          </div>
          <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.xs }}>
            <a href="/" css={quietNavStyles(theme)}>
              Guided Flow
            </a>
            <a href="/advanced" css={quietNavStyles(theme)}>
              Advanced Studio
            </a>
          </div>
        </header>
        <main css={contentCardStyles(theme)}>
          {!storage.durable ? <StatusNotice tone="warning">{storage.notice}</StatusNotice> : null}
          {error ? (
            <StatusNotice role="alert" tone="danger">
              {error}
            </StatusNotice>
          ) : null}
          {loading ? <p role="status">Loading local projects…</p> : null}
          {!loading && projects.length === 0 ? (
            <StatusNotice>
              No saved projects yet. Complete a guided recording to see it here.
            </StatusNotice>
          ) : null}
          <ul css={projectListStyles(theme)}>
            {projects.map((project) => (
              <li key={project.id}>
                <div>
                  <h3>{project.title}</h3>
                  <p>
                    {project.checkpoint} · Updated {new Date(project.updatedAt).toLocaleString()}
                  </p>
                </div>
                <div css={{ display: 'flex', flexWrap: 'wrap', gap: theme.space.xs }}>
                  <a
                    href={`/?project=${encodeURIComponent(project.id)}`}
                    css={quietNavStyles(theme)}
                  >
                    Reopen
                  </a>
                  {project.hasOriginalVideo ? (
                    <Button size="small" onClick={() => void downloadProject(project.id)}>
                      Download Again
                    </Button>
                  ) : null}
                  <Button size="small" variant="danger" onClick={() => void deleteProject(project)}>
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </main>
      </div>
    </div>
  );
};
