import { fileURLToPath } from 'node:url';
import { config as loadEnvironment } from 'dotenv';
import { defineConfig } from 'drizzle-kit';
import { loadSelectedEnvironmentFile } from './src/config/environment-file.js';

if (process.env.LIGHTFRAME_ENV !== undefined) {
  loadSelectedEnvironmentFile({
    repositoryRoot: fileURLToPath(new URL('../../', import.meta.url)),
    environment: process.env,
    load: (path, environment) =>
      loadEnvironment({ path, processEnv: environment, quiet: true, override: false }),
  });
}

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/database/schema.ts',
  out: './drizzle',
  strict: true,
  verbose: true,
  ...(databaseUrl === undefined ? {} : { dbCredentials: { url: databaseUrl } }),
});
