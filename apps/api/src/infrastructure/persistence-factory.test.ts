import { describe, expect, it } from 'vitest';
import { testConfig } from '../test/fakes.js';
import { createConfiguredPersistence } from './persistence-factory.js';

describe('createConfiguredPersistence', () => {
  it('preserves the default local composition without opening a database', async () => {
    await expect(createConfiguredPersistence(testConfig())).resolves.toBeUndefined();
  });

  it('fails before opening Neon when a non-local mode has no database URL', async () => {
    await expect(createConfiguredPersistence(testConfig({ databaseMode: 'neon' }))).rejects.toThrow(
      'DATABASE_URL',
    );
  });
});
