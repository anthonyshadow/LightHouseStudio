import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { testConfig } from '../../test/fakes.js';
import { FileProjectRepository } from './file-project-repository.js';
import { ProjectService } from './project-service.js';

const browserHeaders = { host: 'localhost:5173', origin: 'http://localhost:5173' };
const json = <Value>(response: { json(): unknown }): Value => response.json() as Value;

describe('Project lifecycle routes', () => {
  let directory: string;
  let apps: ReturnType<typeof createApp>[];

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-project-routes-'));
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

  const create = async (app: ReturnType<typeof createApp>, title: string, key = randomUUID()) => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: { ...browserHeaders, 'content-type': 'application/json', 'idempotency-key': key },
      payload: { title },
    });
    return { response, key };
  };

  it('creates, replays, lists, fetches, renames, archives, and restores an empty Project', async () => {
    const app = localApp();
    const operationKey = randomUUID();
    const created = (await create(app, 'Launch cut', operationKey)).response;
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      project: { title: 'Launch cut', status: 'draft', version: 1 },
      revision: { revisionNumber: 1, snapshot: { sourceAssetId: null } },
    });
    const projectId = json<{ project: { id: string } }>(created).project.id;

    const replay = (await create(app, 'Launch cut', operationKey)).response;
    expect(replay.statusCode).toBe(201);
    expect(json<{ project: { id: string } }>(replay).project.id).toBe(projectId);
    const mismatched = (await create(app, 'Different create', operationKey)).response;
    expect(mismatched.statusCode).toBe(409);
    expect(mismatched.json()).toMatchObject({
      error: { code: 'conflict' },
      conflict: { kind: 'operation-key', operation: 'create' },
    });

    const detail = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
      headers: { host: browserHeaders.host },
    });
    const list = await app.inject({
      method: 'GET',
      url: '/api/projects?pageSize=20',
      headers: { host: browserHeaders.host },
    });
    expect(detail.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ projects: [{ id: projectId }], nextCursor: null });

    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { title: 'Launch final', expectedVersion: 1 },
    });
    expect(renamed.json()).toMatchObject({ project: { title: 'Launch final', version: 2 } });
    const stale = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${projectId}`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { title: 'Stale overwrite', expectedVersion: 1 },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      conflict: { kind: 'project-version', expectedVersion: 1, actualVersion: 2 },
    });

    const archived = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/archive`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: 2 },
    });
    expect(archived.json()).toMatchObject({ project: { status: 'archived', version: 3 } });
    const active = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { host: browserHeaders.host },
    });
    const archivedList = await app.inject({
      method: 'GET',
      url: '/api/projects?lifecycle=archived',
      headers: { host: browserHeaders.host },
    });
    expect(json<{ projects: unknown[] }>(active).projects).toEqual([]);
    expect(archivedList.json()).toMatchObject({ projects: [{ id: projectId }] });

    const restored = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/restore`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: 3 },
    });
    expect(restored.json()).toMatchObject({ project: { status: 'draft', version: 4 } });
  });

  it('keeps pagination cursors filter-bound and create idempotency durable across app restart', async () => {
    const firstApp = localApp();
    const key = randomUUID();
    const first = json<{ project: { id: string } }>(
      (await create(firstApp, 'Restart-safe', key)).response,
    );
    await create(firstApp, 'Second');
    await create(firstApp, 'Third');
    const pageOne = await firstApp.inject({
      method: 'GET',
      url: '/api/projects?pageSize=2',
      headers: { host: browserHeaders.host },
    });
    const pageOneBody = json<{ projects: unknown[]; nextCursor: string }>(pageOne);
    expect(pageOneBody.projects).toHaveLength(2);
    expect(pageOneBody.nextCursor).toEqual(expect.any(String));
    const invalidFilter = await firstApp.inject({
      method: 'GET',
      url: `/api/projects?pageSize=1&cursor=${encodeURIComponent(pageOneBody.nextCursor)}`,
      headers: { host: browserHeaders.host },
    });
    expect(invalidFilter.statusCode).toBe(400);

    await firstApp.close();
    apps = apps.filter((app) => app !== firstApp);
    const restarted = localApp();
    const replayed = (await create(restarted, 'Restart-safe', key)).response;
    expect(replayed.statusCode).toBe(201);
    expect(json<{ project: { id: string } }>(replayed).project.id).toBe(first.project.id);
  });

  it('enforces authentication, trusted Origin, strict validation, and safe unavailable state', async () => {
    const otherOwnerProject = await new ProjectService(new FileProjectRepository(directory)).create(
      '458c4aca-a9fa-4c25-a2c8-d218768216a1',
      randomUUID(),
      'Other owner',
    );
    if (!otherOwnerProject.ok) throw new Error('Expected another owner Project.');
    const authenticated = createApp({
      config: testConfig({ demoAuthEnabled: true, lightframeDataDir: directory }),
    });
    apps.push(authenticated);
    const unauthenticated = await authenticated.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { host: browserHeaders.host },
    });
    expect(unauthenticated.statusCode).toBe(401);
    const login = await authenticated.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });
    const cookie = String(login.headers['set-cookie']).split(';', 1)[0]!;
    const isolated = await authenticated.inject({
      method: 'GET',
      url: `/api/projects/${otherOwnerProject.current.project.id}`,
      headers: { host: browserHeaders.host, cookie },
    });
    expect(isolated.statusCode).toBe(404);
    const untrusted = await authenticated.inject({
      method: 'POST',
      url: '/api/projects',
      headers: {
        host: browserHeaders.host,
        origin: 'https://malicious.example',
        cookie,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: { title: 'Rejected' },
    });
    expect(untrusted.statusCode).toBe(403);

    const strict = localApp();
    const invalid = await strict.inject({
      method: 'POST',
      url: '/api/projects',
      headers: {
        ...browserHeaders,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: { title: 'Unknown field', ownerUserId: randomUUID() },
    });
    expect(invalid.statusCode).toBe(400);

    const unavailable = createApp({
      config: testConfig({ databaseMode: 'neon', lightframeDataDir: directory }),
      persistence: {},
    });
    apps.push(unavailable);
    const unavailableResponse = await unavailable.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { host: browserHeaders.host },
    });
    expect(unavailableResponse.statusCode).toBe(503);
    expect(unavailableResponse.json()).toMatchObject({ error: { code: 'feature_unavailable' } });

    const shadow = createApp({
      config: testConfig({ databaseMode: 'shadow', lightframeDataDir: directory }),
      persistence: {},
    });
    apps.push(shadow);
    const shadowCreate = await create(shadow, 'Shadow local authority');
    expect(shadowCreate.response.statusCode).toBe(201);
  });
});
