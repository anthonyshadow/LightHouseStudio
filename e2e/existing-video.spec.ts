import { expect, test, type Page } from '@playwright/test';
import { VIDEO_PROVIDER_INTENT_VALUE } from '@studio/contracts';
import { installFakeVideoJobRoutes, loadH264VideoFixture } from './support/existingVideoHarness';
import {
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  readBrowserState,
} from './support/studioHarness';
import { installProviderNetworkDriver } from './support/studioHarness.network';
import { STUDIO_VIEWPORT_SIZES } from './support/studioViewports';

const CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v5';
const SEEDED_UPLOAD_RECIPES = {
  schemaVersion: 5,
  savedPrompts: [
    {
      id: 'character-anchor',
      title: 'Professional Anchor',
      prompt:
        'A professional anchor in a well-lit studio with a dark blazer and soft cinematic lighting.',
      modelModeId: 'lucy-latest',
      source: 'manual',
      referenceImageAssetId: null,
      vtonInputKind: null,
      enhancePrompt: false,
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
  await page.getByRole('button', { name: 'Upload Video' }).click();
  await expect(page).toHaveURL(/\/studio$/u);
  const dialog = page.getByRole('dialog', { name: 'Use existing video' });
  await expect(dialog).toBeVisible();
  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: filename,
    mimeType: 'video/mp4',
    buffer: bytes,
  });
  await expect(dialog.getByRole('heading', { name: 'Current video' })).toBeVisible();
  await expect(dialog.getByTitle(filename).first()).toHaveText(filename);
  await expect(dialog).toContainText('1280 × 720');
  await expect(dialog).toContainText('MP4 · H.264');
};

test('Record a local video closes the panel and keeps capture on the persistent stage', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Upload Video' }).click();

  const dialog = page.getByRole('dialog', { name: 'Use existing video' });
  const stageVideo = page.getByLabel('Studio media stage').locator('video');
  await expect(dialog).toBeVisible();
  await expect(stageVideo).toHaveCount(1);
  await stageVideo.evaluate((video) => {
    (
      window as typeof window & { __lightframeExistingVideoStage?: HTMLVideoElement }
    ).__lightframeExistingVideoStage = video as HTMLVideoElement;
  });

  await dialog.getByRole('button', { name: 'Record a local video' }).click();

  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(1);
  expect(
    await stageVideo.evaluate(
      (video) =>
        (window as typeof window & { __lightframeExistingVideoStage?: HTMLVideoElement })
          .__lightframeExistingVideoStage === video,
    ),
  ).toBe(true);

  const controls = page.getByLabel('Studio session controls');
  await controls.getByRole('button', { name: 'Record' }).click();
  await expect(controls.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.locator('video')).toHaveCount(1);
  expect(
    await stageVideo.evaluate(
      (video) =>
        (window as typeof window & { __lightframeExistingVideoStage?: HTMLVideoElement })
          .__lightframeExistingVideoStage === video,
    ),
  ).toBe(true);
  await controls.getByRole('button', { name: 'Stop recording' }).click();

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Current video' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Character Swap', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Virtual Try On', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Voice/u })).toBeVisible();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  expectNoExternalProviderTraffic(network);
});

test('Record New Video starts only from the control bar and adopts the local take for editing', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');

  const controls = page.getByLabel('Studio session controls');
  await expect(page.getByLabel('Studio media stage')).toContainText(
    'Camera and microphone remain off until you start local preview.',
  );
  expect((await readBrowserState(page)).cameraCalls).toBe(0);

  await controls.getByRole('button', { name: 'Record New Video' }).click();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await controls.getByRole('button', { name: 'Record' }).click();
  await controls.getByRole('button', { name: 'Stop recording' }).click();

  const dialog = page.getByRole('dialog', { name: 'Use existing video' });
  await expect(dialog.getByRole('heading', { name: 'Current video' })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Character Swap', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Virtual Try On', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Voice/u })).toBeVisible();
  expect((await readBrowserState(page)).cameraCalls).toBe(1);
  expectNoExternalProviderTraffic(network);
});

test('provider-free upload previews and enters the existing take/download surface', async ({
  page,
}) => {
  await installCameraSentinel(page);
  const network = await installProviderNetworkDriver(page, { videoProcessingAvailable: false });
  await page.goto('/');
  const fixture = await loadH264VideoFixture();

  await selectExistingVideo(page, fixture, 'local-only.mp4');
  const dialog = page.getByRole('dialog', { name: 'Use existing video' });
  await expect(dialog).toContainText('Keep the video local');
  await dialog.getByRole('button', { name: 'Review and download' }).click();

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
  const dialog = page.getByRole('dialog', { name: 'Use existing video' });
  const backdrop = page.locator('[data-overlay-panel-root]').filter({ has: dialog });

  await backdrop.click({ position: { x: 16, y: 120 } });
  await expect(dialog).toBeVisible();

  await dialog.getByRole('button', { name: 'Close panel' }).click();
  await expect(dialog).toBeHidden();

  const editVideo = page
    .getByRole('navigation', { name: 'Creative workspace tools' })
    .getByRole('button', { name: 'Edit Video', exact: true });
  await expect(editVideo).toBeVisible();
  await editVideo.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTitle('resume-source.mp4').first()).toHaveText('resume-source.mp4');
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
    const dialog = page.getByRole('dialog', { name: 'Use existing video' });
    await dialog.getByRole('button', { name: 'Character Swap', exact: true }).click();
    await expectNoDocumentOverflow(page);
    await expect(dialog.getByLabel('Video preview for responsive-source.mp4')).toBeAttached();

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
    const editVideo = page
      .getByRole('navigation', { name: 'Creative workspace tools' })
      .getByRole('button', { name: 'Edit Video', exact: true });
    await expect(editVideo).toBeVisible();
    expect((await editVideo.boundingBox())?.height).toBeGreaterThanOrEqual(44);
    await expectNoDocumentOverflow(page);
  }
});

test('switching a configured visual edit confirms before clearing only its settings', async ({
  page,
}) => {
  await installCameraSentinel(page);
  await installProviderNetworkDriver(page);
  await page.goto('/');
  const fixture = await loadH264VideoFixture();

  await selectExistingVideo(page, fixture, 'visual-switch-source.mp4');
  const upload = page.getByRole('dialog', { name: 'Use existing video' });
  const characterSwap = upload.getByRole('button', {
    name: 'Character Swap',
    exact: true,
  });
  const virtualTryOn = upload.getByRole('button', {
    name: 'Virtual Try On',
    exact: true,
  });
  await characterSwap.click();
  const characterPrompt = upload.getByRole('textbox', { name: /^Prompt/u });

  await characterPrompt.fill('Preserve this character setup until switching is confirmed.');
  await virtualTryOn.click();

  const confirmation = page.getByRole('dialog', { name: 'Switch to Virtual Try On?' });
  await expect(confirmation).toContainText(
    'Switching will clear your current Character Swap settings.',
  );
  await expect(confirmation).toContainText('Your Voice settings will not be affected');

  await confirmation.getByRole('button', { name: 'Keep Character Swap' }).click();
  await expect(confirmation).toBeHidden();
  await expect(characterPrompt).toHaveValue(
    'Preserve this character setup until switching is confirmed.',
  );
  await expect(characterSwap).toHaveAttribute('aria-pressed', 'true');
  await expect(virtualTryOn).toHaveAttribute('aria-pressed', 'false');
  await expect(virtualTryOn).toBeFocused();

  await virtualTryOn.click();
  await page
    .getByRole('dialog', { name: 'Switch to Virtual Try On?' })
    .getByRole('button', { name: 'Clear and switch' })
    .click();

  await expect(virtualTryOn).toHaveAttribute('aria-pressed', 'true');
  await expect(characterSwap).toHaveAttribute('aria-pressed', 'false');
  await expect(upload.getByRole('heading', { name: 'Configure Virtual Try On' })).toBeVisible();
  await expect(upload.getByRole('textbox', { name: /^Prompt/u })).toHaveValue('');
});

test('Create A Character returns to the upload plan with the new character selected', async ({
  page,
}) => {
  await installCameraSentinel(page);
  await installProviderNetworkDriver(page);
  await page.goto('/');
  const fixture = await loadH264VideoFixture();

  await selectExistingVideo(page, fixture, 'character-source.mp4');
  const upload = page.getByRole('dialog', { name: 'Use existing video' });
  await upload.getByRole('button', { name: 'Character Swap', exact: true }).click();
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

for (const operation of ['character-swap', 'virtual-try-on'] as const) {
  test(`upload uses only ${operation} when that visual option is selected`, async ({ page }) => {
    await installCameraSentinel(page);
    await installProviderNetworkDriver(page);
    await page.goto('/');
    const fixture = await loadH264VideoFixture();
    const calls = await installFakeVideoJobRoutes(page, fixture, {
      originalFilename: 'creator-source.mp4',
    });

    await selectExistingVideo(page, fixture);
    const dialog = page.getByRole('dialog', { name: 'Use existing video' });
    await dialog
      .getByRole('button', {
        name: operation === 'character-swap' ? 'Character Swap' : 'Virtual Try On',
        exact: true,
      })
      .click();
    const selectedButton = dialog.getByRole('button', {
      name: operation === 'character-swap' ? 'Character Swap' : 'Virtual Try On',
      exact: true,
    });
    const alternateOperation = operation === 'character-swap' ? 'virtual-try-on' : 'character-swap';
    const alternateButton = dialog.getByRole('button', {
      name: alternateOperation === 'character-swap' ? 'Character Swap' : 'Virtual Try On',
      exact: true,
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
    await steps.locator('textarea').fill(`Prompt for ${operation}`);
    await dialog
      .getByRole('button', {
        name: operation === 'character-swap' ? 'Apply Character Swap' : 'Apply Virtual Try On',
      })
      .click();
    await expect(dialog.getByRole('heading', { name: 'Your result is ready' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByRole('button', { name: 'Review Voice and Download' })).toHaveCount(0);

    const submissions = calls.filter(({ method }) => method === 'PUT');
    expect(submissions.map((submission) => submission.operation)).toEqual([operation]);
    expect(
      submissions.every(({ providerIntent }) => providerIntent === VIDEO_PROVIDER_INTENT_VALUE),
    ).toBe(true);
    expect(submissions.every(({ exposedOriginalFilename }) => !exposedOriginalFilename)).toBe(true);
    if (operation === 'character-swap') {
      const playback = page.getByLabel('Recorded take playback');
      const resultUrl = await playback.getAttribute('src');
      expect(resultUrl).toMatch(/^blob:/u);

      await dialog.getByRole('button', { name: 'Original', exact: true }).click();
      const originalUrl = await playback.getAttribute('src');
      expect(originalUrl).toMatch(/^blob:/u);
      expect(originalUrl).not.toBe(resultUrl);

      await dialog.getByRole('button', { name: 'Result', exact: true }).click();
      await expect(playback).toHaveAttribute('src', resultUrl!);

      const downloadPromise = page.waitForEvent('download');
      await dialog.getByRole('link', { name: 'Download result' }).click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.mp4$/u);

      for (const viewport of Object.values(STUDIO_VIEWPORT_SIZES)) {
        await page.setViewportSize(viewport);
        await expectNoDocumentOverflow(page);
        for (const control of [
          dialog.getByRole('button', { name: 'Original', exact: true }),
          dialog.getByRole('button', { name: 'Result', exact: true }),
          dialog.getByRole('link', { name: 'Download result' }),
          dialog.getByRole('button', { name: 'Start over from original' }),
          dialog.getByRole('button', { name: 'Discard video and result' }),
        ]) {
          const box = await control.boundingBox();
          expect(box?.height).toBeGreaterThanOrEqual(44);
          expect(box?.x).toBeGreaterThanOrEqual(0);
          expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport.width + 1);
        }
      }

      await dialog.getByRole('button', { name: 'Start over from original' }).click();
      await expect(dialog.getByRole('heading', { name: 'Choose your edits' })).toBeVisible();
      await expect(dialog.getByTitle('creator-source.mp4').first()).toHaveText(
        'creator-source.mp4',
      );
      await expect(dialog.getByRole('heading', { name: 'Your result is ready' })).toHaveCount(0);
      await expect(playback).toHaveAttribute('src', originalUrl!);
      await expect(
        dialog.getByRole('button', { name: 'Character Swap', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');
      await expect(
        dialog.getByRole('button', { name: 'Virtual Try On', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');

      await dialog.getByRole('button', { name: 'Virtual Try On', exact: true }).click();
      await dialog
        .locator('article')
        .getByRole('textbox', { name: /^Prompt/u })
        .fill('Second submission from the retained original');
      await dialog.getByRole('button', { name: 'Apply Virtual Try On' }).click();
      await expect(dialog.getByRole('heading', { name: 'Your result is ready' })).toBeVisible({
        timeout: 15_000,
      });
      expect(
        calls
          .filter(({ method }) => method === 'PUT')
          .map(({ operation: submittedOperation }) => submittedOperation),
      ).toEqual(['character-swap', 'virtual-try-on']);
    } else {
      await dialog.getByRole('button', { name: 'Discard video and result' }).click();
      const confirmation = page.getByRole('dialog', { name: 'Discard this video?' });
      await confirmation.getByRole('button', { name: 'Discard video' }).click();
      await expect(dialog.getByRole('heading', { name: 'Add a video' })).toBeVisible();
      await expect(dialog.getByRole('button', { name: 'Upload from device' })).toBeEnabled();
      await expect(page.getByLabel('Recorded take playback')).toBeHidden();
    }
    expect(await cameraCalls(page)).toBe(0);
  });
}
