import { expect, test } from '@playwright/test';
import {
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  readBrowserState,
  startLocalPreview,
} from './support/studioHarness';
import { ENTRY_PATH, STUDIO_PATH } from './support/studioRoutes';
import { STUDIO_VIEWPORT_SIZES } from './support/studioViewports';

test('entry stays provider-free and Enter pushes a focused Studio runtime', async ({ page }) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto(ENTRY_PATH);

  await expect(page).toHaveTitle('Enter Lightframe Studio');
  await expect(page.getByRole('heading', { name: 'Enter Lightframe Studio' })).toBeAttached();
  const enter = page.getByRole('button', { name: 'Enter' });
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

  await enter.click();
  await expect(page).toHaveURL(new RegExp(`${STUDIO_PATH}$`, 'u'));
  await expect(page).toHaveTitle('Lightframe Studio');
  await expect(page.locator('#studio-main')).toBeFocused();
  await expect(page.getByLabel('Studio media stage')).toBeVisible();
});

test('Back and Forward restore focus at each application boundary', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(ENTRY_PATH);
  await page.getByRole('button', { name: 'Enter' }).click();
  await expect(page.locator('#studio-main')).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('button', { name: 'Enter' })).toBeFocused();

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
  await expect(page.getByRole('button', { name: 'Start Camera + Mic' })).toBeVisible();
});

test('noncanonical paths return to entry without mounting Studio', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  for (const path of [
    '/advanced',
    '/guided',
    '/projects?project=project-42',
    '/arbitrary-path?project=project-42',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/u);
    await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible();
    await expect(page.getByLabel('Studio media stage')).toHaveCount(0);
  }
});

test('recording and temporary-take work cannot be lost silently through Back', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(ENTRY_PATH);
  await page.getByRole('button', { name: 'Enter' }).click();
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
  await expect(page.getByRole('button', { name: 'Enter' })).toBeVisible();
});

for (const [name, viewport] of Object.entries(STUDIO_VIEWPORT_SIZES)) {
  test(`entry remains contained at ${name}`, async ({ page }) => {
    await installSuccessfulStudioHarness(page);
    await page.setViewportSize(viewport);
    await page.goto(ENTRY_PATH);
    if (name === 'smallMobile') {
      await page.evaluate(() => {
        document.documentElement.style.fontSize = '200%';
      });
    }

    await expect(page.getByRole('button', { name: 'Enter' })).toBeInViewport();
    await expectNoDocumentOverflow(page);
  });
}
