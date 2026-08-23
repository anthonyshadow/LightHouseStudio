import { expect, test, type Page } from '@playwright/test';
import { VIDEO_PROVIDER_INTENT_VALUE } from '@studio/contracts';
import {
  installFakeVideoJobRoutes,
  loadDecodableH264VideoFixture,
  loadH264VideoFixture,
} from './support/existingVideoHarness';
import {
  CREATIVE_ASSET_STORAGE_KEY,
  confirmSaveVideo,
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  readCreativeAssetStore,
  readBrowserState,
} from './support/studioHarness';
import { installProviderNetworkDriver } from './support/studioHarness.network';
import { STUDIO_VIEWPORT_SIZES } from './support/studioViewports';

const SEEDED_UPLOAD_RECIPES = {
  schemaVersion: 7,
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
  savedCharacterVariants: [],
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
  await expect(page).toHaveURL(/\/studio\/create$/u);
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
  await page.goto('/studio/create');
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
  await expect(dialog.getByRole('button', { name: 'Virtual Try-On', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: /^Voice/u })).toBeVisible();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  expectNoExternalProviderTraffic(network);
});

test('Local capture starts only from the control bar and keeps the local take in review', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio/create');

  const controls = page.getByLabel('Studio session controls');
  await expect(page.getByLabel('Studio media stage')).toContainText(
    'Camera and microphone remain off until you select Start camera.',
  );
  expect((await readBrowserState(page)).cameraCalls).toBe(0);

  await controls.getByRole('button', { name: 'Start camera' }).click();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await controls.getByRole('button', { name: 'Record' }).click();
  await controls.getByRole('button', { name: 'Stop recording' }).click();

  await expect(page.getByRole('dialog', { name: 'Use existing video' })).toBeHidden();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await expect(page.getByLabel('Studio media stage')).toHaveAttribute(
    'data-stage-presentation',
    'playback',
  );
  await expect(page.getByRole('group', { name: 'Recorded take controls' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Video', exact: true })).toBeEnabled();
  expect((await readBrowserState(page)).cameraCalls).toBe(1);
  expectNoExternalProviderTraffic(network);
});

test('provider-free upload previews and enters the existing take/save surface', async ({
  page,
}) => {
  await installCameraSentinel(page);
  const network = await installProviderNetworkDriver(page, { videoProcessingAvailable: false });
  await page.goto('/studio/create');
  const fixture = await loadH264VideoFixture();

  await selectExistingVideo(page, fixture, 'local-only.mp4');
  const dialog = page.getByRole('dialog', { name: 'Use existing video' });
  await expect(dialog).toContainText('Keep the video local');
  await dialog.getByRole('button', { name: 'Review and Save' }).click();

  const review = page.getByRole('dialog', { name: 'Latest take' });
  await expect(review).toBeVisible();
  const takeOverflow = review.getByRole('button', { name: 'More actions for this take' });
  await takeOverflow.click();
  await expect(review.getByRole('menuitem', { name: 'Edit video' })).toBeVisible();
  await takeOverflow.click();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await review.getByRole('button', { name: 'Save to Assets' }).click();
  await confirmSaveVideo(page);
  await expect(review.getByRole('button', { name: 'Saved' })).toBeVisible();
  const download = review.getByRole('link', { name: /Download/u });
  await expect(download).toHaveCount(1);
  await expect(download).toHaveAttribute('href', /\/content\?download=true$/u);
  await expect(review.getByRole('button', { name: 'View in Assets' })).toBeVisible();
  expect(await cameraCalls(page)).toBe(0);
  expect(new Set(network.apiRequests.map(({ path }) => path))).toEqual(
    new Set(['/api/capabilities', '/api/creative-library']),
  );
  expect(network.providerSdkRequests).toEqual([]);
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});

test('provider-free Adjust video renders locally and atomically replaces the persistent source', async ({
  page,
}) => {
  await installCameraSentinel(page);
  const network = await installProviderNetworkDriver(page);
  await page.goto('/studio/create');
  const fixture = await loadDecodableH264VideoFixture();

  await selectExistingVideo(page, fixture, 'local-edit-source.mp4');
  const upload = page.getByRole('dialog', { name: 'Use existing video' });
  const stageVideo = page.getByLabel('Studio media stage').locator('video');
  await expect(stageVideo).toHaveCount(1);
  await stageVideo.evaluate((video) => {
    (
      window as typeof window & { __lightframeVideoEditorStage?: HTMLVideoElement }
    ).__lightframeVideoEditorStage = video as HTMLVideoElement;
  });

  await upload.getByRole('button', { name: 'Adjust video' }).click();
  await expect(upload).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Video editing tools' })).toBeVisible();
  await expect(page.getByLabel('Video edit settings')).toBeVisible();
  await expect(page.locator('video')).toHaveCount(1);
  expect(
    await stageVideo.evaluate(
      (video) =>
        (window as typeof window & { __lightframeVideoEditorStage?: HTMLVideoElement })
          .__lightframeVideoEditorStage === video,
    ),
  ).toBe(true);

  for (const viewport of Object.values(STUDIO_VIEWPORT_SIZES)) {
    await page.setViewportSize(viewport);
    await expectNoDocumentOverflow(page);

    const [stageBox, toolsBox, historyBox, timelineBox, settingsBox, actionsBox] =
      await Promise.all([
        page.getByLabel('Studio media stage').boundingBox(),
        page.getByRole('navigation', { name: 'Video editing tools' }).boundingBox(),
        page.locator('[data-video-editor-history]').boundingBox(),
        page.locator('[data-video-edit-timeline]').boundingBox(),
        page.getByLabel('Video edit settings').boundingBox(),
        page.locator('[data-video-editor-actions]').boundingBox(),
      ]);

    expect(stageBox).not.toBeNull();
    expect(toolsBox).not.toBeNull();
    expect(historyBox).not.toBeNull();
    expect(timelineBox).not.toBeNull();
    expect(settingsBox).not.toBeNull();
    expect(actionsBox).not.toBeNull();
    if (!stageBox || !toolsBox || !historyBox || !timelineBox || !settingsBox || !actionsBox) {
      continue;
    }

    expect(Math.abs(stageBox.width / stageBox.height - 16 / 9)).toBeLessThan(0.01);
    expect(toolsBox.y + toolsBox.height).toBeLessThanOrEqual(stageBox.y + 1);
    expect(historyBox.y).toBeGreaterThanOrEqual(stageBox.y + stageBox.height - 1);
    expect(historyBox.y).toBeLessThanOrEqual(stageBox.y + stageBox.height + 16);
    expect(timelineBox.y).toBeGreaterThanOrEqual(historyBox.y + historyBox.height - 1);

    if (viewport.width >= 1_024) {
      expect(settingsBox.x).toBeGreaterThanOrEqual(stageBox.x + stageBox.width - 1);
    } else if (viewport.width >= 768) {
      expect(settingsBox.y).toBeGreaterThanOrEqual(timelineBox.y + timelineBox.height - 1);
    } else {
      expect(settingsBox.y + settingsBox.height).toBeLessThanOrEqual(actionsBox.y + 1);
      expect(actionsBox.y + actionsBox.height).toBeLessThanOrEqual(viewport.height - 72 + 1);
    }
  }

  await page.setViewportSize(STUDIO_VIEWPORT_SIZES.compactDesktop);

  await page.getByRole('button', { name: 'Lighting', exact: true }).click();
  await page.getByRole('slider', { name: 'Brightness' }).fill('24');
  const compare = page.getByRole('button', {
    name: 'Hold to show original. Keyboard shortcut C.',
  });
  await compare.hover();
  await page.mouse.down();
  await expect(compare).toHaveAttribute('aria-pressed', 'true');
  await page.mouse.up();
  await expect(compare).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Save edited video' }).click();
  const replacement = page.getByRole('dialog', { name: 'Replace the current video?' });
  await expect(replacement).toBeVisible({ timeout: 60_000 });
  await expect(replacement.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await expect(replacement.getByRole('button', { name: 'Replace and Save' })).toBeVisible();
  await replacement.getByRole('button', { name: 'Cancel' }).click();
  await expect(replacement).toBeHidden();
  await expect(page.getByRole('slider', { name: 'Brightness' })).toHaveValue('24');

  await page.getByRole('button', { name: 'Save edited video' }).click();
  await expect(replacement).toBeVisible({ timeout: 60_000 });
  await replacement.getByRole('button', { name: 'Replace Without Saving' }).click();

  await expect(upload).toBeVisible();
  await expect(upload.getByTitle(/local-edit-source-edited-/u).first()).toBeVisible();
  await expect(upload.getByRole('button', { name: 'Character Swap', exact: true })).toBeEnabled();
  await expect(stageVideo).toHaveCount(1);
  await expect(upload.locator('video')).toHaveCount(1);
  expect(
    await stageVideo.evaluate(
      (video) =>
        (window as typeof window & { __lightframeVideoEditorStage?: HTMLVideoElement })
          .__lightframeVideoEditorStage === video,
    ),
  ).toBe(true);

  await upload.getByRole('button', { name: 'Adjust video' }).click();
  await page.getByRole('button', { name: 'Crop', exact: true }).click();
  await page.getByRole('button', { name: '1:1', exact: true }).click();
  await page.getByRole('button', { name: 'Save edited video' }).click();
  await expect(replacement).toBeVisible({ timeout: 60_000 });
  await replacement.getByRole('button', { name: 'Replace and Save' }).click();
  await confirmSaveVideo(page, 'Local edit source', { expectSuccessPanel: false });

  await expect(upload).toBeVisible();
  await expect(upload.getByRole('button', { name: 'Character Swap', exact: true })).toBeDisabled();
  await expect(upload.getByRole('button', { name: 'Virtual Try-On', exact: true })).toBeDisabled();
  await expect(upload).toContainText('require a 16:9 or 9:16 source');
  expect(await cameraCalls(page)).toBe(0);
  expect(new Set(network.apiRequests.map(({ path }) => path))).toEqual(
    new Set(['/api/capabilities', '/api/creative-library']),
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
  await page.goto('/studio/create');
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
    await page.goto('/studio/create');
    await selectExistingVideo(page, fixture, 'responsive-source.mp4');
    const dialog = page.getByRole('dialog', { name: 'Use existing video' });
    await dialog.getByRole('button', { name: 'Character Swap', exact: true }).click();
    await expectNoDocumentOverflow(page);
    await expect(dialog.getByLabel('Video preview for responsive-source.mp4')).toBeAttached();

    const flow = dialog.locator('[data-scroll-region="existing-video-flow"]');
    const editor = dialog.getByRole('region', { name: 'Choose edits and configure' });
    const [flowOverflow, editorOverflow] = await Promise.all([
      flow.evaluate((element) => getComputedStyle(element).overflowY),
      editor.evaluate((element) => getComputedStyle(element).overflowY),
    ]);
    if (viewport.width >= 1024) {
      expect(flowOverflow).toBe('hidden');
      expect(editorOverflow).toBe('auto');

      const source = dialog.getByRole('heading', { name: 'Current video' }).locator('..');
      const phase = dialog.getByRole('navigation', { name: 'Video editing progress' });
      const action = dialog.getByRole('button', { name: 'Apply Character Swap' });
      const before = await Promise.all([
        phase.boundingBox(),
        source.boundingBox(),
        action.boundingBox(),
      ]);
      await editor.evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await expect.poll(() => editor.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
      const after = await Promise.all([
        phase.boundingBox(),
        source.boundingBox(),
        action.boundingBox(),
      ]);
      expect(after.map((box) => box?.y)).toEqual(before.map((box) => box?.y));
    } else {
      expect(flowOverflow).toBe('auto');
      expect(editorOverflow).toBe('visible');
    }

    const trigger = dialog.getByRole('combobox', { name: 'Saved Character' });
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

test('Create A Character returns to the upload plan with the new character selected', async ({
  page,
}) => {
  await installCameraSentinel(page);
  await installProviderNetworkDriver(page);
  await page.goto('/studio/create');
  const fixture = await loadH264VideoFixture();

  await selectExistingVideo(page, fixture, 'character-source.mp4');
  const upload = page.getByRole('dialog', { name: 'Use existing video' });
  await upload.getByRole('button', { name: 'Character Swap', exact: true }).click();
  const characterChooser = upload.getByRole('combobox', { name: 'Saved Character' });
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

  const savedCharacter = (await readCreativeAssetStore(page))?.savedCharacterPrompts.find(
    ({ name }) => name === 'Upload Performer',
  );
  expect(savedCharacter).toMatchObject({ name: 'Upload Performer' });
  expect(await cameraCalls(page)).toBe(0);
});

for (const operation of ['character-swap', 'virtual-try-on'] as const) {
  test(`upload uses only ${operation} when that visual option is selected`, async ({ page }) => {
    await installCameraSentinel(page);
    await installProviderNetworkDriver(page);
    await page.goto('/studio/create');
    // This journey switches the persistent stage between both artifacts. Use the
    // deterministic decodable fixture so a codec error cannot trigger the stage's
    // intentional object-URL repair path and obscure source-identity assertions.
    const fixture = await loadDecodableH264VideoFixture();
    const calls = await installFakeVideoJobRoutes(page, fixture, {
      originalFilename: 'creator-source.mp4',
    });

    await selectExistingVideo(page, fixture);
    const dialog = page.getByRole('dialog', { name: 'Use existing video' });
    await dialog
      .getByRole('button', {
        name: operation === 'character-swap' ? 'Character Swap' : 'Virtual Try-On',
        exact: true,
      })
      .click();
    const selectedButton = dialog.getByRole('button', {
      name: operation === 'character-swap' ? 'Character Swap' : 'Virtual Try-On',
      exact: true,
    });
    const alternateOperation = operation === 'character-swap' ? 'virtual-try-on' : 'character-swap';
    const alternateButton = dialog.getByRole('button', {
      name: alternateOperation === 'character-swap' ? 'Character Swap' : 'Virtual Try-On',
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
        name: operation === 'character-swap' ? 'Apply Character Swap' : 'Apply Virtual Try-On',
      })
      .click();
    await expect(dialog.getByRole('heading', { name: 'Your result is ready' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByRole('button', { name: 'Review Voice and Download' })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: 'Download result' })).toHaveCount(0);

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

      await dialog.getByRole('button', { name: 'Save to Assets' }).click();
      await confirmSaveVideo(page);
      await expect(dialog.getByRole('button', { name: 'Saved' })).toBeVisible();

      for (const viewport of Object.values(STUDIO_VIEWPORT_SIZES)) {
        await page.setViewportSize(viewport);
        await expectNoDocumentOverflow(page);
        for (const control of [
          dialog.getByRole('button', { name: 'Original', exact: true }),
          dialog.getByRole('button', { name: 'Result', exact: true }),
          dialog.getByRole('button', { name: 'Saved' }),
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
        dialog.getByRole('button', { name: 'Virtual Try-On', exact: true }),
      ).toHaveAttribute('aria-pressed', 'false');

      await dialog.getByRole('button', { name: 'Virtual Try-On', exact: true }).click();
      await dialog
        .locator('article')
        .getByRole('textbox', { name: /^Prompt/u })
        .fill('Second submission from the retained original');
      await dialog.getByRole('button', { name: 'Apply Virtual Try-On' }).click();
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
