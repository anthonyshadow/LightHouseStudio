import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CampaignService } from '../../features/campaigns/campaign-service.js';
import { ProjectService } from '../../features/projects/project-service.js';
import { DrizzleCampaignRepository } from './campaign-repository.js';
import { createPostgresDatabase, type DatabaseConnection } from './client.js';
import { DrizzleProjectRepository } from './project-repository.js';
import {
  campaignOperationReceipts,
  campaigns,
  projectOperationReceipts,
  projectRevisions,
  projects,
  users,
} from './schema.js';

const databaseUrl =
  process.env.LIGHTFRAME_PROJECT_TEST_DATABASE_URL ??
  (process.env.CI === 'true' || process.env.LIGHTFRAME_RUN_PROJECT_POSTGRES_TEST === 'true'
    ? process.env.DATABASE_URL
    : undefined);

describe.runIf(databaseUrl !== undefined)('Campaign repository PostgreSQL invariants', () => {
  let connection: DatabaseConnection;

  beforeAll(() => {
    connection = createPostgresDatabase(databaseUrl!);
  });

  afterAll(async () => {
    await connection.close();
  });

  it('enforces same-owner active membership, Project CAS, non-cascading archive, and guarded tombstone', async () => {
    const ownerUserId = randomUUID();
    const otherOwnerUserId = randomUUID();
    const now = new Date('2026-08-11T15:00:00.000Z');
    const campaignIds: string[] = [];
    const projectIds: string[] = [];
    try {
      await connection.db.insert(users).values([
        {
          id: ownerUserId,
          login: `${ownerUserId}@campaign.test`,
          normalizedLogin: `${ownerUserId}@campaign.test`,
          username: `c-${ownerUserId}`,
          email: `${ownerUserId}@campaign.test`,
          displayName: 'Campaign owner',
        },
        {
          id: otherOwnerUserId,
          login: `${otherOwnerUserId}@campaign.test`,
          normalizedLogin: `${otherOwnerUserId}@campaign.test`,
          username: `c-${otherOwnerUserId}`,
          email: `${otherOwnerUserId}@campaign.test`,
          displayName: 'Other Campaign owner',
        },
      ]);
      const campaignRepository = new DrizzleCampaignRepository(connection.db);
      const projectRepository = new DrizzleProjectRepository(connection.db);
      const campaignService = new CampaignService(campaignRepository, { now: () => now });
      const projectService = new ProjectService(projectRepository, { now: () => now });
      const first = await campaignService.create(ownerUserId, randomUUID(), { name: 'First' });
      const second = await campaignService.create(ownerUserId, randomUUID(), { name: 'Second' });
      const other = await campaignService.create(otherOwnerUserId, randomUUID(), {
        name: 'Other owner',
      });
      if (!first.ok || !second.ok || !other.ok) throw new Error('Expected Campaign creates.');
      campaignIds.push(first.campaign.id, second.campaign.id, other.campaign.id);

      const project = await projectService.create(
        ownerUserId,
        randomUUID(),
        'Campaign Project',
        first.campaign.id,
      );
      if (!project.ok) throw new Error('Expected Project create.');
      projectIds.push(project.current.project.id);
      await expect(
        projectService.create(ownerUserId, randomUUID(), 'Cross owner', other.campaign.id),
      ).resolves.toMatchObject({ ok: false, conflict: { kind: 'campaign-membership' } });

      const archived = await campaignService.archive(ownerUserId, first.campaign.id, 1);
      expect(archived).toMatchObject({ ok: true, campaign: { status: 'archived' } });
      await expect(
        projectService.create(ownerUserId, randomUUID(), 'Archived target', first.campaign.id),
      ).resolves.toMatchObject({ ok: false, conflict: { kind: 'campaign-membership' } });
      await expect(
        projectService.get(ownerUserId, project.current.project.id),
      ).resolves.toMatchObject({ project: { campaignId: first.campaign.id, status: 'draft' } });
      await expect(
        campaignService.tombstone(ownerUserId, first.campaign.id, 2, 'tombstone'),
      ).resolves.toMatchObject({
        ok: false,
        conflict: { kind: 'campaign-not-empty', attachedProjectCount: 1 },
      });

      const moved = await projectService.moveToCampaign(
        ownerUserId,
        project.current.project.id,
        1,
        second.campaign.id,
      );
      expect(moved).toMatchObject({ ok: true, current: { project: { version: 2 } } });
      await expect(
        projectService.moveToCampaign(ownerUserId, project.current.project.id, 1, null),
      ).resolves.toMatchObject({
        ok: false,
        conflict: { kind: 'project-version', actualVersion: 2 },
      });
      await expect(
        projectService.moveToCampaign(ownerUserId, project.current.project.id, 2, null),
      ).resolves.toMatchObject({
        ok: true,
        current: { project: { campaignId: null, version: 3 } },
      });
      await expect(
        campaignService.tombstone(ownerUserId, first.campaign.id, 2, 'tombstone'),
      ).resolves.toMatchObject({ ok: true, campaign: { status: 'deleted' } });
      await expect(
        projectService.list(ownerUserId, {
          lifecycle: 'active',
          campaignId: 'none',
          pageSize: 20,
        }),
      ).resolves.toMatchObject({ projects: [{ id: project.current.project.id }] });
    } finally {
      await connection.db
        .delete(projectOperationReceipts)
        .where(eq(projectOperationReceipts.ownerUserId, ownerUserId));
      for (const projectId of projectIds) {
        await connection.db
          .update(projects)
          .set({ currentRevisionId: null, currentRevisionNumber: 0 })
          .where(eq(projects.id, projectId));
        await connection.db
          .delete(projectRevisions)
          .where(eq(projectRevisions.projectId, projectId));
        await connection.db.delete(projects).where(eq(projects.id, projectId));
      }
      await connection.db
        .delete(campaignOperationReceipts)
        .where(eq(campaignOperationReceipts.ownerUserId, ownerUserId));
      await connection.db
        .delete(campaignOperationReceipts)
        .where(eq(campaignOperationReceipts.ownerUserId, otherOwnerUserId));
      for (const campaignId of campaignIds) {
        await connection.db.delete(campaigns).where(eq(campaigns.id, campaignId));
      }
      await connection.db.delete(users).where(eq(users.id, ownerUserId));
      await connection.db.delete(users).where(eq(users.id, otherOwnerUserId));
    }
  }, 20_000);
});
