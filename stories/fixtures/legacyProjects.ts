import { fn } from 'storybook/test';
import type {
  GuidedProjectDataV1,
  LocalProjectRepository,
  ProjectRecordV1,
  ProjectStorageState,
  ProjectSummary,
} from '@web/features/guided-flow/types';

export const readyProjectStorage: ProjectStorageState = {
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

const createProject = (id: string, title: string, hasVideo: boolean): ProjectRecordV1 => ({
  schemaVersion: 1,
  id,
  title,
  revision: 1,
  checkpoint: hasVideo ? 'complete' : 'character-ready',
  data: {
    ...emptyGuidedData(),
    characterName: title,
    originalVideoArtifactId: hasVideo ? `${id}-original` : null,
    originalVideoMetadata: hasVideo
      ? {
          filename: `${id}.webm`,
          mimeType: 'video/webm',
          sourceModeId: 'lucy-latest',
          startedAt: '2026-07-19T12:00:00.000Z',
          durationMs: 18_000,
          sizeBytes: 4_200_000,
        }
      : null,
    finalVariant: hasVideo ? 'original' : null,
    completedAt: hasVideo ? '2026-07-19T12:01:00.000Z' : null,
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

export const createLegacyProjectRepository = (): LocalProjectRepository => {
  const projects = new Map(
    [
      createProject('project-1', 'Midnight culture host', true),
      createProject('project-2', 'Botanical explorer', false),
    ].map((project) => [project.id, project]),
  );
  const load: LocalProjectRepository['load'] = (projectId) =>
    Promise.resolve(projects.get(projectId) ?? null);
  const deleteProject: LocalProjectRepository['deleteProject'] = (projectId) => {
    projects.delete(projectId);
    return Promise.resolve();
  };
  return {
    initialize: fn(() => Promise.resolve(readyProjectStorage)),
    getStorageState: fn(() => readyProjectStorage),
    count: fn(() => Promise.resolve(projects.size)),
    list: fn(() => Promise.resolve([...projects.values()].map(toSummary))),
    load: fn(load),
    loadNewestCharacterDesign: fn(() => Promise.resolve(null)),
    readArtifact: fn(() => Promise.resolve(new Blob(['legacy-video'], { type: 'video/webm' }))),
    deleteProject: fn(deleteProject),
    close: fn(),
  };
};
