import { Pool } from '@neondatabase/serverless';
import { drizzle, type NeonDatabase } from 'drizzle-orm/neon-serverless';
import * as schema from './schema.js';

export type LightframeDatabase = NeonDatabase<typeof schema>;

export interface DatabaseConnection {
  readonly db: LightframeDatabase;
  close(): Promise<void>;
}

export const createNeonDatabase = (databaseUrl: string): DatabaseConnection => {
  const client = new Pool({ connectionString: databaseUrl, max: 4 });
  return {
    db: drizzle({ client, schema }),
    close: () => client.end(),
  };
};
