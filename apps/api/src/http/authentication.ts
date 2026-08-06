import type { AuthenticatedUser, EntitlementSnapshot } from '@studio/contracts';
import { createPhaseOneEntitlements } from '@studio/domain';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { RuntimeConfig } from '../config/environment.js';
import type { AuthService } from '../features/auth/auth-service.js';
import { createHash } from 'node:crypto';
import { AppError } from './errors.js';
import { requireTrustedOrigin } from './security.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: {
      readonly user: AuthenticatedUser;
      readonly entitlements: EntitlementSnapshot;
      readonly expiresAt: string;
    } | null;
  }
}

const PUBLIC_API_ROUTES = new Set([
  'GET /api/health',
  'GET /api/auth/demo-config',
  'POST /api/auth/login',
  'POST /api/auth/logout',
]);

const isMutation = (method: string): boolean => !['GET', 'HEAD', 'OPTIONS'].includes(method);

const testOwnerUserId = (request: FastifyRequest): string => {
  const digest = createHash('sha256')
    .update(typeof request.headers.host === 'string' ? request.headers.host.toLowerCase() : 'test')
    .digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
};

export const installAuthentication = (
  app: FastifyInstance,
  authService: AuthService,
  config: RuntimeConfig,
): void => {
  app.decorateRequest('auth', null);
  app.addHook('onRequest', async (request: FastifyRequest, reply) => {
    if (!request.url.startsWith('/api/')) return;
    if (config.nodeEnv === 'test' && !config.demoAuthEnabled) {
      const now = new Date();
      request.auth = {
        user: {
          id: testOwnerUserId(request),
          login: config.demoUserLogin,
          username: 'demo',
          email: config.demoUserLogin,
          displayName: config.demoUserDisplayName,
          avatarUrl: null,
          planId: 'free',
          role: 'user',
          status: 'active',
          createdAt: now.toISOString(),
          updatedAt: now.toISOString(),
          lastLoginAt: now.toISOString(),
        },
        entitlements: createPhaseOneEntitlements('free', now.toISOString()),
        expiresAt: new Date(now.getTime() + config.authSessionTtlSeconds * 1_000).toISOString(),
      };
      return;
    }
    const path = request.url.split('?', 1)[0] ?? request.url;
    if (PUBLIC_API_ROUTES.has(`${request.method} ${path}`)) return;
    reply.header('Cache-Control', 'no-store');
    let verified;
    try {
      verified = await authService.verify(request.cookies[config.authCookieName]);
    } catch (error) {
      reply.clearCookie(config.authCookieName, {
        path: '/',
        httpOnly: true,
        sameSite: 'strict',
        secure: config.authCookieSecure,
      });
      throw error;
    }
    request.auth = {
      user: verified.user,
      entitlements: verified.entitlements,
      expiresAt: verified.expiresAt,
    };
    if (isMutation(request.method)) requireTrustedOrigin(request);
  });
};

export const ownerUserIdForRequest = (request: FastifyRequest): string => {
  if (request.auth == null) {
    throw new AppError(401, 'authentication_required', 'Log in to continue.');
  }
  return request.auth.user.id;
};
