import { randomUUID } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { AiUsageOutcome } from '@studio/domain';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { PoolClient } from 'pg';
import { describe, expect, it } from 'vitest';
import { DrizzleAiUsageLedgerRepository } from './ai-usage-ledger-repository.js';
import { createPostgresDatabase } from './client.js';
import { withTemporaryPostgresDatabase } from './temporary-postgres.test-support.js';

const databaseUrl =
  process.env.LIGHTFRAME_PROJECT_TEST_DATABASE_URL ??
  (process.env.CI === 'true' || process.env.LIGHTFRAME_RUN_PROJECT_POSTGRES_TEST === 'true'
    ? process.env.DATABASE_URL
    : undefined);
const migrationsFolder = fileURLToPath(new URL('../../../drizzle/', import.meta.url));

interface CatalogueEntry {
  readonly name: string;
  readonly definition: string;
}

interface LedgerShape {
  readonly constraints: readonly CatalogueEntry[];
  readonly indexes: readonly CatalogueEntry[];
}

interface AppliedMigration {
  readonly id: number;
  readonly hash: string;
  readonly created_at: string | null;
}

/**
 * The ledger's shape as PostgreSQL renders it, not as the schema module declares it. Reading it
 * back from the catalogue is the point: the assertion has to fail when a migration stops producing
 * the table the plan describes, which a Drizzle-side snapshot could not tell us.
 */
const readLedgerShape = async (client: PoolClient): Promise<LedgerShape> => {
  const constraints = await client.query<CatalogueEntry>(
    `select conname as name, pg_get_constraintdef(oid) as definition
       from pg_constraint
       where conrelid = 'ai_usage_ledger'::regclass
       order by conname`,
  );
  const indexes = await client.query<CatalogueEntry>(
    `select indexname as name, indexdef as definition
       from pg_indexes
       where tablename = 'ai_usage_ledger'
       order by indexname`,
  );
  return { constraints: constraints.rows, indexes: indexes.rows };
};

const readAppliedMigrations = async (client: PoolClient): Promise<readonly AppliedMigration[]> => {
  const { rows } = await client.query<AppliedMigration>(
    `select id, hash, created_at::text as created_at
       from drizzle.__drizzle_migrations
       order by id`,
  );
  return rows;
};

const countLedgerRows = async (
  client: PoolClient,
  ownerUserId: string,
  jobId: string,
): Promise<number> => {
  const { rows } = await client.query<{ total: number }>(
    `select count(*)::int as total from ai_usage_ledger
       where owner_user_id = $1 and job_id = $2`,
    [ownerUserId, jobId],
  );
  return rows[0]?.total ?? -1;
};

/** A raw insert, so the constraint probes below reach the table rather than the repository. */
const insertLedgerRow = async (
  client: PoolClient,
  values: {
    readonly ownerUserId: string;
    readonly jobId: string;
    readonly outcome: AiUsageOutcome | null;
    readonly submittedAt: string;
    readonly completedAt: string | null;
  },
): Promise<void> => {
  await client.query(
    `insert into ai_usage_ledger
       (owner_user_id, job_id, operation, provider, outcome, submitted_at, completed_at)
     values ($1, $2, 'character-swap', 'wiro', $3, $4, $5)`,
    [values.ownerUserId, values.jobId, values.outcome, values.submittedAt, values.completedAt],
  );
};

describe.runIf(databaseUrl !== undefined)('AI usage ledger PostgreSQL migration', () => {
  it('migrates idempotently, then holds one row per submission per owner', async () => {
    await withTemporaryPostgresDatabase(
      databaseUrl!,
      'lightframe_ai_usage',
      async ({ url, client }) => {
        const migrationFiles = (await readdir(migrationsFolder))
          .filter((filename) => /^\d{4}_.+\.sql$/u.test(filename))
          .sort();
        expect(migrationFiles[0]).toBe('0000_public_thunderbolts.sql');
        expect(migrationFiles).toContain('0025_thick_captain_universe.sql');

        const connection = createPostgresDatabase(url);
        try {
          // The migrator is the deployment path, so running it is what "the migration applies" has
          // to mean here; running it twice is what "and is safe to run again" has to mean.
          await migrate(connection.db, { migrationsFolder });
          const firstPass = await readAppliedMigrations(client);
          expect(firstPass).toHaveLength(migrationFiles.length);
          const shapeAfterFirstPass = await readLedgerShape(client);

          await migrate(connection.db, { migrationsFolder });
          // Identical journal rows — same ids, same hashes, same recorded instants — is the proof
          // that the second pass applied nothing rather than re-applying and re-recording.
          expect(await readAppliedMigrations(client)).toEqual(firstPass);
          expect(await readLedgerShape(client)).toEqual(shapeAfterFirstPass);

          expect(shapeAfterFirstPass.constraints).toEqual([
            {
              name: 'ai_usage_ledger_outcome_completed_consistent',
              definition: 'CHECK (((outcome IS NULL) = (completed_at IS NULL)))',
            },
            {
              name: 'ai_usage_ledger_owner_user_id_job_id_pk',
              definition: 'PRIMARY KEY (owner_user_id, job_id)',
            },
            {
              name: 'ai_usage_ledger_owner_user_id_users_id_fk',
              definition: 'FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE RESTRICT',
            },
          ]);
          expect(shapeAfterFirstPass.indexes).toEqual([
            {
              name: 'ai_usage_ledger_open_idx',
              definition:
                'CREATE INDEX ai_usage_ledger_open_idx ON public.ai_usage_ledger ' +
                'USING btree (submitted_at) WHERE (outcome IS NULL)',
            },
            {
              name: 'ai_usage_ledger_owner_submitted_idx',
              definition:
                'CREATE INDEX ai_usage_ledger_owner_submitted_idx ON public.ai_usage_ledger ' +
                'USING btree (owner_user_id, submitted_at DESC NULLS LAST, job_id DESC NULLS LAST)',
            },
            {
              name: 'ai_usage_ledger_owner_user_id_job_id_pk',
              definition:
                'CREATE UNIQUE INDEX ai_usage_ledger_owner_user_id_job_id_pk ' +
                'ON public.ai_usage_ledger USING btree (owner_user_id, job_id)',
            },
          ]);

          const ownerUserId = randomUUID();
          const otherOwnerUserId = randomUUID();
          await client.query(
            `insert into users (id, login, normalized_login, username, email, display_name)
               values ($1, $2, $2, $3, $2, 'Ledger owner'),
                      ($4, $5, $5, $6, $5, 'Other ledger owner')`,
            [
              ownerUserId,
              `${ownerUserId}@ai-usage.test`,
              `u-${ownerUserId}`,
              otherOwnerUserId,
              `${otherOwnerUserId}@ai-usage.test`,
              `u-${otherOwnerUserId}`,
            ],
          );

          // An outcome with no completion instant, and a completion instant with no outcome: the
          // check has to refuse both directions, or a row could claim to be settled and unsettled.
          await expect(
            insertLedgerRow(client, {
              ownerUserId,
              jobId: randomUUID(),
              outcome: 'succeeded',
              submittedAt: '2026-08-01T09:00:00.000Z',
              completedAt: null,
            }),
          ).rejects.toThrow('ai_usage_ledger_outcome_completed_consistent');
          await expect(
            insertLedgerRow(client, {
              ownerUserId,
              jobId: randomUUID(),
              outcome: null,
              submittedAt: '2026-08-01T09:00:00.000Z',
              completedAt: '2026-08-01T09:01:00.000Z',
            }),
          ).rejects.toThrow('ai_usage_ledger_outcome_completed_consistent');
          await expect(
            insertLedgerRow(client, {
              ownerUserId: randomUUID(),
              jobId: randomUUID(),
              outcome: null,
              submittedAt: '2026-08-01T09:00:00.000Z',
              completedAt: null,
            }),
          ).rejects.toThrow('ai_usage_ledger_owner_user_id_users_id_fk');

          const duplicatedJobId = randomUUID();
          const duplicated = {
            ownerUserId: otherOwnerUserId,
            jobId: duplicatedJobId,
            outcome: 'succeeded',
            submittedAt: '2026-08-01T09:00:00.000Z',
            completedAt: '2026-08-01T09:02:00.000Z',
          } as const;
          await insertLedgerRow(client, duplicated);
          await expect(insertLedgerRow(client, duplicated)).rejects.toThrow(
            'ai_usage_ledger_owner_user_id_job_id_pk',
          );

          const ledger = new DrizzleAiUsageLedgerRepository(connection.db);

          const openedJobId = randomUUID();
          await ledger.record({
            ownerUserId,
            jobId: openedJobId,
            operation: 'character-swap',
            provider: 'wiro',
            outcome: null,
            submittedAt: '2026-09-01T10:00:00.000Z',
            completedAt: null,
          });
          // The closer carries a different submission instant, operation and provider on purpose:
          // only the opener saw the submission, so the stored row's account of it has to survive.
          await ledger.record({
            ownerUserId,
            jobId: openedJobId,
            operation: 'reconciled-elsewhere',
            provider: 'reconciler',
            outcome: 'succeeded',
            submittedAt: '2026-09-01T10:05:00.000Z',
            completedAt: '2026-09-01T10:04:00.000Z',
          });

          const racedJobId = randomUUID();
          await ledger.record({
            ownerUserId,
            jobId: racedJobId,
            operation: 'virtual-try-on',
            provider: 'bfl',
            outcome: null,
            submittedAt: '2026-09-01T11:00:00.000Z',
            completedAt: null,
          });
          await Promise.all([
            ledger.record({
              ownerUserId,
              jobId: racedJobId,
              operation: 'virtual-try-on',
              provider: 'bfl',
              outcome: 'succeeded',
              submittedAt: '2026-09-01T11:00:00.000Z',
              completedAt: '2026-09-01T11:02:00.000Z',
            }),
            ledger.record({
              ownerUserId,
              jobId: racedJobId,
              operation: 'virtual-try-on',
              provider: 'bfl',
              outcome: 'failed',
              submittedAt: '2026-09-01T11:00:00.000Z',
              completedAt: '2026-09-01T11:03:00.000Z',
            }),
          ]);

          expect(await countLedgerRows(client, ownerUserId, openedJobId)).toBe(1);
          expect(await countLedgerRows(client, ownerUserId, racedJobId)).toBe(1);

          const settlement = await ledger.listForOwner(ownerUserId, {
            since: '2026-09-01T10:00:00.000Z',
            pageSize: 10,
          });
          expect(settlement.nextCursor).toBeNull();
          expect(settlement.entries).toHaveLength(2);
          const [raced, opened] = settlement.entries;
          if (raced === undefined || opened === undefined)
            throw new Error('Expected both settled submissions.');
          expect(opened).toEqual({
            ownerUserId,
            jobId: openedJobId,
            operation: 'character-swap',
            provider: 'wiro',
            outcome: 'succeeded',
            submittedAt: '2026-09-01T10:00:00.000Z',
            completedAt: '2026-09-01T10:04:00.000Z',
          });
          expect(raced).toMatchObject({
            ownerUserId,
            jobId: racedJobId,
            operation: 'virtual-try-on',
            provider: 'bfl',
            submittedAt: '2026-09-01T11:00:00.000Z',
          });
          // Whichever writer reached the row first is by definition the first terminal outcome, and
          // the loser must have changed nothing — so the surviving pair is one writer's, never a
          // mixture of the two.
          expect([
            { outcome: 'succeeded', completedAt: '2026-09-01T11:02:00.000Z' },
            { outcome: 'failed', completedAt: '2026-09-01T11:03:00.000Z' },
          ]).toContainEqual({ outcome: raced.outcome, completedAt: raced.completedAt });

          await ledger.record({
            ownerUserId,
            jobId: racedJobId,
            operation: 'virtual-try-on',
            provider: 'bfl',
            outcome: 'cancelled',
            submittedAt: '2026-09-01T11:00:00.000Z',
            completedAt: '2026-09-01T11:30:00.000Z',
          });
          await expect(
            ledger.listForOwner(ownerUserId, {
              since: '2026-09-01T11:00:00.000Z',
              pageSize: 10,
            }),
          ).resolves.toEqual({ entries: [raced], nextCursor: null });

          // The same race with one non-terminal writer, which pins the outcome down: whichever of
          // the two lands first, the only terminal answer either of them carries is `succeeded`, so
          // a re-open arriving after the close must not reopen the row and a re-open arriving
          // before it must not stop the close.
          const reopenedJobId = randomUUID();
          const reopening = {
            ownerUserId,
            jobId: reopenedJobId,
            operation: 'voice-over',
            provider: 'elevenlabs',
            submittedAt: '2026-09-01T12:00:00.000Z',
          } as const;
          await ledger.record({ ...reopening, outcome: null, completedAt: null });
          await Promise.all([
            ledger.record({ ...reopening, outcome: null, completedAt: null }),
            ledger.record({
              ...reopening,
              outcome: 'succeeded',
              completedAt: '2026-09-01T12:07:00.000Z',
            }),
          ]);
          expect(await countLedgerRows(client, ownerUserId, reopenedJobId)).toBe(1);
          await expect(
            ledger.listForOwner(ownerUserId, {
              since: '2026-09-01T12:00:00.000Z',
              pageSize: 10,
            }),
          ).resolves.toEqual({
            entries: [
              {
                ...reopening,
                outcome: 'succeeded',
                completedAt: '2026-09-01T12:07:00.000Z',
              },
            ],
            nextCursor: null,
          });

          const windowStart = '2026-09-03T00:00:00.000Z';
          const justBeforeWindowJobId = randomUUID();
          const failedJobId = randomUUID();
          const runningEarlyJobId = randomUUID();
          const succeededJobId = randomUUID();
          const otherOwnerJobId = randomUUID();
          const expiredJobId = randomUUID();
          const runningLateJobId = randomUUID();
          await ledger.record({
            ownerUserId,
            jobId: justBeforeWindowJobId,
            operation: 'character-swap',
            provider: 'wiro',
            outcome: 'ambiguous',
            submittedAt: '2026-09-02T23:59:59.999Z',
            completedAt: '2026-09-03T00:00:01.000Z',
          });
          await ledger.record({
            ownerUserId,
            jobId: failedJobId,
            operation: 'character-swap',
            provider: 'wiro',
            outcome: 'failed',
            submittedAt: '2026-09-03T01:00:00.000Z',
            completedAt: '2026-09-03T01:01:00.000Z',
          });
          await ledger.record({
            ownerUserId,
            jobId: runningEarlyJobId,
            operation: 'character-swap',
            provider: 'wiro',
            outcome: null,
            submittedAt: '2026-09-03T02:00:00.000Z',
            completedAt: null,
          });
          await ledger.record({
            ownerUserId,
            jobId: succeededJobId,
            operation: 'character-swap',
            provider: 'wiro',
            outcome: 'succeeded',
            submittedAt: '2026-09-03T03:00:00.000Z',
            completedAt: '2026-09-03T03:02:00.000Z',
          });
          // Interleaved with this owner's page on purpose: it sorts between 04:00 and 03:00, so a
          // missing owner filter would surface it in the middle of the second page.
          await ledger.record({
            ownerUserId: otherOwnerUserId,
            jobId: otherOwnerJobId,
            operation: 'character-swap',
            provider: 'wiro',
            outcome: 'cancelled',
            submittedAt: '2026-09-03T03:30:00.000Z',
            completedAt: '2026-09-03T03:31:00.000Z',
          });
          await ledger.record({
            ownerUserId,
            jobId: expiredJobId,
            operation: 'character-swap',
            provider: 'wiro',
            outcome: 'expired',
            submittedAt: '2026-09-03T04:00:00.000Z',
            completedAt: '2026-09-03T04:03:00.000Z',
          });
          await ledger.record({
            ownerUserId,
            jobId: runningLateJobId,
            operation: 'character-swap',
            provider: 'wiro',
            outcome: null,
            submittedAt: '2026-09-03T05:00:00.000Z',
            completedAt: null,
          });

          const firstPage = await ledger.listForOwner(ownerUserId, {
            since: windowStart,
            pageSize: 2,
          });
          expect(firstPage.entries.map(({ jobId }) => jobId)).toEqual([
            runningLateJobId,
            expiredJobId,
          ]);
          expect(firstPage.nextCursor).toEqual({
            submittedAt: '2026-09-03T04:00:00.000Z',
            jobId: expiredJobId,
          });
          if (firstPage.nextCursor === null) throw new Error('Expected a second page.');
          const secondPage = await ledger.listForOwner(ownerUserId, {
            since: windowStart,
            cursor: firstPage.nextCursor,
            pageSize: 2,
          });
          expect(secondPage.entries.map(({ jobId }) => jobId)).toEqual([
            succeededJobId,
            runningEarlyJobId,
          ]);
          if (secondPage.nextCursor === null) throw new Error('Expected a third page.');
          const thirdPage = await ledger.listForOwner(ownerUserId, {
            since: windowStart,
            cursor: secondPage.nextCursor,
            pageSize: 2,
          });
          expect(thirdPage.entries.map(({ jobId }) => jobId)).toEqual([failedJobId]);
          expect(thirdPage.nextCursor).toBeNull();

          await expect(
            ledger.listForOwner(otherOwnerUserId, { since: windowStart, pageSize: 10 }),
          ).resolves.toEqual({
            entries: [
              {
                ownerUserId: otherOwnerUserId,
                jobId: otherOwnerJobId,
                operation: 'character-swap',
                provider: 'wiro',
                outcome: 'cancelled',
                submittedAt: '2026-09-03T03:30:00.000Z',
                completedAt: '2026-09-03T03:31:00.000Z',
              },
            ],
            nextCursor: null,
          });

          // `ambiguous` stays at zero because the row carrying it was submitted a millisecond
          // before the window opened, and `cancelled` because that row belongs to the other owner.
          await expect(ledger.countByOutcome(ownerUserId, windowStart)).resolves.toEqual({
            running: 2,
            succeeded: 1,
            failed: 1,
            ambiguous: 0,
            expired: 1,
            cancelled: 0,
          });

          // Crosses owners by design, so the two rows here are every unsettled row in the database.
          const open = await ledger.listOpen(10);
          expect(open.map(({ jobId, outcome }) => ({ jobId, outcome }))).toEqual([
            { jobId: runningEarlyJobId, outcome: null },
            { jobId: runningLateJobId, outcome: null },
          ]);
        } finally {
          await connection.close();
        }
      },
    );
  }, 120_000);
});
