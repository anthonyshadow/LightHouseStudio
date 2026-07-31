import { expect, test, type Page } from '@playwright/test';
import { VIDEO_PROVIDER_INTENT_VALUE } from '@studio/contracts';
import { installFakeVideoJobRoutes, loadH264VideoFixture } from './support/existingVideoHarness';
import { expectNoDocumentOverflow } from './support/studioHarness';
import { installProviderNetworkDriver } from './support/studioHarness.network';
import { STUDIO_VIEWPORT_SIZES } from './support/studioViewports';

const CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v4';
const SEEDED_UPLOAD_RECIPES = {
  schemaVersion: 4,
  savedPrompts: [
    {
      id: 'character-anchor',
      title: 'Professional Anchor',
      prompt:
        'A professional anchor in a well-lit studio with a dark blazer and soft cinematic lighting.',
      modelModeId: 'lucy-2.5',
      source: 'manual',
      referenceImageAssetId: null,
      tags: ['anchor'],
      createdAt: '2026-07-30T12:00:00.000Z',
      updatedAt: '2026-07-30T12:00:00.000Z',
      lastUsedAt: '2026-07-30T12:00:00.000Z',
      useCount: 1,
    },
  ],
  recentPrompts: [],
  savedCharacterPrompts: [],
};

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

  const review = page.getByRole('dialog', { name: 'Latest take' });
  await expect(review).toBeVisible();
  await expect(review.getByRole('button', { name: 'Edit video' })).toBeVisible();
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

test('a selected upload ignores backdrop dismissal and can be reopened after an explicit close', async ({
  page,
}) => {
  await installCameraSentinel(page);
  await installProviderNetworkDriver(page, { videoProcessingAvailable: false });
  await page.goto('/');
  const fixture = await loadH264VideoFixture();

  await selectExistingVideo(page, fixture, 'resume-source.mp4');
  const dialog = page.getByRole('dialog', { name: 'Upload existing video' });
  const backdrop = page.locator('[data-overlay-panel-root]').filter({ has: dialog });

  await backdrop.click({ position: { x: 16, y: 120 } });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Close panel' }).click();
  await expect(dialog).toBeHidden();

  const editVideo = page.getByRole('button', { name: 'Edit video' });
  await expect(editVideo).toBeVisible();
  await editVideo.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTitle('resume-source.mp4')).toHaveText('resume-source.mp4');
});

test('the upload editor and open saved-character chooser reflow at every supported viewport', async ({
  page,
}) => {
  await installCameraSentinel(page);
  await installProviderNetworkDriver(page);
  await page.addInitScript(
    ({ storageKey, store }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(store));
    },
    { storageKey: CREATIVE_ASSET_STORAGE_KEY, store: SEEDED_UPLOAD_RECIPES },
  );
  const fixture = await loadH264VideoFixture();

  for (const viewport of Object.values(STUDIO_VIEWPORT_SIZES)) {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await selectExistingVideo(page, fixture, 'responsive-source.mp4');
    const dialog = page.getByRole('dialog', { name: 'Upload existing video' });
    await dialog.getByRole('button', { name: 'Swap Character' }).click();
    await expectNoDocumentOverflow(page);
    await expect(
      dialog.locator('figure[aria-label="Video preview for responsive-source.mp4"]'),
    ).toBeAttached();

    const trigger = dialog.getByRole('button', { name: /Choose a Saved Character/u });
    await trigger.click();
    const option = dialog.getByRole('option', { name: /Professional Anchor/u });
    await expect(option).toBeVisible();

    const [triggerBox, optionBox] = await Promise.all([
      trigger.boundingBox(),
      option.boundingBox(),
    ]);
    expect(triggerBox?.height).toBeGreaterThanOrEqual(44);
    expect(optionBox?.height).toBeGreaterThanOrEqual(44);
    expect(optionBox?.x).toBeGreaterThanOrEqual(0);
    expect((optionBox?.x ?? 0) + (optionBox?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);

    await page.keyboard.press('Escape');
    await expect(dialog.getByRole('listbox', { name: 'Saved Character' })).toBeHidden();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    const editVideo = page.getByRole('button', { name: 'Edit video' });
    await expect(editVideo).toBeVisible();
    expect((await editVideo.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expectNoDocumentOverflow(page);
  }
});

test('Create A Character returns to the upload plan with the new character selected', async ({
  page,
}) => {
  await installCameraSentinel(page);
  await installProviderNetworkDriver(page);
  await page.goto('/');
  const fixture = await loadH264VideoFixture();

  await selectExistingVideo(page, fixture, 'character-source.mp4');
  const upload = page.getByRole('dialog', { name: 'Upload existing video' });
  await upload.getByRole('button', { name: 'Swap Character' }).click();
  const characterChooser = upload.getByRole('button', { name: 'Choose a Saved Character' });
  await characterChooser.click();
  const options = upload.getByRole('option');
  await expect(options.last()).toHaveAccessibleName('Create A Character');
  await options.last().click();

  const builder = page.getByRole('dialog', { name: 'Build Your Character' });
  await expect(builder).toBeVisible();
  await builder.getByRole('button', { name: 'Adult', exact: true }).click();
  await builder.getByRole('button', { name: /^Preview(?: |$)/u }).click();
  await builder.getByRole('button', { name: 'Save Character', exact: true }).click();
  const naming = page.getByRole('dialog', { name: 'Name your character' });
  await naming.getByRole('textbox', { name: /Character name/u }).fill('Upload Performer');
  await naming.getByRole('button', { name: 'Save Character', exact: true }).click();

  await expect(builder).toBeHidden();
  await expect(upload).toBeVisible();
  await expect(characterChooser).toContainText('Upload Performer');
  await expect(upload.getByPlaceholder('Describe the character or visual edit')).not.toHaveValue(
    '',
  );
  await characterChooser.click();
  await expect(upload.getByRole('option', { name: /Upload Performer/u })).toHaveAttribute(
    'aria-selected',
    'true',
  );

  const savedCharacter = await page.evaluate((storageKey) => {
    const payload = localStorage.getItem(storageKey);
    if (!payload) return null;
    const store = JSON.parse(payload) as {
      savedCharacterPrompts?: Array<{ name?: string }>;
    };
    return store.savedCharacterPrompts?.find(({ name }) => name === 'Upload Performer') ?? null;
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(savedCharacter).toMatchObject({ name: 'Upload Performer' });
  expect(await cameraCalls(page)).toBe(0);
});

for (const modelId of ['lucy-2.5', 'lucy-vton-3'] as const) {
  test(`upload uses only ${modelId} when that visual option is selected`, async ({ page }) => {
    await installCameraSentinel(page);
    await installProviderNetworkDriver(page);
    await page.goto('/');
    const fixture = await loadH264VideoFixture();
    const calls = await installFakeVideoJobRoutes(page, fixture, {
      originalFilename: 'creator-source.mp4',
    });

    await selectExistingVideo(page, fixture);
    const dialog = page.getByRole('dialog', { name: 'Upload existing video' });
    await dialog
      .getByRole('button', {
        name: modelId === 'lucy-2.5' ? 'Swap Character' : 'Virtual Try On',
      })
      .click();
    const selectedButton = dialog.getByRole('button', {
      name: modelId === 'lucy-2.5' ? 'Swap Character' : 'Virtual Try On',
    });
    const alternateModelId = modelId === 'lucy-2.5' ? 'lucy-vton-3' : 'lucy-2.5';
    const alternateButton = dialog.getByRole('button', {
      name: alternateModelId === 'lucy-2.5' ? 'Swap Character' : 'Virtual Try On',
    });
    await expect(selectedButton).toHaveAttribute('aria-pressed', 'true');
    await expect(alternateButton).toBeEnabled();
    await alternateButton.click();
    await expect(alternateButton).toHaveAttribute('aria-pressed', 'true');
    await expect(dialog.locator('article')).toHaveCount(1);
    await selectedButton.click();
    await expect(selectedButton).toHaveAttribute('aria-pressed', 'true');
    const steps = dialog.locator('article');
    await expect(steps).toHaveCount(1);
    await steps.locator('textarea').fill(`Prompt for ${modelId}`);
    await dialog.getByRole('button', { name: 'Start · 1 Decart submission' }).click();
    await expect(dialog.getByRole('heading', { name: 'Result ready' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByRole('button', { name: 'Review Voice and Download' })).toHaveCount(0);

    const submissions = calls.filter(({ method }) => method === 'PUT');
    expect(submissions.map((submission) => submission.modelId)).toEqual([modelId]);
    expect(
      submissions.every(({ providerIntent }) => providerIntent === VIDEO_PROVIDER_INTENT_VALUE),
    ).toBe(true);
    expect(submissions.every(({ exposedOriginalFilename }) => !exposedOriginalFilename)).toBe(true);
    if (modelId === 'lucy-2.5') {
      const playback = page.getByLabel('Recorded take playback');
      const resultUrl = await playback.getAttribute('src');
      expect(resultUrl).toMatch(/^blob:/u);

      await dialog.getByRole('button', { name: 'Original' }).click();
      const originalUrl = await playback.getAttribute('src');
      expect(originalUrl).toMatch(/^blob:/u);
      expect(originalUrl).not.toBe(resultUrl);

      await dialog.getByRole('button', { name: 'Result' }).click();
      await expect(playback).toHaveAttribute('src', resultUrl!);

      const downloadPromise = page.waitForEvent('download');
      await dialog.getByRole('link', { name: 'Download' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.mp4$/u);

      for (const viewport of Object.values(STUDIO_VIEWPORT_SIZES)) {
        await page.setViewportSize(viewport);
        await expectNoDocumentOverflow(page);
        for (const control of [
          dialog.getByRole('button', { name: 'Original' }),
          dialog.getByRole('button', { name: 'Result' }),
          dialog.getByRole('link', { name: 'Download' }),
          dialog.getByRole('button', { name: 'Start over' }),
          dialog.getByRole('button', { name: 'Discard video' }),
        ]) {
          const box = await control.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
          expect(box?.x).toBeGreaterThanOrEqual(0);
          expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
        }
      }

      await dialog.getByRole('button', { name: 'Start over' }).click();
      await expect(dialog.getByRole('heading', { name: 'Visual plan' })).toBeVisible();
      await expect(dialog.getByTitle('creator-source.mp4')).toHaveText('creator-source.mp4');
      await expect(dialog.getByRole('heading', { name: 'Result ready' })).toHaveCount(0);
      await expect(playback).toHaveAttribute('src', originalUrl!);
      await expect(dialog.getByRole('button', { name: 'Swap Character' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      await expect(dialog.getByRole('button', { name: 'Virtual Try On' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );

      await dialog.getByRole('button', { name: 'Virtual Try On' }).click();
      await dialog
        .locator('article')
        .getByRole('textbox', { name: /^Prompt/u })
        .fill('Second submission from the retained original');
      await dialog.getByRole('button', { name: 'Start · 1 Decart submission' }).click();
      await expect(dialog.getByRole('heading', { name: 'Result ready' })).toBeVisible({
        timeout: 15_000,
      });
      expect(
        calls
          .filter(({ method }) => method === 'PUT')
          .map(({ modelId: submittedModel }) => submittedModel),
      ).toEqual(['lucy-2.5', 'lucy-vton-3']);
    } else {
      page.once('dialog', async (confirmation) => {
        expect(confirmation.message()).toContain('Discard this uploaded video and its results?');
        await confirmation.accept();
      });
      await dialog.getByRole('button', { name: 'Discard video' }).click();
      await expect(dialog.getByRole('heading', { name: 'Choose an existing video' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Select video' })).toBeEnabled();
      await expect(page.getByLabel('Recorded take playback')).toBeHidden();
    }
    expect(await cameraCalls(page)).toBe(0);
  });
}
