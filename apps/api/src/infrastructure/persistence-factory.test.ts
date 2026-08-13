import { describe, expect, it } from 'vitest';
import { testConfig } from '../test/fakes.js';
import { FileProjectRepository } from '../features/projects/file-project-repository.js';
import { FileSavedVideoRepository } from '../features/saved-videos/saved-video-repository.js';
import { createConfiguredPersistence } from './persistence-factory.js';

describe('createConfiguredPersistence', () => {
  it('composes file-backed Project authority without opening a database in local mode', async () => {
    const persistence = await createConfiguredPersistence(testConfig());
    expect(persistence?.projects).toBeInstanceOf(FileProjectRepository);
    expect(persistence?.projectProcessing).toBe(persistence?.projects);
    expect(persistence?.projectRetention).toBe(persistence?.projects);
    expect(persistence?.savedVideos).toBeInstanceOf(FileSavedVideoRepository);
  });

  it('fails before opening PostgreSQL when a non-local mode has no database URL', async () => {
    await expect(createConfiguredPersistence(testConfig({ databaseMode: 'neon' }))).rejects.toThrow(
      'DATABASE_URL',
    );
  });
});
