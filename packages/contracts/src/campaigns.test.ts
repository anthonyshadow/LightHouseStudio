import { describe, expect, it } from 'vitest';
import {
  campaignConflictResponseSchema,
  campaignSchema,
  createCampaignRequestSchema,
  editCampaignRequestSchema,
  tombstoneCampaignRequestSchema,
} from './campaigns';

const campaignId = 'f5029fb5-d0a1-4cc0-ad4f-f0ce43b0e0b2';
const now = '2026-08-11T12:00:00.000Z';

describe('Campaign HTTP contracts', () => {
  it('accepts only minimal owner-free Campaign metadata', () => {
    expect(
      campaignSchema.parse({
        id: campaignId,
        name: 'Summer launch',
        brief: null,
        status: 'active',
        version: 1,
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    ).toMatchObject({ id: campaignId, brief: null });
    expect(
      campaignSchema.safeParse({
        id: campaignId,
        name: 'Summer launch',
        brief: null,
        status: 'active',
        version: 1,
        archivedAt: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now,
        ownerUserId: campaignId,
      }).success,
    ).toBe(false);
  });

  it('keeps create/edit/tombstone requests strict and bounded', () => {
    expect(createCampaignRequestSchema.parse({ name: 'Launch' })).toEqual({
      name: 'Launch',
      brief: null,
    });
    expect(
      editCampaignRequestSchema.parse({ name: 'Launch', brief: 'Short brief', expectedVersion: 2 }),
    ).toMatchObject({ brief: 'Short brief', expectedVersion: 2 });
    expect(
      tombstoneCampaignRequestSchema.safeParse({
        expectedVersion: 3,
        confirmation: 'delete-everything',
      }).success,
    ).toBe(false);
  });

  it('exposes typed safe conflicts without owner identity', () => {
    expect(
      campaignConflictResponseSchema.parse({
        error: { code: 'conflict', message: 'Move or detach Projects first.' },
        conflict: { kind: 'campaign-not-empty', campaignId, attachedProjectCount: 2 },
      }),
    ).toMatchObject({ conflict: { kind: 'campaign-not-empty', attachedProjectCount: 2 } });
  });
});
