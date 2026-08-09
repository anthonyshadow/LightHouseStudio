import { describe, expect, it } from 'vitest';
import { getTableConfig, type AnyPgTable } from 'drizzle-orm/pg-core';
import {
  assetStatus,
  assetStorageProvider,
  creativeAssets,
  creativeLibraries,
  directUploads,
  directUploadStatus,
  mediaAssets,
  operationStatus,
  outbox,
  outboxStatus,
  ownerMigrations,
  passwordCredentials,
  processingJobs,
  referenceImageAssets,
  resourceReferences,
  savedVideoReceipts,
  savedVideos,
  savedVoices,
  sessions,
  userPlan,
  userRole,
  userStatus,
  users,
  videoVersions,
} from './schema.js';

describe('Drizzle persistence schema', () => {
  it('materializes every normalized table with columns, constraints, and indexes', () => {
    const tables: readonly AnyPgTable[] = [
      users,
      passwordCredentials,
      sessions,
      mediaAssets,
      savedVideos,
      videoVersions,
      savedVideoReceipts,
      directUploads,
      savedVoices,
      ownerMigrations,
      creativeAssets,
      creativeLibraries,
      referenceImageAssets,
      processingJobs,
      outbox,
      resourceReferences,
    ];
    const configs = tables.map(getTableConfig);
    const references = configs.flatMap(({ foreignKeys }) =>
      foreignKeys.map((foreignKey) => foreignKey.reference()),
    );

    expect(configs.map(({ name }) => name)).toHaveLength(
      new Set(configs.map(({ name }) => name)).size,
    );
    expect(configs.every(({ columns }) => columns.length > 0)).toBe(true);
    expect(getTableConfig(processingJobs).indexes.map(({ config }) => config.name)).toContain(
      'processing_jobs_owner_active_unique',
    );
    expect(getTableConfig(mediaAssets).indexes).toHaveLength(3);
    expect(getTableConfig(creativeAssets).primaryKeys).toHaveLength(1);
    expect(
      references.every(({ columns, foreignColumns }) => columns.length === foreignColumns.length),
    ).toBe(true);
  });

  it('pins all persisted enum values used by migrations and adapters', () => {
    expect(userPlan.enumValues).toEqual(['free', 'plus', 'pro']);
    expect(userRole.enumValues).toEqual(['user', 'admin']);
    expect(userStatus.enumValues).toEqual(['active', 'disabled']);
    expect(assetStorageProvider.enumValues).toEqual(['local', 'r2']);
    expect(assetStatus.enumValues).toEqual([
      'pending',
      'ready',
      'missing',
      'deleting',
      'deleted',
      'failed',
    ]);
    expect(operationStatus.enumValues).toContain('ambiguous');
    expect(outboxStatus.enumValues).toEqual(['pending', 'processing', 'completed', 'failed']);
    expect(directUploadStatus.enumValues).toEqual([
      'pending',
      'uploading',
      'verifying',
      'ready',
      'failed',
      'aborted',
      'expired',
    ]);
  });
});
