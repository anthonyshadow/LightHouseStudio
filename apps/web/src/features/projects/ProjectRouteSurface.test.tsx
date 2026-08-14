// @vitest-environment jsdom

import type { ProjectCurrentResponse } from '@studio/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioDesignProvider } from '../../ui';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { ProjectRouteSurface } from './ProjectRouteSurface';

const activeId = '18b120ac-1578-46e3-8c3d-42307772f391';
const archivedId = '3b41f4fc-0881-4313-878d-d77a1b43f192';
const secondActiveId = '730c73ca-a6af-4509-83c0-b3c18c1ee81a';
const revisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const now = '2026-08-11T16:00:00.000Z';

const currentProject = (
  id: string,
  overrides: Partial<ProjectCurrentResponse['project']> = {},
): ProjectCurrentResponse => ({
  project: {
    id,
    campaignId: null,
    title: id === activeId ? 'Launch cut' : 'Archived concept',
    status: id === archivedId ? 'archived' : 'draft',
    version: 1,
    currentRevisionId: revisionId,
    currentRevisionNumber: 1,
    archivedAt: id === archivedId ? now : null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  },
  revision: {
    id: revisionId,
    projectId: id,
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
});

const renderProjects = (path = '/studio/projects') => {
  mockApiServer.use(
    http.get('*/api/projects/:projectId/history', () =>
      HttpResponse.json({ revisions: [], nextCursor: null }),
    ),
    http.get('*/api/projects/:projectId/outputs', () =>
      HttpResponse.json({ outputs: [], nextCursor: null }),
    ),
    http.get('*/api/projects/:projectId/processing/history', () =>
      HttpResponse.json({ attempts: [], nextCursor: null }),
    ),
  );
  const router = createMemoryRouter(
    [{ path: '/studio/projects/*', element: <ProjectRouteSurface /> }],
    { initialEntries: [path] },
  );
  const view = render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <RouterProvider router={router} />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );
  return { ...view, router };
};

const installProjectLists = (
  active: ProjectCurrentResponse['project'][] = [currentProject(activeId).project],
  archived: ProjectCurrentResponse['project'][] = [currentProject(archivedId).project],
) => {
  mockApiServer.use(
    http.get('*/api/projects', ({ request }) => {
      const lifecycle = new URL(request.url).searchParams.get('lifecycle');
      return HttpResponse.json({
        projects: lifecycle === 'archived' ? archived : active,
        nextCursor: null,
      });
    }),
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Project route surface', () => {
  it('renders bounded active/archived summaries and opens server-owned empty detail', async () => {
    installProjectLists();
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(currentProject(activeId))),
    );
    const { router } = renderProjects();

    expect(await screen.findByRole('heading', { name: 'Active Projects' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Archived' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Launch cut' })).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Archived concept' })).toBeVisible();
    expect(screen.queryByText('No source yet')).not.toBeInTheDocument();

    const activeList = screen.getByRole('list', { name: 'Active Projects' });
    await userEvent.click(within(activeList).getByRole('button', { name: 'Open' }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/studio/projects/${activeId}`),
    );
    expect(await screen.findByRole('heading', { name: 'No source yet' })).toBeVisible();
    expect(screen.getByText('All changes saved').closest('[role="status"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Upload' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Use Saved Video' })).toBeDisabled();
    expect(screen.queryByRole('video')).not.toBeInTheDocument();
  });

  it('reuses the Quick Start operation key after response failure and reconciles replay', async () => {
    installProjectLists([], []);
    const created = currentProject(activeId, { title: 'Untitled Project' });
    const operationKeys: string[] = [];
    let attempts = 0;
    mockApiServer.use(
      http.post('*/api/projects', ({ request }) => {
        operationKeys.push(request.headers.get('idempotency-key') ?? '');
        attempts += 1;
        return attempts === 1 ? HttpResponse.error() : HttpResponse.json(created, { status: 201 });
      }),
      http.get(`*/api/projects/${activeId}`, () => HttpResponse.json(created)),
    );
    const { router } = renderProjects();
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Quick Start' }));
    expect(await screen.findByText('Project not created')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Retry Quick Start' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/studio/projects/${activeId}`),
    );
    expect(operationKeys).toHaveLength(2);
    expect(operationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(operationKeys[1]).toBe(operationKeys[0]);
    expect(await screen.findByRole('heading', { name: 'Untitled Project' })).toBeVisible();
  });

  it('loads the next bounded page only after an explicit pagination action', async () => {
    mockApiServer.use(
      http.get('*/api/projects', ({ request }) => {
        const url = new URL(request.url);
        if (url.searchParams.get('lifecycle') === 'archived') {
          return HttpResponse.json({ projects: [], nextCursor: null });
        }
        if (url.searchParams.get('cursor') === 'active-next') {
          return HttpResponse.json({
            projects: [currentProject(secondActiveId, { title: 'Second page' }).project],
            nextCursor: null,
          });
        }
        return HttpResponse.json({
          projects: [currentProject(activeId).project],
          nextCursor: 'active-next',
        });
      }),
    );
    const user = userEvent.setup();
    renderProjects();

    expect(await screen.findByRole('heading', { name: 'Launch cut' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Second page' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Load more active Projects' }));
    expect(await screen.findByRole('heading', { name: 'Second page' })).toBeVisible();
  });

  it('shows a safe list error and retries the failed lifecycle independently', async () => {
    let activeReads = 0;
    mockApiServer.use(
      http.get('*/api/projects', ({ request }) => {
        if (new URL(request.url).searchParams.get('lifecycle') === 'archived') {
          return HttpResponse.json({ projects: [], nextCursor: null });
        }
        activeReads += 1;
        return activeReads === 1
          ? HttpResponse.json(
              { error: { code: 'feature_unavailable', message: 'Projects are starting.' } },
              { status: 503 },
            )
          : HttpResponse.json({ projects: [currentProject(activeId).project], nextCursor: null });
      }),
    );
    const user = userEvent.setup();
    renderProjects();

    const error = await screen.findByRole('alert');
    expect(error).toHaveTextContent('Projects are starting.');
    await user.click(within(error).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Launch cut' })).toBeVisible();
  });

  it('archives and restores through confirmation, CAS, cache invalidation, and announcements', async () => {
    let active = [currentProject(activeId).project];
    let archived: ProjectCurrentResponse['project'][] = [];
    mockApiServer.use(
      http.get('*/api/projects', ({ request }) =>
        HttpResponse.json({
          projects:
            new URL(request.url).searchParams.get('lifecycle') === 'archived' ? archived : active,
          nextCursor: null,
        }),
      ),
      http.post(`*/api/projects/${activeId}/archive`, async ({ request }) => {
        expect(await request.json()).toEqual({ expectedVersion: 1 });
        const current = currentProject(activeId, {
          status: 'archived',
          version: 2,
          archivedAt: now,
        });
        active = [];
        archived = [current.project];
        return HttpResponse.json(current);
      }),
      http.post(`*/api/projects/${activeId}/restore`, async ({ request }) => {
        expect(await request.json()).toEqual({ expectedVersion: 2 });
        const current = currentProject(activeId, { status: 'draft', version: 3, archivedAt: null });
        active = [current.project];
        archived = [];
        return HttpResponse.json(current);
      }),
    );
    const user = userEvent.setup();
    renderProjects();

    const activeList = await screen.findByRole('list', { name: 'Active Projects' });
    await user.click(within(activeList).getByRole('button', { name: 'Archive' }));
    const archiveDialog = screen.getByRole('dialog', { name: 'Archive Project' });
    await user.click(within(archiveDialog).getByRole('button', { name: 'Archive Project' }));
    expect(await screen.findByText('Launch cut archived.')).toBeVisible();
    const archivedList = await screen.findByRole('list', { name: 'Archived Projects' });

    await user.click(within(archivedList).getByRole('button', { name: 'Restore' }));
    const restoreDialog = screen.getByRole('dialog', { name: 'Restore Project' });
    await user.click(within(restoreDialog).getByRole('button', { name: 'Restore Project' }));
    expect(await screen.findByText('Launch cut restored.')).toBeVisible();
    expect(await screen.findByRole('list', { name: 'Active Projects' })).toHaveTextContent(
      'Launch cut',
    );
  });

  it('preserves a proposed rename across stale CAS and requires explicit reload/retry', async () => {
    const initial = currentProject(activeId);
    const latest = currentProject(activeId, { title: 'Server title', version: 2 });
    const renamed = currentProject(activeId, { title: 'Proposed title', version: 3 });
    let detailReads = 0;
    let renameWrites = 0;
    mockApiServer.use(
      http.get(`*/api/projects/${activeId}`, () => {
        detailReads += 1;
        return HttpResponse.json(detailReads === 1 ? initial : latest);
      }),
      http.patch(`*/api/projects/${activeId}`, async ({ request }) => {
        renameWrites += 1;
        const body = (await request.json()) as { title: string; expectedVersion: number };
        if (renameWrites === 1) {
          return HttpResponse.json(
            {
              error: { code: 'conflict', message: 'The Project changed. Refresh it.' },
              conflict: {
                kind: 'project-version',
                projectId: activeId,
                expectedVersion: body.expectedVersion,
                actualVersion: 2,
              },
            },
            { status: 409 },
          );
        }
        expect(body).toEqual({ title: 'Proposed title', expectedVersion: 2 });
        return HttpResponse.json(renamed);
      }),
    );
    renderProjects(`/studio/projects/${activeId}`);
    const user = userEvent.setup();

    const renameTrigger = await screen.findByRole('button', { name: 'Rename' });
    await user.click(renameTrigger);
    const dialog = screen.getByRole('dialog', { name: 'Rename Project' });
    const input = within(dialog).getByRole('textbox', { name: /Project name/u });
    await user.clear(input);
    await user.type(input, 'Proposed title');
    await user.click(within(dialog).getByRole('button', { name: 'Rename Project' }));

    expect(await within(dialog).findByText(/Your proposed name is still here/u)).toBeVisible();
    expect(input).toHaveValue('Proposed title');
    await user.click(within(dialog).getByRole('button', { name: 'Reload and retry rename' }));

    expect(await screen.findByRole('heading', { name: 'Proposed title' })).toBeVisible();
    await waitFor(() => expect(renameTrigger).toHaveFocus());
    expect(screen.getByText('Project renamed to Proposed title.')).toBeVisible();
    expect(renameWrites).toBe(2);
  });
});
