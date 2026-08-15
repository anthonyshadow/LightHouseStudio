import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../../app.js';
import { testConfig } from '../../test/fakes.js';
import { FileProjectRepository } from './file-project-repository.js';
import { ProjectService } from './project-service.js';
import { createDefaultVideoEditSpec } from '@studio/domain';

const browserHeaders = { host: 'localhost:5173', origin: 'http://localhost:5173' };
const json = <Value>(response: { json(): unknown }): Value => response.json() as Value;
const emptyCreativeProposal = {
  selectedCharacter: null,
  selectedOutfit: null,
  selectedVoice: null,
  visualTreatment: { kind: 'none' as const },
  creativeIntent: {
    promptId: null,
    promptLabel: null,
    recipeId: null,
    recipeLabel: null,
    userIntent: '',
    appliedPrompt: null,
    referenceAssetId: null,
    resourceRevision: null,
  },
  localEdit: null,
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
    expect(accepted.json()).toMatchObject({
      project: { id: projectId, status: 'ready', version: 2 },
      revision: { revisionNumber: 2, snapshot: { sourceAssetId: operationKey } },
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
    const localEdit = createDefaultVideoEditSpec(1_000);
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

    const adopted = await upload();
    expect(adopted.statusCode).toBe(201);
    expect(adopted.json()).toMatchObject({
      project: { id: projectId, version: 3, status: 'ready' },
      revision: {
        revisionNumber: 3,
        snapshot: {
          sourceAssetId: sourceKey,
          workingMedia: { kind: 'asset', assetId: operationKey },
          presentedMedia: { kind: 'asset', assetId: operationKey },
          localEdit,
          lastSuccessfulOutput: null,
        },
      },
      isCurrent: true,
      media: {
        kind: 'local-render',
        assetId: operationKey,
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
        };
      };
      output: { savedVideoId: string; videoVersionId: string };
      savedVideo: { id: string; currentVersion: { id: string } };
      contentUrl: string;
    }>(first);
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
