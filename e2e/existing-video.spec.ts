import { expect, test, type Page } from '@playwright/test';
import { VIDEO_PROVIDER_INTENT_VALUE } from '@studio/contracts';
import { installFakeVideoJobRoutes, loadH264VideoFixture } from './support/existingVideoHarness';
import { installProviderNetworkDriver } from './support/studioHarness.network';

const installCameraSentinel = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const state = { cameraCalls: 0 };
    Object.defineProperty(window, '__lightframeUploadTestState', {
      configurable: true,
      value: state,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          state.cameraCalls += 1;
          return Promise.reject(new DOMException('Camera use is not expected.', 'NotAllowedError'));
        },
        enumerateDevices: () => Promise.resolve([]),
      },
    });
  });
};

const cameraCalls = (page: Page): Promise<number> =>
  page.evaluate(
    () =>
      (
        window as typeof window & {
          __lightframeUploadTestState: { cameraCalls: number };
        }
      ).__lightframeUploadTestState.cameraCalls,
  );

const selectExistingVideo = async (
  page: Page,
  bytes: Buffer,
  filename = 'creator-source.mp4',
): Promise<void> => {
  await page.getByRole('button', { name: 'Upload existing video' }).click();
  await expect(page).toHaveURL(/\/studio$/u);
  const dialog = page.getByRole('dialog', { name: 'Upload existing video' });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: filename,
    mimeType: 'video/mp4',
    buffer: bytes,
  });
  await expect(dialog.getByRole('heading', { name: 'Uploaded source' })).toBeVisible();
  await expect(dialog.getByTitle(filename)).toHaveText(filename);
  await expect(dialog).toContainText('1280 × 720');
  await expect(dialog).toContainText('MP4 · H.264');
};

test('provider-free upload previews and enters the existing take/download surface', async ({
  page,
}) => {
  await installCameraSentinel(page);
  const network = await installProviderNetworkDriver(page, { videoProcessingAvailable: false });
  await page.goto('/');
  const fixture = await loadH264VideoFixture();

  await selectExistingVideo(page, fixture, 'local-only.mp4');
  const dialog = page.getByRole('dialog', { name: 'Upload existing video' });
  await expect(dialog).toContainText('No provider transfer');
  await dialog.getByRole('button', { name: 'Continue locally' }).click();

  await expect(page.getByRole('dialog', { name: 'Latest take' })).toBeVisible();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await page.getByRole('link', { name: 'Download take' }).click();
  await expect(page.getByText('A download was started.')).toBeVisible();
  expect(await cameraCalls(page)).toBe(0);
  expect(new Set(network.apiRequests.map(({ path }) => path))).toEqual(
    new Set(['/api/capabilities']),
  );
  expect(network.providerSdkRequests).toEqual([]);
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});

for (const order of [
  ['lucy-2.5', 'lucy-vton-3'],
  ['lucy-vton-3', 'lucy-2.5'],
] as const) {
  test(`ordered ${order.join(' → ')} waits for explicit intermediate approval`, async ({
    page,
  }) => {
    await installCameraSentinel(page);
    await installProviderNetworkDriver(page);
    await page.goto('/');
    const fixture = await loadH264VideoFixture();
    const calls = await installFakeVideoJobRoutes(page, fixture, {
      originalFilename: 'creator-source.mp4',
    });

    await selectExistingVideo(page, fixture);
    const dialog = page.getByRole('dialog', { name: 'Upload existing video' });
    for (const modelId of order) {
      await dialog
        .getByRole('button', { name: modelId === 'lucy-2.5' ? 'Add Lucy' : 'Add VTO' })
        .click();
    }
    const steps = dialog.locator('article');
    await steps.nth(0).locator('textarea').fill(`Prompt for ${order[0]}`);
    await steps.nth(1).locator('textarea').fill(`Prompt for ${order[1]}`);
    await dialog.getByRole('button', { name: 'Start first · 2 planned submissions' }).click();

    await expect(
      dialog.getByRole('heading', { name: 'Review the intermediate result' }),
    ).toBeVisible({ timeout: 15_000 });
    expect(calls.filter(({ method }) => method === 'PUT').map(({ modelId }) => modelId)).toEqual([
      order[0],
    ]);
    await dialog.getByRole('button', { name: 'Continue · 1 Decart submission' }).click();
    await expect(dialog.getByRole('heading', { name: 'Result ready' })).toBeVisible({
      timeout: 15_000,
    });

    const submissions = calls.filter(({ method }) => method === 'PUT');
    expect(submissions.map(({ modelId }) => modelId)).toEqual([...order]);
    expect(
      submissions.every(({ providerIntent }) => providerIntent === VIDEO_PROVIDER_INTENT_VALUE),
    ).toBe(true);
    expect(submissions.every(({ exposedOriginalFilename }) => !exposedOriginalFilename)).toBe(true);
    expect(await cameraCalls(page)).toBe(0);
  });
}

test('a second-stage failure preserves the first visual result and local finish path', async ({
  page,
}) => {
  await installCameraSentinel(page);
  await installProviderNetworkDriver(page);
  await page.goto('/');
  const fixture = await loadH264VideoFixture();
  const calls = await installFakeVideoJobRoutes(page, fixture, {
    failSecond: true,
    originalFilename: 'creator-source.mp4',
  });

  await selectExistingVideo(page, fixture);
  const dialog = page.getByRole('dialog', { name: 'Upload existing video' });
  await dialog.getByRole('button', { name: 'Add Lucy' }).click();
  await dialog.getByRole('button', { name: 'Add VTO' }).click();
  const steps = dialog.locator('article');
  await steps.nth(0).locator('textarea').fill('First visual');
  await steps.nth(1).locator('textarea').fill('Second visual');
  await dialog.getByRole('button', { name: 'Start first · 2 planned submissions' }).click();
  await expect(dialog.getByRole('heading', { name: 'Review the intermediate result' })).toBeVisible(
    {
      timeout: 15_000,
    },
  );
  await dialog.getByRole('button', { name: 'Continue · 1 Decart submission' }).click();

  await expect(dialog).toContainText('The visual provider could not complete this request.');
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  expect(calls.filter(({ method }) => method === 'PUT')).toHaveLength(2);
});
