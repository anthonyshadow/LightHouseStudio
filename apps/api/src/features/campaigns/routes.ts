import {
  campaignConflictResponseSchema,
  campaignLifecycleRequestSchema,
  campaignOperationKeySchema,
  campaignParamsSchema,
  campaignsQuerySchema,
  createCampaignRequestSchema,
  editCampaignRequestSchema,
  tombstoneCampaignRequestSchema,
} from '@studio/contracts';
import type { CampaignConflict } from '@studio/domain';
import type {
  ApplicationRuntime,
  HttpReply,
  HttpRequest,
} from '../../application/application-runtime.js';
import { AppError } from '../../http/app-error.js';
import { ownerUserIdForRequest } from '../../http/authentication.js';
import { requestHeader, requireConfiguredService } from '../../http/request-helpers.js';
import type { CampaignService, CampaignServiceMutationResult } from './campaign-service.js';

const requireService = (service: CampaignService | undefined): CampaignService =>
  requireConfiguredService(service, 'Campaign persistence is unavailable in the configured mode.');

const conflictMessage = (conflict: CampaignConflict): string => {
  switch (conflict.kind) {
    case 'operation-key':
      return 'That Idempotency-Key was already used for a different Campaign create request.';
    case 'campaign-version':
      return 'The Campaign changed in another session. Refresh it before retrying.';
    case 'campaign-not-empty':
      return 'Move or detach every Project before deleting this Campaign.';
  }
};

const sendMutation = (reply: HttpReply, result: CampaignServiceMutationResult) => {
  if (result.ok) return result.campaign;
  return reply.status(409).send(
    campaignConflictResponseSchema.parse({
      error: { code: 'conflict', message: conflictMessage(result.conflict) },
      conflict: result.conflict,
    }),
  );
};

const params = (request: HttpRequest) => {
  const parsed = campaignParamsSchema.safeParse(request.params);
  if (!parsed.success) throw new AppError(400, 'validation_error', 'Choose a valid Campaign.');
  return parsed.data;
};

export const registerCampaignRoutes = (
  app: ApplicationRuntime,
  service: CampaignService | undefined,
): void => {
  app.get('/api/campaigns', async (request) => {
    const query = campaignsQuerySchema.safeParse(request.query);
    if (!query.success) {
      throw new AppError(400, 'validation_error', 'Use a valid Campaign page request.');
    }
    return requireService(service).list(ownerUserIdForRequest(request), query.data);
  });

  app.post('/api/campaigns', async (request, reply) => {
    const body = createCampaignRequestSchema.safeParse(request.body);
    const operationKey = campaignOperationKeySchema.safeParse(
      requestHeader(request, 'idempotency-key'),
    );
    if (!body.success || !operationKey.success) {
      throw new AppError(
        400,
        'validation_error',
        'Provide a Campaign name and UUID Idempotency-Key.',
      );
    }
    const result = await requireService(service).create(
      ownerUserIdForRequest(request),
      operationKey.data,
      body.data,
    );
    if (result.ok) reply.status(201);
    return sendMutation(reply, result);
  });

  app.get('/api/campaigns/:campaignId', async (request) =>
    requireService(service).get(ownerUserIdForRequest(request), params(request).campaignId),
  );

  app.patch('/api/campaigns/:campaignId', async (request, reply) => {
    const body = editCampaignRequestSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, 'validation_error', 'Provide valid Campaign details and version.');
    }
    const { expectedVersion, ...details } = body.data;
    return sendMutation(
      reply,
      await requireService(service).edit(
        ownerUserIdForRequest(request),
        params(request).campaignId,
        expectedVersion,
        details,
      ),
    );
  });

  for (const operation of ['archive', 'restore'] as const) {
    app.post(`/api/campaigns/:campaignId/${operation}`, async (request, reply) => {
      const body = campaignLifecycleRequestSchema.safeParse(request.body);
      if (!body.success) {
        throw new AppError(400, 'validation_error', 'Provide a valid Campaign and version.');
      }
      const campaignId = params(request).campaignId;
      const campaignService = requireService(service);
      return sendMutation(
        reply,
        await campaignService[operation](
          ownerUserIdForRequest(request),
          campaignId,
          body.data.expectedVersion,
        ),
      );
    });
  }

  app.post('/api/campaigns/:campaignId/tombstone', async (request, reply) => {
    const body = tombstoneCampaignRequestSchema.safeParse(request.body);
    if (!body.success) {
      throw new AppError(400, 'validation_error', 'Confirm deletion of an archived Campaign.');
    }
    return sendMutation(
      reply,
      await requireService(service).tombstone(
        ownerUserIdForRequest(request),
        params(request).campaignId,
        body.data.expectedVersion,
        body.data.confirmation,
      ),
    );
  });
};
