import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config as loadEnvironment } from 'dotenv';
import { eq, sql } from 'drizzle-orm';
import { loadSelectedEnvironmentFile } from '../src/config/environment-file.js';
import { parseEnvironment } from '../src/config/environment.js';
import { DrizzleUserRepository } from '../src/infrastructure/database/auth-repositories.js';
import { createPostgresDatabase } from '../src/infrastructure/database/client.js';
import { users } from '../src/infrastructure/database/schema.js';

loadSelectedEnvironmentFile({
  repositoryRoot: fileURLToPath(new URL('../../../', import.meta.url)),
  environment: process.env,
  load: (path, environment) =>
    loadEnvironment({ path, processEnv: environment, quiet: true, override: false }),
});
const config = parseEnvironment(process.env);
if (config.databaseMode !== 'postgres' || config.databaseUrl === undefined) {
  throw new Error('The development database smoke requires DATABASE_MODE=postgres.');
}

const connection = createPostgresDatabase(config.databaseUrl);
const temporaryUserId = randomUUID();
try {
  await connection.db.execute(sql`select 1`);
  const usersRepository = new DrizzleUserRepository(connection.db);
  await usersRepository.ensureSeededUser({
    id: temporaryUserId,
    login: `${temporaryUserId}@smoke.lightframe.local`,
    displayName: 'Database Smoke',
    passwordHash: config.demoUserPasswordHash,
  });
  const persisted = await usersRepository.findById(temporaryUserId);
  if (persisted?.id !== temporaryUserId) throw new Error('The seeded-user smoke did not persist.');

  const sentinel = new Error('rollback-sentinel');
  await connection.db
    .transaction(async (transaction) => {
      await transaction
        .update(users)
        .set({ displayName: 'Must Roll Back' })
        .where(eq(users.id, temporaryUserId));
      throw sentinel;
    })
    .catch((error: unknown) => {
      if (error !== sentinel) throw error;
    });
  const afterRollback = await usersRepository.findById(temporaryUserId);
  if (afterRollback?.displayName !== 'Database Smoke') {
    throw new Error('The PostgreSQL transaction smoke did not roll back.');
  }
} finally {
  await connection.db
    .delete(users)
    .where(eq(users.id, temporaryUserId))
    .catch(() => undefined);
  await connection.close();
}

console.log('Development PostgreSQL connection, transaction, seeded user, and cleanup passed.');
