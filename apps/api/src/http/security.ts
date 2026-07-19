import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from './errors.js';

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

const isLoopbackHostname = (hostname: string): boolean =>
  LOOPBACK_HOSTS.has(hostname.toLowerCase());

const parseHostHeader = (header: string): URL | undefined => {
  if (header.includes(',') || header.includes('/') || header.includes('@')) return undefined;
  try {
    return new URL(`http://${header}`);
  } catch {
    return undefined;
  }
};

export const canonicalLoopbackOrigin = (value: string): string | undefined => {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined;
    if (parsed.username !== '' || parsed.password !== '') return undefined;
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') return undefined;
    if (!isLoopbackHostname(parsed.hostname)) return undefined;
    return parsed.origin;
  } catch {
    return undefined;
  }
};

export const requireTrustedOrigin = (request: FastifyRequest): string => {
  const originHeader = request.headers.origin;
  const origin =
    typeof originHeader === 'string' ? canonicalLoopbackOrigin(originHeader) : undefined;
  const hostHeader = request.headers.host;
  const requestHost = typeof hostHeader === 'string' ? parseHostHeader(hostHeader) : undefined;
  if (
    origin === undefined ||
    requestHost === undefined ||
    new URL(origin).host !== requestHost.host
  ) {
    throw new AppError(
      403,
      'forbidden_origin',
      'This provider action is available only from the exact local Studio origin.',
    );
  }
  return origin;
};

/** Opaque, deterministic owner boundary for the exact local Host (including port). */
export const localOwnerIdForRequest = (request: FastifyRequest): string => {
  const hostHeader = request.headers.host;
  const parsedHost = typeof hostHeader === 'string' ? parseHostHeader(hostHeader) : undefined;
  if (parsedHost === undefined || !isLoopbackHostname(parsedHost.hostname)) {
    throw new AppError(421, 'forbidden_origin', 'This local Studio owner could not be verified.');
  }
  return createHash('sha256')
    .update(parsedHost.host.toLocaleLowerCase('en-US'), 'utf8')
    .digest('hex');
};

export const installLocalSecurityBoundary = (app: FastifyInstance): void => {
  app.addHook('onRequest', (request) => {
    const hostHeader = request.headers.host;
    const parsedHost = typeof hostHeader === 'string' ? parseHostHeader(hostHeader) : undefined;
    if (parsedHost === undefined || !isLoopbackHostname(parsedHost.hostname)) {
      throw new AppError(
        421,
        'forbidden_origin',
        'This local Studio server accepts only loopback hosts.',
      );
    }
    return Promise.resolve();
  });

  app.addHook('onSend', async (_request, reply, payload) => {
    void reply.header('Cache-Control', 'no-store');
    void reply.header('Pragma', 'no-cache');
    return payload;
  });
};
