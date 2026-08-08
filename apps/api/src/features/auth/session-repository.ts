export interface AuthenticatedSessionRecord {
  readonly jti: string;
  readonly userId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface SessionRepository {
  create(record: AuthenticatedSessionRecord): Promise<void>;
  findActive(jti: string, now: Date): Promise<AuthenticatedSessionRecord | null>;
  revoke(jti: string, now: Date): Promise<void>;
}

export class InMemorySessionRepository implements SessionRepository {
  readonly #sessions = new Map<string, AuthenticatedSessionRecord>();

  create(record: AuthenticatedSessionRecord): Promise<void> {
    const issuedAt = new Date(record.issuedAt);
    for (const [jti, session] of this.#sessions) {
      if (session.revokedAt !== null || new Date(session.expiresAt) <= issuedAt) {
        this.#sessions.delete(jti);
      }
    }
    this.#sessions.set(record.jti, record);
    return Promise.resolve();
  }

  findActive(jti: string, now: Date): Promise<AuthenticatedSessionRecord | null> {
    const session = this.#sessions.get(jti);
    if (!session) return Promise.resolve(null);
    if (session.revokedAt !== null || new Date(session.expiresAt) <= now) {
      this.#sessions.delete(jti);
      return Promise.resolve(null);
    }
    return Promise.resolve(session);
  }

  revoke(jti: string, _now: Date): Promise<void> {
    const session = this.#sessions.get(jti);
    if (!session || session.revokedAt !== null) return Promise.resolve();
    this.#sessions.delete(jti);
    return Promise.resolve();
  }
}
