import { afterEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { AppError, installErrorHandling } from './errors.js';

describe('API error handling', () => {
  const apps: FastifyInstance[] = [];

  afterEach(async () => {
    await Promise.all(apps.splice(0).map(async (app) => app.close()));
  });

  const requestAppError = async (upstreamStatus: number) => {
    const app = Fastify({ logger: false });
    apps.push(app);
    app.get('/failure', () => {
      throw new AppError(502, 'provider_failure', 'The provider request failed safely.', {
        upstreamStatus,
      });
    });
    installErrorHandling(app);
    return app.inject({ method: 'GET', url: '/failure' });
  };

  it.each([400, 599])(
    'preserves valid upstream HTTP status %s in the safe envelope',
    async (status) => {
      const response = await requestAppError(status);

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: {
          code: 'provider_failure',
          message: 'The provider request failed safely.',
          upstreamStatus: status,
        },
      });
    },
  );

  it.each([0, 399, 400.5, 600, Number.NaN, Number.POSITIVE_INFINITY])(
    'omits invalid upstream status metadata %s without breaking the safe envelope',
    async (status) => {
      const response = await requestAppError(status);

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: {
          code: 'provider_failure',
          message: 'The provider request failed safely.',
        },
      });
    },
  );
});
