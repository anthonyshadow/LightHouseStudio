import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { databaseUrlUsesEncryptedTransport } from '../../config/environment.js';
import * as schema from './schema.js';

export type LightframeDatabase = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  readonly db: LightframeDatabase;
  close(): Promise<void>;
}

export const createPostgresDatabase = (
  databaseUrl: string,
  options: { readonly requireTls?: boolean } = {},
): DatabaseConnection => {
  if (options.requireTls && !databaseUrlUsesEncryptedTransport(databaseUrl)) {
    throw new Error('Neon PostgreSQL connections require explicit encrypted transport.');
  }
  const client = new Pool({ connectionString: databaseUrl, max: 4 });
  return {
    db: drizzle({ client, schema }),
    close: () => client.end(),
  };
};
