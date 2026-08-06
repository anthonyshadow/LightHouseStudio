import { randomUUID } from 'node:crypto';
import { verify } from '@node-rs/argon2';
import type {
  AuthenticatedSessionResponse,
  AuthenticatedUser,
  EntitlementSnapshot,
  LoginRequest,
} from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import { SignJWT, jwtVerify } from 'jose';
import { AppError } from '../../http/errors.js';
import { publicUser, type UserRepository } from './seeded-user-repository.js';
import type { SessionRepository } from './session-repository.js';

interface VerifiedSession {
  readonly user: AuthenticatedUser;
  readonly entitlements: EntitlementSnapshot;
  readonly expiresAt: string;
  readonly jti: string;
}

const authenticationRequired = (): AppError =>
  new AppError(401, 'authentication_required', 'Log in to continue.');

export class AuthService {
  readonly #secret: Uint8Array;

  constructor(
    private readonly users: UserRepository,
    private readonly sessions: SessionRepository,
    secret: string,
    private readonly issuer: string,
    private readonly audience: string,
    private readonly ttlSeconds: number,
    private readonly fakePasswordHash: string,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.#secret = new TextEncoder().encode(secret);
  }

  private entitlements(user: AuthenticatedUser, now: Date): EntitlementSnapshot {
    return createPhaseOneEntitlements(user.planId, now.toISOString());
  }

  async login(input: LoginRequest): Promise<{
    readonly token: string;
    readonly response: AuthenticatedSessionResponse;
  }> {
    const credential = this.users.findByLogin(input.login);
    const valid = await verify(credential?.passwordHash ?? this.fakePasswordHash, input.password);
    if (!credential || !valid || credential.status !== 'active') {
      throw new AppError(401, 'invalid_credentials', 'The login or password is incorrect.');
    }

    const now = this.now();
    const currentCredential = this.users.recordLastLogin(credential.id, now.toISOString());
    const expiresAt = new Date(now.valueOf() + this.ttlSeconds * 1_000);
    const jti = randomUUID();
    const user = publicUser(currentCredential ?? credential);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(user.id)
      .setJti(jti)
      .setIssuer(this.issuer)
      .setAudience(this.audience)
      .setIssuedAt(Math.floor(now.valueOf() / 1_000))
      .setExpirationTime(Math.floor(expiresAt.valueOf() / 1_000))
      .sign(this.#secret);

    this.sessions.create({
      jti,
      userId: user.id,
      issuedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      revokedAt: null,
    });

    return {
      token,
      response: {
        user,
        entitlements: this.entitlements(user, now),
        expiresAt: expiresAt.toISOString(),
      },
    };
  }

  async verify(token: string | undefined): Promise<VerifiedSession> {
    if (!token) throw authenticationRequired();
    try {
      const now = this.now();
      const { payload } = await jwtVerify(token, this.#secret, {
        algorithms: ['HS256'],
        issuer: this.issuer,
        audience: this.audience,
        currentDate: now,
      });
      if (!payload.sub || !payload.jti) throw authenticationRequired();
      const session = this.sessions.findActive(payload.jti, now);
      const credential = this.users.findById(payload.sub);
      if (
        !session ||
        session.userId !== payload.sub ||
        !credential ||
        credential.status !== 'active'
      ) {
        throw authenticationRequired();
      }
      const user = publicUser(credential);
      return {
        user,
        entitlements: this.entitlements(user, now),
        expiresAt: session.expiresAt,
        jti: payload.jti,
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw authenticationRequired();
    }
  }

  async revoke(token: string | undefined): Promise<void> {
    if (!token) return;
    try {
      const verified = await this.verify(token);
      this.sessions.revoke(verified.jti, this.now());
    } catch {
      // Logout is idempotent. Invalid or expired cookies are still cleared by the route.
    }
  }
}
