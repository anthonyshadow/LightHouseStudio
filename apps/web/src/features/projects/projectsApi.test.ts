// @vitest-environment jsdom

import type { ProjectCurrentResponse } from '@studio/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureRequests, jsonScenario, malformedContractScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';
import {
  archiveProject,
  createProject,
  getProject,
  listProjects,
  ProjectApiConflictError,
  renameProject,
  restoreProject,
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
        schemaVersion: 1,
        sourceAssetId: null,
        workingMedia: null,
        presentedMedia: null,
        selectedCharacter: null,
        selectedOutfit: null,
        selectedVoice: null,
        visualTreatment: { kind: 'none' },
        liveMode: null,
        creativeIntent: { promptId: null, recipeId: null, userIntent: '' },
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
    ).resolves.toEqual({ projects: [currentProject().project], nextCursor: 'next-page' });
    const url = new URL(observed.requests[0]!.url);
    expect(url.searchParams.get('lifecycle')).toBe('active');
    expect(url.searchParams.get('pageSize')).toBe('20');
    expect(url.searchParams.get('cursor')).toBe('first-page');
    expect(JSON.stringify(await observed.requests[0]!.clone().text())).not.toContain('snapshot');
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

  it('maps get, rename, archive, and restore through strict current-state responses', async () => {
    const renamed = currentProject({ title: 'Launch final', version: 2 });
    const archived = currentProject({
      title: 'Launch final',
      status: 'archived',
      version: 3,
      archivedAt: now,
    });
    const restored = currentProject({ title: 'Launch final', status: 'draft', version: 4 });
    mockApiServer.use(
      jsonScenario('GET', `/api/projects/${projectId}`, { body: currentProject() }),
      jsonScenario('PATCH', `/api/projects/${projectId}`, { body: renamed }),
      jsonScenario('POST', `/api/projects/${projectId}/archive`, { body: archived }),
      jsonScenario('POST', `/api/projects/${projectId}/restore`, { body: restored }),
    );

    await expect(getProject(projectId)).resolves.toEqual(currentProject());
    await expect(renameProject(projectId, 'Launch final', 1)).resolves.toEqual(renamed);
    await expect(archiveProject(projectId, 2)).resolves.toEqual(archived);
    await expect(restoreProject(projectId, 3)).resolves.toEqual(restored);
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
