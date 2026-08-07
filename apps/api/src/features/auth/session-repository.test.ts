import { describe, expect, it } from 'vitest';
import { InMemorySessionRepository } from './session-repository.js';

const session = (jti: string, issuedAt: string, expiresAt: string) => ({
  jti,
  userId: '2d7914b2-f912-4b96-b17d-54100a2ffea3',
  issuedAt,
  expiresAt,
  revokedAt: null,
});

describe('InMemorySessionRepository', () => {
  it('drops expired and revoked records while preserving active sessions', () => {
    const repository = new InMemorySessionRepository();
    repository.create(session('expired', '2026-08-01T00:00:00.000Z', '2026-08-02T00:00:00.000Z'));
    repository.create(session('active', '2026-08-03T00:00:00.000Z', '2026-08-05T00:00:00.000Z'));

    expect(repository.findActive('expired', new Date('2026-08-03T00:00:00.000Z'))).toBeNull();
    expect(repository.findActive('active', new Date('2026-08-04T00:00:00.000Z'))).not.toBeNull();

    repository.revoke('active', new Date('2026-08-04T01:00:00.000Z'));
    expect(repository.findActive('active', new Date('2026-08-04T01:00:00.000Z'))).toBeNull();
  });
});
