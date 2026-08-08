import { and, eq, gt, isNotNull, isNull, lte, or } from 'drizzle-orm';
import type {
  SeededUserCredential,
  UserRepository,
} from '../../features/auth/seeded-user-repository.js';
import type {
  AuthenticatedSessionRecord,
  SessionRepository,
} from '../../features/auth/session-repository.js';
import type { LightframeDatabase } from './client.js';
import { passwordCredentials, sessions, users } from './schema.js';

type UserRow = typeof users.$inferSelect;

const toCredential = (row: UserRow, passwordHash: string): SeededUserCredential => ({
  id: row.id,
  login: row.login,
  username: row.username,
  email: row.email,
  displayName: row.displayName,
  avatarUrl: row.avatarUrl,
  planId: row.planId,
  role: row.role,
  status: row.status,
  passwordHash,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  lastLoginAt: row.lastLoginAt,
});

export class DrizzleUserRepository implements UserRepository {
  constructor(private readonly db: LightframeDatabase) {}

  async ensureSeededUser(input: {
    readonly id: string;
    readonly login: string;
    readonly displayName: string;
    readonly passwordHash: string;
  }): Promise<void> {
    const login = input.login.trim();
    const normalizedLogin = login.toLocaleLowerCase('en-US');
    const timestamp = new Date().toISOString();
    await this.db.transaction(async (tx) => {
      await tx
        .insert(users)
        .values({
          id: input.id,
          login,
          normalizedLogin,
          username: 'demo',
          email: normalizedLogin,
          displayName: input.displayName.trim(),
          avatarUrl: null,
          planId: 'free',
          role: 'user',
          status: 'active',
          createdAt: timestamp,
          updatedAt: timestamp,
          lastLoginAt: null,
        })
        .onConflictDoUpdate({
          target: users.id,
          set: {
            login,
            normalizedLogin,
            email: normalizedLogin,
            displayName: input.displayName.trim(),
            updatedAt: timestamp,
          },
        });
      await tx
        .insert(passwordCredentials)
        .values({
          userId: input.id,
          passwordHash: input.passwordHash,
          hashScheme: 'argon2id',
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoUpdate({
          target: passwordCredentials.userId,
          set: { passwordHash: input.passwordHash, hashScheme: 'argon2id', updatedAt: timestamp },
        });
    });
  }

  async findById(id: string): Promise<SeededUserCredential | null> {
    const [row] = await this.db
      .select({ user: users, passwordHash: passwordCredentials.passwordHash })
      .from(users)
      .innerJoin(passwordCredentials, eq(passwordCredentials.userId, users.id))
      .where(eq(users.id, id))
      .limit(1);
    return row === undefined ? null : toCredential(row.user, row.passwordHash);
  }

  async findByLogin(login: string): Promise<SeededUserCredential | null> {
    const normalizedLogin = login.trim().toLocaleLowerCase('en-US');
    const [row] = await this.db
      .select({ user: users, passwordHash: passwordCredentials.passwordHash })
      .from(users)
      .innerJoin(passwordCredentials, eq(passwordCredentials.userId, users.id))
      .where(eq(users.normalizedLogin, normalizedLogin))
      .limit(1);
    return row === undefined ? null : toCredential(row.user, row.passwordHash);
  }

  async recordLastLogin(userId: string, at: string): Promise<SeededUserCredential | null> {
    const [row] = await this.db
      .update(users)
      .set({ lastLoginAt: at, updatedAt: at })
      .where(eq(users.id, userId))
      .returning({ id: users.id });
    return row === undefined ? null : this.findById(row.id);
  }
}

export class DrizzleSessionRepository implements SessionRepository {
  constructor(private readonly db: LightframeDatabase) {}

  async create(record: AuthenticatedSessionRecord): Promise<void> {
    await this.db.delete(sessions).where(
      or(
        lte(sessions.expiresAt, record.issuedAt),
        // Revoked rows have no value once their JWT can no longer be accepted.
        isNotNull(sessions.revokedAt),
      ),
    );
    await this.db.insert(sessions).values(record).onConflictDoUpdate({
      target: sessions.jti,
      set: record,
    });
  }

  async findActive(jti: string, now: Date): Promise<AuthenticatedSessionRecord | null> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.jti, jti),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, now.toISOString()),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async revoke(jti: string, now: Date): Promise<void> {
    await this.db
      .update(sessions)
      .set({ revokedAt: now.toISOString() })
      .where(and(eq(sessions.jti, jti), isNull(sessions.revokedAt)));
  }
}
