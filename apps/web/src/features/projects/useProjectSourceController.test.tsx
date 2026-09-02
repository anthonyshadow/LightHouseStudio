// @vitest-environment jsdom

import type {
  ProjectCurrentResponse,
  ProjectSourceResponse,
  ProjectWorkingMediaResponse,
} from '@studio/contracts';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { delay, HttpResponse, http } from 'msw';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import {
  useProjectSourceController,
  type ProjectSourceActivity,
  type ProjectStageSourceRuntime,
} from './useProjectSourceController';

const firstProjectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const secondProjectId = '730c73ca-a6af-4509-83c0-b3c18c1ee81a';
const firstRevisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const acceptedRevisionId = '4159225b-60f4-4f94-a3d5-08feee91a91d';
const assetId = '79b94c02-d268-4201-a05b-1f3baa0caed1';
const workingAssetId = '08ab9b2e-0cb2-4f07-9bed-b931204e1546';
const savedVideoId = 'ea77cbd9-c453-4f58-a9a0-42bf8aaef338';
const videoVersionId = 'b276694b-58c4-40d3-8fb6-315e32b66fd0';
const now = '2026-08-12T16:00:00.000Z';

const currentProject = (projectId: string, accepted: boolean): ProjectCurrentResponse => ({
  project: {
    id: projectId,
    campaignId: null,
    title: 'Source Project',
    status: accepted ? 'ready' : 'draft',
    version: accepted ? 2 : 1,
    currentRevisionId: accepted ? acceptedRevisionId : firstRevisionId,
    currentRevisionNumber: accepted ? 2 : 1,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  revision: {
    id: accepted ? acceptedRevisionId : firstRevisionId,
    projectId,
    revisionNumber: accepted ? 2 : 1,
    parentRevisionId: accepted ? firstRevisionId : null,
    parentRevisionNumber: accepted ? 1 : null,
    snapshot: {
      schemaVersion: 2,
      sourceAssetId: accepted ? assetId : null,
      workingMedia: accepted ? { kind: 'asset', assetId } : null,
      presentedMedia: accepted ? { kind: 'asset', assetId } : null,
      selectedCharacter: null,
      selectedOutfit: null,
      selectedVoice: null,
      visualTreatment: { kind: 'none' },
      liveMode: null,
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
      exportSpecification: null,
      lastSuccessfulOutput: null,
      workflowPhase: accepted ? 'creative' : 'source',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: accepted ? 'user-edit' : 'create',
    createdAt: now,
  },
});

const sourceResponse = (projectId: string): ProjectSourceResponse => ({
  ...currentProject(projectId, true),
  source: {
    kind: 'uploaded',
    savedVideoId: null,
    videoVersionId: null,
    mimeType: 'video/mp4',
    filename: `${projectId}.mp4`,
    sizeBytes: 4,
    container: 'mp4',
    videoCodec: 'avc',
    audioCodec: null,
    durationMs: 1_000,
    width: 640,
    height: 360,
    hasAudio: false,
    acceptedAt: now,
    contentUrl: `/api/projects/${projectId}/source/content`,
  },
});

const reusedSourceResponse = (projectId: string): ProjectSourceResponse => {
  const response = sourceResponse(projectId);
  const mediaReference = {
    kind: 'saved-video-version' as const,
    savedVideoId,
    videoVersionId,
  };
  return {
    ...response,
    revision: {
      ...response.revision,
      snapshot: {
        ...response.revision.snapshot,
        workingMedia: mediaReference,
        presentedMedia: mediaReference,
      },
    },
    source: {
      ...response.source,
      kind: 'saved-video-version',
      savedVideoId,
      videoVersionId,
      filename: 'exact-version.mp4',
    },
  };
};

const adoptedWorkingResponse = (projectId: string): ProjectWorkingMediaResponse => {
  const base = currentProject(projectId, true);
  const revision = {
    ...base.revision,
    snapshot: {
      ...base.revision.snapshot,
      workingMedia: { kind: 'asset' as const, assetId: workingAssetId },
      presentedMedia: { kind: 'asset' as const, assetId: workingAssetId },
    },
  };
  return {
    project: base.project,
    revision,
    media: {
      kind: 'local-render',
      reference: { kind: 'asset', assetId: workingAssetId },
      assetId: workingAssetId,
      savedVideoId: null,
      videoVersionId: null,
      mimeType: 'video/mp4',
      filename: 'adopted-working.mp4',
      sizeBytes: 4,
      checksumSha256: 'a'.repeat(64),
      container: 'mp4',
      videoCodec: 'avc',
      audioCodec: null,
      durationMs: 900,
      width: 640,
      height: 360,
      hasAudio: false,
      adoptedRevisionId: acceptedRevisionId,
      adoptedRevisionNumber: 2,
      adoptedAt: now,
      contentUrl: `/api/projects/${projectId}/working-media/${acceptedRevisionId}/content`,
    },
    isCurrent: true,
  };
};

const runtime = () => {
  const present = vi.fn<ProjectStageSourceRuntime['present']>();
  const clear = vi.fn<ProjectStageSourceRuntime['clear']>();
  return { kind: 'stage', present, clear } satisfies ProjectStageSourceRuntime;
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useProjectSourceController', () => {
  it('hydrates by presenting the ranged content route without downloading the video', async () => {
    const contentRanges: (string | null)[] = [];
    mockApiServer.use(
      http.get(`*/api/projects/${firstProjectId}/source`, () =>
        HttpResponse.json(sourceResponse(firstProjectId)),
      ),
      http.get(`*/api/projects/${firstProjectId}/source/content`, ({ request }) => {
        contentRanges.push(request.headers.get('range'));
        return HttpResponse.arrayBuffer(new Uint8Array([1]).buffer, {
          status: 206,
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '1' },
        });
      }),
    );
    const mediaOwner = runtime();
    const first = renderHook(
      () =>
        useProjectSourceController(
          firstProjectId,
          currentProject(firstProjectId, true),
          mediaOwner,
        ),
      { wrapper: RemoteStateTestProvider },
    );
    await waitFor(() => expect(first.result.current.phase).toBe('saved'));
    expect(mediaOwner.clear).toHaveBeenCalledWith(firstProjectId);
    expect(mediaOwner.present).toHaveBeenCalledOnce();
    const firstInput = mediaOwner.present.mock.calls[0]![1];
    expect(firstInput).not.toHaveProperty('blob');
    expect(firstInput).toMatchObject({
      remoteMedia: {
        kind: 'remote-presentation',
        contentUrl: `/api/projects/${firstProjectId}/source/content`,
        sizeBytes: 4,
        mimeType: 'video/mp4',
      },
    });
    expect(firstInput.artifactMetadata.filename).toBe(`${firstProjectId}.mp4`);
    // Reachability is proven with one byte; the video itself is never downloaded to hydrate.
    expect(contentRanges).toEqual(['bytes=0-0']);
    first.unmount();

    const second = renderHook(
      () =>
        useProjectSourceController(
          firstProjectId,
          currentProject(firstProjectId, true),
          mediaOwner,
        ),
      { wrapper: RemoteStateTestProvider },
    );
    await waitFor(() => expect(second.result.current.phase).toBe('saved'));
    const secondInput = mediaOwner.present.mock.calls.at(-1)![1];
    expect(secondInput).toMatchObject({
      remoteMedia: { contentUrl: `/api/projects/${firstProjectId}/source/content` },
    });
    expect(contentRanges).toEqual(['bytes=0-0', 'bytes=0-0']);
  });

  it('removes a source, clears the stage, and reopens the add-source controls', async () => {
    const removed: ProjectCurrentResponse = {
      project: {
        ...currentProject(firstProjectId, false).project,
        version: 3,
        currentRevisionNumber: 3,
        currentRevisionId: '5b42c7d8-9b65-4989-b351-293763b45e42',
      },
      revision: {
        ...currentProject(firstProjectId, false).revision,
        id: '5b42c7d8-9b65-4989-b351-293763b45e42',
        revisionNumber: 3,
      },
    };
    let removeBody: unknown = null;
    mockApiServer.use(
      http.get(`*/api/projects/${firstProjectId}/source`, () =>
        HttpResponse.json(sourceResponse(firstProjectId)),
      ),
      http.get(`*/api/projects/${firstProjectId}/source/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
      http.post(`*/api/projects/${firstProjectId}/source/remove`, async ({ request }) => {
        removeBody = await request.json();
        return HttpResponse.json(removed);
      }),
    );
    const mediaOwner = runtime();
    const changes: ProjectCurrentResponse[] = [];
    const hook = renderHook(
      () => {
        const [current, setCurrent] = useState(() => currentProject(firstProjectId, true));
        return useProjectSourceController(
          firstProjectId,
          current,
          mediaOwner,
          undefined,
          (next) => {
            changes.push(next);
            setCurrent(next);
          },
        );
      },
      { wrapper: RemoteStateTestProvider },
    );
    await waitFor(() => expect(hook.result.current.phase).toBe('saved'));
    expect(hook.result.current.accepted).toBe(true);
    const clearsBeforeRemoval = mediaOwner.clear.mock.calls.length;

    await act(async () => {
      await hook.result.current.remove();
    });

    expect(removeBody).toEqual({ expectedVersion: 2, expectedRevisionNumber: 2 });
    await waitFor(() => expect(hook.result.current.phase).toBe('idle'));
    expect(hook.result.current.source).toBeNull();
    expect(hook.result.current.accepted).toBe(false);
    expect(mediaOwner.clear.mock.calls.length).toBeGreaterThan(clearsBeforeRemoval);
    expect(changes.at(-1)?.revision.snapshot.sourceAssetId).toBeNull();
  });

  it('treats a CAS conflict as success when the removal already landed', async () => {
    const removed: ProjectCurrentResponse = {
      project: {
        ...currentProject(firstProjectId, false).project,
        version: 3,
        currentRevisionNumber: 3,
      },
      revision: currentProject(firstProjectId, false).revision,
    };
    mockApiServer.use(
      http.get(`*/api/projects/${firstProjectId}/source`, () =>
        HttpResponse.json(sourceResponse(firstProjectId)),
      ),
      http.get(`*/api/projects/${firstProjectId}/source/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
      http.post(`*/api/projects/${firstProjectId}/source/remove`, () =>
        HttpResponse.json(
          {
            error: { code: 'conflict', message: 'The Project changed in another session.' },
            conflict: {
              kind: 'project-version',
              projectId: firstProjectId,
              expectedVersion: 2,
              actualVersion: 3,
            },
          },
          { status: 409 },
        ),
      ),
      http.get(`*/api/projects/${firstProjectId}`, () => HttpResponse.json(removed)),
    );
    const mediaOwner = runtime();
    const hook = renderHook(
      () => {
        const [current, setCurrent] = useState(() => currentProject(firstProjectId, true));
        return useProjectSourceController(
          firstProjectId,
          current,
          mediaOwner,
          undefined,
          setCurrent,
        );
      },
      { wrapper: RemoteStateTestProvider },
    );
    await waitFor(() => expect(hook.result.current.phase).toBe('saved'));

    await act(async () => {
      await hook.result.current.remove();
    });

    // The conflict only means someone got there first — server authority decides, and it agrees.
    await waitFor(() => expect(hook.result.current.phase).toBe('idle'));
    expect(hook.result.current.accepted).toBe(false);
  });

  it('reports a conflict when the Project still has a source after a failed removal', async () => {
    mockApiServer.use(
      http.get(`*/api/projects/${firstProjectId}/source`, () =>
        HttpResponse.json(sourceResponse(firstProjectId)),
      ),
      http.get(`*/api/projects/${firstProjectId}/source/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
      http.post(`*/api/projects/${firstProjectId}/source/remove`, () =>
        HttpResponse.json(
          {
            error: { code: 'conflict', message: 'The Project has active work.' },
            conflict: { kind: 'active-jobs', projectId: firstProjectId },
          },
          { status: 409 },
        ),
      ),
      http.get(`*/api/projects/${firstProjectId}`, () =>
        HttpResponse.json(currentProject(firstProjectId, true)),
      ),
    );
    const mediaOwner = runtime();
    const hook = renderHook(
      () =>
        useProjectSourceController(
          firstProjectId,
          currentProject(firstProjectId, true),
          mediaOwner,
        ),
      { wrapper: RemoteStateTestProvider },
    );
    await waitFor(() => expect(hook.result.current.phase).toBe('saved'));

    await act(async () => {
      await hook.result.current.remove();
    });

    await waitFor(() => expect(hook.result.current.phase).toBe('conflict'));
    expect(hook.result.current.accepted).toBe(true);
  });

  it('hydrates the current adopted working reference while keeping source metadata immutable', async () => {
    const working = adoptedWorkingResponse(firstProjectId);
    const source = {
      ...sourceResponse(firstProjectId),
      revision: working.revision,
    };
    mockApiServer.use(
      http.get(`*/api/projects/${firstProjectId}/source`, () => HttpResponse.json(source)),
      http.get(`*/api/projects/${firstProjectId}/working-media`, () => HttpResponse.json(working)),
      http.get(`*/api/projects/${firstProjectId}/working-media/${acceptedRevisionId}/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([4, 3, 2, 1]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
    );
    const mediaOwner = runtime();
    const hook = renderHook(() => useProjectSourceController(firstProjectId, working, mediaOwner), {
      wrapper: RemoteStateTestProvider,
    });

    await waitFor(() => expect(hook.result.current.phase).toBe('saved'));
    expect(hook.result.current.source?.filename).toBe(`${firstProjectId}.mp4`);
    expect(mediaOwner.present).toHaveBeenCalledOnce();
    expect(mediaOwner.present.mock.calls[0]?.[0]).toBe(firstProjectId);
    expect(mediaOwner.present.mock.calls[0]?.[1].artifactMetadata.filename).toBe(
      'adopted-working.mp4',
    );
  });

  it('does not clear freshly presented media when equivalent authority is accepted', async () => {
    const events: string[] = [];
    mockApiServer.use(
      http.get(`*/api/projects/${firstProjectId}/source`, () =>
        HttpResponse.json(sourceResponse(firstProjectId)),
      ),
      http.get(`*/api/projects/${firstProjectId}/source/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
    );
    const mediaOwner: ProjectStageSourceRuntime = {
      kind: 'stage',
      present: vi.fn(() => events.push('present')),
      clear: vi.fn(() => events.push('clear')),
    };
    const hook = renderHook(
      () => {
        const [current, setCurrent] = useState(() => currentProject(firstProjectId, true));
        return useProjectSourceController(
          firstProjectId,
          current,
          mediaOwner,
          undefined,
          setCurrent,
        );
      },
      { wrapper: RemoteStateTestProvider },
    );

    await waitFor(() => expect(hook.result.current.phase).toBe('saved'));
    expect(events).toEqual(['clear', 'present']);
  });

  it('aborts an old Project hydration so late completion cannot replace the new stage', async () => {
    let firstSourceStarted = false;
    mockApiServer.use(
      http.get(`*/api/projects/${firstProjectId}/source`, async () => {
        firstSourceStarted = true;
        await delay(120);
        return HttpResponse.json(sourceResponse(firstProjectId));
      }),
      http.get(`*/api/projects/${secondProjectId}/source`, () =>
        HttpResponse.json(sourceResponse(secondProjectId)),
      ),
      http.get('*/api/projects/:projectId/source/content', () =>
        HttpResponse.arrayBuffer(new Uint8Array([1]).buffer, {
          status: 206,
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '1' },
        }),
      ),
    );
    const mediaOwner = runtime();
    const hook = renderHook(
      ({ projectId }) =>
        useProjectSourceController(projectId, currentProject(projectId, true), mediaOwner),
      { initialProps: { projectId: firstProjectId }, wrapper: RemoteStateTestProvider },
    );
    await waitFor(() => expect(firstSourceStarted).toBe(true));
    hook.rerender({ projectId: secondProjectId });

    await waitFor(() => {
      const latest = mediaOwner.present.mock.calls.at(-1);
      expect(latest?.[0]).toBe(secondProjectId);
      expect(latest?.[1]).toMatchObject({
        remoteMedia: { contentUrl: `/api/projects/${secondProjectId}/source/content` },
      });
    });
    await act(() => delay(150));
    expect(mediaOwner.present.mock.calls.map(([projectId]) => projectId)).toEqual([
      secondProjectId,
    ]);
  });

  it('previews locally, reports cancellable staging, and releases that preview on abort', async () => {
    mockApiServer.use(
      http.post(`*/api/projects/${firstProjectId}/source`, async () => {
        await delay(120);
        return HttpResponse.json(sourceResponse(firstProjectId), { status: 201 });
      }),
    );
    const mediaOwner = runtime();
    const activities: ProjectSourceActivity[] = [];
    const hook = renderHook(
      () =>
        useProjectSourceController(
          firstProjectId,
          currentProject(firstProjectId, false),
          mediaOwner,
          (activity) => activities.push(activity),
        ),
      { wrapper: RemoteStateTestProvider },
    );
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'preview.mp4', {
      type: 'video/mp4',
    });
    act(() => {
      void hook.result.current.upload(file);
    });
    await waitFor(() => expect(hook.result.current.busy).toBe(true));
    expect(mediaOwner.present).toHaveBeenCalledWith(
      firstProjectId,
      expect.objectContaining({ blob: file }),
    );
    expect(activities.at(-1)).toMatchObject({ busy: true, accepted: false });

    act(() => hook.result.current.abort());
    await waitFor(() => expect(hook.result.current.phase).toBe('idle'));
    expect(mediaOwner.clear).toHaveBeenLastCalledWith(firstProjectId);
    await act(() => delay(150));
    expect(mediaOwner.present).toHaveBeenCalledOnce();
  });

  it('reuses only the selected exact Version without sending an output save target', async () => {
    let requestBody: unknown;
    mockApiServer.use(
      http.post(`*/api/projects/${firstProjectId}/source/reuse`, async ({ request }) => {
        requestBody = await request.json();
        return HttpResponse.json(reusedSourceResponse(firstProjectId), { status: 201 });
      }),
      http.get(`*/api/projects/${firstProjectId}/source/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4', 'Content-Length': '4' },
        }),
      ),
    );
    const mediaOwner = runtime();
    const hook = renderHook(
      () =>
        useProjectSourceController(
          firstProjectId,
          currentProject(firstProjectId, false),
          mediaOwner,
        ),
      { wrapper: RemoteStateTestProvider },
    );
    const selectedVideo = {
      id: savedVideoId,
      title: 'Exact source',
      status: 'ready' as const,
      currentVersion: {
        id: videoVersionId,
        videoId: savedVideoId,
        ordinal: 3,
        origin: 'uploaded' as const,
        characterName: null,
        characterVariantName: null,
        sourceVersionId: null,
        mimeType: 'video/mp4' as const,
        filename: 'exact-version.mp4',
        sizeBytes: 4,
        durationMs: 1_000,
        width: 640,
        height: 360,
        exportSpecification: null,
        createdAt: now,
      },
      sourceVideoId: null,
      versionCount: 3,
      thumbnailAvailable: false,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };

    act(() => {
      void hook.result.current.reuseSavedVideo(selectedVideo);
    });
    await waitFor(() => expect(hook.result.current.phase).toBe('saved'));
    expect(requestBody).toEqual({
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      savedVideoId,
      videoVersionId,
    });
    expect(JSON.stringify(requestBody)).not.toContain('saveTarget');
    const latestPresentation = mediaOwner.present.mock.calls.at(-1);
    expect(latestPresentation?.[0]).toBe(firstProjectId);
    expect(latestPresentation?.[1]).toMatchObject({
      remoteMedia: { contentUrl: `/api/projects/${firstProjectId}/source/content` },
    });
  });

  it('reuses the same source operation key after response loss until the Project reconciles', async () => {
    const operationKeys: string[] = [];
    let attempts = 0;
    mockApiServer.use(
      http.post(`*/api/projects/${firstProjectId}/source`, ({ request }) => {
        operationKeys.push(request.headers.get('idempotency-key') ?? '');
        attempts += 1;
        return attempts === 1
          ? HttpResponse.error()
          : HttpResponse.json(sourceResponse(firstProjectId), { status: 201 });
      }),
      http.get(`*/api/projects/${firstProjectId}/source`, () =>
        HttpResponse.json(
          { error: { code: 'not_found', message: 'No accepted source.' } },
          { status: 404 },
        ),
      ),
    );
    const mediaOwner = runtime();
    const hook = renderHook(
      () =>
        useProjectSourceController(
          firstProjectId,
          currentProject(firstProjectId, false),
          mediaOwner,
        ),
      { wrapper: RemoteStateTestProvider },
    );
    const file = new File([new Uint8Array([1, 2, 3, 4])], 'retry.mp4', {
      type: 'video/mp4',
      lastModified: 42,
    });

    act(() => {
      void hook.result.current.upload(file);
    });
    await waitFor(() => expect(hook.result.current.phase).toBe('error'));
    act(() => {
      void hook.result.current.upload(file);
    });
    await waitFor(() => expect(hook.result.current.phase).toBe('saved'));

    expect(operationKeys).toHaveLength(2);
    expect(operationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(operationKeys[1]).toBe(operationKeys[0]);
  });
});
