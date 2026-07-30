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

  it('preserves the valid upstream HTTP status boundaries in the safe envelope', async () => {
    for (const status of [400, 599]) {
      const response = await requestAppError(status);

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: {
          code: 'provider_failure',
          message: 'The provider request failed safely.',
          upstreamStatus: status,
        },
      });
    }
  });

  it('omits every invalid upstream status without breaking the safe envelope', async () => {
    for (const status of [0, 399, 400.5, 600, Number.NaN, Number.POSITIVE_INFINITY]) {
      const response = await requestAppError(status);

      expect(response.statusCode).toBe(502);
      expect(response.json()).toEqual({
        error: {
          code: 'provider_failure',
          message: 'The provider request failed safely.',
        },
      });
    }
  });
});
