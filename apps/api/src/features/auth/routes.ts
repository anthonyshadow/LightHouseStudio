import {
  authenticatedSessionResponseSchema,
  demoAuthConfigResponseSchema,
  loginRequestSchema,
} from '@studio/contracts';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { RuntimeConfig } from '../../config/environment.js';
import { AppError } from '../../http/errors.js';
import { requireTrustedOrigin } from '../../http/security.js';
import type { AuthService } from './auth-service.js';

const sessionCookieOptions = (config: RuntimeConfig) => ({
  path: '/',
  httpOnly: true,
  sameSite: 'strict' as const,
  secure: config.authCookieSecure,
  maxAge: config.authSessionTtlSeconds,
});

const clearSessionCookie = (reply: FastifyReply, config: RuntimeConfig): void => {
  reply.clearCookie(config.authCookieName, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure: config.authCookieSecure,
  });
};

export const registerAuthRoutes = (
  app: FastifyInstance,
  auth: AuthService,
  config: RuntimeConfig,
): void => {
  app.get('/api/auth/demo-config', (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return demoAuthConfigResponseSchema.parse({
      enabled: config.demoAuthEnabled,
      prefill:
        config.demoAuthEnabled && config.demoAuthPrefill && config.nodeEnv !== 'production'
          ? { login: config.demoUserLogin, password: config.demoUserPassword }
          : null,
    });
  });

  app.post('/api/auth/login', async (request, reply) => {
    requireTrustedOrigin(request);
    const parsed = loginRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new AppError(400, 'validation_error', 'Enter a valid login and password.');
    }
    if (!config.demoAuthEnabled) {
      throw new AppError(503, 'feature_unavailable', 'Demo login is not enabled.');
    }
    const result = await auth.login(parsed.data);
    reply.header('Cache-Control', 'no-store');
    reply.setCookie(config.authCookieName, result.token, sessionCookieOptions(config));
    return authenticatedSessionResponseSchema.parse(result.response);
  });

  app.get('/api/auth/me', async (request, reply) => {
    const authenticated = request.auth;
    if (!authenticated) throw new AppError(401, 'authentication_required', 'Log in to continue.');
    reply.header('Cache-Control', 'no-store');
    return authenticatedSessionResponseSchema.parse({
      user: authenticated.user,
      entitlements: authenticated.entitlements,
      expiresAt: authenticated.expiresAt,
    });
  });

  app.post('/api/auth/logout', async (request, reply) => {
    requireTrustedOrigin(request);
    await auth.revoke(request.cookies[config.authCookieName]);
    clearSessionCookie(reply, config);
    reply.header('Cache-Control', 'no-store').code(204).send();
  });
};
