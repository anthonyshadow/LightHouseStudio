import { describe, expect, it } from 'vitest';
import {
  archiveCampaign,
  CampaignRuleError,
  createCampaign,
  editCampaign,
  restoreCampaign,
  tombstoneCampaign,
} from './index';

const campaignId = 'f5029fb5-d0a1-4cc0-ad4f-f0ce43b0e0b2';
const ownerUserId = '8565ab6c-70ee-409c-bb0a-ff08b7c98070';
const now = '2026-08-11T12:00:00.000Z';
const later = '2026-08-11T12:05:00.000Z';

const activeCampaign = () =>
  createCampaign(
    {
      id: campaignId,
      ownerUserId,
      name: '  Summer\u0000   launch  ',
      brief: ' First line.\r\n\r\n\r\n Second line. ',
    },
    { now },
  );

describe('Campaign aggregate rules', () => {
  it('creates minimal normalized owner-scoped Campaign metadata', () => {
    expect(activeCampaign()).toEqual({
      id: campaignId,
      ownerUserId,
      name: 'Summer launch',
      brief: 'First line.\n\n Second line.',
      status: 'active',
      version: 1,
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  it('uses one CAS token for edits and lifecycle without changing ownership', () => {
    const campaign = activeCampaign();
    expect(editCampaign(campaign, { name: 'Renamed', brief: '' }, 9, later)).toMatchObject({
      ok: false,
      conflict: { kind: 'campaign-version', actualVersion: 1 },
    });
    const edited = editCampaign(campaign, { name: 'Renamed', brief: '' }, 1, later);
    if (!edited.ok) throw new Error('Expected Campaign edit.');
    expect(edited.value).toMatchObject({
      ownerUserId,
      name: 'Renamed',
      brief: null,
      version: 2,
    });
    const archived = archiveCampaign(edited.value, 2, later);
    if (!archived.ok) throw new Error('Expected Campaign archive.');
    expect(archived.value).toMatchObject({ status: 'archived', version: 3, archivedAt: later });
    expect(restoreCampaign(archived.value, 3, later)).toMatchObject({
      ok: true,
      value: { status: 'active', version: 4, archivedAt: null },
    });
  });

  it('requires archive, zero Projects, and explicit confirmation before tombstone', () => {
    const campaign = activeCampaign();
    expect(() => tombstoneCampaign(campaign, 1, 0, 'tombstone', later)).toThrow(
      'Archive the Campaign',
    );
    const archived = archiveCampaign(campaign, 1, later);
    if (!archived.ok) throw new Error('Expected Campaign archive.');
    expect(tombstoneCampaign(archived.value, 2, 2, 'tombstone', later)).toEqual({
      ok: false,
      conflict: { kind: 'campaign-not-empty', campaignId, attachedProjectCount: 2 },
    });
    expect(() => tombstoneCampaign(archived.value, 2, 0, null, later)).toThrow(CampaignRuleError);
    expect(tombstoneCampaign(archived.value, 2, 0, 'tombstone', later)).toMatchObject({
      ok: true,
      value: { status: 'deleted', version: 3, archivedAt: later, deletedAt: later },
    });
  });

  it('bounds required names and optional briefs', () => {
    expect(() => createCampaign({ id: campaignId, ownerUserId, name: '   ' }, { now })).toThrow(
      'Campaign name',
    );
    expect(() =>
      createCampaign(
        { id: campaignId, ownerUserId, name: 'Campaign', brief: 'x'.repeat(1_001) },
        { now },
      ),
    ).toThrow('brief');
  });
});
