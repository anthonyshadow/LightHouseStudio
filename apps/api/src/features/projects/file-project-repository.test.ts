import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FileProjectRepository } from './file-project-repository.js';
import { ProjectService } from './project-service.js';
import { CampaignService } from '../campaigns/campaign-service.js';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const otherOwnerUserId = '458c4aca-a9fa-4c25-a2c8-d218768216a1';

const metadataPaths = (directory: string, ownerId: string) => {
  const segment = createHash('sha256').update(ownerId).digest('hex');
  const primary = path.join(directory, 'metadata', 'v1', 'projects', `${segment}.json`);
  return { primary, backup: `${primary}.bak`, journal: `${primary}.journal.json` };
};

describe('FileProjectRepository', () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-projects-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('persists owner-scoped create receipts and replays the original result after restart', async () => {
    const operationKey = randomUUID();
    const first = new ProjectService(new FileProjectRepository(directory));
    const created = await first.create(ownerUserId, operationKey, '  Summer   launch  ');
    expect(created).toMatchObject({
      ok: true,
      current: { project: { title: 'Summer launch', version: 1, status: 'draft' } },
    });
    if (!created.ok) throw new Error('Expected a created Project.');

    const restarted = new ProjectService(new FileProjectRepository(directory));
    const replayed = await restarted.create(ownerUserId, operationKey, 'Summer launch');
    expect(replayed).toEqual(created);
    await expect(restarted.create(ownerUserId, operationKey, 'Different request')).resolves.toEqual(
      {
        ok: false,
        conflict: { kind: 'operation-key', operation: 'create' },
      },
    );

    const repository = new FileProjectRepository(directory);
    await expect(
      repository.getCurrent(otherOwnerUserId, created.current.project.id),
    ).resolves.toBeNull();
    await expect(
      repository.list(ownerUserId, { lifecycle: 'active', pageSize: 20 }),
    ).resolves.toMatchObject({ projects: [{ id: created.current.project.id }], nextCursor: null });
  });

  it('recovers a prepared create journal without duplicating the Project or receipt', async () => {
    const operationKey = randomUUID();
    const interrupted = new ProjectService(
      new FileProjectRepository(directory, {
        afterJournalPrepared: () => {
          throw new Error('simulated interruption');
        },
      }),
    );
    await expect(
      interrupted.create(ownerUserId, operationKey, 'Recovered Project'),
    ).rejects.toThrow('simulated interruption');

    const restarted = new ProjectService(new FileProjectRepository(directory));
    const page = await restarted.list(ownerUserId, { lifecycle: 'active', pageSize: 20 });
    expect(page.projects).toHaveLength(1);
    const replay = await restarted.create(ownerUserId, operationKey, 'Recovered Project');
    expect(replay).toMatchObject({
      ok: true,
      current: { project: { id: page.projects[0]!.id, title: 'Recovered Project' } },
    });
    expect(
      (await restarted.list(ownerUserId, { lifecycle: 'active', pageSize: 20 })).projects,
    ).toHaveLength(1);
  });

  it('enforces CAS across rename, archive, restore, paging, and restart', async () => {
    let tick = 0;
    const service = new ProjectService(new FileProjectRepository(directory), {
      now: () => new Date(Date.UTC(2026, 7, 11, 12, tick++)),
    });
    const one = await service.create(ownerUserId, randomUUID(), 'One');
    const two = await service.create(ownerUserId, randomUUID(), 'Two');
    const three = await service.create(ownerUserId, randomUUID(), 'Three');
    if (!one.ok || !two.ok || !three.ok) throw new Error('Expected Project creates.');

    const firstPage = await service.list(ownerUserId, { lifecycle: 'active', pageSize: 2 });
    expect(firstPage.projects.map(({ title }) => title)).toEqual(['Three', 'Two']);
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = await service.list(ownerUserId, {
      lifecycle: 'active',
      pageSize: 2,
      cursor: firstPage.nextCursor!,
    });
    expect(secondPage.projects.map(({ title }) => title)).toEqual(['One']);

    const renamed = await service.rename(ownerUserId, one.current.project.id, 1, 'Renamed');
    expect(renamed).toMatchObject({
      ok: true,
      current: { project: { title: 'Renamed', version: 2 } },
    });
    await expect(
      service.rename(ownerUserId, one.current.project.id, 1, 'Stale'),
    ).resolves.toMatchObject({
      ok: false,
      conflict: { kind: 'project-version', expectedVersion: 1, actualVersion: 2 },
    });
    const archived = await service.archive(ownerUserId, one.current.project.id, 2);
    expect(archived).toMatchObject({
      ok: true,
      current: { project: { status: 'archived', version: 3 } },
    });
    expect(
      (await service.list(ownerUserId, { lifecycle: 'active', pageSize: 20 })).projects,
    ).toHaveLength(2);
    expect(
      (await service.list(ownerUserId, { lifecycle: 'archived', pageSize: 20 })).projects,
    ).toHaveLength(1);
    const restored = await service.restore(ownerUserId, one.current.project.id, 3);
    expect(restored).toMatchObject({
      ok: true,
      current: { project: { status: 'draft', version: 4 } },
    });

    const restarted = new ProjectService(new FileProjectRepository(directory));
    await expect(restarted.get(ownerUserId, one.current.project.id)).resolves.toMatchObject({
      project: { title: 'Renamed', status: 'draft', version: 4 },
    });
  });

  it('recovers a corrupt primary from the validated backup and fails closed if both are corrupt', async () => {
    const service = new ProjectService(new FileProjectRepository(directory));
    const first = await service.create(ownerUserId, randomUUID(), 'Backup survivor');
    await service.create(ownerUserId, randomUUID(), 'Newest primary');
    if (!first.ok) throw new Error('Expected a Project create.');
    const paths = metadataPaths(directory, ownerUserId);

    await writeFile(paths.primary, '{not-json', 'utf8');
    const recovered = new FileProjectRepository(directory);
    await expect(
      recovered.getCurrent(ownerUserId, first.current.project.id),
    ).resolves.toMatchObject({
      project: { title: 'Backup survivor' },
    });

    await writeFile(paths.primary, '{still-not-json', 'utf8');
    await writeFile(paths.backup, '{also-not-json', 'utf8');
    await expect(
      new FileProjectRepository(directory).list(ownerUserId, {
        lifecycle: 'active',
        pageSize: 20,
      }),
    ).rejects.toThrow();
  });

  it('migrates v1 Project metadata to v2 without inventing Campaign membership', async () => {
    const service = new ProjectService(new FileProjectRepository(directory));
    const created = await service.create(ownerUserId, randomUUID(), 'Legacy standalone');
    if (!created.ok) throw new Error('Expected a Project create.');
    const paths = metadataPaths(directory, ownerUserId);
    const current = JSON.parse(await readFile(paths.primary, 'utf8')) as {
      schemaVersion: number;
      campaigns?: unknown;
      campaignCreateReceipts?: unknown;
      projects: Array<{ project: { campaignId?: string | null } }>;
    };
    current.schemaVersion = 1;
    delete current.campaigns;
    delete current.campaignCreateReceipts;
    for (const aggregate of current.projects) delete aggregate.project.campaignId;
    await writeFile(paths.primary, `${JSON.stringify(current)}\n`, 'utf8');
    await writeFile(paths.backup, `${JSON.stringify(current)}\n`, 'utf8');

    const restarted = new ProjectService(new FileProjectRepository(directory));
    await expect(restarted.get(ownerUserId, created.current.project.id)).resolves.toMatchObject({
      project: { campaignId: null, title: 'Legacy standalone' },
    });
    const migrated = JSON.parse(await readFile(paths.primary, 'utf8')) as {
      schemaVersion: number;
      campaigns: unknown[];
    };
    expect(migrated).toMatchObject({ schemaVersion: 2, campaigns: [] });
  });

  it('recovers Campaign create receipts and preserves membership across restart', async () => {
    const key = randomUUID();
    const repository = new FileProjectRepository(directory);
    const campaigns = new CampaignService(repository);
    const created = await campaigns.create(ownerUserId, key, {
      name: 'Launch',
      brief: 'A concise brief',
    });
    if (!created.ok) throw new Error('Expected a Campaign create.');
    await expect(repository.getCampaign(otherOwnerUserId, created.campaign.id)).resolves.toBeNull();
    await expect(
      repository.listCampaigns(otherOwnerUserId, { lifecycle: 'active', pageSize: 20 }),
    ).resolves.toEqual({ campaigns: [], nextCursor: null });
    const projects = new ProjectService(repository);
    await expect(
      projects.create(otherOwnerUserId, randomUUID(), 'Cross-owner Project', created.campaign.id),
    ).resolves.toMatchObject({ ok: false, conflict: { kind: 'campaign-membership' } });
    const project = await projects.create(
      ownerUserId,
      randomUUID(),
      'Campaign Project',
      created.campaign.id,
    );
    if (!project.ok) throw new Error('Expected a Project create.');

    const restartedRepository = new FileProjectRepository(directory);
    const restartedCampaigns = new CampaignService(restartedRepository);
    await expect(
      restartedCampaigns.create(ownerUserId, key, { name: 'Launch', brief: 'A concise brief' }),
    ).resolves.toEqual(created);
    await expect(
      new ProjectService(restartedRepository).get(ownerUserId, project.current.project.id),
    ).resolves.toMatchObject({ project: { campaignId: created.campaign.id } });
  });
});
