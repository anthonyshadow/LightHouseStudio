import { describe, expect, it } from 'vitest';
import { getTableConfig, type AnyPgTable } from 'drizzle-orm/pg-core';
import {
  assetStatus,
  assetStorageProvider,
  campaignOperationReceipts,
  campaigns,
  campaignStatus,
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
  projectAssetRole,
  projectAssets,
  projectJobs,
  projectOutputs,
  projectRevisionAuthorKind,
  projectRevisions,
  projectRevisionSource,
  projects,
  projectSourceKind,
  projectSources,
  projectStatus,
  projectVersionReferenceRole,
  projectVersionReferences,
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
      campaigns,
      campaignOperationReceipts,
      projects,
      projectRevisions,
      projectAssets,
      projectVersionReferences,
      projectJobs,
      projectOutputs,
      projectSources,
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
    expect(getTableConfig(processingJobs).indexes.map(({ config }) => config.name)).toContain(
      'processing_jobs_retry_idx',
    );
    expect(getTableConfig(processingJobs).foreignKeys.map((key) => key.getName())).toContain(
      'processing_jobs_retry_same_owner_fk',
    );
    expect(getTableConfig(mediaAssets).indexes).toHaveLength(3);
    expect(getTableConfig(creativeAssets).primaryKeys).toHaveLength(1);
    expect(getTableConfig(projectRevisions).indexes.map(({ config }) => config.name)).toContain(
      'project_revisions_project_number_unique',
    );
    expect(getTableConfig(projectRevisions).uniqueConstraints).toHaveLength(1);
    expect(
      [videoVersions, projectAssets, projectVersionReferences, projectJobs, projectOutputs].flatMap(
        (table) => getTableConfig(table).indexes.map(({ config }) => config.name),
      ),
    ).toEqual(
      expect.arrayContaining([
        'video_versions_asset_idx',
        'video_versions_thumbnail_asset_idx',
        'project_assets_project_revision_idx',
        'project_version_references_project_revision_idx',
        'project_jobs_project_revision_idx',
        'project_outputs_project_revision_idx',
      ]),
    );
    expect(getTableConfig(projects).foreignKeys.map((foreignKey) => foreignKey.getName())).toEqual(
      expect.arrayContaining([
        'projects_campaign_same_owner_fk',
        'projects_current_revision_same_project_fk',
      ]),
    );
    expect(getTableConfig(projects).indexes.map(({ config }) => config.name)).toEqual(
      expect.arrayContaining([
        'projects_owner_campaign_active_recent_idx',
        'projects_owner_campaign_archived_recent_idx',
      ]),
    );
    expect(getTableConfig(projectJobs).foreignKeys.map((key) => key.getName())).toContain(
      'project_jobs_result_revision_same_project_fk',
    );
    expect(getTableConfig(projectSources).foreignKeys).toHaveLength(5);
    expect(getTableConfig(projectSources).indexes.map(({ config }) => config.name)).toEqual(
      expect.arrayContaining([
        'project_sources_owner_operation_unique',
        'project_sources_asset_idx',
      ]),
    );
    expect(
      [projectAssets, projectJobs, projectOutputs].every(
        (table) => getTableConfig(table).foreignKeys.length >= 3,
      ),
    ).toBe(true);
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
    expect(projectStatus.enumValues).toEqual([
      'draft',
      'ready',
      'processing',
      'needs-attention',
      'completed',
      'archived',
      'deleted',
    ]);
    expect(campaignStatus.enumValues).toEqual(['active', 'archived', 'deleted']);
    expect(projectAssetRole.enumValues).toEqual([
      'source',
      'working',
      'presented',
      'reference',
      'job-input',
      'job-output',
      'audio',
      'thumbnail',
    ]);
    expect(projectVersionReferenceRole.enumValues).toEqual(['working', 'presented']);
    expect(projectRevisionAuthorKind.enumValues).toEqual(['user', 'system', 'migration']);
    expect(projectRevisionSource.enumValues).toEqual([
      'create',
      'user-edit',
      'job-result',
      'restore',
      'migration',
    ]);
    expect(projectSourceKind.enumValues).toEqual(['uploaded', 'recorded', 'saved-video-version']);
  });
});
