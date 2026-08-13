import {
  cancelProjectProcessingRequestSchema,
  projectOperationKeySchema,
  projectParamsSchema,
  projectProcessingHistoryQuerySchema,
  projectProcessingOperationParamsSchema,
  reconcileProjectProcessingRequestSchema,
  retryProjectProcessingRequestSchema,
  submitProjectProcessingRequestSchema,
} from '@studio/contracts';
import type { ApplicationRuntime, HttpRequest } from '../../application/application-runtime.js';
import { AppError } from '../../http/app-error.js';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import { requireTrustedOrigin, requireVideoProviderIntent } from '../../http/security.js';
import { contentRangeHeaders, parseByteRange } from '../saved-videos/byte-range.js';
import type { ProjectProcessingService } from './project-processing-service.js';

const header = (request: HttpRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
};

const requireService = (
  service: ProjectProcessingService | undefined,
): ProjectProcessingService => {
  if (service === undefined) {
    throw new AppError(
      503,
      'feature_unavailable',
      'Project processing authority is unavailable in the configured mode.',
    );
  }
  return service;
};

const requireProviderRequest = (request: HttpRequest): Promise<void> => {
  requireTrustedOrigin(request);
  requireVideoProviderIntent(request);
  return Promise.resolve();
};

const requireOrigin = (request: HttpRequest): Promise<void> => {
  requireTrustedOrigin(request);
  return Promise.resolve();
};

const operationId = (request: HttpRequest): string => {
  const parsed = projectOperationKeySchema.safeParse(header(request, 'idempotency-key'));
  if (!parsed.success) {
    throw new AppError(400, 'validation_error', 'Provide a UUID Idempotency-Key.');
  }
  return parsed.data;
};

export const registerProjectProcessingRoutes = (
  app: ApplicationRuntime,
  service: ProjectProcessingService | undefined,
): void => {
  app.post(
    '/api/projects/:projectId/processing/submit',
    { onRequest: requireProviderRequest },
    async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      const body = submitProjectProcessingRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, 'validation_error', 'Provide a valid Project processing request.');
      }
      const result = await requireService(service).submit({
        ownerUserId: ownerUserIdForRequest(request),
        projectId: params.data.projectId,
        operationId: operationId(request),
        ...body.data,
      });
      reply.status(result.replayed ? 200 : 202);
      return result;
    },
  );

  app.get(
    '/api/projects/:projectId/processing/current',
    { onRequest: requireProviderRequest },
    async (request) => {
      const params = projectParamsSchema.safeParse(request.params);
      if (!params.success) throw new AppError(400, 'validation_error', 'Choose a valid Project.');
      return requireService(service).current(ownerUserIdForRequest(request), params.data.projectId);
    },
  );

  app.post(
    '/api/projects/:projectId/processing/reconcile',
    { onRequest: requireProviderRequest },
    async (request) => {
      const params = projectParamsSchema.safeParse(request.params);
      const body = reconcileProjectProcessingRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, 'validation_error', 'Choose a valid processing attempt.');
      }
      return requireService(service).reconcile(
        ownerUserIdForRequest(request),
        params.data.projectId,
        body.data.operationId,
      );
    },
  );

  app.post(
    '/api/projects/:projectId/processing/retry',
    { onRequest: requireProviderRequest },
    async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      const body = retryProjectProcessingRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, 'validation_error', 'Provide a valid explicit retry request.');
      }
      const result = await requireService(service).retry({
        ownerUserId: ownerUserIdForRequest(request),
        projectId: params.data.projectId,
        operationId: operationId(request),
        ...body.data,
      });
      reply.status(result.replayed ? 200 : 202);
      return result;
    },
  );

  app.post(
    '/api/projects/:projectId/processing/cancel',
    { onRequest: requireProviderRequest },
    async (request) => {
      const params = projectParamsSchema.safeParse(request.params);
      const body = cancelProjectProcessingRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, 'validation_error', 'Choose a valid processing attempt.');
      }
      return requireService(service).cancel(
        ownerUserIdForRequest(request),
        params.data.projectId,
        body.data.operationId,
      );
    },
  );

  app.get(
    '/api/projects/:projectId/processing/history',
    { onRequest: requireOrigin },
    async (request) => {
      const params = projectParamsSchema.safeParse(request.params);
      const query = projectProcessingHistoryQuerySchema.safeParse(request.query);
      if (!params.success || !query.success) {
        throw new AppError(400, 'validation_error', 'Use a valid Project processing page.');
      }
      return requireService(service).history(
        ownerUserIdForRequest(request),
        params.data.projectId,
        query.data,
      );
    },
  );

  app.get(
    '/api/projects/:projectId/processing/:operationId/result/content',
    { onRequest: requireOrigin },
    async (request, reply) => {
      const params = projectProcessingOperationParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, 'validation_error', 'Choose a valid retained processing result.');
      }
      const asset = await requireService(service).content(
        ownerUserIdForRequest(request),
        params.data.projectId,
        params.data.operationId,
      );
      const size = asset.manifest.sizeBytes;
      const range = parseByteRange(header(request, 'range'), size);
      const filename = asset.manifest.filename.replaceAll(/["\\\r\n]/gu, '_');
      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Type', asset.manifest.mimeType);
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Content-Disposition', `inline; filename="${filename}"`);
      if (range === null) {
        reply.header('Content-Length', size);
        return reply.send(asset.createReadStream());
      }
      const headers = contentRangeHeaders(range, size);
      reply.status(206);
      reply.header('Content-Range', headers.contentRange);
      reply.header('Content-Length', headers.contentLength);
      return reply.send(asset.createReadStream(range));
    },
  );
};
