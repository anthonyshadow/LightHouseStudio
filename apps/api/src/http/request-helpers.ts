import type { HttpRequest } from '../application/application-runtime.js';
import { AppError } from './app-error.js';

/** Reads a request header. `HttpRequest.headers` is single-valued — only `query` can repeat. */
export const requestHeader = (request: HttpRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
};

/**
 * Reads the URI-encoded JSON metadata that rides beside a raw byte body, in the one shape every
 * upload route uses. The caller supplies the header name, the schema and the refusal message, so a
 * change to the encoding is made once rather than per feature.
 */
export const parseUploadMetadata = <Output>(
  request: HttpRequest,
  headerName: string,
  schema: { readonly parse: (value: unknown) => Output },
  message: string,
): Output => {
  const encoded = requestHeader(request, headerName);
  try {
    return schema.parse(JSON.parse(decodeURIComponent(encoded ?? '')) as unknown);
  } catch {
    throw new AppError(400, 'validation_error', message);
  }
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
