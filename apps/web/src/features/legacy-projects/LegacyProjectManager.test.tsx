// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import {
  type GuidedProjectDataV1,
  type LocalProjectRepository,
  type ProjectRecordV1,
  type ProjectStorageState,
  type ProjectSummary,
} from '../guided-flow/types';
import { LegacyProjectManager } from './LegacyProjectManager';

const READY_STORAGE: ProjectStorageState = {
  health: 'ready',
  durable: true,
  notice: null,
};

const emptyGuidedData = (): GuidedProjectDataV1 => ({
  characterId: null,
  characterName: '',
  characterPrompt: '',
  characterDraft: null,
  guidedDesign: null,
  referenceMode: null,
  referenceImageAssetId: null,
  referenceImageStale: false,
  originalVideoArtifactId: null,
  originalVideoMetadata: null,
  originalAudioArtifactId: null,
  originalAudioMimeType: null,
  processedVideoArtifactId: null,
  processedVideoMetadata: null,
  finalVariant: null,
  selectedVoiceId: null,
  selectedVoiceName: null,
  downloadStartedAt: null,
  completedAt: null,
});

const createProject = (
  id: string,
  title: string,
  options: { readonly hasVideo?: boolean } = {},
): ProjectRecordV1 => ({
  schemaVersion: 1,
  id,
  title,
  revision: 1,
  checkpoint: 'complete',
  data: {
    ...emptyGuidedData(),
    characterName: title,
    originalVideoArtifactId: options.hasVideo ? `${id}-original` : null,
    originalVideoMetadata: options.hasVideo
      ? {
          filename: `${id}.webm`,
          mimeType: 'video/webm',
          sourceModeId: 'lucy-2.5',
          startedAt: '2026-07-19T12:00:00.000Z',
          durationMs: 3_000,
          sizeBytes: 12,
        }
      : null,
    finalVariant: options.hasVideo ? 'original' : null,
    completedAt: '2026-07-19T12:01:00.000Z',
  },
  createdAt: '2026-07-19T12:00:00.000Z',
  updatedAt: '2026-07-19T12:01:00.000Z',
});

const toSummary = (project: ProjectRecordV1): ProjectSummary => ({
  id: project.id,
  title: project.title,
  revision: project.revision,
  checkpoint: project.checkpoint,
  characterName: project.data.characterName,
  hasOriginalVideo: project.data.originalVideoArtifactId !== null,
  hasProcessedVideo: project.data.processedVideoArtifactId !== null,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});

const createRepository = (initialProjects: readonly ProjectRecordV1[]) => {
  const projects = new Map(initialProjects.map((project) => [project.id, project]));
  const video = new Blob(['legacy-video'], { type: 'video/webm' });
  const repository: LocalProjectRepository = {
    initialize: vi.fn(() => Promise.resolve(READY_STORAGE)),
    getStorageState: vi.fn(() => READY_STORAGE),
    list: vi.fn(() => Promise.resolve([...projects.values()].map(toSummary))),
    load: vi.fn((projectId: string) => Promise.resolve(projects.get(projectId) ?? null)),
    readArtifact: vi.fn(() => Promise.resolve(video)),
    deleteProject: vi.fn((projectId: string) => {
      projects.delete(projectId);
      return Promise.resolve();
    }),
    close: vi.fn(),
  };
  return repository;
};

const renderManager = (
  repository: LocalProjectRepository,
  options: {
    readonly storage?: ProjectStorageState;
    readonly onProjectCountChange?: (count: number) => void;
  } = {},
) =>
  render(
    <StudioDesignProvider>
      <LegacyProjectManager
        repository={repository}
        storage={options.storage ?? READY_STORAGE}
        {...(options.onProjectCountChange === undefined
          ? {}
          : { onProjectCountChange: options.onProjectCountChange })}
      />
    </StudioDesignProvider>,
  );

afterEach(cleanup);

describe('LegacyProjectManager', () => {
  it('lists legacy projects without Guided or reopen navigation', async () => {
    const repository = createRepository([
      createProject('project-1', 'Copper host', { hasVideo: true }),
      createProject('project-2', 'Night host'),
    ]);
    renderManager(repository);

    expect(await screen.findByRole('heading', { name: 'Copper host' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Night host' })).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Reopen')).not.toBeInTheDocument();
    expect(screen.getByText(/can no longer be reopened for editing/i)).toBeInTheDocument();
  });

  it('downloads the persisted final video with a readable filename', async () => {
    const user = userEvent.setup();
    const repository = createRepository([
      createProject('project-1', 'Copper Host', { hasVideo: true }),
    ]);
    const createObjectUrl = vi.fn(() => 'blob:legacy-video');
    const revokeObjectUrl = vi.fn();
    const originalCreateDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectUrl,
    });
    let downloadedFilename = '';
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(function captureDownload(this: HTMLAnchorElement) {
        downloadedFilename = this.download;
      });

    try {
      renderManager(repository);
      await user.click(await screen.findByRole('button', { name: 'Download Copper Host' }));

      await waitFor(() => expect(revokeObjectUrl).toHaveBeenCalledWith('blob:legacy-video'));
      expect(repository.load).toHaveBeenCalledWith('project-1');
      expect(repository.readArtifact).toHaveBeenCalledWith('project-1', 'project-1-original');
      expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
      expect(downloadedFilename).toMatch(/^copper-host-original-\d{4}-\d{2}-\d{2}\.webm$/u);
      expect(click).toHaveBeenCalledOnce();
    } finally {
      if (originalCreateDescriptor) {
        Object.defineProperty(URL, 'createObjectURL', originalCreateDescriptor);
      } else {
        Reflect.deleteProperty(URL, 'createObjectURL');
      }
      if (originalRevokeDescriptor) {
        Object.defineProperty(URL, 'revokeObjectURL', originalRevokeDescriptor);
      } else {
        Reflect.deleteProperty(URL, 'revokeObjectURL');
      }
    }
  });

  it('requires accessible confirmation, restores focus on cancel, and deletes project media', async () => {
    const user = userEvent.setup();
    const repository = createRepository([
      createProject('project-1', 'Copper host', { hasVideo: true }),
      createProject('project-2', 'Night host'),
    ]);
    const onProjectCountChange = vi.fn();
    const browserConfirm = vi.spyOn(window, 'confirm');
    renderManager(repository, { onProjectCountChange });

    const deleteButton = await screen.findByRole('button', { name: 'Delete Copper host' });
    await user.click(deleteButton);
    const confirmation = screen.getByRole('dialog', { name: 'Delete “Copper host”?' });
    expect(confirmation).toHaveTextContent(/all of its browser-local media/i);
    await waitFor(() =>
      expect(within(confirmation).getByRole('button', { name: 'Keep project' })).toHaveFocus(),
    );

    await user.click(within(confirmation).getByRole('button', { name: 'Keep project' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Delete Copper host' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('button', { name: 'Delete Copper host' }));
    await user.click(screen.getByRole('button', { name: 'Delete permanently' }));

    await waitFor(() =>
      expect(screen.queryByRole('heading', { name: 'Copper host' })).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Delete “Copper host”?' }),
      ).not.toBeInTheDocument(),
    );
    expect(repository.deleteProject).toHaveBeenCalledWith('project-1');
    expect(onProjectCountChange).toHaveBeenLastCalledWith(1);
    expect(screen.getByRole('heading', { name: 'Legacy projects' })).toHaveFocus();
    expect(browserConfirm).not.toHaveBeenCalled();
  });

  it('reports unavailable storage and loading failures without implying that data is absent', async () => {
    const repository = createRepository([]);
    vi.mocked(repository.list).mockRejectedValueOnce(new Error('IndexedDB could not be opened.'));
    renderManager(repository, {
      storage: {
        health: 'degraded',
        durable: false,
        notice: 'Legacy project storage is running in memory only.',
      },
    });

    expect(screen.getByText(/running in memory only/i)).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('IndexedDB could not be opened.');
    expect(screen.queryByText(/no legacy projects are stored/i)).not.toBeInTheDocument();
  });
});
