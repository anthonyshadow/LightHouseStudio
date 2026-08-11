import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const migrationUrl = new URL('../../../drizzle/0009_boring_marvel_apes.sql', import.meta.url);

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
