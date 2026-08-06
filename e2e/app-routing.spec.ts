import { expect, test, type Page } from '@playwright/test';
import {
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  readBrowserState,
  startLocalPreview,
} from './support/studioHarness';
import { ENTRY_PATH, STUDIO_PATH } from './support/studioRoutes';

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
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
    await expect(page.getByLabel('Studio media stage')).toHaveCount(0);
  }
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
