import type { AuthenticatedUser, UserPlanId } from '@studio/contracts';

export interface SeededUserCredential extends AuthenticatedUser {
  readonly passwordHash: string;
}

export interface UserRepository {
  findById(id: string): Promise<SeededUserCredential | null>;
  findByLogin(login: string): Promise<SeededUserCredential | null>;
  recordLastLogin(userId: string, at: string): Promise<SeededUserCredential | null>;
}

export class SeededUserRepository implements UserRepository {
  #user: SeededUserCredential;

  constructor(input: {
    readonly id: string;
    readonly login: string;
    readonly username?: string;
    readonly displayName: string;
    readonly planId?: UserPlanId;
    readonly passwordHash: string;
    readonly createdAt?: string;
  }) {
    this.#user = {
      id: input.id,
      login: input.login.trim(),
      username: input.username?.trim() || 'demo',
      email: input.login.trim().toLocaleLowerCase('en-US'),
      displayName: input.displayName.trim(),
      avatarUrl: null,
      planId: input.planId ?? 'free',
      role: 'user',
      status: 'active',
      passwordHash: input.passwordHash,
      createdAt: input.createdAt ?? '2026-08-05T00:00:00.000Z',
      updatedAt: input.createdAt ?? '2026-08-05T00:00:00.000Z',
      lastLoginAt: null,
    };
  }

  findById(id: string): Promise<SeededUserCredential | null> {
    return Promise.resolve(id === this.#user.id ? this.#user : null);
  }

  findByLogin(login: string): Promise<SeededUserCredential | null> {
    return Promise.resolve(
      login.trim().toLocaleLowerCase('en-US') === this.#user.login.toLocaleLowerCase('en-US')
        ? this.#user
        : null,
    );
  }

  recordLastLogin(userId: string, at: string): Promise<SeededUserCredential | null> {
    if (userId !== this.#user.id) return Promise.resolve(null);
    this.#user = { ...this.#user, lastLoginAt: at, updatedAt: at };
    return Promise.resolve(this.#user);
  }
}

export const publicUser = ({
  passwordHash: _passwordHash,
  ...user
}: SeededUserCredential): AuthenticatedUser => user;
