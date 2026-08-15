// @vitest-environment jsdom

import type { CampaignContract, ProjectCurrentResponse } from '@studio/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { CampaignRouteSurface } from './CampaignRouteSurface';

const campaignId = '20ce94fa-15d1-42c6-abd3-77ff61516b48';
const secondCampaignId = '312490eb-3e08-4f89-9246-fb2e917063ce';
const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const secondProjectId = '4597a4ef-5c75-4a4b-869a-a88d515c218f';
const revisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const now = '2026-08-11T16:00:00.000Z';

const campaign = (overrides: Partial<CampaignContract> = {}): CampaignContract => ({
  id: campaignId,
  name: 'Summer launch',
  brief: 'Keep the launch focused.',
  status: 'active',
  version: 1,
  archivedAt: null,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
  ...overrides,
});

const currentProject = (
  overrides: Partial<ProjectCurrentResponse['project']> = {},
): ProjectCurrentResponse => ({
  project: {
    id: projectId,
    campaignId,
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
});

const renderCampaigns = (path = '/campaign', previousPath?: string) => {
  const router = createMemoryRouter(
    [
      { path: '/campaign/*', element: <CampaignRouteSurface /> },
      { path: '/projects/:projectId', element: <div>Project route</div> },
      { path: '/dashboard', element: <div>Dashboard previous</div> },
    ],
    { initialEntries: previousPath ? [previousPath, path] : [path] },
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

const installEmptyProjects = () => {
  mockApiServer.use(
    http.get('*/api/projects', () => HttpResponse.json({ projects: [], nextCursor: null })),
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.history.replaceState({ idx: 0 }, '');
});

describe('Campaign route surface', () => {
  it('creates a lightweight Campaign and creates its first Project in place', async () => {
    let created = false;
    let projectCreateBody: unknown;
    mockApiServer.use(
      http.get('*/api/campaigns', ({ request }) => {
        const lifecycle = new URL(request.url).searchParams.get('lifecycle');
        return HttpResponse.json({
          campaigns: created && lifecycle === 'active' ? [campaign()] : [],
          nextCursor: null,
        });
      }),
      http.post('*/api/campaigns', async ({ request }) => {
        expect(request.headers.get('idempotency-key')).toMatch(/^[0-9a-f-]{36}$/u);
        expect(await request.json()).toEqual({
          name: 'Summer launch',
          brief: 'Keep the launch focused.',
        });
        created = true;
        return HttpResponse.json(campaign(), { status: 201 });
      }),
      http.get(`*/api/campaigns/${campaignId}`, () => HttpResponse.json(campaign())),
      http.post('*/api/projects', async ({ request }) => {
        projectCreateBody = await request.json();
        return HttpResponse.json(currentProject(), { status: 201 });
      }),
    );
    installEmptyProjects();
    const user = userEvent.setup();
    const { router } = renderCampaigns();

    await user.click(await screen.findByRole('button', { name: 'Create Campaign' }));
    const dialog = screen.getByRole('dialog', { name: 'Create Campaign' });
    await user.type(
      within(dialog).getByRole('textbox', { name: /Campaign name/u }),
      'Summer launch',
    );
    await user.type(
      within(dialog).getByRole('textbox', { name: /Brief/u }),
      'Keep the launch focused.',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Create Campaign' }));

    await waitFor(() => expect(router.state.location.pathname).toBe(`/campaign/${campaignId}`));
    expect(await screen.findByRole('heading', { name: 'Summer launch' })).toBeVisible();
    expect(await screen.findByText('Campaign created')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create Project in Campaign' }));
    const projectDialog = screen.getByRole('dialog', { name: 'New Project' });
    await user.type(
      within(projectDialog).getByRole('textbox', { name: /Project name/u }),
      'Launch cut',
    );
    expect(within(projectDialog).getByRole('combobox', { name: 'Campaign' })).toBeDisabled();
    await user.click(within(projectDialog).getByRole('button', { name: 'Create Project' }));
    await waitFor(() => expect(projectCreateBody).toEqual({ title: 'Launch cut', campaignId }));
    expect(router.state.location.pathname).toBe(`/projects/${projectId}`);
  });

  it('paginates Campaigns and opens the exact organizer selected from the list', async () => {
    const secondCampaign = campaign({
      id: secondCampaignId,
      name: 'Winter launch',
      brief: null,
    });
    const archivedCampaign = campaign({
      id: 'a5b99ce5-dd77-4d4f-af03-2d08d46e6ed9',
      name: 'Spring archive',
      status: 'archived',
      version: 2,
      archivedAt: now,
    });
    const activeCursors: Array<string | null> = [];
    mockApiServer.use(
      http.get('*/api/campaigns', ({ request }) => {
        const url = new URL(request.url);
        const lifecycle = url.searchParams.get('lifecycle');
        const cursor = url.searchParams.get('cursor');
        if (lifecycle === 'archived') {
          return HttpResponse.json({ campaigns: [archivedCampaign], nextCursor: null });
        }
        activeCursors.push(cursor);
        return cursor === 'active-next'
          ? HttpResponse.json({ campaigns: [secondCampaign], nextCursor: null })
          : HttpResponse.json({ campaigns: [campaign()], nextCursor: 'active-next' });
      }),
      http.get(`*/api/campaigns/${secondCampaignId}`, () => HttpResponse.json(secondCampaign)),
    );
    installEmptyProjects();
    const user = userEvent.setup();
    const { router } = renderCampaigns();

    expect(await screen.findByRole('list', { name: 'Active Campaigns' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Archived Campaigns' })).toHaveTextContent(
      'Spring archive',
    );
    await user.click(screen.getByRole('button', { name: 'Load more active Campaigns' }));
    expect(await screen.findByText('Winter launch')).toBeVisible();
    expect(activeCursors).toEqual([null, 'active-next']);

    const winterCard = screen.getByText('Winter launch').closest('article');
    expect(winterCard).not.toBeNull();
    await user.click(within(winterCard!).getByRole('button', { name: 'Open' }));

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/campaign/${secondCampaignId}`),
    );
    expect(await screen.findByRole('heading', { name: 'Winter launch' })).toBeVisible();
    expect(screen.getByText('No brief yet.')).toBeVisible();
  });

  it('deletes the selected archived Campaign directly from its list', async () => {
    let archived = [
      campaign({ name: 'Archived organizer', status: 'archived', version: 2, archivedAt: now }),
    ];
    let requestBody: unknown;
    mockApiServer.use(
      http.get('*/api/campaigns', ({ request }) =>
        HttpResponse.json({
          campaigns:
            new URL(request.url).searchParams.get('lifecycle') === 'archived' ? archived : [],
          nextCursor: null,
        }),
      ),
      http.post(`*/api/campaigns/${campaignId}/tombstone`, async ({ request }) => {
        requestBody = await request.json();
        archived = [];
        return HttpResponse.json(
          campaign({ status: 'deleted', version: 3, archivedAt: now, deletedAt: now }),
        );
      }),
    );
    const user = userEvent.setup();
    renderCampaigns();

    const archivedList = await screen.findByRole('list', { name: 'Archived Campaigns' });
    await user.click(within(archivedList).getByRole('button', { name: 'Delete' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Campaign' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirm Delete Campaign' }));

    expect(requestBody).toEqual({ expectedVersion: 2, confirmation: 'tombstone' });
    expect(await screen.findByText('Archived organizer deleted.')).toBeVisible();
    expect(await screen.findByText('No archived Campaigns')).toBeVisible();
  });

  it('retries an unavailable Campaign list and lets creation be cancelled safely', async () => {
    let activeAttempts = 0;
    mockApiServer.use(
      http.get('*/api/campaigns', ({ request }) => {
        const lifecycle = new URL(request.url).searchParams.get('lifecycle');
        if (lifecycle === 'active' && activeAttempts++ === 0) {
          return HttpResponse.json(
            { error: { code: 'unavailable', message: 'internal details' } },
            { status: 503 },
          );
        }
        return HttpResponse.json({ campaigns: [], nextCursor: null });
      }),
    );
    const user = userEvent.setup();
    renderCampaigns();

    const unavailable = await screen.findByRole('alert');
    expect(unavailable).toHaveTextContent('Campaigns unavailable');
    expect(unavailable).not.toHaveTextContent('internal details');
    await user.click(within(unavailable).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No Campaigns yet')).toBeVisible();

    const create = screen.getByRole('button', { name: 'Create Campaign' });
    await user.click(create);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Create Campaign' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(screen.queryByRole('dialog', { name: 'Create Campaign' })).not.toBeInTheDocument();
    expect(create).toHaveFocus();
  });

  it('returns from a safely normalized Campaign detail failure', async () => {
    mockApiServer.use(
      http.get(`*/api/campaigns/${campaignId}`, () =>
        HttpResponse.json(
          { error: { code: 'unavailable', message: 'provider body must stay private' } },
          { status: 503 },
        ),
      ),
      http.get('*/api/campaigns', () => HttpResponse.json({ campaigns: [], nextCursor: null })),
    );
    const user = userEvent.setup();
    const { router } = renderCampaigns(`/campaign/${campaignId}`);

    const unavailable = await screen.findByRole('alert');
    expect(unavailable).toHaveTextContent('Campaign unavailable');
    expect(unavailable).not.toHaveTextContent('provider body must stay private');
    await user.click(within(unavailable).getByRole('button', { name: 'Back to Campaigns' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/campaign'));
    expect(await screen.findByRole('heading', { name: 'Campaigns' })).toBeVisible();
  });

  it('edits Campaign identity while preserving cancellation and focus behavior', async () => {
    let detail = campaign();
    let editBody: unknown;
    mockApiServer.use(
      http.get(`*/api/campaigns/${campaignId}`, () => HttpResponse.json(detail)),
      http.get('*/api/projects', () => HttpResponse.json({ projects: [], nextCursor: null })),
      http.get('*/api/campaigns', () => HttpResponse.json({ campaigns: [], nextCursor: null })),
      http.patch(`*/api/campaigns/${campaignId}`, async ({ request }) => {
        editBody = await request.json();
        detail = campaign({ name: 'Summer launch revised', brief: null, version: 2 });
        return HttpResponse.json(detail);
      }),
    );
    const user = userEvent.setup();
    renderCampaigns(`/campaign/${campaignId}`);

    const edit = await screen.findByRole('button', { name: 'Edit' });
    await user.click(edit);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Edit Campaign' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    expect(edit).toHaveFocus();

    await user.click(edit);
    const dialog = screen.getByRole('dialog', { name: 'Edit Campaign' });
    const name = within(dialog).getByRole('textbox', { name: /Campaign name/u });
    const brief = within(dialog).getByRole('textbox', { name: /Brief/u });
    await user.clear(name);
    await user.type(name, 'Summer launch revised');
    await user.clear(brief);
    await user.click(within(dialog).getByRole('button', { name: 'Save Campaign' }));

    expect(editBody).toEqual({
      name: 'Summer launch revised',
      brief: null,
      expectedVersion: 1,
    });
    expect(await screen.findByText('Summer launch revised updated.')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Summer launch revised' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: '← All Campaigns' }));
    expect(await screen.findByRole('heading', { name: 'Campaigns' })).toBeVisible();
  });

  it('uses the actual prior route for Back instead of the Campaign list', async () => {
    mockApiServer.use(
      http.get(`*/api/campaigns/${campaignId}`, () => HttpResponse.json(campaign())),
    );
    installEmptyProjects();
    window.history.replaceState({ idx: 1 }, '');
    const { router } = renderCampaigns(`/campaign/${campaignId}`, '/dashboard');

    await userEvent.click(await screen.findByRole('button', { name: '← All Campaigns' }));

    await waitFor(() => expect(router.state.location.pathname).toBe('/dashboard'));
    expect(screen.getByText('Dashboard previous')).toBeVisible();
  });

  it('shows a recoverable New Project error without exposing an upstream body', async () => {
    mockApiServer.use(
      http.get(`*/api/campaigns/${campaignId}`, () => HttpResponse.json(campaign())),
      http.get('*/api/campaigns', () =>
        HttpResponse.json({ campaigns: [campaign()], nextCursor: null }),
      ),
      http.get('*/api/projects', () => HttpResponse.json({ projects: [], nextCursor: null })),
      http.post('*/api/projects', () =>
        HttpResponse.json(
          { error: { code: 'unavailable', message: 'upstream project failure' } },
          { status: 503 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderCampaigns(`/campaign/${campaignId}`);

    await user.click(await screen.findByRole('button', { name: 'New Project' }));
    const dialog = screen.getByRole('dialog', { name: 'New Project' });
    await user.type(within(dialog).getByRole('textbox', { name: /Project name/u }), 'Retry cut');
    await user.click(within(dialog).getByRole('button', { name: 'Create Project' }));

    const error = await within(dialog).findByRole('alert');
    expect(error).toHaveTextContent('The request could not be completed.');
    expect(error).not.toHaveTextContent('upstream project failure');
  });

  it('paginates Campaign Projects and opens the exact selected Project', async () => {
    const secondProject = currentProject({
      id: secondProjectId,
      title: 'Launch cut two',
    }).project;
    const activeCursors: Array<string | null> = [];
    mockApiServer.use(
      http.get(`*/api/campaigns/${campaignId}`, () => HttpResponse.json(campaign())),
      http.get('*/api/projects', ({ request }) => {
        const url = new URL(request.url);
        const lifecycle = url.searchParams.get('lifecycle');
        const cursor = url.searchParams.get('cursor');
        if (lifecycle === 'archived') {
          return HttpResponse.json({ projects: [], nextCursor: null });
        }
        activeCursors.push(cursor);
        return cursor === 'project-next'
          ? HttpResponse.json({ projects: [secondProject], nextCursor: null })
          : HttpResponse.json({
              projects: [currentProject().project],
              nextCursor: 'project-next',
            });
      }),
    );
    const user = userEvent.setup();
    const { router } = renderCampaigns(`/campaign/${campaignId}`);

    await user.click(await screen.findByRole('button', { name: 'Load more active Projects' }));
    expect(await screen.findByText('Launch cut two')).toBeVisible();
    expect(activeCursors).toEqual([null, 'project-next']);

    const projectCard = screen.getByText('Launch cut two').closest('article');
    expect(projectCard).not.toBeNull();
    await user.click(within(projectCard!).getByRole('button', { name: 'Open' }));
    expect(router.state.location.pathname).toBe(`/projects/${secondProjectId}`);
  });

  it('moves a Project to a paginated Campaign and retries a normalized failure', async () => {
    const targetCampaign = campaign({
      id: secondCampaignId,
      name: 'Winter launch',
      brief: null,
    });
    let moveAttempts = 0;
    let movedBody: unknown;
    mockApiServer.use(
      http.get(`*/api/campaigns/${campaignId}`, () => HttpResponse.json(campaign())),
      http.get('*/api/projects', ({ request }) => {
        const lifecycle = new URL(request.url).searchParams.get('lifecycle');
        return HttpResponse.json({
          projects: lifecycle === 'active' ? [currentProject().project] : [],
          nextCursor: null,
        });
      }),
      http.get('*/api/campaigns', ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        return cursor === 'campaign-next'
          ? HttpResponse.json({ campaigns: [targetCampaign], nextCursor: null })
          : HttpResponse.json({ campaigns: [campaign()], nextCursor: 'campaign-next' });
      }),
      http.post(`*/api/projects/${projectId}/campaign`, async ({ request }) => {
        movedBody = await request.json();
        moveAttempts += 1;
        if (moveAttempts === 1) {
          return HttpResponse.json(
            { error: { code: 'unavailable', message: 'storage internals' } },
            { status: 503 },
          );
        }
        return HttpResponse.json(currentProject({ campaignId: secondCampaignId, version: 2 }));
      }),
    );
    const user = userEvent.setup();
    renderCampaigns(`/campaign/${campaignId}`);

    const activeProjects = await screen.findByRole('list', {
      name: 'Active Projects in Summer launch',
    });
    await user.click(within(activeProjects).getByRole('button', { name: 'Move or detach' }));
    const dialog = screen.getByRole('dialog', { name: 'Move Project' });
    await user.click(within(dialog).getByRole('button', { name: 'Load more Campaigns' }));
    await user.click(within(dialog).getByRole('combobox', { name: 'New location' }));
    const options = await screen.findByRole('listbox', { name: 'New location' });
    expect(
      within(options).queryByRole('option', { name: 'Summer launch' }),
    ).not.toBeInTheDocument();
    await user.click(
      within(options).getByRole('option', {
        name: 'Winter launch',
      }),
    );

    await user.click(within(dialog).getByRole('button', { name: 'Move Project' }));
    const error = await within(dialog).findByRole('alert');
    expect(error).not.toHaveTextContent('storage internals');
    await user.click(within(dialog).getByRole('button', { name: 'Move Project' }));

    expect(movedBody).toEqual({
      campaignId: secondCampaignId,
      expectedVersion: 1,
    });
    expect(await screen.findByText('Launch cut moved to Winter launch.')).toBeVisible();
    expect(moveAttempts).toBe(2);
  });

  it('moves a Project to the virtual No Campaign group and archives without cascading', async () => {
    let detail = campaign();
    let movedBody: unknown;
    mockApiServer.use(
      http.get(`*/api/campaigns/${campaignId}`, () => HttpResponse.json(detail)),
      http.get('*/api/campaigns', ({ request }) =>
        HttpResponse.json({
          campaigns:
            new URL(request.url).searchParams.get('lifecycle') === 'active' ? [detail] : [],
          nextCursor: null,
        }),
      ),
      http.get('*/api/projects', ({ request }) => {
        const url = new URL(request.url);
        return HttpResponse.json({
          projects:
            url.searchParams.get('lifecycle') === 'active' ? [currentProject().project] : [],
          nextCursor: null,
        });
      }),
      http.post(`*/api/projects/${projectId}/campaign`, async ({ request }) => {
        movedBody = await request.json();
        return HttpResponse.json(currentProject({ campaignId: null, version: 2 }));
      }),
      http.post(`*/api/campaigns/${campaignId}/archive`, async ({ request }) => {
        expect(await request.json()).toEqual({ expectedVersion: 1 });
        detail = campaign({ status: 'archived', version: 2, archivedAt: now });
        return HttpResponse.json(detail);
      }),
    );
    const user = userEvent.setup();
    renderCampaigns(`/campaign/${campaignId}`);

    const activeProjects = await screen.findByRole('list', {
      name: 'Active Projects in Summer launch',
    });
    await user.click(within(activeProjects).getByRole('button', { name: 'Move or detach' }));
    const moveDialog = screen.getByRole('dialog', { name: 'Move Project' });
    await user.click(within(moveDialog).getByRole('button', { name: 'Move Project' }));
    await waitFor(() => expect(movedBody).toEqual({ campaignId: null, expectedVersion: 1 }));
    expect(await screen.findByText('Launch cut moved to No Campaign.')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Archive' }));
    const archiveDialog = screen.getByRole('dialog', { name: 'Archive Campaign' });
    expect(archiveDialog).toHaveTextContent('It does not archive or move Projects.');
    await user.click(within(archiveDialog).getByRole('button', { name: 'Archive Campaign' }));
    expect(
      await screen.findByText('Summer launch archived. Projects remain intact.'),
    ).toBeVisible();
    expect(screen.getByText(/Its Projects remain intact and openable/u)).toBeVisible();
  });

  it('explains why a non-empty archived Campaign cannot be tombstoned', async () => {
    const archived = campaign({ status: 'archived', version: 2, archivedAt: now });
    mockApiServer.use(
      http.get(`*/api/campaigns/${campaignId}`, () => HttpResponse.json(archived)),
      http.get('*/api/projects', ({ request }) =>
        HttpResponse.json({
          projects:
            new URL(request.url).searchParams.get('lifecycle') === 'active'
              ? [currentProject().project]
              : [],
          nextCursor: null,
        }),
      ),
      http.post(`*/api/campaigns/${campaignId}/tombstone`, () =>
        HttpResponse.json(
          {
            error: { code: 'conflict', message: 'Move or detach Projects first.' },
            conflict: { kind: 'campaign-not-empty', campaignId, attachedProjectCount: 1 },
          },
          { status: 409 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderCampaigns(`/campaign/${campaignId}`);

    await user.click(await screen.findByRole('button', { name: 'Delete Campaign' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Campaign' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirm Delete Campaign' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Move or detach every active and archived Project before deleting this Campaign.',
    );
    expect(screen.getByText('Launch cut')).toBeInTheDocument();
  });

  it('retries restore after a safe error and keeps archived Projects independently movable', async () => {
    let detail = campaign({ status: 'archived', version: 2, archivedAt: now });
    let restoreAttempts = 0;
    mockApiServer.use(
      http.get(`*/api/campaigns/${campaignId}`, () => HttpResponse.json(detail)),
      http.get('*/api/campaigns', () => HttpResponse.json({ campaigns: [], nextCursor: null })),
      http.get('*/api/projects', ({ request }) => {
        const lifecycle = new URL(request.url).searchParams.get('lifecycle');
        return HttpResponse.json({
          projects:
            lifecycle === 'archived'
              ? [
                  currentProject({
                    status: 'archived',
                    version: 2,
                    archivedAt: now,
                  }).project,
                ]
              : [],
          nextCursor: null,
        });
      }),
      http.post(`*/api/campaigns/${campaignId}/restore`, async ({ request }) => {
        expect(await request.json()).toEqual({ expectedVersion: 2 });
        restoreAttempts += 1;
        if (restoreAttempts === 1) {
          return HttpResponse.json(
            { error: { code: 'unavailable', message: 'database details' } },
            { status: 503 },
          );
        }
        detail = campaign({ version: 3 });
        return HttpResponse.json(detail);
      }),
    );
    const user = userEvent.setup();
    renderCampaigns(`/campaign/${campaignId}`);

    const archivedProjects = await screen.findByRole('list', {
      name: 'Archived Projects in Summer launch',
    });
    const move = within(archivedProjects).getByRole('button', { name: 'Move or detach' });
    await user.click(move);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Move Project' })).not.toBeInTheDocument();
    expect(move).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Restore' }));
    const restore = screen.getByRole('dialog', { name: 'Restore Campaign' });
    await user.click(within(restore).getByRole('button', { name: 'Restore Campaign' }));
    const error = await within(restore).findByRole('alert');
    expect(error).toHaveTextContent('Change not applied');
    expect(error).not.toHaveTextContent('database details');

    await user.click(within(restore).getByRole('button', { name: 'Restore Campaign' }));
    expect(
      await screen.findByText('Summer launch restored. Projects remain intact.'),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'New Project' })).toBeVisible();
    expect(restoreAttempts).toBe(2);

    const archive = screen.getByRole('button', { name: 'Archive' });
    await user.click(archive);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Archive Campaign' })).not.toBeInTheDocument();
    expect(archive).toHaveFocus();
  });

  it('tombstones only an archived empty Campaign after explicit confirmation', async () => {
    const archived = campaign({ status: 'archived', version: 2, archivedAt: now });
    let tombstoneBody: unknown;
    mockApiServer.use(
      http.get(`*/api/campaigns/${campaignId}`, () => HttpResponse.json(archived)),
      http.get('*/api/projects', () => HttpResponse.json({ projects: [], nextCursor: null })),
      http.get('*/api/campaigns', () => HttpResponse.json({ campaigns: [], nextCursor: null })),
      http.post(`*/api/campaigns/${campaignId}/tombstone`, async ({ request }) => {
        tombstoneBody = await request.json();
        return HttpResponse.json(
          campaign({
            status: 'deleted',
            version: 3,
            archivedAt: now,
            deletedAt: now,
          }),
        );
      }),
    );
    const user = userEvent.setup();
    const { router } = renderCampaigns(`/campaign/${campaignId}`);

    const deleteCampaign = await screen.findByRole('button', { name: 'Delete Campaign' });
    await user.click(deleteCampaign);
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Delete Campaign' })).not.toBeInTheDocument();
    expect(deleteCampaign).toHaveFocus();

    await user.click(deleteCampaign);
    await user.click(
      within(screen.getByRole('dialog', { name: 'Delete Campaign' })).getByRole('button', {
        name: 'Confirm Delete Campaign',
      }),
    );

    await waitFor(() => expect(router.state.location.pathname).toBe('/campaign'));
    expect(tombstoneBody).toEqual({ expectedVersion: 2, confirmation: 'tombstone' });
    expect(await screen.findByRole('heading', { name: 'Campaigns' })).toBeVisible();
  });
});
