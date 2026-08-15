import type { CampaignContract, ProjectCurrentResponse } from '@studio/contracts';
import type { Page } from '@playwright/test';
import { emptyProjectFixture, TEST_PROJECT_ID } from './projectHarness';

export const TEST_CAMPAIGN_ID = '20ce94fa-15d1-42c6-abd3-77ff61516b48';
const CAMPAIGN_TIMESTAMP = '2030-01-01T00:00:00.000Z';

export const campaignFixture = (overrides: Partial<CampaignContract> = {}): CampaignContract => ({
  id: TEST_CAMPAIGN_ID,
  name: 'Summer launch',
  brief: 'Keep the launch focused.',
  status: 'active',
  version: 1,
  archivedAt: null,
  deletedAt: null,
  createdAt: CAMPAIGN_TIMESTAMP,
  updatedAt: CAMPAIGN_TIMESTAMP,
  ...overrides,
});

export const installCampaignHarness = async (page: Page, seed = false) => {
  let currentCampaign: CampaignContract | null = seed ? campaignFixture() : null;
  let currentProject: ProjectCurrentResponse | null = null;
  const campaignOperationKeys: string[] = [];
  const projectOperationKeys: string[] = [];
  const lifecycleRequests: Array<{
    readonly action: 'archive' | 'restore';
    readonly expectedVersion: number;
  }> = [];

  await page.route('**/api/campaigns**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === '/api/campaigns' && method === 'GET') {
      const lifecycle = url.searchParams.get('lifecycle');
      const campaigns =
        currentCampaign && currentCampaign.status === lifecycle ? [currentCampaign] : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ campaigns, nextCursor: null }),
      });
      return;
    }
    if (url.pathname === '/api/campaigns' && method === 'POST') {
      campaignOperationKeys.push(request.headers()['idempotency-key'] ?? '');
      const body = request.postDataJSON() as { name: string; brief: string | null };
      currentCampaign = campaignFixture({ name: body.name, brief: body.brief });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(currentCampaign),
      });
      return;
    }
    if (
      currentCampaign &&
      url.pathname === `/api/campaigns/${TEST_CAMPAIGN_ID}` &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentCampaign),
      });
      return;
    }
    const lifecycle = url.pathname.match(
      new RegExp(`^/api/campaigns/${TEST_CAMPAIGN_ID}/(archive|restore)$`, 'u'),
    )?.[1] as 'archive' | 'restore' | undefined;
    if (currentCampaign && lifecycle && method === 'POST') {
      const body = request.postDataJSON() as { expectedVersion: number };
      lifecycleRequests.push({ action: lifecycle, expectedVersion: body.expectedVersion });
      currentCampaign = {
        ...currentCampaign,
        status: lifecycle === 'archive' ? 'archived' : 'active',
        version: currentCampaign.version + 1,
        archivedAt: lifecycle === 'archive' ? '2030-01-01T00:20:00.000Z' : null,
        updatedAt: '2030-01-01T00:20:00.000Z',
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentCampaign),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'Campaign unavailable.' } }),
    });
  });

  await page.route('**/api/projects**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (url.pathname === '/api/projects' && method === 'GET') {
      const lifecycle = url.searchParams.get('lifecycle');
      const projects =
        currentProject &&
        (currentProject.project.archivedAt === null ? 'active' : 'archived') === lifecycle &&
        (url.searchParams.get('campaignId') === null ||
          url.searchParams.get('campaignId') === currentProject.project.campaignId)
          ? [currentProject.project]
          : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects, nextCursor: null }),
      });
      return;
    }
    if (url.pathname === '/api/projects' && method === 'POST') {
      projectOperationKeys.push(request.headers()['idempotency-key'] ?? '');
      const body = request.postDataJSON() as { campaignId: string | null; title?: string };
      const empty = emptyProjectFixture();
      currentProject = {
        ...empty,
        project: {
          ...empty.project,
          campaignId: body.campaignId,
          title: body.title ?? empty.project.title,
        },
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(currentProject),
      });
      return;
    }
    if (currentProject && url.pathname === `/api/projects/${TEST_PROJECT_ID}` && method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(currentProject),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'Project unavailable.' } }),
    });
  });

  return { campaignOperationKeys, projectOperationKeys, lifecycleRequests };
};
