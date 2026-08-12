import type { ProjectCurrentResponse } from '@studio/contracts';
import type { Page } from '@playwright/test';

export const TEST_PROJECT_ID = '18b120ac-1578-46e3-8c3d-42307772f391';
const PROJECT_REVISION_ID = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const PROJECT_TIMESTAMP = '2030-01-01T00:00:00.000Z';

export const emptyProjectFixture = (): ProjectCurrentResponse => ({
  project: {
    id: TEST_PROJECT_ID,
    campaignId: null,
    title: 'Untitled Project',
    status: 'draft',
    version: 1,
    currentRevisionId: PROJECT_REVISION_ID,
    currentRevisionNumber: 1,
    archivedAt: null,
    deletedAt: null,
    createdAt: PROJECT_TIMESTAMP,
    updatedAt: PROJECT_TIMESTAMP,
  },
  revision: {
    id: PROJECT_REVISION_ID,
    projectId: TEST_PROJECT_ID,
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
      createdAt: PROJECT_TIMESTAMP,
      updatedAt: PROJECT_TIMESTAMP,
    },
    authorKind: 'user',
    source: 'create',
    createdAt: PROJECT_TIMESTAMP,
  },
});

export const installProjectHarness = async (page: Page, seed = false) => {
  let current: ProjectCurrentResponse | null = seed ? emptyProjectFixture() : null;
  const operationKeys: string[] = [];
  await page.route('**/api/projects**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const detailPath = `/api/projects/${TEST_PROJECT_ID}`;
    if (url.pathname === '/api/projects' && method === 'GET') {
      const lifecycle = url.searchParams.get('lifecycle');
      const projects =
        current && (current.project.archivedAt === null ? 'active' : 'archived') === lifecycle
          ? [current.project]
          : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects, nextCursor: null }),
      });
      return;
    }
    if (url.pathname === '/api/projects' && method === 'POST') {
      operationKeys.push(request.headers()['idempotency-key'] ?? '');
      current ??= emptyProjectFixture();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(current),
      });
      return;
    }
    if (url.pathname === detailPath && method === 'GET' && current) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(current),
      });
      return;
    }
    if (url.pathname === detailPath && method === 'PATCH' && current) {
      const body = request.postDataJSON() as { title: string; expectedVersion: number };
      current = {
        ...current,
        project: {
          ...current.project,
          title: body.title,
          version: body.expectedVersion + 1,
          updatedAt: '2030-01-01T00:01:00.000Z',
        },
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(current),
      });
      return;
    }
    const lifecycle = url.pathname.match(new RegExp(`^${detailPath}/(archive|restore)$`, 'u'))?.[1];
    if (lifecycle && method === 'POST' && current) {
      const body = request.postDataJSON() as { expectedVersion: number };
      current = {
        ...current,
        project: {
          ...current.project,
          status: lifecycle === 'archive' ? 'archived' : 'draft',
          version: body.expectedVersion + 1,
          archivedAt: lifecycle === 'archive' ? '2030-01-01T00:02:00.000Z' : null,
          updatedAt: '2030-01-01T00:02:00.000Z',
        },
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(current),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'Project unavailable.' } }),
    });
  });
  return { operationKeys };
};
