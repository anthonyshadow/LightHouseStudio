// @vitest-environment jsdom

import type { ProjectCurrentResponse } from '@studio/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureRequests, jsonScenario, malformedContractScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';
import {
  archiveProject,
  checkpointProject,
  createProject,
  getProject,
  listProjects,
  ProjectApiConflictError,
  removeProjectSource,
  renameProject,
  restoreProject,
  tombstoneProject,
} from './projectsApi';

const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const revisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const now = '2026-08-11T16:00:00.000Z';

const currentProject = (overrides: Partial<ProjectCurrentResponse['project']> = {}) =>
  ({
    project: {
      id: projectId,
      campaignId: null,
      title: 'Launch cut',
      status: 'draft',
      version: 1,
      currentRevisionId: revisionId,
      currentRevisionNumber: 1,
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    },
    revision: {
      id: revisionId,
      projectId,
      revisionNumber: 1,
      parentRevisionId: null,
      parentRevisionNumber: null,
      snapshot: {
        schemaVersion: 2,
        sourceAssetId: null,
        workingMedia: null,
        presentedMedia: null,
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
        workflowPhase: 'source',
        createdAt: now,
        updatedAt: now,
      },
      authorKind: 'user',
      source: 'create',
      createdAt: now,
    },
  }) satisfies ProjectCurrentResponse;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Projects API adapter', () => {
  it('requests bounded lifecycle pages without snapshots and validates summaries', async () => {
    const observed = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'GET',
        '/api/projects',
        {
          body: { projects: [currentProject().project], nextCursor: 'next-page' },
        },
        observed.observe,
      ),
    );

    await expect(
      listProjects({ lifecycle: 'active', pageSize: 20, cursor: 'first-page' }),
    ).resolves.toEqual({
      projects: [currentProject().project],
      // A page that names no posters is a page with nothing to show, not a missing field.
      previews: [],
      nextCursor: 'next-page',
    });
    const url = new URL(observed.requests[0]!.url);
    expect(url.searchParams.get('lifecycle')).toBe('active');
    expect(url.searchParams.get('pageSize')).toBe('20');
    expect(url.searchParams.get('cursor')).toBe('first-page');
    expect(JSON.stringify(await observed.requests[0]!.clone().text())).not.toContain('snapshot');
  });

  it('carries the poster references the page resolved, and rejects a malformed one', async () => {
    const preview = {
      projectId: currentProject().project.id,
      savedVideoId: 'e1cfa9a0-9dd2-4c8e-8db7-3b0d5d1f8f70',
      videoVersionId: '0b4a5b6a-9f6c-4a0c-9a44-9a7e0f9a1c3d',
    };
    mockApiServer.use(
      jsonScenario('GET', '/api/projects', {
        body: { projects: [currentProject().project], previews: [preview], nextCursor: null },
      }),
    );

    await expect(listProjects({ lifecycle: 'active', pageSize: 20 })).resolves.toMatchObject({
      previews: [preview],
    });

    mockApiServer.use(
      jsonScenario('GET', '/api/projects', {
        body: {
          projects: [currentProject().project],
          previews: [{ ...preview, savedVideoId: 'not-a-video' }],
          nextCursor: null,
        },
      }),
    );

    await expect(listProjects({ lifecycle: 'active', pageSize: 20 })).rejects.toThrow();
  });

  it('sends one app-owned operation key and owner-free Quick Start body', async () => {
    const observed = captureRequests();
    const operationKey = '9dbfce90-3f54-4d5e-a6e6-369d5f15bbc7';
    mockApiServer.use(
      jsonScenario(
        'POST',
        '/api/projects',
        { body: currentProject(), status: 201 },
        observed.observe,
      ),
    );

    await expect(createProject('Untitled Project', operationKey)).resolves.toEqual(
      currentProject(),
    );
    expect(observed.requests[0]!.headers.get('idempotency-key')).toBe(operationKey);
    expect(await observed.requests[0]!.json()).toEqual({
      title: 'Untitled Project',
      campaignId: null,
    });
  });

  it('maps get, rename, archive, restore, and guarded tombstone through strict responses', async () => {
    const renamed = currentProject({ title: 'Launch final', version: 2 });
    const archived = currentProject({
      title: 'Launch final',
      status: 'archived',
      version: 3,
      archivedAt: now,
    });
    const restored = currentProject({ title: 'Launch final', status: 'draft', version: 4 });
    const deleted = currentProject({
      title: 'Launch final',
      status: 'deleted',
      version: 5,
      archivedAt: now,
      deletedAt: now,
    });
    const observed = captureRequests();
    mockApiServer.use(
      jsonScenario('GET', `/api/projects/${projectId}`, { body: currentProject() }),
      jsonScenario('PATCH', `/api/projects/${projectId}`, { body: renamed }),
      jsonScenario('POST', `/api/projects/${projectId}/archive`, { body: archived }),
      jsonScenario('POST', `/api/projects/${projectId}/restore`, { body: restored }),
      jsonScenario(
        'POST',
        `/api/projects/${projectId}/tombstone`,
        { body: deleted },
        observed.observe,
      ),
    );

    await expect(getProject(projectId)).resolves.toEqual(currentProject());
    await expect(renameProject(projectId, 'Launch final', 1)).resolves.toEqual(renamed);
    await expect(archiveProject(projectId, 2)).resolves.toEqual(archived);
    await expect(restoreProject(projectId, 3)).resolves.toEqual(restored);
    await expect(tombstoneProject(projectId, 4)).resolves.toEqual(deleted);
    expect(await observed.requests[0]!.json()).toEqual({
      expectedVersion: 4,
      confirmation: 'permanent-delete',
    });
  });

  it('removes a Project source with both CAS tokens and no idempotency key', async () => {
    const observed = captureRequests();
    const base = currentProject();
    const removedRevisionId = '5b42c7d8-9b65-4989-b351-293763b45e42';
    const removed: ProjectCurrentResponse = {
      project: {
        ...base.project,
        version: 3,
        currentRevisionNumber: 3,
        currentRevisionId: removedRevisionId,
      },
      revision: {
        ...base.revision,
        id: removedRevisionId,
        revisionNumber: 3,
        parentRevisionId: base.revision.id,
        parentRevisionNumber: 2,
        snapshot: { ...base.revision.snapshot, sourceAssetId: null, workflowPhase: 'source' },
      },
    };
    mockApiServer.use(
      jsonScenario(
        'POST',
        `/api/projects/${projectId}/source/remove`,
        { body: removed },
        observed.observe,
      ),
    );

    await expect(
      removeProjectSource({ projectId, expectedVersion: 2, expectedRevisionNumber: 2 }),
    ).resolves.toEqual(removed);
    await expect(observed.requests[0]!.json()).resolves.toEqual({
      expectedVersion: 2,
      expectedRevisionNumber: 2,
    });
    // Removal creates no bytes and no provider work, so it carries no receipt.
    expect(observed.requests[0]!.headers.get('idempotency-key')).toBeNull();
  });

  it('surfaces a typed conflict when a source removal loses CAS', async () => {
    mockApiServer.use(
      jsonScenario('POST', `/api/projects/${projectId}/source/remove`, {
        status: 409,
        body: {
          error: { code: 'conflict', message: 'The Project changed in another session.' },
          conflict: {
            kind: 'project-version',
            projectId,
            expectedVersion: 2,
            actualVersion: 3,
          },
        },
      }),
    );

    await expect(
      removeProjectSource({ projectId, expectedVersion: 2, expectedRevisionNumber: 2 }),
    ).rejects.toMatchObject({
      conflict: { kind: 'project-version', expectedVersion: 2, actualVersion: 3 },
    });
  });

  it('sends a strict semantic checkpoint with both CAS tokens', async () => {
    const observed = captureRequests();
    const base = currentProject();
    const nextRevisionId = '4a31b6c7-8a54-4878-b240-182652a34d31';
    const checkpointed: ProjectCurrentResponse = {
      project: {
        ...base.project,
        version: 2,
        currentRevisionNumber: 2,
        currentRevisionId: nextRevisionId,
      },
      revision: {
        ...base.revision,
        id: nextRevisionId,
        revisionNumber: 2,
        parentRevisionId: base.revision.id,
        parentRevisionNumber: 1,
        snapshot: { ...base.revision.snapshot, workflowPhase: 'creative' },
      },
    };
    mockApiServer.use(
      jsonScenario(
        'POST',
        `/api/projects/${projectId}/revisions`,
        { body: checkpointed },
        observed.observe,
      ),
    );
    const proposal = {
      workflowPhase: 'creative',
      liveMode: null,
      selectedCharacter: null,
      selectedOutfit: null,
      selectedVoice: null,
      visualTreatment: { kind: 'none' },
      creativeIntent: base.revision.snapshot.creativeIntent,
      localEdit: null,
    } as const;

    await expect(
      checkpointProject(projectId, {
        expectedVersion: 1,
        expectedRevisionNumber: 1,
        proposal,
      }),
    ).resolves.toEqual(checkpointed);
    await expect(observed.requests[0]!.json()).resolves.toEqual({
      expectedVersion: 1,
      expectedRevisionNumber: 1,
      proposal,
    });
  });

  it('preserves typed CAS conflicts and normalizes malformed success payloads', async () => {
    mockApiServer.use(
      jsonScenario('PATCH', `/api/projects/${projectId}`, {
        status: 409,
        body: {
          error: { code: 'conflict', message: 'Refresh the Project.' },
          conflict: {
            kind: 'project-version',
            projectId,
            expectedVersion: 1,
            actualVersion: 2,
          },
        },
      }),
    );

    const conflict = await renameProject(projectId, 'Stale title', 1).catch(
      (error: unknown) => error,
    );
    expect(conflict).toBeInstanceOf(ProjectApiConflictError);
    expect(conflict).toMatchObject({
      status: 409,
      code: 'conflict',
      conflict: { kind: 'project-version', actualVersion: 2 },
    });

    mockApiServer.use(malformedContractScenario('GET', `/api/projects/${projectId}`));
    await expect(getProject(projectId)).rejects.toMatchObject({
      status: 502,
      code: 'invalid-response',
    });
  });
});
