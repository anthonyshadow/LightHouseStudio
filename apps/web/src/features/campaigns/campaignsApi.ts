import {
  campaignConflictResponseSchema,
  campaignSchema,
  campaignsResponseSchema,
  type CampaignConflictContract,
  type CampaignContract,
  type CampaignsQuery,
} from '@studio/contracts';
import {
  ApiClientError,
  requestJson,
  type ApiErrorPayloadParser,
} from '../../adapters/api-client/apiClient';

export interface CampaignsPage {
  readonly campaigns: CampaignContract[];
  readonly nextCursor: string | null;
}

export class CampaignApiConflictError extends ApiClientError {
  readonly conflict: CampaignConflictContract;

  constructor(message: string, conflict: CampaignConflictContract) {
    super(message, 409, 'conflict');
    this.name = 'CampaignApiConflictError';
    this.conflict = conflict;
  }
}

const parseCampaignConflict: ApiErrorPayloadParser = (payload, status) => {
  if (status !== 409) return null;
  const parsed = campaignConflictResponseSchema.safeParse(payload);
  return parsed.success
    ? new CampaignApiConflictError(parsed.data.error.message, parsed.data.conflict)
    : null;
};

const invalidCampaignResponse = () =>
  new ApiClientError('The Campaign response was invalid.', 502, 'invalid-response');
const jsonHeaders = { Accept: 'application/json', 'Content-Type': 'application/json' } as const;

export const listCampaigns = (
  input: Pick<CampaignsQuery, 'lifecycle' | 'pageSize'> & {
    readonly cursor?: string | undefined;
    readonly signal?: AbortSignal | undefined;
  },
): Promise<CampaignsPage> => {
  const query = new URLSearchParams({
    lifecycle: input.lifecycle,
    pageSize: String(input.pageSize),
  });
  if (input.cursor) query.set('cursor', input.cursor);
  return requestJson(
    `/api/campaigns?${query.toString()}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(input.signal ? { signal: input.signal } : {}),
    },
    campaignsResponseSchema,
    invalidCampaignResponse,
  );
};

export const getCampaign = (campaignId: string, signal?: AbortSignal): Promise<CampaignContract> =>
  requestJson(
    `/api/campaigns/${encodeURIComponent(campaignId)}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    },
    campaignSchema,
    invalidCampaignResponse,
  );

export const createCampaign = (
  input: { readonly name: string; readonly brief: string | null },
  operationKey: string,
  signal?: AbortSignal,
): Promise<CampaignContract> =>
  requestJson(
    '/api/campaigns',
    {
      method: 'POST',
      cache: 'no-store',
      headers: { ...jsonHeaders, 'Idempotency-Key': operationKey },
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    },
    campaignSchema,
    invalidCampaignResponse,
    parseCampaignConflict,
  );

export const editCampaign = (
  campaignId: string,
  input: { readonly name: string; readonly brief: string | null; readonly expectedVersion: number },
  signal?: AbortSignal,
): Promise<CampaignContract> =>
  requestJson(
    `/api/campaigns/${encodeURIComponent(campaignId)}`,
    {
      method: 'PATCH',
      cache: 'no-store',
      headers: jsonHeaders,
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    },
    campaignSchema,
    invalidCampaignResponse,
    parseCampaignConflict,
  );

const changeCampaignLifecycle = (
  campaignId: string,
  operation: 'archive' | 'restore',
  expectedVersion: number,
): Promise<CampaignContract> =>
  requestJson(
    `/api/campaigns/${encodeURIComponent(campaignId)}/${operation}`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: jsonHeaders,
      body: JSON.stringify({ expectedVersion }),
    },
    campaignSchema,
    invalidCampaignResponse,
    parseCampaignConflict,
  );

export const archiveCampaign = (campaignId: string, expectedVersion: number) =>
  changeCampaignLifecycle(campaignId, 'archive', expectedVersion);
export const restoreCampaign = (campaignId: string, expectedVersion: number) =>
  changeCampaignLifecycle(campaignId, 'restore', expectedVersion);

export const tombstoneCampaign = (
  campaignId: string,
  expectedVersion: number,
): Promise<CampaignContract> =>
  requestJson(
    `/api/campaigns/${encodeURIComponent(campaignId)}/tombstone`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: jsonHeaders,
      body: JSON.stringify({ expectedVersion, confirmation: 'tombstone' }),
    },
    campaignSchema,
    invalidCampaignResponse,
    parseCampaignConflict,
  );
