import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { campaignSchema, projectCurrentResponseSchema } from '@studio/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { testConfig } from '../../test/fakes.js';
import { FileProjectRepository } from '../projects/file-project-repository.js';
import { CampaignService } from './campaign-service.js';

const browserHeaders = { host: 'localhost:5173', origin: 'http://localhost:5173' };
const jsonHeaders = { ...browserHeaders, 'content-type': 'application/json' };

describe('Campaign organization routes', () => {
  let directory: string;
  let apps: ReturnType<typeof createApp>[];

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-campaign-routes-'));
    apps = [];
  });

  afterEach(async () => {
    await Promise.all(apps.map(async (app) => app.close()));
    await rm(directory, { recursive: true, force: true });
  });

  const localApp = () => {
    const app = createApp({ config: testConfig({ lightframeDataDir: directory }) });
    apps.push(app);
    return app;
  };

  const createCampaign = async (
    app: ReturnType<typeof createApp>,
    name: string,
    key = randomUUID(),
  ) =>
    app.inject({
      method: 'POST',
      url: '/api/campaigns',
      headers: { ...jsonHeaders, 'idempotency-key': key },
      payload: { name, brief: 'Keep the launch focused.' },
    });

  const createProject = async (app: ReturnType<typeof createApp>, campaignId: string | null) =>
    app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { ...jsonHeaders, 'idempotency-key': randomUUID() },
      payload: { title: 'Launch cut', campaignId },
    });

  it('creates, replays, lists, edits, archives, restores, and tombstones an empty Campaign', async () => {
    const app = localApp();
    const key = randomUUID();
    const created = await createCampaign(app, '  Summer launch  ', key);
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      name: 'Summer launch',
      brief: 'Keep the launch focused.',
      status: 'active',
      version: 1,
    });
    const campaignId = campaignSchema.parse(created.json()).id;
    const replay = await createCampaign(app, 'Summer launch', key);
    expect(replay.statusCode).toBe(201);
    expect(campaignSchema.parse(replay.json()).id).toBe(campaignId);
    expect((await createCampaign(app, 'Different', key)).statusCode).toBe(409);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/campaigns',
          headers: { host: browserHeaders.host },
        })
      ).json(),
    ).toMatchObject({ campaigns: [{ id: campaignId }], nextCursor: null });

    const edited = await app.inject({
      method: 'PATCH',
      url: `/api/campaigns/${campaignId}`,
      headers: jsonHeaders,
      payload: { name: 'Summer launch final', brief: null, expectedVersion: 1 },
    });
    expect(edited.json()).toMatchObject({ name: 'Summer launch final', version: 2 });
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/api/campaigns/${campaignId}`,
          headers: jsonHeaders,
          payload: { name: 'Stale', brief: null, expectedVersion: 1 },
        })
      ).statusCode,
    ).toBe(409);
    const archived = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/archive`,
      headers: jsonHeaders,
      payload: { expectedVersion: 2 },
    });
    expect(archived.json()).toMatchObject({ status: 'archived', version: 3 });
    const restored = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/restore`,
      headers: jsonHeaders,
      payload: { expectedVersion: 3 },
    });
    expect(restored.json()).toMatchObject({ status: 'active', version: 4 });
    await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/archive`,
      headers: jsonHeaders,
      payload: { expectedVersion: 4 },
    });
    const deleted = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${campaignId}/tombstone`,
      headers: jsonHeaders,
      payload: { expectedVersion: 5, confirmation: 'tombstone' },
    });
    expect(deleted.json()).toMatchObject({ status: 'deleted', version: 6 });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/api/campaigns?lifecycle=archived',
          headers: { host: browserHeaders.host },
        })
      ).json(),
    ).toMatchObject({ campaigns: [] });
  });

  it('keeps Campaign membership optional, owner-safe, active-only, CAS-protected, and non-cascading', async () => {
    const app = localApp();
    const first = await createCampaign(app, 'First');
    const second = await createCampaign(app, 'Second');
    const firstId = campaignSchema.parse(first.json()).id;
    const secondId = campaignSchema.parse(second.json()).id;
    const createdProject = await createProject(app, firstId);
    expect(createdProject.statusCode).toBe(201);
    expect(createdProject.json()).toMatchObject({ project: { campaignId: firstId, version: 1 } });
    const projectId = projectCurrentResponseSchema.parse(createdProject.json()).project.id;

    const archivedFirst = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${firstId}/archive`,
      headers: jsonHeaders,
      payload: { expectedVersion: 1 },
    });
    expect(archivedFirst.json()).toMatchObject({ status: 'archived' });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/projects/${projectId}`,
          headers: { host: browserHeaders.host },
        })
      ).json(),
    ).toMatchObject({ project: { campaignId: firstId, status: 'draft' } });
    expect((await createProject(app, firstId)).statusCode).toBe(409);

    const blockedDelete = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${firstId}/tombstone`,
      headers: jsonHeaders,
      payload: { expectedVersion: 2, confirmation: 'tombstone' },
    });
    expect(blockedDelete.statusCode).toBe(409);
    expect(blockedDelete.json()).toMatchObject({
      conflict: { kind: 'campaign-not-empty', attachedProjectCount: 1 },
    });

    const moved = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/campaign`,
      headers: jsonHeaders,
      payload: { campaignId: secondId, expectedVersion: 1 },
    });
    expect(moved.json()).toMatchObject({ project: { campaignId: secondId, version: 2 } });
    const stale = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/campaign`,
      headers: jsonHeaders,
      payload: { campaignId: null, expectedVersion: 1 },
    });
    expect(stale.statusCode).toBe(409);
    const detached = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/campaign`,
      headers: jsonHeaders,
      payload: { campaignId: null, expectedVersion: 2 },
    });
    expect(detached.json()).toMatchObject({ project: { campaignId: null, version: 3 } });
    const noCampaign = await app.inject({
      method: 'GET',
      url: '/api/projects?campaignId=none',
      headers: { host: browserHeaders.host },
    });
    expect(noCampaign.json()).toMatchObject({ projects: [{ id: projectId }] });

    const deleted = await app.inject({
      method: 'POST',
      url: `/api/campaigns/${firstId}/tombstone`,
      headers: jsonHeaders,
      payload: { expectedVersion: 2, confirmation: 'tombstone' },
    });
    expect(deleted.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          method: 'GET',
          url: `/api/projects/${projectId}`,
          headers: { host: browserHeaders.host },
        })
      ).json(),
    ).toMatchObject({ project: { campaignId: null } });
  });

  it('applies authentication, trusted Origin, strict validation, and safe unavailable behavior', async () => {
    const otherOwnerCampaign = await new CampaignService(
      new FileProjectRepository(directory),
    ).create('458c4aca-a9fa-4c25-a2c8-d218768216a1', randomUUID(), {
      name: 'Other owner Campaign',
      brief: null,
    });
    if (!otherOwnerCampaign.ok) throw new Error('Expected another owner Campaign.');
    const authenticated = createApp({
      config: testConfig({ demoAuthEnabled: true, lightframeDataDir: directory }),
    });
    apps.push(authenticated);
    expect(
      (
        await authenticated.inject({
          method: 'GET',
          url: '/api/campaigns',
          headers: { host: browserHeaders.host },
        })
      ).statusCode,
    ).toBe(401);
    const login = await authenticated.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: jsonHeaders,
      payload: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });
    const cookie = String(login.headers['set-cookie']).split(';', 1)[0]!;
    const isolatedRead = await authenticated.inject({
      method: 'GET',
      url: `/api/campaigns/${otherOwnerCampaign.campaign.id}`,
      headers: { host: browserHeaders.host, cookie },
    });
    const isolatedMutation = await authenticated.inject({
      method: 'PATCH',
      url: `/api/campaigns/${otherOwnerCampaign.campaign.id}`,
      headers: { ...jsonHeaders, cookie },
      payload: { name: 'Must not change', brief: null, expectedVersion: 1 },
    });
    expect(isolatedRead.statusCode).toBe(404);
    expect(isolatedMutation.statusCode).toBe(404);
    expect(
      (
        await authenticated.inject({
          method: 'POST',
          url: '/api/campaigns',
          headers: {
            host: browserHeaders.host,
            origin: 'https://malicious.example',
            cookie,
            'content-type': 'application/json',
            'idempotency-key': randomUUID(),
          },
          payload: { name: 'Rejected' },
        })
      ).statusCode,
    ).toBe(403);

    const app = localApp();
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/campaigns',
          headers: { ...jsonHeaders, 'idempotency-key': randomUUID() },
          payload: { name: 'Unknown', ownerUserId: randomUUID() },
        })
      ).statusCode,
    ).toBe(400);

    const unavailable = createApp({
      config: testConfig({ databaseMode: 'neon', lightframeDataDir: directory }),
      persistence: {},
    });
    apps.push(unavailable);
    expect(
      (
        await unavailable.inject({
          method: 'GET',
          url: '/api/campaigns',
          headers: { host: browserHeaders.host },
        })
      ).statusCode,
    ).toBe(503);
  });
});
