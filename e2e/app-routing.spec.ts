import { expect, test, type Page } from '@playwright/test';
import {
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  readBrowserState,
  startLocalPreview,
} from './support/studioHarness';
import { ENTRY_PATH, STUDIO_PATH } from './support/studioRoutes';
import { installProjectHarness, TEST_PROJECT_ID } from './support/projectHarness';
import { installCampaignHarness, TEST_CAMPAIGN_ID } from './support/campaignHarness';

const loginFromEntry = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Log in' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log in to Lightframe' });
  await expect(dialog.getByLabel('Login')).toHaveValue('demo@lightframe.local');
  await expect(dialog.getByLabel('Password')).toHaveValue('lightframe-demo');
  await dialog.getByRole('button', { name: 'Log in' }).click();
};

test('entry stays provider-free and Login opens a focused Studio runtime', async ({ page }) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto(ENTRY_PATH);

  await expect(page).toHaveTitle('Enter Lightframe Studio');
  await expect(page.getByRole('heading', { name: 'Enter Lightframe Studio' })).toBeAttached();
  const enter = page.getByRole('button', { name: 'Log in' });
  await expect(enter).toBeVisible();
  await expect(page.getByLabel('Studio media stage')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  expect(network.apiRequests).toEqual([]);
  expectNoExternalProviderTraffic(network);
  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({
      cameraCalls: 0,
      requirementModels: [],
      connections: [],
      recorderStarts: 0,
    });

  await loginFromEntry(page);
  await expect(page).toHaveURL(new RegExp(`${STUDIO_PATH}$`, 'u'));
  await expect(page).toHaveTitle('Lightframe Studio');
  await expect(page.locator('#studio-main')).toBeFocused();
  await expect(page.getByLabel('Studio media stage')).toBeVisible();
});

test('Back and Forward restore focus at each application boundary', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(ENTRY_PATH);
  await loginFromEntry(page);
  await expect(page.locator('#studio-main')).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('button', { name: 'Enter Studio' })).toBeFocused();

  await page.goForward();
  await expect(page).toHaveURL(/\/studio$/u);
  await expect(page.locator('#studio-main')).toBeFocused();
});

test('direct and refreshed Studio entries preserve one stage', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(STUDIO_PATH);
  await expect(page.getByLabel('Studio media stage')).toHaveCount(1);

  await page.reload();
  await expect(page).toHaveURL(/\/studio$/u);
  await expect(page.getByLabel('Studio media stage')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Record New Video' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload Video' })).toBeVisible();
  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({ cameraCalls: 0, requirementModels: [], connections: [] });
});

test('saved video, character, and outfit routes preserve the shared Studio stage', async ({
  page,
}) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(STUDIO_PATH);
  const stageVideo = page.getByLabel('Studio media stage').locator('video');
  await stageVideo.evaluate((video) => {
    (window as typeof window & { __sharedLibraryStage?: HTMLVideoElement }).__sharedLibraryStage =
      video as HTMLVideoElement;
  });

  for (const library of [
    { label: 'Saved Videos', path: '/studio/videos', empty: 'No saved videos yet' },
    { label: 'Saved Characters', path: '/studio/characters', empty: 'No saved characters yet' },
    { label: 'Saved Outfits', path: '/studio/outfits', empty: 'No saved outfits yet' },
  ]) {
    await page.getByRole('button', { name: 'Lightframe Demo account menu' }).click();
    await page.getByRole('menuitem', { name: library.label }).click();
    await expect(page).toHaveURL(new RegExp(`${library.path}$`, 'u'));
    const dialog = page.getByRole('dialog', { name: library.label });
    await expect(dialog.getByRole('heading', { name: library.empty })).toBeVisible();
    if (library.path === '/studio/characters') {
      await expect(dialog.getByRole('button', { name: 'Create new character' })).toBeVisible();
    }
    expect(
      await stageVideo.evaluate(
        (video) =>
          (window as typeof window & { __sharedLibraryStage?: HTMLVideoElement })
            .__sharedLibraryStage === video,
      ),
    ).toBe(true);
    await dialog.getByRole('button', { name: 'Close panel' }).click();
    await expect(page).toHaveURL(/\/studio$/u);
  }
});

test('Projects Quick Start, lifecycle, refresh, and explicit library exit stay in one Studio shell', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  const projects = await installProjectHarness(page);
  await page.goto('/studio/projects');

  await expect(page).toHaveTitle('Projects · Lightframe Studio');
  await expect(page.getByText('No active Projects yet', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Studio media stage')).toHaveCount(1);
  await expect(page.getByLabel('Studio media stage')).toBeHidden();
  await page.getByRole('button', { name: 'Quick Start' }).click();

  await expect(page).toHaveURL(new RegExp(`/studio/projects/${TEST_PROJECT_ID}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'No source yet' })).toBeVisible();
  expect(projects.operationKeys).toHaveLength(1);
  expect(projects.operationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({ cameraCalls: 0, requirementModels: [], connections: [], recorderStarts: 0 });

  await page.getByRole('button', { name: 'Rename' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename Project' });
  await rename.getByRole('textbox', { name: /Project name/u }).fill('Launch edit');
  await rename.getByRole('button', { name: 'Rename Project' }).click();
  await expect(page.getByRole('heading', { name: 'Launch edit' })).toBeVisible();

  await page.getByRole('button', { name: 'Archive' }).click();
  await page
    .getByRole('dialog', { name: 'Archive Project' })
    .getByRole('button', { name: 'Archive Project' })
    .click();
  await expect(page.getByText('Archived', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Launch edit' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page
    .getByRole('dialog', { name: 'Restore Project' })
    .getByRole('button', { name: 'Restore Project' })
    .click();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Lightframe Demo account menu' }).click();
  await expect(page.getByText('Global libraries · exits Project')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Saved Videos (exits Project)' }).click();
  await expect(page).toHaveURL(/\/studio\/videos$/u);
  await page.reload();
  await expect(page).toHaveURL(/\/studio\/videos$/u);
  await expect(page.getByRole('dialog', { name: 'Saved Videos' })).toBeVisible();
  expectNoExternalProviderTraffic(network);
});

test('Campaign creation reaches a Campaign Project without activating media or providers', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  const campaigns = await installCampaignHarness(page);
  await page.goto('/studio/campaigns');

  await expect(page).toHaveTitle('Campaigns · Lightframe Studio');
  await expect(page.getByText('No Campaigns yet', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Studio media stage')).toBeHidden();
  await page.getByRole('button', { name: 'Create Campaign' }).click();
  const create = page.getByRole('dialog', { name: 'Create Campaign' });
  await create.getByRole('textbox', { name: /Campaign name/u }).fill('Summer launch');
  await create.getByRole('textbox', { name: /Brief/u }).fill('Keep the launch focused.');
  await create.getByRole('button', { name: 'Create Campaign' }).click();

  await expect(page).toHaveURL(new RegExp(`/studio/campaigns/${TEST_CAMPAIGN_ID}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'Summer launch' })).toBeVisible();
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(page).toHaveURL(new RegExp(`/studio/projects/${TEST_PROJECT_ID}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'No source yet' })).toBeVisible();
  expect(campaigns.campaignOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  expect(campaigns.projectOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({ cameraCalls: 0, requirementModels: [], connections: [], recorderStarts: 0 });
  expectNoExternalProviderTraffic(network);
});

test('a protected Project deep link returns to the same URL after login', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await installProjectHarness(page, true);
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'authentication_required', message: 'Sign in to continue.' },
      }),
    });
  });
  await page.goto(`/studio/projects/${TEST_PROJECT_ID}`);

  const login = page.getByRole('dialog', { name: 'Log in to Lightframe' });
  await expect(login).toBeVisible();
  await login.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(new RegExp(`/studio/projects/${TEST_PROJECT_ID}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'No source yet' })).toBeVisible();
});

test('recording and temporary-take work cannot be lost silently through Back', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(ENTRY_PATH);
  await loginFromEntry(page);
  await startLocalPreview(page);
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/studio$/u);
  await expect(page.getByRole('dialog', { name: 'Finish the take before leaving' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay in Studio' }).click();
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();

  await page.goBack();
  const discard = page.getByRole('dialog', { name: 'Discard temporary work and leave?' });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Discard and leave' }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('button', { name: 'Enter Studio' })).toBeVisible();
});
