import {
  appendProjectRevisionRequestSchema,
  adoptProjectWorkingMediaRequestSchema,
  createProjectRequestSchema,
  projectConflictResponseSchema,
  projectLifecycleRequestSchema,
  projectOperationKeySchema,
  projectOutputVersionParamsSchema,
  projectSourceResponseSchema,
  projectSourceUploadMetadataSchema,
  projectWorkingMediaParamsSchema,
  projectWorkingMediaResponseSchema,
  projectWorkingMediaUploadMetadataSchema,
  saveProjectOutputRequestSchema,
  saveProjectOutputResponseSchema,
  reuseProjectSourceRequestSchema,
  moveProjectCampaignRequestSchema,
  projectParamsSchema,
  projectsQuerySchema,
  renameProjectRequestSchema,
  VIDEO_INPUT_MIME_TYPES,
  VIDEO_RESULT_MAX_BYTES,
} from '@studio/contracts';
import type { ProjectConflict } from '@studio/domain';
import type {
  ApplicationRuntime,
  HttpReply,
  HttpRequest,
} from '../../application/application-runtime.js';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import { AppError } from '../../http/app-error.js';
import { isSpooledAudioUpload } from '../../application/spooled-upload.js';
import type { AssetReadHandle } from '../../storage/asset-byte-store.js';
import { contentRangeHeaders, parseByteRange } from '../saved-videos/byte-range.js';
import type { ProjectService, ProjectServiceMutationResult } from './project-service.js';
import type {
  ProjectSourceMutationResult,
  ProjectSourceService,
} from './project-source-service.js';
import type {
  ProjectWorkingMediaMutationResult,
  ProjectWorkingMediaService,
} from './project-working-media-service.js';
import type {
  ProjectOutputSaveMutationResult,
  ProjectOutputService,
} from './project-output-service.js';

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

const operationKeyConflictMessages = {
  create: 'That Idempotency-Key was already used for a different Project create request.',
  'source-accept': 'That source operation was already used for a different Project source request.',
  'working-media-adopt':
    'That working-media operation was already used for different media or edit settings.',
  'output-save': 'That Idempotency-Key was already used for a different Project output save.',
} satisfies Record<
  Extract<ProjectConflict, { readonly kind: 'operation-key' }>['operation'],
  string
>;

const conflictMessage = (conflict: ProjectConflict): string => {
  switch (conflict.kind) {
    case 'operation-key':
      return operationKeyConflictMessages[conflict.operation];
    case 'project-version':
      return 'The Project changed in another session. Refresh it before retrying.';
    case 'revision':
      return 'The Project revision changed in another session. Refresh it before retrying.';
    case 'active-jobs':
      return 'The Project has active work and cannot be archived yet.';
    case 'relation-mismatch':
      return 'The Project relationship changed and the request was not applied.';
    case 'campaign-membership':
      return 'Choose an active Campaign you can access, or detach the Project.';
    case 'immutable-source':
      return 'This Project already has its immutable original. Start a new Project for a different source.';
    case 'saved-video-version':
      return 'The selected Saved Video changed. Confirm its current Version before adding another.';
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

const sendReplayableMutation = (
  reply: HttpReply,
  result: ProjectSourceMutationResult | ProjectWorkingMediaMutationResult,
) => {
  if (result.ok) {
    if (!result.replayed) reply.status(201);
    return result.response;
  }
  return reply.status(409).send(
    projectConflictResponseSchema.parse({
      error: { code: 'conflict', message: conflictMessage(result.conflict) },
      conflict: result.conflict,
    }),
  );
};

const sendProjectOutputMutation = (reply: HttpReply, result: ProjectOutputSaveMutationResult) => {
  if (result.ok) {
    if (!result.response.replayed) reply.status(201);
    return saveProjectOutputResponseSchema.parse(result.response);
  }
  return reply.status(409).send(
    projectConflictResponseSchema.parse({
      error: { code: 'conflict', message: conflictMessage(result.conflict) },
      conflict: result.conflict,
    }),
  );
};

const sendProjectMediaContent = (
  request: HttpRequest,
  reply: HttpReply,
  media: {
    readonly asset: AssetReadHandle;
    readonly mimeType: string;
    readonly filename: string;
  },
) => {
  const size = media.asset.manifest.sizeBytes;
  const range = parseByteRange(header(request, 'range'), size);
  const filename = media.filename.replaceAll(/["\\\r\n]/gu, '_');
  reply.header('Accept-Ranges', 'bytes');
  reply.header('Content-Type', media.mimeType);
  reply.header('Content-Disposition', `inline; filename="${filename}"`);
  if (range === null) {
    reply.header('Content-Length', size);
    return reply.send(media.asset.createReadStream());
  }
  const headers = contentRangeHeaders(range, size);
  reply.status(206);
  reply.header('Content-Range', headers.contentRange);
  reply.header('Content-Length', headers.contentLength);
  return reply.send(media.asset.createReadStream(range));
};

const parseUploadMetadata = <Output>(
  request: HttpRequest,
  headerName: string,
  schema: { readonly parse: (value: unknown) => Output },
  message: string,
): Output => {
  const encoded = header(request, headerName);
  try {
    return schema.parse(JSON.parse(decodeURIComponent(encoded ?? '')) as unknown);
  } catch {
    throw new AppError(400, 'validation_error', message);
  }
};

const sourceUploadMetadata = (request: HttpRequest) =>
  parseUploadMetadata(
    request,
    'x-lightframe-project-source',
    projectSourceUploadMetadataSchema,
    'Provide valid Project source metadata.',
  );

const workingMediaUploadMetadata = (request: HttpRequest) =>
  parseUploadMetadata(
    request,
    'x-lightframe-project-working-media',
    projectWorkingMediaUploadMetadataSchema,
    'Provide valid Project working-media metadata.',
  );

export const registerProjectRoutes = (
  app: ApplicationRuntime,
  service: ProjectService | undefined,
  sourceService?: ProjectSourceService,
  workingMediaService?: ProjectWorkingMediaService,
  outputService?: ProjectOutputService,
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
      body.data.campaignId,
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

  app.post('/api/projects/:projectId/revisions', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    const body = appendProjectRevisionRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new AppError(400, 'validation_error', 'Provide a valid semantic Project checkpoint.');
    }
    return sendMutation(
      reply,
      await requireService(service).checkpoint(
        ownerUserIdForRequest(request),
        params.data.projectId,
        body.data,
      ),
    );
  });

  if (sourceService !== undefined) {
    app.post(
      '/api/projects/:projectId/source',
      {
        bodyLimit: VIDEO_RESULT_MAX_BYTES,
        bodyParser: 'spooled',
        acceptedContentTypes: VIDEO_INPUT_MIME_TYPES,
        unsupportedMediaType: {
          statusCode: 400,
          message: 'Upload an MP4, QuickTime, or WebM Project source.',
        },
        payloadTooLargeMessage: 'The Project source must be 300 MB or smaller.',
      },
      async (request, reply) => {
        const params = projectParamsSchema.safeParse(request.params);
        const operationKey = projectOperationKeySchema.safeParse(
          header(request, 'idempotency-key'),
        );
        const upload = isSpooledAudioUpload(request.body) ? request.body : null;
        try {
          const metadata = sourceUploadMetadata(request);
          if (!params.success || !operationKey.success || upload === null) {
            throw new AppError(400, 'validation_error', 'Provide a valid Project source upload.');
          }
          return sendReplayableMutation(
            reply,
            await sourceService.upload({
              ownerUserId: ownerUserIdForRequest(request),
              projectId: params.data.projectId,
              operationKey: operationKey.data,
              expectedVersion: metadata.expectedVersion,
              expectedRevisionNumber: metadata.expectedRevisionNumber,
              kind: metadata.kind,
              sourcePath: upload.path,
              checksumSha256: upload.checksumSha256,
              filename: metadata.filename,
            }),
          );
        } finally {
          await upload?.cleanup().catch(() => undefined);
        }
      },
    );

    app.post('/api/projects/:projectId/source/reuse', async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      const operationKey = projectOperationKeySchema.safeParse(header(request, 'idempotency-key'));
      const body = reuseProjectSourceRequestSchema.safeParse(request.body);
      if (!params.success || !operationKey.success || !body.success) {
        throw new AppError(400, 'validation_error', 'Choose a valid exact Saved Video Version.');
      }
      return sendReplayableMutation(
        reply,
        await sourceService.reuseSavedVideo({
          ownerUserId: ownerUserIdForRequest(request),
          projectId: params.data.projectId,
          operationKey: operationKey.data,
          ...body.data,
        }),
      );
    });

    app.get('/api/projects/:projectId/source', async (request) => {
      const params = projectParamsSchema.safeParse(request.params);
      if (!params.success) throw new AppError(400, 'validation_error', 'Choose a valid Project.');
      return projectSourceResponseSchema.parse(
        await sourceService.get(ownerUserIdForRequest(request), params.data.projectId),
      );
    });

    app.get('/api/projects/:projectId/source/content', async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      if (!params.success) throw new AppError(400, 'validation_error', 'Choose a valid Project.');
      const result = await sourceService.content(
        ownerUserIdForRequest(request),
        params.data.projectId,
      );
      return sendProjectMediaContent(request, reply, {
        asset: result.asset,
        mimeType: result.source.mimeType,
        filename: result.source.filename,
      });
    });
  }

  if (workingMediaService !== undefined) {
    app.post(
      '/api/projects/:projectId/working-media',
      {
        bodyLimit: VIDEO_RESULT_MAX_BYTES,
        bodyParser: 'spooled',
        acceptedContentTypes: VIDEO_INPUT_MIME_TYPES,
        unsupportedMediaType: {
          statusCode: 400,
          message: 'Adopt an MP4, QuickTime, or WebM validated local render.',
        },
        payloadTooLargeMessage: 'Project working media must be 300 MB or smaller.',
      },
      async (request, reply) => {
        const params = projectParamsSchema.safeParse(request.params);
        const operationKey = projectOperationKeySchema.safeParse(
          header(request, 'idempotency-key'),
        );
        const upload = isSpooledAudioUpload(request.body) ? request.body : null;
        try {
          const metadata = workingMediaUploadMetadata(request);
          if (!params.success || !operationKey.success || upload === null) {
            throw new AppError(
              400,
              'validation_error',
              'Provide a valid local Project render and Idempotency-Key.',
            );
          }
          return sendReplayableMutation(
            reply,
            await workingMediaService.uploadLocalRender({
              ownerUserId: ownerUserIdForRequest(request),
              projectId: params.data.projectId,
              operationKey: operationKey.data,
              expectedVersion: metadata.expectedVersion,
              expectedRevisionNumber: metadata.expectedRevisionNumber,
              sourcePath: upload.path,
              checksumSha256: upload.checksumSha256,
              filename: metadata.filename,
              localEdit: metadata.localEdit,
            }),
          );
        } finally {
          await upload?.cleanup().catch(() => undefined);
        }
      },
    );

    app.post('/api/projects/:projectId/working-media/reuse', async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      const operationKey = projectOperationKeySchema.safeParse(header(request, 'idempotency-key'));
      const body = adoptProjectWorkingMediaRequestSchema.safeParse(request.body);
      if (!params.success || !operationKey.success || !body.success) {
        throw new AppError(400, 'validation_error', 'Choose valid retained Project media.');
      }
      return sendReplayableMutation(
        reply,
        await workingMediaService.reuse({
          ownerUserId: ownerUserIdForRequest(request),
          projectId: params.data.projectId,
          operationKey: operationKey.data,
          ...body.data,
        }),
      );
    });

    app.get('/api/projects/:projectId/working-media', async (request) => {
      const params = projectParamsSchema.safeParse(request.params);
      if (!params.success) throw new AppError(400, 'validation_error', 'Choose a valid Project.');
      return projectWorkingMediaResponseSchema.parse(
        await workingMediaService.get(ownerUserIdForRequest(request), params.data.projectId),
      );
    });

    app.get(
      '/api/projects/:projectId/working-media/:revisionId/content',
      async (request, reply) => {
        const params = projectWorkingMediaParamsSchema.safeParse(request.params);
        if (!params.success) {
          throw new AppError(400, 'validation_error', 'Choose valid Project working media.');
        }
        const result = await workingMediaService.content(
          ownerUserIdForRequest(request),
          params.data.projectId,
          params.data.revisionId,
        );
        return sendProjectMediaContent(request, reply, {
          asset: result.asset,
          mimeType: result.media.mimeType,
          filename: result.media.filename,
        });
      },
    );
  }

  if (outputService !== undefined) {
    app.post('/api/projects/:projectId/outputs', async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      const operationId = projectOperationKeySchema.safeParse(header(request, 'idempotency-key'));
      const body = saveProjectOutputRequestSchema.safeParse(request.body);
      if (!params.success || !operationId.success || !body.success) {
        throw new AppError(
          400,
          'validation_error',
          'Provide the exact current Project media, an explicit save target, and a UUID Idempotency-Key.',
        );
      }
      return sendProjectOutputMutation(
        reply,
        await outputService.save(
          ownerUserIdForRequest(request),
          params.data.projectId,
          operationId.data,
          body.data,
        ),
      );
    });

    app.get('/api/projects/:projectId/outputs/:videoVersionId/content', async (request, reply) => {
      const params = projectOutputVersionParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, 'validation_error', 'Choose a valid Project output.');
      }
      const result = await outputService.content(
        ownerUserIdForRequest(request),
        params.data.projectId,
        params.data.videoVersionId,
      );
      return sendProjectMediaContent(request, reply, {
        asset: result.asset,
        mimeType: result.version.mimeType,
        filename: result.version.filename,
      });
    });
  }

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

  app.post('/api/projects/:projectId/campaign', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    const body = moveProjectCampaignRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new AppError(
        400,
        'validation_error',
        'Provide a valid Project, Campaign, and version.',
      );
    }
    return sendMutation(
      reply,
      await requireService(service).moveToCampaign(
        ownerUserIdForRequest(request),
        params.data.projectId,
        body.data.expectedVersion,
        body.data.campaignId,
      ),
    );
  });
};
