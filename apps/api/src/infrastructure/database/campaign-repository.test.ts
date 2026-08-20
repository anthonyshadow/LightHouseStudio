import { createCampaign } from '@studio/domain';
import { describe, expect, it } from 'vitest';
import { DrizzleCampaignRepository } from './campaign-repository.js';
import { scriptedDatabase } from './scripted-database.test-support.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const campaignId = '20ce94fa-15d1-42c6-abd3-77ff61516b48';
const now = '2026-08-11T12:00:00.000Z';
const postgresNow = '2026-08-11 12:00:00+00';

const campaign = createCampaign(
  { id: campaignId, ownerUserId, name: 'Summer launch', brief: 'Keep it focused.' },
  { now },
);
const campaignRow = {
  ...campaign,
  archivedAt: null,
  deletedAt: null,
  createdAt: postgresNow,
  updatedAt: postgresNow,
};

describe('Campaign persistence query boundaries', () => {
  it('returns a bounded Campaign page and its total in a fixed number of queries', async () => {
    const secondCampaignId = '41365ff4-5810-4ad4-b419-cb1a042cf30b';
    const scripted = scriptedDatabase(
      [campaignRow, { ...campaignRow, id: secondCampaignId, name: 'Second Campaign' }],
      [{ id: campaignId }, { id: secondCampaignId }],
    );

    await expect(
      new DrizzleCampaignRepository(scripted.db).listCampaigns(ownerUserId, {
        lifecycle: 'active',
        pageSize: 20,
      }),
    ).resolves.toMatchObject({
      campaigns: [{ id: campaignId }, { id: secondCampaignId }],
      nextCursor: null,
      total: { count: 2, exceedsCeiling: false },
    });
    // Two statements: the page, and the bounded count behind the total. A fixed number either way —
    // what must never happen is a statement per row.
    expect(scripted.calls.filter(({ operation }) => operation === 'select')).toHaveLength(2);
    expect(scripted.remaining()).toBe(0);
  });

  it('loads a Campaign and its attached Project count with one SQL query', async () => {
    const scripted = scriptedDatabase([{ campaign: campaignRow, attachedProjectCount: 12 }]);

    await expect(
      new DrizzleCampaignRepository(scripted.db).getCampaignWithAttachedProjectCount(
        ownerUserId,
        campaignId,
      ),
    ).resolves.toMatchObject({
      campaign: { id: campaignId },
      attachedProjectCount: 12,
    });
    expect(scripted.calls.filter(({ operation }) => operation === 'select')).toHaveLength(1);
    expect(scripted.remaining()).toBe(0);
  });
});
