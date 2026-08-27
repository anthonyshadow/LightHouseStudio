import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  createEmptyCreativeAssetStore,
  createEmptyProjectSnapshot,
  createSavedPrompt,
} from '@studio/domain';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { createPostgresDatabase } from './client.js';
import { DrizzleCreativeLibraryRepository } from './creative-library-repository.js';
import { DrizzleProjectRepository } from './project-repository.js';
import { DrizzleSavedVideoRepository } from './saved-video-repository.js';
import { DrizzleSavedVoiceRepository } from './saved-voice-repository.js';
import { withTemporaryPostgresDatabase } from './temporary-postgres.test-support.js';

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
      await withTemporaryPostgresDatabase(
        databaseUrl!,
        'lightframe_prompt02',
        async ({ url, client }) => {
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
          const legacyVideoAssetId = randomUUID();
          const legacySavedVideoId = randomUUID();
          const legacyVideoVersionId = randomUUID();
          const legacySavedVoiceId = randomUUID();
          const legacySavedVoiceProviderId = `legacy-voice-${randomUUID()}`;
          const legacyCreativeAssetId = `legacy-prompt-${randomUUID()}`;
          const legacyProcessingJobId = randomUUID();
          const now = '2026-08-11T12:00:00.000Z';
          const later = '2026-08-11T12:05:00.000Z';
          const legacyCreativeStore = createSavedPrompt(
            createEmptyCreativeAssetStore(),
            {
              title: 'Legacy studio look',
              prompt: 'Use soft studio lighting.',
              modelModeId: 'lucy-latest',
              source: 'manual',
            },
            { now, createId: () => legacyCreativeAssetId },
          );
          const legacyCreativePrompt = legacyCreativeStore.savedPrompts[0];
          if (legacyCreativePrompt === undefined)
            throw new Error('Expected a legacy prompt fixture.');
          const emptySnapshot = createEmptyProjectSnapshot(now);
          const firstSnapshot = {
            schemaVersion: 1 as const,
            sourceAssetId,
            workingMedia: emptySnapshot.workingMedia,
            presentedMedia: emptySnapshot.presentedMedia,
            selectedCharacter: null,
            selectedOutfit: null,
            selectedVoice: null,
            visualTreatment: { kind: 'none' as const },
            liveMode: null,
            creativeIntent: { promptId: null, recipeId: null, userIntent: '' },
            localEdit: emptySnapshot.localEdit,
            exportSpecification: emptySnapshot.exportSpecification,
            lastSuccessfulOutput: emptySnapshot.lastSuccessfulOutput,
            workflowPhase: emptySnapshot.workflowPhase,
            createdAt: emptySnapshot.createdAt,
            updatedAt: emptySnapshot.updatedAt,
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
            ($1, $4, 'local', $5, 'ready', 'video/mp4', 'source.mp4', 100, $8),
            ($2, $4, 'local', $6, 'ready', 'video/mp4', 'version.mp4', 100, $9),
            ($3, $4, 'local', $7, 'ready', 'video/mp4', 'legacy-unassigned.mp4', 120, $10)`,
            [
              sourceAssetId,
              versionAssetId,
              legacyVideoAssetId,
              ownerUserId,
              sourceAssetId,
              versionAssetId,
              legacyVideoAssetId,
              'a'.repeat(64),
              'b'.repeat(64),
              'c'.repeat(64),
            ],
          );
          await client.query(
            `insert into saved_videos
            (id, owner_user_id, title, current_version_id, status, revision)
           values
            ($1, $3, 'Migrated Version', $2, 'ready', 1),
            ($4, $3, 'Legacy unassigned', $5, 'ready', 1)`,
            [savedVideoId, videoVersionId, ownerUserId, legacySavedVideoId, legacyVideoVersionId],
          );
          await client.query(
            `insert into video_versions
            (id, video_id, owner_user_id, ordinal, origin, asset_id, mime_type, filename,
             size_bytes, duration_ms, width, height)
           values
            ($1, $3, $4, 1, 'uploaded', $5, 'video/mp4', 'version.mp4', 100, 1000, 1280, 720),
            ($2, $6, $4, 1, 'legacy-import', $7, 'video/mp4', 'legacy-unassigned.mp4', 120, 2000, 1280, 720)`,
            [
              videoVersionId,
              legacyVideoVersionId,
              savedVideoId,
              ownerUserId,
              versionAssetId,
              legacySavedVideoId,
              legacyVideoAssetId,
            ],
          );
          await client.query(
            `insert into saved_voices
              (id, owner_user_id, provider, provider_voice_id, public_owner_id, saved_at)
             values ($1, $2, 'elevenlabs', $3, 'legacy-public-owner', $4)`,
            [legacySavedVoiceId, ownerUserId, legacySavedVoiceProviderId, now],
          );
          await client.query(
            `insert into creative_libraries
              (owner_user_id, revision, schema_version, created_at, updated_at)
             values ($1, 1, $2, $3, $3)`,
            [ownerUserId, legacyCreativeStore.schemaVersion, now],
          );
          await client.query(
            `insert into creative_assets
              (id, owner_user_id, kind, revision, schema_version, payload, created_at, updated_at)
             values ($1, $2, 'saved-prompt', 1, $3, $4, $5, $5)`,
            [
              legacyCreativeAssetId,
              ownerUserId,
              legacyCreativeStore.schemaVersion,
              legacyCreativePrompt,
              now,
            ],
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

          for (const filename of migrationFiles.filter(
            (name) => name >= '0011_' && name < '0019_',
          )) {
            await applyMigration(client, filename);
          }
          await client.query(
            `insert into processing_jobs
              (id, owner_user_id, operation, provider, status, output_asset_id, expires_at)
             values ($1, $2, 'character-swap', 'legacy-provider', 'ready', $3, $4)`,
            [legacyProcessingJobId, ownerUserId, versionAssetId, '2026-08-11T13:00:00.000Z'],
          );
          await applyMigration(client, '0019_tearful_microchip.sql');
          await expect(
            client.query(
              `select result_asset_id, result_metadata, retry_of_job_id
               from processing_jobs where id = $1`,
              [legacyProcessingJobId],
            ),
          ).resolves.toMatchObject({
            rows: [{ result_asset_id: null, result_metadata: null, retry_of_job_id: null }],
          });
          await expect(
            client.query(`select job_id from project_jobs where job_id = $1`, [
              legacyProcessingJobId,
            ]),
          ).resolves.toMatchObject({ rows: [] });
          await expect(
            client.query(`update processing_jobs set result_metadata = '{}' where id = $1`, [
              legacyProcessingJobId,
            ]),
          ).rejects.toThrow('processing_jobs_result_consistent');
          await client.query(
            `insert into project_jobs
              (project_id, owner_user_id, job_id, initiating_revision_id,
               initiating_revision_number, created_at)
             values ($1, $2, $3, $4, 2, $5)`,
            [projectId, ownerUserId, legacyProcessingJobId, secondRevisionId, later],
          );
          await expect(
            client.query(
              `update project_jobs
               set result_revision_id = $2, result_revision_number = null
               where job_id = $1`,
              [legacyProcessingJobId, secondRevisionId],
            ),
          ).rejects.toThrow('project_jobs_result_revision_consistent');

          const remainingMigrations = migrationFiles.filter((name) => name >= '0020_');
          expect(remainingMigrations).toContain('0020_tiresome_wolf_cub.sql');
          expect(remainingMigrations).toContain('0021_slow_krista_starr.sql');
          for (const filename of remainingMigrations) await applyMigration(client, filename);

          const compatibility = createPostgresDatabase(url);
          try {
            const projects = new DrizzleProjectRepository(compatibility.db);
            const savedVideos = new DrizzleSavedVideoRepository(compatibility.db);
            const creativeLibrary = new DrizzleCreativeLibraryRepository(compatibility.db);
            const savedVoices = new DrizzleSavedVoiceRepository(compatibility.db);

            await expect(projects.getCurrent(ownerUserId, projectId)).resolves.toMatchObject({
              project: {
                id: projectId,
                campaignId: null,
                currentRevisionId: secondRevisionId,
                currentRevisionNumber: 2,
              },
              revision: { id: secondRevisionId, revisionNumber: 2 },
            });
            await expect(savedVideos.get(ownerUserId, legacySavedVideoId)).resolves.toMatchObject({
              video: {
                id: legacySavedVideoId,
                title: 'Legacy unassigned',
                currentVersionId: legacyVideoVersionId,
                status: 'ready',
              },
              versions: [
                {
                  id: legacyVideoVersionId,
                  assetId: legacyVideoAssetId,
                  origin: 'legacy-import',
                },
              ],
            });
            await expect(
              projects.assignedSavedVideoIds(ownerUserId, [savedVideoId, legacySavedVideoId]),
            ).resolves.toEqual(new Set([savedVideoId]));
            await expect(creativeLibrary.load(ownerUserId)).resolves.toMatchObject({
              revision: 1,
              store: { savedPrompts: [{ id: legacyCreativeAssetId }] },
            });
            await expect(savedVoices.list(ownerUserId)).resolves.toEqual([
              expect.objectContaining({
                id: legacySavedVoiceId,
                providerVoiceId: legacySavedVoiceProviderId,
                publicOwnerId: 'legacy-public-owner',
              }),
            ]);
          } finally {
            await compatibility.close();
          }

          await expect(
            client.query<{
              asset_linked: boolean;
              output_linked: boolean;
              source_linked: boolean;
              version_referenced: boolean;
              working_media_linked: boolean;
            }>(
              `select
                exists(select 1 from project_assets where asset_id = $1) as asset_linked,
                exists(select 1 from project_outputs where saved_video_id = $2) as output_linked,
                exists(select 1 from project_sources where saved_video_id = $2) as source_linked,
                exists(select 1 from project_version_references where saved_video_id = $2)
                  as version_referenced,
                exists(select 1 from project_working_media_adoptions where saved_video_id = $2)
                  as working_media_linked`,
              [legacyVideoAssetId, legacySavedVideoId],
            ),
          ).resolves.toMatchObject({
            rows: [
              {
                asset_linked: false,
                output_linked: false,
                source_linked: false,
                version_referenced: false,
                working_media_linked: false,
              },
            ],
          });
          const revisionSources = await client.query<{ enumlabel: string }>(
            `select enumlabel
               from pg_enum
               inner join pg_type on pg_type.oid = pg_enum.enumtypid
               where pg_type.typname = 'project_revision_source'
               order by enumsortorder`,
          );
          expect(revisionSources.rows.map(({ enumlabel }) => enumlabel)).toContain('output-save');
          await expect(
            client.query('select operation_id from project_output_operation_receipts'),
          ).resolves.toMatchObject({ rows: [] });
          await expect(
            client.query('select id from project_asset_memberships'),
          ).resolves.toMatchObject({ rows: [] });
        },
      );
    }, 45_000);
  },
);
