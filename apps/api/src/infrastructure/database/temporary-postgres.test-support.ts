import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

export interface TemporaryPostgresDatabase {
  /** Connection string for the freshly created database. */
  readonly url: string;
  /** A connected client on that database, released by the helper. */
  readonly client: PoolClient;
}

const DISCONNECT_TIMEOUT_MS = 10_000;
const DISCONNECT_POLL_MS = 25;

/**
 * `Pool.end()` resolves once the pool has let go of its clients, not once their sockets have
 * closed, so a `drop database ... with (force)` issued immediately afterwards can still terminate
 * a live backend. The client turns that FATAL (57P01) into a pool `error` event, and a pool with
 * no `error` listener throws — which Vitest reports as an unhandled error and fails the run.
 */
const waitForDisconnection = async (admin: Pool, databaseName: string): Promise<void> => {
  const deadline = Date.now() + DISCONNECT_TIMEOUT_MS;
  for (;;) {
    const { rows } = await admin.query<{ backends: string }>(
      'select count(*)::text as backends from pg_stat_activity where datname = $1',
      [databaseName],
    );
    if (rows[0]?.backends === '0' || Date.now() >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, DISCONNECT_POLL_MS));
  }
};

/**
 * Creates a uniquely named database, runs `body` against it, and drops it afterwards. Both pools
 * carry an `error` listener so that a connection torn down during cleanup cannot escape as an
 * unhandled error.
 */
export const withTemporaryPostgresDatabase = async (
  databaseUrl: string,
  namePrefix: string,
  body: (database: TemporaryPostgresDatabase) => Promise<void>,
): Promise<void> => {
  const databaseName = `${namePrefix}_${randomUUID().replaceAll('-', '')}`;
  const adminUrl = new URL(databaseUrl);
  adminUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  admin.on('error', () => undefined);
  let created = false;
  try {
    await admin.query(`create database ${databaseName}`);
    created = true;
    const targetUrl = new URL(databaseUrl);
    targetUrl.pathname = `/${databaseName}`;
    const target = new Pool({ connectionString: targetUrl.toString(), max: 1 });
    target.on('error', () => undefined);
    const client = await target.connect();
    try {
      await body({ url: targetUrl.toString(), client });
    } finally {
      client.release();
      await target.end();
    }
  } finally {
    if (created) {
      await waitForDisconnection(admin, databaseName);
      await admin.query(`drop database if exists ${databaseName} with (force)`);
    }
    await admin.end();
  }
};
