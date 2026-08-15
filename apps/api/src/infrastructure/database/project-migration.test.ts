import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../../../drizzle/0009_boring_marvel_apes.sql', import.meta.url);
const correctionMigrationUrl = new URL(
  '../../../drizzle/0010_quiet_wind_dancer.sql',
  import.meta.url,
);
const receiptMigrationUrl = new URL('../../../drizzle/0012_huge_black_tom.sql', import.meta.url);
const lifecycleIndexMigrationUrl = new URL(
  '../../../drizzle/0013_natural_the_phantom.sql',
  import.meta.url,
);
const campaignMigrationUrl = new URL('../../../drizzle/0014_violet_namor.sql', import.meta.url);
const campaignListIndexMigrationUrl = new URL(
  '../../../drizzle/0015_wooden_invaders.sql',
  import.meta.url,
);
const projectSourceMigrationUrl = new URL(
  '../../../drizzle/0016_purple_layla_miller.sql',
  import.meta.url,
);
const projectWorkingMediaMigrationUrl = new URL(
  '../../../drizzle/0018_stormy_darkhawk.sql',
  import.meta.url,
);
const projectProcessingMigrationUrl = new URL(
  '../../../drizzle/0019_tearful_microchip.sql',
  import.meta.url,
);
const projectOutputMigrationUrl = new URL(
  '../../../drizzle/0020_tiresome_wolf_cub.sql',
  import.meta.url,
);
const projectAssetMembershipMigrationUrl = new URL(
  '../../../drizzle/0021_slow_krista_starr.sql',
  import.meta.url,
);

describe('Project aggregate migration', () => {
  it('is additive and creates every normalized Project relationship', async () => {
    const migration = await readFile(migrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE "projects"');
    expect(migration).toContain('CREATE TABLE "project_revisions"');
    expect(migration).toContain('CREATE TABLE "project_assets"');
    expect(migration).toContain('CREATE TABLE "project_jobs"');
    expect(migration).toContain('CREATE TABLE "project_outputs"');
    expect(migration).not.toMatch(/\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"/u);
    expect(migration).not.toContain('ALTER COLUMN');
  });

  it('installs owner-consistency keys before relationship foreign keys', async () => {
    const migration = await readFile(migrationUrl, 'utf8');
    const firstOwnerKey = migration.indexOf('ADD CONSTRAINT "media_assets_id_owner_unique" UNIQUE');
    const firstRelationshipForeignKey = migration.indexOf(
      'ADD CONSTRAINT "project_assets_project_owner_fk" FOREIGN KEY',
    );

    expect(firstOwnerKey).toBeGreaterThan(-1);
    expect(firstRelationshipForeignKey).toBeGreaterThan(firstOwnerKey);
    expect(migration).toContain('projects_current_revision_same_project_fk');
    expect(migration).toContain('project_revisions_project_number_unique');
    expect(migration).toContain('ON DELETE restrict');
  });
});

describe('Project invariant correction migration', () => {
  it('preflights strict snapshots and proven lineage before replacing keys', async () => {
    const migration = await readFile(correctionMigrationUrl, 'utf8');

    expect(migration).toContain('Project invariant migration preflight failed');
    expect(migration).toContain('unsupported or non-strict snapshots');
    expect(migration).toContain('project_snapshot_v1_is_valid');
    expect(migration).toContain('direct asset lineage cannot be proven');
    expect(migration).toContain('Saved Video Version lineage cannot be proven');
    expect(migration.indexOf('LOCK TABLE')).toBeLessThan(
      migration.indexOf('DROP CONSTRAINT "project_assets_project_id_asset_id_role_pk"'),
    );
  });

  it('rekeys revision lineage, preserves producer columns, and reconstructs only declared refs', async () => {
    const migration = await readFile(correctionMigrationUrl, 'utf8');

    expect(migration).toContain('PRIMARY KEY("project_id","revision_id","asset_id","role")');
    expect(migration).toContain('RENAME COLUMN "revision_id" TO "initiating_revision_id"');
    expect(migration).toContain('RENAME COLUMN "revision_id" TO "producing_revision_id"');
    expect(migration).toContain('CREATE TABLE "project_version_references"');
    expect(migration).toContain("WHERE media.value ->> 'kind' = 'saved-video-version'");
    expect(migration).not.toMatch(/\b(?:TRUNCATE|DELETE\s+FROM)\b/u);
  });
});

describe('Project operation receipt migration', () => {
  it('adds only the owner-scoped durable create receipt and supporting index', async () => {
    const migration = await readFile(receiptMigrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE "project_operation_receipts"');
    expect(migration).toContain('PRIMARY KEY("owner_user_id","operation_key")');
    expect(migration).toContain('project_operation_receipts_project_idx');
    expect(migration).toContain('"operation" = \'create\'');
    expect(migration).not.toMatch(/\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"/u);
  });
});

describe('Project lifecycle index migration', () => {
  it('adds owner-scoped indexes for both recent lifecycle feeds', async () => {
    const migration = await readFile(lifecycleIndexMigrationUrl, 'utf8');

    expect(migration).toContain('projects_owner_active_recent_idx');
    expect(migration).toContain('projects_owner_archived_recent_idx');
    expect(migration).toContain('"updated_at" DESC');
    expect(migration).toContain('"id" DESC');
    expect(migration).not.toMatch(/\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"/u);
  });
});

describe('Campaign organization migration', () => {
  it('adds owner-scoped Campaigns and nullable restrictive Project membership without backfill', async () => {
    const migration = await readFile(campaignMigrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE "campaigns"');
    expect(migration).toContain('CREATE TABLE "campaign_operation_receipts"');
    expect(migration).toContain('ALTER TABLE "projects" ADD COLUMN "campaign_id" uuid');
    expect(migration).toContain('projects_campaign_same_owner_fk');
    expect(migration).toContain('ON DELETE restrict');
    expect(migration).toContain('campaigns_owner_active_recent_idx');
    expect(migration).toContain('campaigns_owner_archived_recent_idx');
    expect(migration).not.toMatch(/\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"/u);
  });

  it('adds only the grouped active/archived Project list indexes', async () => {
    const migration = await readFile(campaignListIndexMigrationUrl, 'utf8');

    expect(migration).toContain('projects_owner_campaign_active_recent_idx');
    expect(migration).toContain('projects_owner_campaign_archived_recent_idx');
    expect(migration).toContain('"campaign_id"');
    expect(migration).not.toMatch(
      /\b(?:DROP|TRUNCATE|ALTER\s+TABLE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"/u,
    );
  });
});

describe('Project source migration', () => {
  it('adds immutable exact-lineage source authority without backfill or byte duplication', async () => {
    const migration = await readFile(projectSourceMigrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE "project_sources"');
    expect(migration).toContain('project_sources_owner_operation_unique');
    expect(migration).toContain('project_sources_revision_same_project_fk');
    expect(migration).toContain('project_sources_asset_owner_fk');
    expect(migration).toContain('project_sources_version_same_video_fk');
    expect(migration).toContain('project_sources_lineage_consistent');
    expect(migration).not.toMatch(
      /\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"|\bINSERT\s+INTO\b/u,
    );
  });
});

describe('Project working-media migration', () => {
  it('adds revision-scoped adoption receipts and explicit v1/v2 snapshot support without backfill', async () => {
    const migration = await readFile(projectWorkingMediaMigrationUrl, 'utf8');

    expect(migration).toContain('CREATE TABLE "project_working_media_adoptions"');
    expect(migration).toContain('project_working_media_owner_operation_unique');
    expect(migration).toContain('project_working_media_revision_same_project_fk');
    expect(migration).toContain('project_working_media_asset_owner_fk');
    expect(migration).toContain('project_working_media_version_same_video_fk');
    expect(migration).toContain('project_working_media_lineage_consistent');
    expect(migration).toContain('"snapshot_schema_version" in (1, 2)');
    expect(migration).not.toMatch(
      /\b(?:TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"|\bINSERT\s+INTO\b/u,
    );
  });
});

describe('Project processing authority migration', () => {
  it('adds retry/result correlation and exact result revision linkage without backfill', async () => {
    const migration = await readFile(projectProcessingMigrationUrl, 'utf8');

    expect(migration).toContain('ADD COLUMN "result_asset_id" uuid');
    expect(migration).toContain('ADD COLUMN "retry_of_job_id" uuid');
    expect(migration).toContain('processing_jobs_retry_same_owner_fk');
    expect(migration).toContain('project_jobs_result_revision_same_project_fk');
    expect(migration).toContain('processing_jobs_result_consistent');
    expect(migration).toContain('project_jobs_result_revision_consistent');
    expect(migration).not.toMatch(
      /\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"|\bINSERT\s+INTO\b/u,
    );
  });
});

describe('Project output authority migration', () => {
  it('adds output-save revision identity and owner-scoped replay receipts without backfill', async () => {
    const migration = await readFile(projectOutputMigrationUrl, 'utf8');

    expect(migration).toContain(
      'ALTER TYPE "public"."project_revision_source" ADD VALUE \'output-save\'',
    );
    expect(migration).toContain('CREATE TABLE "project_output_operation_receipts"');
    expect(migration).toContain('PRIMARY KEY("owner_user_id","operation_id")');
    expect(migration).toContain('project_output_receipts_fingerprint_length');
    expect(migration).toContain('project_output_receipts_revision_positive');
    expect(migration).toContain('project_output_operation_receipts_owner_user_id_users_id_fk');
    expect(migration).toContain('ON DELETE restrict');
    expect(migration).toContain('project_output_receipts_project_idx');
    expect(migration).not.toMatch(
      /\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"|\bINSERT\s+INTO\b/u,
    );
  });
});

describe('Project asset membership migration', () => {
  it('adds only the non-owning same-owner relation and bounded list index', async () => {
    const migration = await readFile(projectAssetMembershipMigrationUrl, 'utf8');

    expect(migration).toContain(
      "CREATE TYPE \"public\".\"project_asset_kind\" AS ENUM('video', 'character', 'outfit', 'voice')",
    );
    expect(migration).toContain('CREATE TABLE "project_asset_memberships"');
    expect(migration).toContain('project_asset_memberships_owner_project_kind_resource_unique');
    expect(migration).toContain('project_asset_memberships_project_owner_fk');
    expect(migration).toContain('ON DELETE cascade');
    expect(migration).toContain('project_asset_memberships_project_kind_recent_idx');
    expect(migration).not.toMatch(
      /\b(?:DROP|TRUNCATE)\b|\bDELETE\s+FROM\b|\bUPDATE\s+"|\bINSERT\s+INTO\b/u,
    );
  });
});
