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
const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
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

const renderCampaigns = (path = '/studio/campaigns') => {
  const router = createMemoryRouter(
    [{ path: '/studio/campaigns/*', element: <CampaignRouteSurface /> }],
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

const installEmptyProjects = () => {
  mockApiServer.use(
    http.get('*/api/projects', () => HttpResponse.json({ projects: [], nextCursor: null })),
  );
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
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

    await waitFor(() =>
      expect(router.state.location.pathname).toBe(`/studio/campaigns/${campaignId}`),
    );
    expect(await screen.findByRole('heading', { name: 'Summer launch' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'New Project' }));
    await waitFor(() =>
      expect(projectCreateBody).toEqual({ title: 'Untitled Project', campaignId }),
    );
    expect(router.state.location.pathname).toBe(`/studio/projects/${projectId}`);
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
    renderCampaigns(`/studio/campaigns/${campaignId}`);

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
    renderCampaigns(`/studio/campaigns/${campaignId}`);

    await user.click(await screen.findByRole('button', { name: 'Delete Campaign' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete Campaign' });
    await user.click(within(dialog).getByRole('button', { name: 'Confirm Delete Campaign' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Move or detach every active and archived Project before deleting this Campaign.',
    );
    expect(screen.getByText('Launch cut')).toBeInTheDocument();
  });
});
