import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../../../drizzle/0009_boring_marvel_apes.sql', import.meta.url);
const correctionMigrationUrl = new URL(
  '../../../drizzle/0010_quiet_wind_dancer.sql',
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
