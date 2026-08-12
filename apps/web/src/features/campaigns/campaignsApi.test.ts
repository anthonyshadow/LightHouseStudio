// @vitest-environment jsdom

import type { CampaignContract } from '@studio/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureRequests, jsonScenario, malformedContractScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';
import {
  archiveCampaign,
  CampaignApiConflictError,
  createCampaign,
  editCampaign,
  getCampaign,
  listCampaigns,
  restoreCampaign,
  tombstoneCampaign,
} from './campaignsApi';

const campaignId = '20ce94fa-15d1-42c6-abd3-77ff61516b48';
const now = '2026-08-11T16:00:00.000Z';

const campaign = (overrides: Partial<CampaignContract> = {}): CampaignContract => ({
  id: campaignId,
  name: 'Summer launch',
  brief: 'Keep the launch focused.',
  status: 'active',
  version: 1,
  archivedAt: null,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Campaigns API adapter', () => {
  it('lists bounded lifecycle summaries and creates with one owner-free operation key', async () => {
    const observed = captureRequests();
    const operationKey = 'bb61d587-7b8d-43f8-8ca8-757110b34e02';
    mockApiServer.use(
      jsonScenario(
        'GET',
        '/api/campaigns',
        { body: { campaigns: [campaign()], nextCursor: 'next-page' } },
        observed.observe,
      ),
      jsonScenario('POST', '/api/campaigns', { body: campaign(), status: 201 }, observed.observe),
    );

    await expect(
      listCampaigns({ lifecycle: 'active', pageSize: 20, cursor: 'first-page' }),
    ).resolves.toEqual({ campaigns: [campaign()], nextCursor: 'next-page' });
    await expect(
      createCampaign({ name: 'Summer launch', brief: 'Keep the launch focused.' }, operationKey),
    ).resolves.toEqual(campaign());

    const listUrl = new URL(observed.requests[0]!.url);
    expect(Object.fromEntries(listUrl.searchParams)).toEqual({
      lifecycle: 'active',
      pageSize: '20',
      cursor: 'first-page',
    });
    expect(observed.requests[1]!.headers.get('idempotency-key')).toBe(operationKey);
    expect(await observed.requests[1]!.json()).toEqual({
      name: 'Summer launch',
      brief: 'Keep the launch focused.',
    });
  });

  it('maps detail, edit, lifecycle, and guarded tombstone operations through strict contracts', async () => {
    const edited = campaign({ name: 'Summer launch final', brief: null, version: 2 });
    const archived = campaign({
      name: edited.name,
      brief: null,
      status: 'archived',
      version: 3,
      archivedAt: now,
    });
    const restored = campaign({ name: edited.name, brief: null, version: 4 });
    const deleted = campaign({
      name: edited.name,
      brief: null,
      status: 'deleted',
      version: 5,
      deletedAt: now,
    });
    mockApiServer.use(
      jsonScenario('GET', `/api/campaigns/${campaignId}`, { body: campaign() }),
      jsonScenario('PATCH', `/api/campaigns/${campaignId}`, { body: edited }),
      jsonScenario('POST', `/api/campaigns/${campaignId}/archive`, { body: archived }),
      jsonScenario('POST', `/api/campaigns/${campaignId}/restore`, { body: restored }),
      jsonScenario('POST', `/api/campaigns/${campaignId}/tombstone`, { body: deleted }),
    );

    await expect(getCampaign(campaignId)).resolves.toEqual(campaign());
    await expect(
      editCampaign(campaignId, { name: edited.name, brief: null, expectedVersion: 1 }),
    ).resolves.toEqual(edited);
    await expect(archiveCampaign(campaignId, 2)).resolves.toEqual(archived);
    await expect(restoreCampaign(campaignId, 3)).resolves.toEqual(restored);
    await expect(tombstoneCampaign(campaignId, 4)).resolves.toEqual(deleted);
  });

  it('preserves safe typed conflicts and rejects malformed success payloads', async () => {
    mockApiServer.use(
      jsonScenario('POST', `/api/campaigns/${campaignId}/tombstone`, {
        status: 409,
        body: {
          error: { code: 'conflict', message: 'Move or detach Projects first.' },
          conflict: { kind: 'campaign-not-empty', campaignId, attachedProjectCount: 2 },
        },
      }),
    );

    const conflict = await tombstoneCampaign(campaignId, 2).catch((error: unknown) => error);
    expect(conflict).toBeInstanceOf(CampaignApiConflictError);
    expect(conflict).toMatchObject({
      status: 409,
      code: 'conflict',
      conflict: { kind: 'campaign-not-empty', attachedProjectCount: 2 },
    });

    mockApiServer.use(malformedContractScenario('GET', `/api/campaigns/${campaignId}`));
    await expect(getCampaign(campaignId)).rejects.toMatchObject({
      status: 502,
      code: 'invalid-response',
    });
  });
});
