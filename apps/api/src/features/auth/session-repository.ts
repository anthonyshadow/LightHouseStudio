export interface AuthenticatedSessionRecord {
  readonly jti: string;
  readonly userId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}

export interface SessionRepository {
  create(record: AuthenticatedSessionRecord): void;
  findActive(jti: string, now: Date): AuthenticatedSessionRecord | null;
  revoke(jti: string, now: Date): void;
}

export class InMemorySessionRepository implements SessionRepository {
  readonly #sessions = new Map<string, AuthenticatedSessionRecord>();

  create(record: AuthenticatedSessionRecord): void {
    const issuedAt = new Date(record.issuedAt);
    for (const [jti, session] of this.#sessions) {
      if (session.revokedAt !== null || new Date(session.expiresAt) <= issuedAt) {
        this.#sessions.delete(jti);
      }
    }
    this.#sessions.set(record.jti, record);
  }

  findActive(jti: string, now: Date): AuthenticatedSessionRecord | null {
    const session = this.#sessions.get(jti);
    if (!session) return null;
    if (session.revokedAt !== null || new Date(session.expiresAt) <= now) {
      this.#sessions.delete(jti);
      return null;
    }
    return session;
  }

  revoke(jti: string, _now: Date): void {
    const session = this.#sessions.get(jti);
    if (!session || session.revokedAt !== null) return;
    this.#sessions.delete(jti);
  }
}
