import {
  attachProjectAssetRequestSchema,
  appendProjectRevisionRequestSchema,
  adoptProjectWorkingMediaRequestSchema,
  createProjectRequestSchema,
  detachProjectAssetResponseSchema,
  duplicateProjectRequestSchema,
  projectAssetMembershipParamsSchema,
  projectAssetsQuerySchema,
  projectConflictResponseSchema,
  projectLifecycleRequestSchema,
  tombstoneProjectRequestSchema,
  projectHistoryQuerySchema,
  projectHistoryResponseSchema,
  projectOutputHistoryItemSchema,
  projectOutputHistoryResponseSchema,
  projectOperationKeySchema,
  projectOutputVersionParamsSchema,
  projectSourceResponseSchema,
  projectSourceUploadMetadataSchema,
  projectWorkingMediaParamsSchema,
  projectWorkingMediaResponseSchema,
  projectWorkingMediaUploadMetadataSchema,
  saveProjectOutputRequestSchema,
  saveProjectOutputResponseSchema,
  removeProjectSourceRequestSchema,
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
  RouteHandler,
} from '../../application/application-runtime.js';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import { AppError } from '../../http/app-error.js';
import { requestHeader, requireConfiguredService } from '../../http/request-helpers.js';
import { isSpooledAudioUpload } from '../../application/spooled-upload.js';
import { sendRangedAsset } from '../saved-videos/byte-range.js';
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
import type { ProjectHistoryService } from './project-history-service.js';
import type { ProjectAssetService } from './project-asset-service.js';

const requireService = (service: ProjectService | undefined): ProjectService =>
  requireConfiguredService(service, 'Project persistence is unavailable in the configured mode.');

const requireAssetService = (service: ProjectAssetService | undefined): ProjectAssetService =>
  requireConfiguredService(
    service,
    'Project asset persistence is unavailable in the configured mode.',
  );

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
      return 'The Project has active work. Wait for it to finish, cancel it, or reconcile it first.';
    case 'relation-mismatch':
      return 'The Project relationship changed and the request was not applied.';
    case 'campaign-membership':
      return 'Choose an active Campaign you can access, or detach the Project.';
    case 'immutable-source':
      return 'This Project already has a source. Remove the current source before choosing another.';
    case 'saved-video-version':
      return 'The selected Saved Video changed. Confirm its current Version before adding another.';
  }
};

/** One owner for the 409 wire shape, so every mutation reports a conflict identically. */
const sendProjectConflict = (reply: HttpReply, conflict: ProjectConflict) =>
  reply.status(409).send(
    projectConflictResponseSchema.parse({
      error: { code: 'conflict', message: conflictMessage(conflict) },
      conflict,
    }),
  );

const sendMutation = (reply: HttpReply, result: ProjectServiceMutationResult) => {
  if (result.ok) return result.current;
  return sendProjectConflict(reply, result.conflict);
};

const sendReplayableMutation = (
  reply: HttpReply,
  result: ProjectSourceMutationResult | ProjectWorkingMediaMutationResult,
) => {
  if (result.ok) {
    if (!result.replayed) reply.status(201);
    return result.response;
  }
  return sendProjectConflict(reply, result.conflict);
};

const sendProjectOutputMutation = (reply: HttpReply, result: ProjectOutputSaveMutationResult) => {
  if (result.ok) {
    if (!result.response.replayed) reply.status(201);
    return saveProjectOutputResponseSchema.parse(result.response);
  }
  return sendProjectConflict(reply, result.conflict);
};

const parseUploadMetadata = <Output>(
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
  historyService?: ProjectHistoryService,
  assetService?: ProjectAssetService,
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
    const operationKey = projectOperationKeySchema.safeParse(
      requestHeader(request, 'idempotency-key'),
    );
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

  // Registered unconditionally alongside the other Project lifecycle commands: duplicating derives
  // one revision from another and touches no source bytes, so it needs no storage-backed service.
  app.post('/api/projects/:projectId/duplicate', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    const body = duplicateProjectRequestSchema.safeParse(request.body);
    const operationKey = projectOperationKeySchema.safeParse(
      requestHeader(request, 'idempotency-key'),
    );
    if (!params.success || !body.success || !operationKey.success) {
      throw new AppError(
        400,
        'validation_error',
        'Provide a Project title, Campaign, version and UUID Idempotency-Key.',
      );
    }
    const result = await requireService(service).duplicate(
      ownerUserIdForRequest(request),
      params.data.projectId,
      operationKey.data,
      body.data,
    );
    if (result.ok) reply.status(201);
    return sendMutation(reply, result);
  });

  app.get('/api/projects/:projectId/assets', async (request) => {
    const params = projectParamsSchema.safeParse(request.params);
    const query = projectAssetsQuerySchema.safeParse(request.query);
    if (!params.success || !query.success) {
      throw new AppError(400, 'validation_error', 'Use a valid Project asset page request.');
    }
    return requireAssetService(assetService).list(
      ownerUserIdForRequest(request),
      params.data.projectId,
      query.data,
    );
  });

  app.post('/api/projects/:projectId/assets', async (request, reply) => {
    const params = projectParamsSchema.safeParse(request.params);
    const body = attachProjectAssetRequestSchema.safeParse(request.body);
    if (!params.success || !body.success) {
      throw new AppError(400, 'validation_error', 'Choose a valid Project asset.');
    }
    const response = await requireAssetService(assetService).attach(
      ownerUserIdForRequest(request),
      params.data.projectId,
      body.data,
    );
    if (response.created) reply.status(201);
    return response;
  });

  app.delete('/api/projects/:projectId/assets/:membershipId', async (request) => {
    const params = projectAssetMembershipParamsSchema.safeParse(request.params);
    if (!params.success) {
      throw new AppError(400, 'validation_error', 'Choose a valid Project asset membership.');
    }
    await requireAssetService(assetService).detach(
      ownerUserIdForRequest(request),
      params.data.projectId,
      params.data.membershipId,
    );
    return detachProjectAssetResponseSchema.parse({ detached: true });
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
          requestHeader(request, 'idempotency-key'),
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
      const operationKey = projectOperationKeySchema.safeParse(
        requestHeader(request, 'idempotency-key'),
      );
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

    app.post('/api/projects/:projectId/source/remove', async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      const body = removeProjectSourceRequestSchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, 'validation_error', 'Provide a valid Project and version.');
      }
      return sendMutation(
        reply,
        await sourceService.remove({
          ownerUserId: ownerUserIdForRequest(request),
          projectId: params.data.projectId,
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
      return sendRangedAsset(request, reply, {
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
          requestHeader(request, 'idempotency-key'),
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
      const operationKey = projectOperationKeySchema.safeParse(
        requestHeader(request, 'idempotency-key'),
      );
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
        return sendRangedAsset(request, reply, {
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
      const operationId = projectOperationKeySchema.safeParse(
        requestHeader(request, 'idempotency-key'),
      );
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
      return sendRangedAsset(request, reply, {
        asset: result.asset,
        mimeType: result.version.mimeType,
        filename: result.version.filename,
      });
    });
  }

  if (historyService !== undefined) {
    app.get('/api/projects/:projectId/history', async (request) => {
      const params = projectParamsSchema.safeParse(request.params);
      const query = projectHistoryQuerySchema.safeParse(request.query);
      if (!params.success || !query.success) {
        throw new AppError(400, 'validation_error', 'Use a valid Project history page.');
      }
      return projectHistoryResponseSchema.parse(
        await historyService.revisions(
          ownerUserIdForRequest(request),
          params.data.projectId,
          query.data,
        ),
      );
    });

    app.get('/api/projects/:projectId/outputs', async (request) => {
      const params = projectParamsSchema.safeParse(request.params);
      const query = projectHistoryQuerySchema.safeParse(request.query);
      if (!params.success || !query.success) {
        throw new AppError(400, 'validation_error', 'Use a valid Project output page.');
      }
      return projectOutputHistoryResponseSchema.parse(
        await historyService.outputs(
          ownerUserIdForRequest(request),
          params.data.projectId,
          query.data,
        ),
      );
    });

    app.get('/api/projects/:projectId/outputs/:videoVersionId', async (request) => {
      const params = projectOutputVersionParamsSchema.safeParse(request.params);
      if (!params.success) {
        throw new AppError(400, 'validation_error', 'Choose a valid Project output.');
      }
      return projectOutputHistoryItemSchema.parse(
        await historyService.output(
          ownerUserIdForRequest(request),
          params.data.projectId,
          params.data.videoVersionId,
        ),
      );
    });
  }

  /**
   * Every versioned Project mutation shares one shape: validate params + body together, then
   * hand the owner, the Project id and the caller's expected version to one service method.
   */
  const versionedProjectMutation = <Body extends { readonly expectedVersion: number }>(
    register: (handler: RouteHandler) => void,
    bodySchema: {
      readonly safeParse: (value: unknown) => { success: true; data: Body } | { success: false };
    },
    validationMessage: string,
    run: (
      projects: ProjectService,
      ownerUserId: string,
      projectId: string,
      body: Body,
    ) => Promise<ProjectServiceMutationResult>,
  ): void => {
    register(async (request, reply) => {
      const params = projectParamsSchema.safeParse(request.params);
      const body = bodySchema.safeParse(request.body);
      if (!params.success || !body.success) {
        throw new AppError(400, 'validation_error', validationMessage);
      }
      return sendMutation(
        reply,
        await run(
          requireService(service),
          ownerUserIdForRequest(request),
          params.data.projectId,
          body.data,
        ),
      );
    });
  };

  versionedProjectMutation(
    (handler) => app.patch('/api/projects/:projectId', handler),
    renameProjectRequestSchema,
    'Provide a valid Project title and version.',
    (projects, ownerUserId, projectId, body) =>
      projects.rename(ownerUserId, projectId, body.expectedVersion, body.title),
  );

  versionedProjectMutation(
    (handler) => app.post('/api/projects/:projectId/archive', handler),
    projectLifecycleRequestSchema,
    'Provide a valid Project and version.',
    (projects, ownerUserId, projectId, body) =>
      projects.archive(ownerUserId, projectId, body.expectedVersion),
  );

  versionedProjectMutation(
    (handler) => app.post('/api/projects/:projectId/restore', handler),
    projectLifecycleRequestSchema,
    'Provide a valid Project and version.',
    (projects, ownerUserId, projectId, body) =>
      projects.restore(ownerUserId, projectId, body.expectedVersion),
  );

  versionedProjectMutation(
    (handler) => app.post('/api/projects/:projectId/tombstone', handler),
    tombstoneProjectRequestSchema,
    'Confirm deletion of an archived Project.',
    (projects, ownerUserId, projectId, body) =>
      projects.tombstone(ownerUserId, projectId, body.expectedVersion, body.confirmation),
  );

  versionedProjectMutation(
    (handler) => app.post('/api/projects/:projectId/campaign', handler),
    moveProjectCampaignRequestSchema,
    'Provide a valid Project, Campaign, and version.',
    (projects, ownerUserId, projectId, body) =>
      projects.moveToCampaign(ownerUserId, projectId, body.expectedVersion, body.campaignId),
  );
};
