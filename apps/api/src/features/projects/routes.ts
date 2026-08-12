import {
  createProjectRequestSchema,
  projectConflictResponseSchema,
  projectLifecycleRequestSchema,
  projectOperationKeySchema,
  projectParamsSchema,
  projectsQuerySchema,
  renameProjectRequestSchema,
} from '@studio/contracts';
import type { ProjectConflict } from '@studio/domain';
import type {
  ApplicationRuntime,
  HttpReply,
  HttpRequest,
} from '../../application/application-runtime.js';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import { AppError } from '../../http/app-error.js';
import type { ProjectService, ProjectServiceMutationResult } from './project-service.js';

const header = (request: HttpRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
};

const requireService = (service: ProjectService | undefined): ProjectService => {
  if (service === undefined) {
    throw new AppError(
      503,
      'feature_unavailable',
      'Project persistence is unavailable in the configured mode.',
    );
  }
  return service;
};

const conflictMessage = (conflict: ProjectConflict): string => {
  switch (conflict.kind) {
    case 'operation-key':
      return 'That Idempotency-Key was already used for a different Project create request.';
    case 'project-version':
      return 'The Project changed in another session. Refresh it before retrying.';
    case 'revision':
      return 'The Project revision changed in another session. Refresh it before retrying.';
    case 'active-jobs':
      return 'The Project has active work and cannot be archived yet.';
    case 'relation-mismatch':
      return 'The Project relationship changed and the request was not applied.';
  }
};

const sendMutation = (reply: HttpReply, result: ProjectServiceMutationResult) => {
  if (result.ok) return result.current;
  return reply.status(409).send(
    projectConflictResponseSchema.parse({
      error: { code: 'conflict', message: conflictMessage(result.conflict) },
      conflict: result.conflict,
    }),
  );
};

export const registerProjectRoutes = (
  app: ApplicationRuntime,
  service: ProjectService | undefined,
): void => {
  app.get('/api/projects', async (request) => {
    const query = projectsQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError(400, 'validation_error', 'Use a valid Project page request.');
    }
    return requireService(service).list(ownerUserIdForRequest(request), query.data);
  });

  app.post('/api/projects', async (request, reply) => {
    const body = createProjectRequestSchema.safeParse(request.body);
    const operationKey = projectOperationKeySchema.safeParse(header(request, 'idempotency-key'));
    if (!body.success || !operationKey.success) {
      throw new AppError(
        400,
        'validation_error',
        'Provide a Project title and UUID Idempotency-Key.',
      );
    }
    const result = await requireService(service).create(
      ownerUserIdForRequest(request),
      operationKey.data,
      body.data.title,
    );
    if (result.ok) {
      reply.status(201);
    }
    return sendMutation(reply, result);
  });

  app.get('/api/projects/:projectId', async (request) => {
    const params = projectParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError(400, 'validation_error', 'Choose a valid Project.');
    }
    return requireService(service).get(ownerUserIdForRequest(request), params.data.projectId);
  });

  app.patch('/api/projects/:projectId', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    const body = renameProjectRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new AppError(400, 'validation_error', 'Provide a valid Project title and version.');
    }
    return sendMutation(
      reply,
      await requireService(service).rename(
        ownerUserIdForRequest(request),
        params.data.projectId,
        body.data.expectedVersion,
        body.data.title,
      ),
    );
  });

  app.post('/api/projects/:projectId/archive', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    const body = projectLifecycleRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new AppError(400, 'validation_error', 'Provide a valid Project and version.');
    }
    return sendMutation(
      reply,
      await requireService(service).archive(
        ownerUserIdForRequest(request),
        params.data.projectId,
        body.data.expectedVersion,
      ),
    );
  });

  app.post('/api/projects/:projectId/restore', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    const body = projectLifecycleRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new AppError(400, 'validation_error', 'Provide a valid Project and version.');
    }
    return sendMutation(
      reply,
      await requireService(service).restore(
        ownerUserIdForRequest(request),
        params.data.projectId,
        body.data.expectedVersion,
      ),
    );
  });
};
