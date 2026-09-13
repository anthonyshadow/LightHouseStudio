import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { testConfig } from '../../test/fakes.js';
import { FileProjectRepository } from './file-project-repository.js';
import { ProjectService } from './project-service.js';
import { createDefaultVideoEditSpec, EMPTY_PROJECT_TRANSFORM } from '@studio/domain';
import {
  PROJECT_STALE_CLIENT_MESSAGE,
  projectSourceListResponseSchema,
  projectSourceResponseSchema,
  projectWorkingMediaResponseSchema,
} from '@studio/contracts';

const browserHeaders = { host: 'localhost:5173', origin: 'http://localhost:5173' };
const json = <Value>(response: { json(): unknown }): Value => response.json() as Value;
const emptyCreativeProposal = {
  transform: null,
  localEdit: null,
  exportSpecification: null,
};

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

  it('tombstones only one archived Project after explicit confirmation and hides it from reads', async () => {
    const app = localApp();
    const first = (await create(app, 'Delete this Project')).response;
    const second = (await create(app, 'Keep this Project')).response;
    const projectId = json<{ project: { id: string } }>(first).project.id;
    const keptProjectId = json<{ project: { id: string } }>(second).project.id;

    const activeDelete = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tombstone`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: 1, confirmation: 'permanent-delete' },
    });
    expect(activeDelete.statusCode).toBe(409);

    await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/archive`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: 1 },
    });
    const missingConfirmation = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tombstone`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: 2 },
    });
    expect(missingConfirmation.statusCode).toBe(400);

    const deleted = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/tombstone`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: 2, confirmation: 'permanent-delete' },
    });
    expect(deleted.statusCode).toBe(200);
    const deletedBody = json<{
      project: {
        id: string;
        status: string;
        version: number;
        archivedAt: string | null;
        deletedAt: string | null;
      };
    }>(deleted);
    expect(deletedBody.project).toMatchObject({
      id: projectId,
      status: 'deleted',
      version: 3,
    });
    expect(deletedBody.project.archivedAt).toEqual(expect.stringMatching(/Z$/u));
    expect(deletedBody.project.deletedAt).toEqual(expect.stringMatching(/Z$/u));

    const archived = await app.inject({
      method: 'GET',
      url: '/api/projects?lifecycle=archived',
      headers: { host: browserHeaders.host },
    });
    const active = await app.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { host: browserHeaders.host },
    });
    const detail = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
      headers: { host: browserHeaders.host },
    });
    expect(json<{ projects: unknown[] }>(archived).projects).toEqual([]);
    expect(active.json()).toMatchObject({ projects: [{ id: keptProjectId }] });
    expect(detail.statusCode).toBe(404);
  });

  it('attaches browser-local Assets idempotently, detaches only memberships, and locks archived Projects', async () => {
    const app = localApp();
    const created = (await create(app, 'Asset collection')).response;
    const projectId = json<{ project: { id: string } }>(created).project.id;
    const resourceId = randomUUID();
    const attach = () =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/assets`,
        headers: { ...browserHeaders, 'content-type': 'application/json' },
        payload: { kind: 'character', resourceId },
      });

    const first = await attach();
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      membership: { projectId, kind: 'character', resourceId },
      created: true,
    });
    const membershipId = json<{ membership: { id: string } }>(first).membership.id;

    const duplicate = await attach();
    expect(duplicate.statusCode).toBe(200);
    expect(duplicate.json()).toMatchObject({
      membership: { id: membershipId },
      created: false,
    });

    const listed = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/assets?pageSize=24`,
      headers: { host: browserHeaders.host },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual({
      assets: [expect.objectContaining({ id: membershipId, kind: 'character', resourceId })],
      videoSummaries: [],
      nextCursor: null,
    });

    const detached = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}/assets/${membershipId}`,
      headers: { host: browserHeaders.host },
    });
    const detachedAgain = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${projectId}/assets/${membershipId}`,
      headers: { host: browserHeaders.host },
    });
    expect(detached.statusCode).toBe(200);
    expect(detachedAgain.statusCode).toBe(200);
    expect(detached.json()).toEqual({ detached: true });

    const archived = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/archive`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: 1 },
    });
    expect(archived.statusCode).toBe(200);
    const archivedAttach = await attach();
    expect(archivedAttach.statusCode).toBe(409);
    expect(archivedAttach.json()).toMatchObject({ error: { code: 'conflict' } });

    const recipe = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/assets`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { kind: 'recipe', resourceId: randomUUID() },
    });
    expect(recipe.statusCode).toBe(400);
  });

  it('duplicates a Project into an independent one that copies intent but produces nothing', async () => {
    const app = localApp();
    const created = (await create(app, 'Launch cut')).response;
    const projectId = json<{ project: { id: string } }>(created).project.id;
    const exportSpecification = {
      container: 'video/mp4',
      aspect: '1:1',
      resolution: { width: 1_080, height: 1_080 },
      includeAudio: true,
    };
    // Give the original creative state worth carrying, so the duplicate has something to inherit.
    const checkpointed = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/revisions`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: {
        expectedVersion: 1,
        expectedRevisionNumber: 1,
        proposal: {
          ...emptyCreativeProposal,
          workflowPhase: 'creative',
          liveMode: null,
          transform: {
            ...EMPTY_PROJECT_TRANSFORM,
            creativeIntent: {
              ...EMPTY_PROJECT_TRANSFORM.creativeIntent,
              userIntent: 'A bright summer launch.',
              appliedPrompt: 'A bright summer launch.',
            },
          },
          exportSpecification,
        },
      },
    });
    expect(checkpointed.statusCode).toBe(200);
    // A bundle built before snapshot v3 sends the five AI fields flat; the 400 tells it to reload,
    // in words the session surfaces, rather than answering with a validation code.
    const preV3Checkpoint = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/revisions`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: {
        expectedVersion: 2,
        expectedRevisionNumber: 2,
        proposal: {
          workflowPhase: 'creative',
          liveMode: null,
          ...EMPTY_PROJECT_TRANSFORM,
          localEdit: null,
          exportSpecification,
        },
      },
    });
    expect(preV3Checkpoint.statusCode).toBe(400);
    expect(JSON.stringify(preV3Checkpoint.json())).toContain(PROJECT_STALE_CLIENT_MESSAGE);

    const duplicate = (operationKey: string, payload: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/duplicate`,
        headers: {
          ...browserHeaders,
          'content-type': 'application/json',
          'idempotency-key': operationKey,
        },
        payload,
      });

    const operationKey = randomUUID();
    const body = { title: 'Launch cut (copy)', campaignId: null, expectedVersion: 2 };
    const copied = await duplicate(operationKey, body);
    expect(copied.statusCode).toBe(201);
    const copy = json<{
      project: { id: string; version: number; title: string; status: string };
      revision: {
        revisionNumber: number;
        source: string;
        snapshot: Record<string, unknown>;
      };
    }>(copied);
    expect(copy.project.id).not.toBe(projectId);
    expect(copy.project).toMatchObject({ title: 'Launch cut (copy)', version: 1, status: 'draft' });
    expect(copy.revision).toMatchObject({
      revisionNumber: 1,
      source: 'create',
      snapshot: {
        exportSpecification,
        transform: { creativeIntent: { userIntent: 'A bright summer launch.' } },
        lastSuccessfulOutput: null,
      },
    });

    // Same key, same intent: one duplicate, not two.
    const replay = await duplicate(operationKey, body);
    expect(replay.statusCode).toBe(201);
    expect(json<{ project: { id: string } }>(replay).project.id).toBe(copy.project.id);
    expect(
      json<{ projects: { id: string }[] }>(
        await app.inject({
          method: 'GET',
          url: '/api/projects?lifecycle=active',
          headers: { host: browserHeaders.host },
        }),
      ).projects,
    ).toHaveLength(2);

    // Same key, different intent: refused rather than silently reused.
    expect((await duplicate(operationKey, { ...body, title: 'Something else' })).statusCode).toBe(
      409,
    );

    // A stale expected version is refused before anything is written.
    const stale = await duplicate(randomUUID(), { ...body, expectedVersion: 1 });
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      conflict: { kind: 'project-version', expectedVersion: 1, actualVersion: 2 },
    });

    // The duplicate is renameable and archivable on its own, and the original is untouched.
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${copy.project.id}`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { title: 'Second cut', expectedVersion: 1 },
    });
    expect(renamed.statusCode).toBe(200);
    expect(
      json<{ project: { title: string } }>(
        await app.inject({
          method: 'GET',
          url: `/api/projects/${projectId}`,
          headers: { host: browserHeaders.host },
        }),
      ).project.title,
    ).toBe('Launch cut');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/projects/${copy.project.id}/archive`,
          headers: { ...browserHeaders, 'content-type': 'application/json' },
          payload: { expectedVersion: 2 },
        })
      ).statusCode,
    ).toBe(200);
  });

  it('refuses a duplicate placed in an unavailable Campaign, exactly as a move would', async () => {
    const app = localApp();
    const created = (await create(app, 'Launch cut')).response;
    const projectId = json<{ project: { id: string } }>(created).project.id;

    const refused = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/duplicate`,
      headers: {
        ...browserHeaders,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: { title: 'Launch cut (copy)', campaignId: randomUUID(), expectedVersion: 1 },
    });

    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ conflict: { kind: 'campaign-membership' } });
    // Nothing was created by the refused attempt.
    expect(
      json<{ projects: unknown[] }>(
        await app.inject({
          method: 'GET',
          url: '/api/projects?lifecycle=active',
          headers: { host: browserHeaders.host },
        }),
      ).projects,
    ).toHaveLength(1);
  });

  it('records a chosen placement on the revision, replays it, and rejects an impossible one', async () => {
    const app = localApp();
    const created = (await create(app, 'Placement checkpoint')).response;
    const projectId = json<{ project: { id: string } }>(created).project.id;
    const exportSpecification = {
      container: 'video/mp4',
      aspect: '9:16',
      resolution: { width: 1_080, height: 1_920 },
      includeAudio: true,
    };
    const choose = (specification: unknown, expectedVersion = 1, expectedRevisionNumber = 1) =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/revisions`,
        headers: { ...browserHeaders, 'content-type': 'application/json' },
        payload: {
          expectedVersion,
          expectedRevisionNumber,
          proposal: {
            ...emptyCreativeProposal,
            workflowPhase: 'review',
            liveMode: null,
            exportSpecification: specification,
          },
        },
      });

    const chosen = await choose(exportSpecification);
    expect(chosen.statusCode).toBe(200);
    expect(chosen.json()).toMatchObject({
      project: { version: 2, currentRevisionNumber: 2 },
      revision: { revisionNumber: 2, snapshot: { exportSpecification } },
    });

    // The same placement again is the same revision, not a second one.
    expect((await choose(exportSpecification)).json()).toEqual(chosen.json());

    // A size that is not the placement's shape is refused by the domain rule, not persisted.
    const impossible = await choose(
      { ...exportSpecification, resolution: { width: 1_920, height: 1_080 } },
      2,
      2,
    );
    expect(impossible.statusCode).toBe(409);
    expect(impossible.json()).toMatchObject({ error: { code: 'conflict' } });

    // History reports the placement so the operator can see what a change was for.
    const history = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/history`,
      headers: { host: browserHeaders.host },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject({
      revisions: [
        { revisionNumber: 2, exportSpecification },
        { revisionNumber: 1, exportSpecification: null },
      ],
    });
  });

  it('checkpoints bounded session metadata, converges exact replay, and preserves CAS conflicts', async () => {
    const app = localApp();
    const created = (await create(app, 'Session checkpoint')).response;
    const projectId = json<{ project: { id: string } }>(created).project.id;
    const proposal = {
      ...emptyCreativeProposal,
      workflowPhase: 'creative',
      liveMode: {
        modeId: 'local',
        captureFormat: 'landscape',
        audioSource: 'local-microphone',
      },
    };
    const checkpoint = () =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/revisions`,
        headers: { ...browserHeaders, 'content-type': 'application/json' },
        payload: { expectedVersion: 1, expectedRevisionNumber: 1, proposal },
      });

    const saved = await checkpoint();
    expect(saved.statusCode).toBe(200);
    expect(saved.json()).toMatchObject({
      project: { version: 2, currentRevisionNumber: 2 },
      revision: { revisionNumber: 2, snapshot: proposal },
    });

    const exactReplay = await checkpoint();
    expect(exactReplay.statusCode).toBe(200);
    expect(exactReplay.json()).toEqual(saved.json());

    const staleDifferent = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/revisions`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: {
        expectedVersion: 1,
        expectedRevisionNumber: 1,
        proposal: {
          ...emptyCreativeProposal,
          workflowPhase: 'review',
          liveMode: null,
        },
      },
    });
    expect(staleDifferent.statusCode).toBe(409);
    expect(staleDifferent.json()).toMatchObject({
      conflict: { kind: 'project-version', expectedVersion: 1, actualVersion: 2 },
    });
    const current = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
      headers: { host: browserHeaders.host },
    });
    expect(current.json()).toEqual(saved.json());
  });

  it('accepts, replays, hydrates, and range-streams an inspected Project source', async () => {
    const app = localApp();
    const created = (await create(app, 'Durable source')).response;
    const projectId = json<{ project: { id: string } }>(created).project.id;
    const fixture = Buffer.from(
      (
        await readFile(
          new URL('../../../../../e2e/fixtures/decodable-h264-video.base64', import.meta.url),
          'utf8',
        )
      ).replaceAll(/\s/gu, ''),
      'base64',
    );
    const operationKey = randomUUID();
    const metadata = encodeURIComponent(
      JSON.stringify({
        expectedVersion: 1,
        expectedRevisionNumber: 1,
        kind: 'uploaded',
        filename: '../durable source?.mp4',
      }),
    );
    const upload = () =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/source`,
        headers: {
          ...browserHeaders,
          'content-type': 'video/mp4',
          'idempotency-key': operationKey,
          'x-lightframe-project-source': metadata,
        },
        payload: fixture,
      });

    const accepted = await upload();
    expect(accepted.statusCode).toBe(201);
    // Parsed through the contract rather than an inline shape, so the id keeps its uuid check: the
    // server derives it, and the operation key the request supplied is deliberately not it.
    const acceptedSourceAssetId = projectSourceResponseSchema.parse(accepted.json()).revision
      .snapshot.sourceAssetId;
    expect(acceptedSourceAssetId).not.toBe(operationKey);
    expect(accepted.json()).toMatchObject({
      project: { id: projectId, status: 'ready', version: 2 },
      revision: { revisionNumber: 2, snapshot: { sourceAssetId: acceptedSourceAssetId } },
      source: {
        kind: 'uploaded',
        filename: 'durable-source.mp4',
        contentUrl: `/api/projects/${projectId}/source/content`,
      },
    });
    expect(accepted.body).not.toContain('checksum');
    expect(accepted.body).not.toContain(directory);

    const replayed = await upload();
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json()).toEqual(accepted.json());
    const hydrated = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/source`,
      headers: { host: browserHeaders.host },
    });
    expect(hydrated.json()).toEqual(accepted.json());

    const ranged = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/source/content`,
      headers: { host: browserHeaders.host, range: 'bytes=2-7' },
    });
    expect(ranged.statusCode).toBe(206);
    expect(ranged.rawPayload).toEqual(fixture.subarray(2, 8));
    expect(ranged.headers).toMatchObject({
      'accept-ranges': 'bytes',
      'content-range': `bytes 2-7/${fixture.byteLength}`,
      'content-length': '6',
      'content-type': 'video/mp4',
    });
    const head = await app.inject({
      method: 'HEAD',
      url: `/api/projects/${projectId}/source/content`,
      headers: { host: browserHeaders.host },
    });
    expect(head.statusCode).toBe(200);
    expect(head.body).toBe('');
    expect(head.headers['content-length']).toBe(String(fixture.byteLength));
  });

  it('removes an accepted Project source and accepts a different original afterwards', async () => {
    const app = localApp();
    const created = (await create(app, 'Wrong source')).response;
    const projectId = json<{ project: { id: string } }>(created).project.id;
    const fixture = Buffer.from(
      (
        await readFile(
          new URL('../../../../../e2e/fixtures/decodable-h264-video.base64', import.meta.url),
          'utf8',
        )
      ).replaceAll(/\s/gu, ''),
      'base64',
    );
    const upload = (expectedVersion: number, filename: string) =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/source`,
        headers: {
          ...browserHeaders,
          'content-type': 'video/mp4',
          'idempotency-key': randomUUID(),
          'x-lightframe-project-source': encodeURIComponent(
            JSON.stringify({
              expectedVersion,
              expectedRevisionNumber: expectedVersion,
              kind: 'uploaded',
              filename,
            }),
          ),
        },
        payload: fixture,
      });
    const remove = (expectedVersion: number, expectedRevisionNumber: number) =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/source/remove`,
        headers: { ...browserHeaders, 'content-type': 'application/json' },
        payload: { expectedVersion, expectedRevisionNumber },
      });

    expect((await upload(1, 'wrong.mp4')).statusCode).toBe(201);

    const removed = await remove(2, 2);
    expect(removed.statusCode).toBe(200);
    expect(removed.json()).toMatchObject({
      project: { id: projectId, status: 'draft', version: 3 },
      revision: {
        revisionNumber: 3,
        snapshot: {
          sourceAssetId: null,
          workingMedia: null,
          presentedMedia: null,
          workflowPhase: 'source',
        },
      },
    });
    expect(removed.json()).not.toHaveProperty('source');

    const hydrated = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/source`,
      headers: browserHeaders,
    });
    expect(hydrated.statusCode).toBe(404);

    // A replayed removal whose response was lost converges on current authority rather than
    // conflicting: the requested end state already holds. This is why no operation key is needed.
    const replayed = await remove(2, 2);
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json()).toMatchObject({
      project: { version: 3 },
      revision: { revisionNumber: 3, snapshot: { sourceAssetId: null } },
    });

    const reaccepted = await upload(3, 'right.mp4');
    expect(reaccepted.statusCode).toBe(201);
    expect(reaccepted.json()).toMatchObject({
      project: { status: 'ready', version: 4 },
      source: { filename: 'right.mp4' },
    });

    const staleAfterReplacement = await remove(2, 2);
    expect(staleAfterReplacement.statusCode).toBe(409);
    expect(staleAfterReplacement.json()).toMatchObject({
      error: { code: 'conflict' },
      conflict: { kind: 'project-version', expectedVersion: 2, actualVersion: 4 },
    });
    const stillAttached = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/source`,
      headers: browserHeaders,
    });
    expect(stillAttached.statusCode).toBe(200);
    expect(stillAttached.json()).toMatchObject({ source: { filename: 'right.mp4' } });

    const malformed = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/source/remove`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: 4 },
    });
    expect(malformed.statusCode).toBe(400);

    /*
     * The collection, over the wire, beside the legacy endpoints in the same Project.
     *
     * The point of the assertions below is what does NOT move: `POST /source` still refuses,
     * `GET /source` still describes the original, and the snapshot the browser reads still names it.
     */
    const secondKey = randomUUID();
    const secondMetadata = JSON.stringify({
      expectedVersion: 4,
      expectedRevisionNumber: 4,
      kind: 'uploaded',
      filename: 'second.mp4',
    });
    const added = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/sources`,
      headers: {
        ...browserHeaders,
        'content-type': 'video/mp4',
        'idempotency-key': secondKey,
        'x-lightframe-project-source': secondMetadata,
      },
      payload: fixture,
    });
    expect(added.statusCode).toBe(201);
    const listed = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/sources`,
      headers: browserHeaders,
    });
    expect(listed.statusCode).toBe(200);
    const collection = projectSourceListResponseSchema.parse(listed.json());
    expect(collection.sources.map(({ filename }) => filename)).toEqual(['right.mp4', 'second.mp4']);
    expect(listed.body).not.toContain('checksum');
    expect(listed.body).not.toContain('operationKey');
    const secondAssetId = collection.sources[1]!.assetId;

    const legacyAfterAdd = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/source`,
      headers: browserHeaders,
    });
    expect(legacyAfterAdd.json()).toMatchObject({ source: { filename: 'right.mp4' } });

    const refusedSecond = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/source`,
      headers: {
        ...browserHeaders,
        'content-type': 'video/mp4',
        'idempotency-key': randomUUID(),
        'x-lightframe-project-source': secondMetadata,
      },
      payload: fixture,
    });
    expect(refusedSecond.statusCode).toBe(409);
    expect(refusedSecond.json()).toMatchObject({ conflict: { kind: 'immutable-source' } });

    const held = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/sources/${secondAssetId}/content`,
      headers: { ...browserHeaders, range: 'bytes=0-3' },
    });
    expect(held.statusCode).toBe(206);

    const refusedPrimary = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/sources/${collection.sources[0]!.assetId}/remove`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: 5, expectedRevisionNumber: 5 },
    });
    expect(refusedPrimary.statusCode).toBe(409);
    expect(refusedPrimary.json()).toMatchObject({ conflict: { kind: 'primary-source' } });

    const removedHeld = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/sources/${secondAssetId}/remove`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: 5, expectedRevisionNumber: 5 },
    });
    expect(removedHeld.statusCode).toBe(200);
    expect(removedHeld.json()).not.toHaveProperty('sources');
  });

  it('adopts a validated local render explicitly and range-streams it without changing source', async () => {
    const app = localApp();
    const created = (await create(app, 'Local render adoption')).response;
    const projectId = json<{ project: { id: string } }>(created).project.id;
    const fixture = Buffer.from(
      (
        await readFile(
          new URL('../../../../../e2e/fixtures/decodable-h264-video.base64', import.meta.url),
          'utf8',
        )
      ).replaceAll(/\s/gu, ''),
      'base64',
    );
    const sourceKey = randomUUID();
    const source = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/source`,
      headers: {
        ...browserHeaders,
        'content-type': 'video/mp4',
        'idempotency-key': sourceKey,
        'x-lightframe-project-source': encodeURIComponent(
          JSON.stringify({
            expectedVersion: 1,
            expectedRevisionNumber: 1,
            kind: 'uploaded',
            filename: 'source.mp4',
          }),
        ),
      },
      payload: fixture,
    });
    expect(source.statusCode).toBe(201);
    const operationKey = randomUUID();
    const localEdit = {
      ...createDefaultVideoEditSpec(1_000),
      subtitles: [
        {
          id: '2a7c4e1d-0b3f-4d8a-9e6c-5f1b2a3c4d5e',
          text: 'Over the wire',
          startMs: 100,
          endMs: 600,
          placement: 'middle' as const,
        },
      ],
    };
    const upload = () =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/working-media`,
        headers: {
          ...browserHeaders,
          'content-type': 'video/mp4',
          'idempotency-key': operationKey,
          'x-lightframe-project-working-media': encodeURIComponent(
            JSON.stringify({
              expectedVersion: 2,
              expectedRevisionNumber: 2,
              filename: 'render-preview.mp4',
              localEdit,
            }),
          ),
        },
        payload: fixture,
      });

    const sourceAssetId = projectSourceResponseSchema.parse(source.json()).revision.snapshot
      .sourceAssetId;
    const adopted = await upload();
    expect(adopted.statusCode).toBe(201);
    // The render is one asset, named identically by the snapshot's working and presented media and
    // by the response's own media, and the source it was derived from is left as it was.
    const renderAssetId = projectWorkingMediaResponseSchema.parse(adopted.json()).media.assetId;
    expect(renderAssetId).not.toBe(sourceAssetId);
    expect(adopted.json()).toMatchObject({
      project: { id: projectId, version: 3, status: 'ready' },
      revision: {
        revisionNumber: 3,
        snapshot: {
          sourceAssetId,
          workingMedia: { kind: 'asset', assetId: renderAssetId },
          presentedMedia: { kind: 'asset', assetId: renderAssetId },
          localEdit,
          lastSuccessfulOutput: null,
        },
      },
      isCurrent: true,
      media: {
        kind: 'local-render',
        assetId: renderAssetId,
      },
    });
    expect(adopted.body).not.toContain(directory);
    const replay = await upload();
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual(adopted.json());

    const hydrated = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/working-media`,
      headers: { host: browserHeaders.host },
    });
    expect(hydrated.json()).toEqual(adopted.json());
    const contentUrl = json<{ media: { contentUrl: string } }>(adopted).media.contentUrl;
    expect(contentUrl).toContain('/working-media/');
    const ranged = await app.inject({
      method: 'GET',
      url: contentUrl,
      headers: { host: browserHeaders.host, range: 'bytes=1-5' },
    });
    expect(ranged.statusCode).toBe(206);
    expect(ranged.rawPayload).toEqual(fixture.subarray(1, 6));
  });

  it('saves and replays explicit Project outputs, appends only to the confirmed target, and retains Project content', async () => {
    const app = localApp();
    const created = (await create(app, 'Project output route')).response;
    const projectId = json<{ project: { id: string } }>(created).project.id;
    const fixture = Buffer.from(
      (
        await readFile(
          new URL('../../../../../e2e/fixtures/decodable-h264-video.base64', import.meta.url),
          'utf8',
        )
      ).replaceAll(/\s/gu, ''),
      'base64',
    );
    const sourceKey = randomUUID();
    const source = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/source`,
      headers: {
        ...browserHeaders,
        'content-type': 'video/mp4',
        'idempotency-key': sourceKey,
        'x-lightframe-project-source': encodeURIComponent(
          JSON.stringify({
            expectedVersion: 1,
            expectedRevisionNumber: 1,
            kind: 'uploaded',
            filename: 'project-output.mp4',
          }),
        ),
      },
      payload: fixture,
    });
    const sourceBody = json<{
      project: { version: number };
      revision: {
        revisionNumber: number;
        snapshot: { workingMedia: { kind: 'asset'; assetId: string } };
      };
    }>(source);
    const operationId = randomUUID();
    const firstPayload = {
      expectedVersion: sourceBody.project.version,
      expectedRevisionNumber: sourceBody.revision.revisionNumber,
      media: sourceBody.revision.snapshot.workingMedia,
      target: { kind: 'new', title: 'Output master' },
    };
    const save = (payload: unknown = firstPayload, key = operationId) =>
      app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/outputs`,
        headers: {
          ...browserHeaders,
          'content-type': 'application/json',
          'idempotency-key': key,
        },
        payload,
      });

    const first = await save();
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      replayed: false,
      project: { id: projectId, status: 'completed', version: 3 },
      revision: { revisionNumber: 3, parentRevisionNumber: 2, source: 'output-save' },
      output: { producingRevisionNumber: 2 },
      savedVideo: { title: 'Output master', versionCount: 1 },
    });
    expect(first.body).not.toContain('ownerUserId');
    expect(first.body).not.toContain('checksum');
    expect(first.body).not.toContain(directory);
    const firstBody = json<{
      project: { version: number };
      revision: {
        revisionNumber: number;
        snapshot: {
          workingMedia: {
            kind: 'saved-video-version';
            savedVideoId: string;
            videoVersionId: string;
          };
          workflowPhase: string;
          liveMode: unknown;
          transform: unknown;
          localEdit: unknown;
          exportSpecification: unknown;
          lastSuccessfulOutput: { savedVideoId: string; videoVersionId: string };
        };
      };
      output: { savedVideoId: string; videoVersionId: string };
      savedVideo: { id: string; currentVersion: { id: string } };
      contentUrl: string;
    }>(first);

    // The tab that asked for the save re-proposes what it is now looking at, which is the post-save
    // snapshot itself — transform and all, and after a save the transform is the canonical `null`.
    // That proposal has to converge: appending a revision for it would be an edit that changed
    // nothing while dropping the output pointer this save just recorded.
    const postSaveSnapshot = firstBody.revision.snapshot;
    const reproposed = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/revisions`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: {
        expectedVersion: firstBody.project.version,
        expectedRevisionNumber: firstBody.revision.revisionNumber,
        proposal: {
          workflowPhase: postSaveSnapshot.workflowPhase,
          liveMode: postSaveSnapshot.liveMode,
          transform: postSaveSnapshot.transform,
          localEdit: postSaveSnapshot.localEdit,
          exportSpecification: postSaveSnapshot.exportSpecification,
        },
      },
    });
    expect(reproposed.statusCode).toBe(200);
    expect(postSaveSnapshot.transform).toBeNull();
    expect(reproposed.json()).toMatchObject({
      project: {
        status: 'completed',
        version: firstBody.project.version,
        currentRevisionNumber: firstBody.revision.revisionNumber,
      },
      revision: {
        revisionNumber: firstBody.revision.revisionNumber,
        snapshot: {
          transform: null,
          lastSuccessfulOutput: {
            savedVideoId: firstBody.output.savedVideoId,
            videoVersionId: firstBody.output.videoVersionId,
          },
        },
      },
    });

    const replay = await save();
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({ ...json<Record<string, unknown>>(first), replayed: true });
    const mismatch = await save({
      ...firstPayload,
      target: { kind: 'new', title: 'Different title' },
    });
    expect(mismatch.statusCode).toBe(409);
    expect(mismatch.json()).toMatchObject({
      conflict: { kind: 'operation-key', operation: 'output-save' },
    });

    const append = await save(
      {
        expectedVersion: firstBody.project.version,
        expectedRevisionNumber: firstBody.revision.revisionNumber,
        media: firstBody.revision.snapshot.workingMedia,
        target: {
          kind: 'version',
          savedVideoId: firstBody.savedVideo.id,
          expectedVersionId: firstBody.savedVideo.currentVersion.id,
        },
      },
      randomUUID(),
    );
    expect(append.statusCode).toBe(201);
    expect(append.json()).toMatchObject({
      output: { producingRevisionNumber: 3 },
      savedVideo: {
        id: firstBody.savedVideo.id,
        versionCount: 2,
        currentVersion: { ordinal: 2, sourceVersionId: firstBody.savedVideo.currentVersion.id },
      },
    });
    const appendBody = json<{
      project: { version: number };
      revision: { revisionNumber: number };
      output: { videoVersionId: string };
    }>(append);

    const outputPage = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/outputs?pageSize=1`,
      headers: { host: browserHeaders.host },
    });
    expect(outputPage.statusCode).toBe(200);
    expect(outputPage.json()).toMatchObject({
      outputs: [
        {
          kind: 'saved-video-version',
          output: { producingRevisionNumber: 3 },
          version: { ordinal: 2 },
          referenceRevision: { revisionNumber: 4 },
          isCurrentForProject: true,
          savedVideo: { libraryStatus: 'ready' },
        },
      ],
    });
    const outputCursor = json<{ nextCursor: string }>(outputPage).nextCursor;
    const invalidOutputCursor = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/outputs?cursor=not-a-cursor`,
      headers: { host: browserHeaders.host },
    });
    expect(invalidOutputCursor.statusCode).toBe(400);
    const olderOutputPage = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/outputs?pageSize=1&cursor=${encodeURIComponent(outputCursor)}`,
      headers: { host: browserHeaders.host },
    });
    expect(olderOutputPage.json()).toMatchObject({
      outputs: [{ version: { ordinal: 1 }, isCurrentForProject: false }],
      nextCursor: null,
    });
    const history = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/history?pageSize=2`,
      headers: { host: browserHeaders.host },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject({
      revisions: [
        { kind: 'project-change', revisionNumber: 4, source: 'output-save' },
        { kind: 'project-change', revisionNumber: 3, source: 'output-save' },
      ],
    });
    expect(history.body).not.toContain('snapshot');
    const exactMetadata = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/outputs/${appendBody.output.videoVersionId}`,
      headers: { host: browserHeaders.host },
    });
    expect(exactMetadata.json()).toMatchObject({
      version: { id: appendBody.output.videoVersionId, ordinal: 2 },
      output: { producingRevisionNumber: 3 },
      referenceRevision: { revisionNumber: 4 },
    });

    const standalone = await app.inject({
      method: 'POST',
      url: '/api/videos',
      headers: {
        ...browserHeaders,
        'content-type': 'video/mp4',
        'idempotency-key': randomUUID(),
        'x-lightframe-video-metadata': encodeURIComponent(
          JSON.stringify({
            title: 'Legacy standalone',
            origin: 'legacy-import',
            characterName: null,
            characterVariantName: null,
            filename: 'legacy.mp4',
            sourceVideoId: null,
            sourceVersionId: null,
          }),
        ),
      },
      payload: fixture,
    });
    expect(standalone.statusCode).toBe(201);
    const gallery = await app.inject({
      method: 'GET',
      url: '/api/videos?pageSize=20',
      headers: { host: browserHeaders.host },
    });
    expect(
      json<{ videos: Array<{ title: string; assignment: string }> }>(gallery).videos.map(
        ({ title, assignment }) => ({ title, assignment }),
      ),
    ).toEqual(
      expect.arrayContaining([
        { title: 'Output master', assignment: 'project-output' },
        { title: 'Legacy standalone', assignment: 'unassigned' },
      ]),
    );

    const ranged = await app.inject({
      method: 'GET',
      url: firstBody.contentUrl,
      headers: { host: browserHeaders.host, range: 'bytes=3-9' },
    });
    expect(ranged.statusCode).toBe(206);
    expect(ranged.rawPayload).toEqual(fixture.subarray(3, 10));
    await app.inject({
      method: 'DELETE',
      url: `/api/videos/${firstBody.savedVideo.id}`,
      headers: browserHeaders,
    });
    const hidden = await app.inject({
      method: 'GET',
      url: `/api/videos/${firstBody.savedVideo.id}`,
      headers: { host: browserHeaders.host },
    });
    expect(hidden.statusCode).toBe(404);
    const retained = await app.inject({
      method: 'GET',
      url: firstBody.contentUrl,
      headers: { host: browserHeaders.host },
    });
    expect(retained.statusCode).toBe(200);
    expect(retained.rawPayload).toEqual(fixture);
    const retainedMetadata = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/outputs/${firstBody.output.videoVersionId}`,
      headers: { host: browserHeaders.host },
    });
    expect(retainedMetadata.json()).toMatchObject({ savedVideo: { libraryStatus: 'removed' } });
    const reuseRemovedVersion = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/working-media/reuse`,
      headers: {
        ...browserHeaders,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: {
        expectedVersion: appendBody.project.version,
        expectedRevisionNumber: appendBody.revision.revisionNumber,
        media: {
          kind: 'saved-video-version',
          savedVideoId: firstBody.output.savedVideoId,
          videoVersionId: firstBody.output.videoVersionId,
        },
        localEdit: null,
      },
    });
    expect(reuseRemovedVersion.statusCode).toBe(201);
    expect(reuseRemovedVersion.json()).toMatchObject({
      isCurrent: true,
      media: {
        kind: 'saved-video-version',
        videoVersionId: firstBody.output.videoVersionId,
      },
      revision: { snapshot: { lastSuccessfulOutput: null } },
    });
    const download = await app.inject({
      method: 'GET',
      url: `${firstBody.contentUrl}?download=true`,
      headers: { host: browserHeaders.host },
    });
    expect(download.headers['content-disposition']).toMatch(/^attachment;/u);
    const outputHead = await app.inject({
      method: 'HEAD',
      url: firstBody.contentUrl,
      headers: { host: browserHeaders.host },
    });
    expect(outputHead.statusCode).toBe(200);
    expect(outputHead.body).toBe('');
    expect(outputHead.headers['content-length']).toBe(String(fixture.byteLength));
  });

  it('saves an output over an arrangement, clearing the treatment and leaving the arrangement alone', async () => {
    const app = localApp();
    const created = (await create(app, 'Arranged Project')).response;
    const projectId = json<{ project: { id: string } }>(created).project.id;
    const fixture = Buffer.from(
      (
        await readFile(
          new URL('../../../../../e2e/fixtures/decodable-h264-video.base64', import.meta.url),
          'utf8',
        )
      ).replaceAll(/\s/gu, ''),
      'base64',
    );
    const source = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/source`,
      headers: {
        ...browserHeaders,
        'content-type': 'video/mp4',
        'idempotency-key': randomUUID(),
        'x-lightframe-project-source': encodeURIComponent(
          JSON.stringify({
            expectedVersion: 1,
            expectedRevisionNumber: 1,
            kind: 'uploaded',
            filename: 'arranged.mp4',
          }),
        ),
      },
      payload: fixture,
    });
    expect(source.statusCode).toBe(201);
    const sourceBody = json<{
      project: { version: number };
      revision: {
        revisionNumber: number;
        snapshot: { sourceAssetId: string; workingMedia: { kind: 'asset'; assetId: string } };
      };
    }>(source);

    // Nothing in the product writes a composition yet — the session proposal carries the creative
    // fields and deliberately has no arrangement field until the editor can build one — so the
    // arrangement is placed on the stored library the way its writer will, and a second app over
    // the same directory reads it back. Everything after that is the ordinary save path.
    const projectsDirectory = path.join(directory, 'metadata', 'v1', 'projects');
    const libraryFile = (await readdir(projectsDirectory)).find((entry) =>
      /^[a-f0-9]{64}\.json$/u.test(entry),
    );
    if (libraryFile === undefined) throw new Error('Expected one stored Project library.');
    const libraryPath = path.join(projectsDirectory, libraryFile);
    const library = JSON.parse(await readFile(libraryPath, 'utf8')) as {
      projects: Array<{
        project: { id: string; ownerUserId: string; currentRevisionId: string };
        revisions: Array<{
          id: string;
          revisionNumber: number;
          createdAt: string;
          snapshot: Record<string, unknown>;
        }>;
        assetLinks: Array<Record<string, unknown>>;
      }>;
    };
    const aggregate = library.projects.find(({ project }) => project.id === projectId);
    if (aggregate === undefined) throw new Error('Expected the created Project to be stored.');
    const arranged = aggregate.revisions.find(
      ({ id }) => id === aggregate.project.currentRevisionId,
    );
    if (arranged === undefined) throw new Error('Expected a current stored revision.');
    const composition = {
      clips: [
        {
          id: randomUUID(),
          media: sourceBody.revision.snapshot.workingMedia,
          trim: { startMs: 0, endMs: 1_000 },
          audio: createDefaultVideoEditSpec(1_000).audio,
        },
      ],
      subtitles: [],
    };
    arranged.snapshot.composition = composition;
    // A clip's media is held by the revision that arranges it, so its writer records the link.
    aggregate.assetLinks.push({
      projectId,
      ownerUserId: aggregate.project.ownerUserId,
      assetId: sourceBody.revision.snapshot.sourceAssetId,
      role: 'clip',
      revisionId: arranged.id,
      revisionNumber: arranged.revisionNumber,
      createdAt: arranged.createdAt,
    });
    const serialized = `${JSON.stringify(library)}\n`;
    await writeFile(libraryPath, serialized, 'utf8');
    await writeFile(`${libraryPath}.bak`, serialized, 'utf8');

    const reopened = localApp();
    const treated = await reopened.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/revisions`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: {
        expectedVersion: sourceBody.project.version,
        expectedRevisionNumber: sourceBody.revision.revisionNumber,
        proposal: {
          ...emptyCreativeProposal,
          workflowPhase: 'review',
          liveMode: null,
          transform: {
            ...EMPTY_PROJECT_TRANSFORM,
            selectedVoice: {
              kind: 'local-effect',
              effectId: 'warm-studio',
              effectRevision: 'builtin-v1',
            },
          },
        },
      },
    });
    expect(treated.statusCode).toBe(200);
    // A checkpoint states the creative half; the arrangement it says nothing about carries forward.
    expect(treated.json()).toMatchObject({ revision: { snapshot: { composition } } });
    const treatedBody = json<{
      project: { version: number };
      revision: {
        revisionNumber: number;
        snapshot: { workingMedia: { kind: 'asset'; assetId: string } };
      };
    }>(treated);

    const saved = await reopened.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/outputs`,
      headers: {
        ...browserHeaders,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: {
        expectedVersion: treatedBody.project.version,
        expectedRevisionNumber: treatedBody.revision.revisionNumber,
        media: treatedBody.revision.snapshot.workingMedia,
        target: { kind: 'new', title: 'Arranged master' },
      },
    });
    expect(saved.statusCode).toBe(201);
    // The storage boundary checks the status the domain derives from the deliverable this save
    // recorded rather than the word "completed", and it derives it over this snapshot — the one
    // carrying an arrangement.
    expect(saved.json()).toMatchObject({
      project: { status: 'completed' },
      revision: {
        source: 'output-save',
        snapshot: {
          // The save ends the round its treatment was configured for; the arrangement describes
          // the media instead, which carries forward untouched.
          transform: null,
          composition,
        },
      },
    });

    // The same case as the replayed proposal after the save above, with a treatment that was
    // genuinely configured before it: the tab re-proposes the cleared `null` it can now see, and
    // the checkpoint converges rather than appending an edit that changes nothing.
    const savedBody = json<{
      project: { version: number };
      revision: {
        revisionNumber: number;
        snapshot: {
          workflowPhase: string;
          liveMode: unknown;
          transform: unknown;
          localEdit: unknown;
          exportSpecification: unknown;
          lastSuccessfulOutput: { savedVideoId: string; videoVersionId: string };
        };
      };
    }>(saved);
    const reproposed = await reopened.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/revisions`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: {
        expectedVersion: savedBody.project.version,
        expectedRevisionNumber: savedBody.revision.revisionNumber,
        proposal: {
          workflowPhase: savedBody.revision.snapshot.workflowPhase,
          liveMode: savedBody.revision.snapshot.liveMode,
          transform: savedBody.revision.snapshot.transform,
          localEdit: savedBody.revision.snapshot.localEdit,
          exportSpecification: savedBody.revision.snapshot.exportSpecification,
        },
      },
    });
    expect(reproposed.statusCode).toBe(200);
    expect(reproposed.json()).toMatchObject({
      project: {
        status: 'completed',
        version: savedBody.project.version,
        currentRevisionNumber: savedBody.revision.revisionNumber,
      },
      revision: {
        revisionNumber: savedBody.revision.revisionNumber,
        snapshot: {
          composition,
          lastSuccessfulOutput: savedBody.revision.snapshot.lastSuccessfulOutput,
        },
      },
    });
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
    const isolatedHistory = await authenticated.inject({
      method: 'GET',
      url: `/api/projects/${otherOwnerProject.current.project.id}/history`,
      headers: { host: browserHeaders.host, cookie },
    });
    const isolatedOutputs = await authenticated.inject({
      method: 'GET',
      url: `/api/projects/${otherOwnerProject.current.project.id}/outputs`,
      headers: { host: browserHeaders.host, cookie },
    });
    expect(isolatedHistory.statusCode).toBe(404);
    expect(isolatedOutputs.statusCode).toBe(404);
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
