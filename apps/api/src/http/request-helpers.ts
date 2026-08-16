import type { HttpRequest } from '../application/application-runtime.js';
import { AppError } from './app-error.js';

/** Reads a single request header, ignoring the multi-value form the runtime may produce. */
export const requestHeader = (request: HttpRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Route registration is conditional on `DATABASE_MODE`, so a registered route can still be
 * backed by an unconfigured service. `503 feature_unavailable` is the legitimate answer.
 */
export const requireConfiguredService = <Service>(
  service: Service | undefined,
  message: string,
): Service => {
  if (service === undefined) throw new AppError(503, 'feature_unavailable', message);
  return service;
};
