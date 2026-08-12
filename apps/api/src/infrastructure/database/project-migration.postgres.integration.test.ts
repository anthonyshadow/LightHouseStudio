import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createEmptyProjectSnapshot } from '@studio/domain';
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

describe.runIf(databaseUrl !== undefined)(
  'Project correction migration PostgreSQL preflight',
  () => {
    it('reconstructs only truthful Prompt 01 lineage without fabricating provenance', async () => {
      const baseUrl = new URL(databaseUrl!);
      const databaseName = `lightframe_prompt02_${randomUUID().replaceAll('-', '')}`;
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
          for (const filename of migrationFiles.filter((name) => name < '0010_')) {
            await applyMigration(client, filename);
          }

          const ownerUserId = randomUUID();
          const projectId = randomUUID();
          const firstRevisionId = randomUUID();
          const secondRevisionId = randomUUID();
          const sourceAssetId = randomUUID();
          const versionAssetId = randomUUID();
          const savedVideoId = randomUUID();
          const videoVersionId = randomUUID();
          const now = '2026-08-11T12:00:00.000Z';
          const later = '2026-08-11T12:05:00.000Z';
          const firstSnapshot = {
            ...createEmptyProjectSnapshot(now),
            sourceAssetId,
          };
          const secondSnapshot = {
            ...firstSnapshot,
            workingMedia: {
              kind: 'saved-video-version' as const,
              savedVideoId,
              videoVersionId,
            },
            lastSuccessfulOutput: { savedVideoId, videoVersionId },
            workflowPhase: 'review' as const,
            updatedAt: later,
          };

          await client.query(
            `insert into users
            (id, login, normalized_login, username, email, display_name)
           values ($1, $2, $2, $3, $2, 'Migration Integration')`,
            [ownerUserId, `${ownerUserId}@project.test`, `p-${ownerUserId}`],
          );
          await client.query(
            `insert into media_assets
            (id, owner_user_id, storage_provider, storage_key, status, mime_type, filename,
             size_bytes, checksum_sha256)
           values
            ($1, $3, 'local', $4, 'ready', 'video/mp4', 'source.mp4', 100, $6),
            ($2, $3, 'local', $5, 'ready', 'video/mp4', 'version.mp4', 100, $7)`,
            [
              sourceAssetId,
              versionAssetId,
              ownerUserId,
              sourceAssetId,
              versionAssetId,
              'a'.repeat(64),
              'b'.repeat(64),
            ],
          );
          await client.query(
            `insert into saved_videos
            (id, owner_user_id, title, current_version_id, status, revision)
           values ($1, $2, 'Migrated Version', $3, 'ready', 1)`,
            [savedVideoId, ownerUserId, videoVersionId],
          );
          await client.query(
            `insert into video_versions
            (id, video_id, owner_user_id, ordinal, origin, asset_id, mime_type, filename,
             size_bytes, duration_ms, width, height)
           values ($1, $2, $3, 1, 'uploaded', $4, 'video/mp4', 'version.mp4', 100, 1000, 1280, 720)`,
            [videoVersionId, savedVideoId, ownerUserId, versionAssetId],
          );
          await client.query(
            `insert into projects
            (id, owner_user_id, title, status, version, current_revision_id,
             current_revision_number, created_at, updated_at)
           values ($1, $2, 'Prompt 01 Project', 'completed', 2, null, 0, $3, $4)`,
            [projectId, ownerUserId, now, later],
          );
          await client.query(
            `insert into project_revisions
            (id, project_id, owner_user_id, revision_number, parent_revision_id,
             parent_revision_number, snapshot_schema_version, snapshot, author_kind,
             author_id, source, created_at)
           values
            ($1, $3, $4, 1, null, null, 1, $5, 'user', $9, 'create', $7),
            ($2, $3, $4, 2, $1, 1, 1, $6, 'user', $9, 'user-edit', $8)`,
            [
              firstRevisionId,
              secondRevisionId,
              projectId,
              ownerUserId,
              firstSnapshot,
              secondSnapshot,
              now,
              later,
              ownerUserId,
            ],
          );
          await client.query(
            `insert into project_assets
            (project_id, owner_user_id, asset_id, role, revision_id, revision_number, created_at)
           values ($1, $2, $3, 'source', $4, 1, $5)`,
            [projectId, ownerUserId, sourceAssetId, firstRevisionId, now],
          );
          await client.query(
            `insert into project_outputs
            (project_id, owner_user_id, saved_video_id, video_version_id,
             revision_id, revision_number, created_at)
           values ($1, $2, $3, $4, $5, 1, $6)`,
            [projectId, ownerUserId, savedVideoId, videoVersionId, firstRevisionId, now],
          );
          await client.query(
            `update projects
           set current_revision_id = $2, current_revision_number = 2
           where id = $1`,
            [projectId, secondRevisionId],
          );

          await client.query(`update project_revisions set snapshot = $2 where id = $1`, [
            secondRevisionId,
            {
              ...secondSnapshot,
              creativeIntent: { ...secondSnapshot.creativeIntent, userIntent: 'x'.repeat(4_001) },
            },
          ]);
          await expect(applyMigration(client, '0010_quiet_wind_dancer.sql')).rejects.toThrow(
            'unsupported or non-strict snapshots',
          );
          await client.query(`update project_revisions set snapshot = $2 where id = $1`, [
            secondRevisionId,
            secondSnapshot,
          ]);

          await applyMigration(client, '0010_quiet_wind_dancer.sql');

          await expect(
            client.query(
              `select revision_id, role from project_assets
             where project_id = $1 and asset_id = $2 order by revision_number`,
              [projectId, sourceAssetId],
            ),
          ).resolves.toMatchObject({
            rows: [
              { revision_id: firstRevisionId, role: 'source' },
              { revision_id: secondRevisionId, role: 'source' },
            ],
          });
          await expect(
            client.query(
              `select revision_id, role, saved_video_id, video_version_id
             from project_version_references where project_id = $1`,
              [projectId],
            ),
          ).resolves.toMatchObject({
            rows: [
              {
                revision_id: secondRevisionId,
                role: 'working',
                saved_video_id: savedVideoId,
                video_version_id: videoVersionId,
              },
            ],
          });
          await expect(
            client.query(
              `select producing_revision_id, producing_revision_number
             from project_outputs where video_version_id = $1`,
              [videoVersionId],
            ),
          ).resolves.toMatchObject({
            rows: [{ producing_revision_id: firstRevisionId, producing_revision_number: 1 }],
          });
        } finally {
          client.release();
          await target.end();
        }
      } finally {
        if (created) await admin.query(`drop database ${databaseName} with (force)`);
        await admin.end();
      }
    }, 30_000);
  },
);
