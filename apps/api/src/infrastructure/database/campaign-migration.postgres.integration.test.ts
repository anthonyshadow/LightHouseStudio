import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';

const databaseUrl =
  process.env.LIGHTFRAME_PROJECT_TEST_DATABASE_URL ??
  (process.env.CI === 'true' || process.env.LIGHTFRAME_RUN_PROJECT_POSTGRES_TEST === 'true'
    ? process.env.DATABASE_URL
    : undefined);
const migrationsDirectory = fileURLToPath(new URL('../../../drizzle/', import.meta.url));

const applyMigration = async (client: PoolClient, filename: string): Promise<void> => {
  const sql = await readFile(new URL(`../../../drizzle/${filename}`, import.meta.url), 'utf8');
  await client.query('begin');
  try {
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim().length > 0) await client.query(statement);
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
};

describe.runIf(databaseUrl !== undefined)('Campaign migration PostgreSQL constraints', () => {
  it('leaves existing Projects unassigned and rejects cross-owner or cascading membership', async () => {
    const baseUrl = new URL(databaseUrl!);
    const databaseName = `lightframe_prompt05_${randomUUID().replaceAll('-', '')}`;
    const adminUrl = new URL(baseUrl);
    adminUrl.pathname = '/postgres';
    const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
    let created = false;
    try {
      await admin.query(`create database ${databaseName}`);
      created = true;
      const targetUrl = new URL(baseUrl);
      targetUrl.pathname = `/${databaseName}`;
      const target = new Pool({ connectionString: targetUrl.toString(), max: 1 });
      const client = await target.connect();
      try {
        const migrationFiles = (await readdir(migrationsDirectory))
          .filter((filename) => /^\d{4}_.+\.sql$/u.test(filename))
          .sort();
        for (const filename of migrationFiles.filter((name) => name < '0014_')) {
          await applyMigration(client, filename);
        }
        const ownerUserId = randomUUID();
        const otherOwnerUserId = randomUUID();
        const projectId = randomUUID();
        await client.query(
          `insert into users (id, login, normalized_login, username, email, display_name)
           values ($1, $2, $2, $3, $2, 'Campaign Migration'),
                  ($4, $5, $5, $6, $5, 'Other Campaign Migration')`,
          [
            ownerUserId,
            `${ownerUserId}@campaign.test`,
            `c-${ownerUserId}`,
            otherOwnerUserId,
            `${otherOwnerUserId}@campaign.test`,
            `c-${otherOwnerUserId}`,
          ],
        );
        await client.query(
          `insert into projects
           (id, owner_user_id, title, status, version, current_revision_id, current_revision_number)
           values ($1, $2, 'Existing Project', 'draft', 1, null, 0)`,
          [projectId, ownerUserId],
        );
        await applyMigration(client, '0014_violet_namor.sql');
        const existing = await client.query<{ campaign_id: string | null }>(
          'select campaign_id from projects where id = $1',
          [projectId],
        );
        expect(existing.rows[0]?.campaign_id).toBeNull();

        const sameOwnerCampaignId = randomUUID();
        const otherOwnerCampaignId = randomUUID();
        await client.query(
          `insert into campaigns (id, owner_user_id, name)
           values ($1, $2, 'Same owner'), ($3, $4, 'Other owner')`,
          [sameOwnerCampaignId, ownerUserId, otherOwnerCampaignId, otherOwnerUserId],
        );
        await expect(
          client.query('update projects set campaign_id = $1 where id = $2', [
            otherOwnerCampaignId,
            projectId,
          ]),
        ).rejects.toThrow();
        await client.query('update projects set campaign_id = $1 where id = $2', [
          sameOwnerCampaignId,
          projectId,
        ]);
        await expect(
          client.query('delete from campaigns where id = $1', [sameOwnerCampaignId]),
        ).rejects.toThrow();
      } finally {
        client.release();
        await target.end();
      }
    } finally {
      if (created) {
        await admin.query(`drop database if exists ${databaseName} with (force)`);
      }
      await admin.end();
    }
  }, 30_000);
});
