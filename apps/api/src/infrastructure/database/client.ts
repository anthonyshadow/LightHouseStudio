import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';

export type LightframeDatabase = NodePgDatabase<typeof schema>;

export interface DatabaseConnection {
  readonly db: LightframeDatabase;
  close(): Promise<void>;
}

export const createPostgresDatabase = (databaseUrl: string): DatabaseConnection => {
  const client = new Pool({ connectionString: databaseUrl, max: 4 });
  return {
    db: drizzle({ client, schema }),
    close: () => client.end(),
  };
};
