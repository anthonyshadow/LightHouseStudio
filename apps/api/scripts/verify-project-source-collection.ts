/**
 * Dual-read verification for slice 3.2's source expand, against real data.
 *
 * The repository tests prove the two reads agree on fixtures this file never sees. This proves it on
 * whatever is actually stored: for every Project that holds a source, it compares what the legacy
 * single-source read authority answers (the row the current revision's `sourceAssetId` names) with
 * what the collection contains, and reports the counts prompt 30 has to act on before the read
 * authority moves.
 *
 * It issues one SELECT and nothing else. `db:verify-sources` pins `LIGHTFRAME_ENV=development`, so
 * it reads whatever `DATABASE_URL` that environment names; verifying a deployed database needs its
 * own pinned entry, which prompt 30 adds when it has one to verify.
 *
 *     bun run --filter @studio/api db:verify-sources
 */
import { fileURLToPath } from 'node:url';
import { config as loadEnvironment } from 'dotenv';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { loadSelectedEnvironmentFile } from '../src/config/environment-file.js';
import { parseEnvironment } from '../src/config/environment.js';
import { createPostgresDatabase } from '../src/infrastructure/database/client.js';
import { currentRevisionMatch } from '../src/infrastructure/database/project-repository.js';
import {
  projectRevisions,
  projectSources,
  projects,
} from '../src/infrastructure/database/schema.js';

loadSelectedEnvironmentFile({
  repositoryRoot: fileURLToPath(new URL('../../../', import.meta.url)),
  environment: process.env,
  load: (path, environment) =>
    loadEnvironment({ path, processEnv: environment, quiet: true, override: false }),
});

const { databaseUrl } = parseEnvironment(process.env);
if (databaseUrl === undefined) {
  throw new Error('Dual-read verification needs DATABASE_URL; this deployment stores no Projects.');
}

const connection = createPostgresDatabase(databaseUrl);

interface Divergence {
  readonly projectId: string;
  readonly reason: string;
}

try {
  const rows = await connection.db
    .select({
      projectId: projects.id,
      primaryAssetId: sql<string | null>`${projectRevisions.snapshot} ->> 'sourceAssetId'`,
      heldAssetId: projectSources.assetId,
    })
    .from(projects)
    .innerJoin(projectRevisions, currentRevisionMatch)
    .leftJoin(
      projectSources,
      and(
        eq(projectSources.projectId, projects.id),
        eq(projectSources.ownerUserId, projects.ownerUserId),
      ),
    )
    // The reads this verifies exclude tombstoned Projects, so counting them here would compare a
    // different population against itself. Their held sources are counted separately below, because
    // a tombstone still retains its bytes and the switch has to account for them.
    .where(isNull(projects.deletedAt));

  const [tombstoned] = await connection.db
    .select({ heldSources: sql<number>`count(*)::int` })
    .from(projectSources)
    .innerJoin(
      projects,
      and(
        eq(projects.id, projectSources.projectId),
        eq(projects.ownerUserId, projectSources.ownerUserId),
      ),
    )
    .where(sql`${projects.deletedAt} is not null`);

  const held = new Map<string, { primary: string | null; assets: string[] }>();
  for (const row of rows) {
    const entry = held.get(row.projectId) ?? { primary: row.primaryAssetId, assets: [] };
    if (row.heldAssetId !== null) entry.assets.push(row.heldAssetId);
    held.set(row.projectId, entry);
  }

  const divergences: Divergence[] = [];
  let withSources = 0;
  let collectionsLargerThanOne = 0;
  for (const [projectId, entry] of held) {
    if (entry.assets.length > 0) withSources += 1;
    if (entry.assets.length > 1) collectionsLargerThanOne += 1;
    // A Project duplicated before its source was accepted carries the pointer with no row, which is
    // pre-existing and legitimate — the legacy read answers 404 for it either way. The reverse is
    // the divergence: rows the pointer does not reach are invisible to every read.
    const holdsPrimary = entry.primary !== null && entry.assets.includes(entry.primary);
    if (entry.assets.length > 0 && !holdsPrimary) {
      divergences.push({
        projectId,
        reason: 'holds sources but none is the one the current revision names',
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        stage: 'verified',
        projects: held.size,
        projectsHoldingSources: withSources,
        sourcesHeldByTombstonedProjects: tombstoned?.heldSources ?? 0,
        collectionsLargerThanOne,
        divergences: divergences.length,
        detail: divergences.slice(0, 20),
      },
      null,
      2,
    ),
  );
  if (divergences.length > 0) process.exitCode = 1;
} finally {
  await connection.close();
}
