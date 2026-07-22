import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  closeRecipeDockWhenOverlaid,
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  openRecipeDockWhenOverlaid,
  readBrowserState,
  triggerProviderDisconnect,
} from './support/studioHarness';

const rememberStageVideo = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const testWindow = window as typeof window & {
      __lightframeStageVideo?: HTMLVideoElement | null;
    };
    testWindow.__lightframeStageVideo = document.querySelector('figure video');
  });

const expectStableStageVideo = async (page: Page): Promise<void> => {
  expect(
    await page.evaluate(() => {
      const testWindow = window as typeof window & {
        __lightframeStageVideo?: HTMLVideoElement | null;
      };
      return testWindow.__lightframeStageVideo === document.querySelector('figure video');
    }),
  ).toBe(true);
};

type StageRect = { x: number; y: number; width: number; height: number };

const readStageRect = async (page: Page): Promise<StageRect> => {
  const box = await page.getByLabel('Studio media stage').boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error('The stable media stage has no bounding box.');
  return box;
};

const expectStableStageRect = async (page: Page, expected: StageRect): Promise<void> => {
  const current = await readStageRect(page);
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(current[key] - expected[key]), `${key} changed`).toBeLessThanOrEqual(1);
  }
};

const expectActionInsideViewport = async (page: Page, name: string): Promise<void> => {
  const box = await page.getByRole('button', { name }).boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  const viewport = page.viewportSize();
  expect(viewport).not.toBeNull();
  if (!viewport) return;
  expect(box.x).toBeGreaterThanOrEqual(-1);
  expect(box.y).toBeGreaterThanOrEqual(-1);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
};

const expectInternalScrollOwnership = async (
  page: Page,
  selector: string,
): Promise<{ clientHeight: number; scrollHeight: number }> => {
  const region = page.locator(selector).first();
  await expect(region).toBeVisible();
  const metrics = await region.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    overflowY: getComputedStyle(element).overflowY,
  }));
  expect(metrics.overflowY).toMatch(/auto|scroll/u);
  if (metrics.scrollHeight > metrics.clientHeight) {
    await region.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await expect.poll(() => region.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await region.evaluate((element) => {
      element.scrollTop = 0;
    });
  }
  return metrics;
};

const expectNoAxeViolations = async (page: Page): Promise<void> => {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(
    result.violations.map((violation) => ({
      id: violation.id,
      targets: violation.nodes.flatMap((node) => node.target),
    })),
  ).toEqual([]);
};

const closeLatestTakeWhenOverlaid = async (page: Page): Promise<void> => {
  const dialog = page.getByRole('dialog', { name: 'Latest Take' });
  if (!(await dialog.isVisible())) return;

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
};

const exactViewports = [
  { name: 'full desktop', width: 1_440, height: 960 },
  { name: 'compact desktop', width: 1_280, height: 720 },
  { name: 'tablet portrait', width: 834, height: 1_112 },
  { name: 'mobile portrait', width: 390, height: 844 },
  { name: 'small mobile', width: 320, height: 568 },
] as const;

for (const viewport of exactViewports) {
  test(`${viewport.name} keeps every live/capture/review state viewport-bound`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'The exact visual-state matrix runs in Chromium.');
    const network = await installSuccessfulStudioHarness(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');
    await expectNoDocumentOverflow(page);
    const stableStageRect = await readStageRect(page);

    await page.getByRole('button', { name: 'Workshop', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Direct one clear visual change' }),
    ).toBeVisible();
    const workshopScroll = await expectInternalScrollOwnership(
      page,
      '[data-scroll-region="character-workshop"]',
    );
    if (viewport.width <= 390) {
      expect(workshopScroll.scrollHeight).toBeGreaterThan(workshopScroll.clientHeight);
    }
    await expectNoDocumentOverflow(page);
    await expectStableStageRect(page, stableStageRect);
    await page.getByRole('button', { name: 'Close creative tool' }).click();
    await expect(page.getByRole('dialog', { name: 'Character Workshop' })).toBeHidden();
    await expectStableStageRect(page, stableStageRect);

    await page.getByRole('button', { name: 'Shelf', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recipe Shelf', exact: true })).toBeVisible();
    await expectInternalScrollOwnership(page, '[data-scroll-region="recipe-shelf"]');
    await expectNoDocumentOverflow(page);
    await expectStableStageRect(page, stableStageRect);
    await page.getByRole('button', { name: 'Close creative tool' }).click();
    await expect(page.getByRole('dialog', { name: 'Recipe Shelf' })).toBeHidden();
    await expectStableStageRect(page, stableStageRect);

    await page.getByRole('button', { name: 'Open capture settings' }).click();
    const settingsDialog = page.getByRole('dialog', { name: 'Capture Settings' });
    await expect(settingsDialog).toBeVisible();
    const settingsScroll = await expectInternalScrollOwnership(
      page,
      '[data-scroll-region="capture-settings"]',
    );
    if (viewport.width <= 390) {
      expect(settingsScroll.scrollHeight).toBeGreaterThan(settingsScroll.clientHeight);
    }
    await expectNoDocumentOverflow(page);
    await expectStableStageRect(page, stableStageRect);
    await page.getByRole('button', { name: 'Close panel' }).click();
    await expect(settingsDialog).toBeHidden();
    await expectStableStageRect(page, stableStageRect);

    await rememberStageVideo(page);
    await openRecipeDockWhenOverlaid(page);
    await page.getByRole('button', { name: 'Local Camera' }).click();
    await page.getByRole('button', { name: 'Start local preview' }).click();
    await expect(page.getByLabel('Live local camera preview')).toBeVisible();
    await expectStableStageRect(page, stableStageRect);
    await closeRecipeDockWhenOverlaid(page);
    await expectStableStageVideo(page);
    await expectNoDocumentOverflow(page);

    await page.getByRole('button', { name: 'Shelf', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recipe Shelf', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close creative tool' }).click();
    await expectStableStageVideo(page);
    expect((await readBrowserState(page)).cameraCalls).toBe(1);

    await page.getByRole('button', { name: 'Record a take' }).click();
    await expect(page.getByRole('button', { name: 'Finish take' })).toBeVisible();
    await expectActionInsideViewport(page, 'Finish take');
    await expectNoDocumentOverflow(page);
    await page.getByRole('button', { name: 'Finish take' }).click();

    await expect(page.getByLabel('Recorded take playback')).toHaveCount(1);
    await expect(page.getByLabel('Studio media stage')).toHaveAttribute(
      'data-stage-presentation',
      'playback',
    );
    await expectStableStageRect(page, stableStageRect);
    await expectNoDocumentOverflow(page);
    const takeScroll = await expectInternalScrollOwnership(
      page,
      '[data-scroll-region="take-review"]',
    );
    expect(takeScroll.scrollHeight).toBeGreaterThanOrEqual(takeScroll.clientHeight);

    await page.getByRole('button', { name: 'Voice treatments' }).click();
    await expect(page.getByRole('dialog', { name: 'Voice Treatments' })).toBeVisible();
    const voiceScroll = await expectInternalScrollOwnership(
      page,
      '[data-scroll-region="take-review"]',
    );
    expect(voiceScroll.scrollHeight).toBeGreaterThanOrEqual(voiceScroll.clientHeight);
    await expectStableStageRect(page, stableStageRect);
    await page.getByRole('button', { name: 'Back to take review' }).click();

    await page.getByRole('button', { name: 'Discard' }).click();
    await openRecipeDockWhenOverlaid(page);
    await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
    await page.getByLabel('Character direction').fill('An adult cinematic field presenter');
    await page.getByRole('button', { name: 'Start Character AI' }).click();
    await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
    await closeRecipeDockWhenOverlaid(page);
    await expectStableStageVideo(page);
    await expectNoDocumentOverflow(page);

    await page.getByRole('button', { name: 'Shelf', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Recipe Shelf', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close creative tool' }).click();
    await expectStableStageVideo(page);
    expect((await readBrowserState(page)).connections).toHaveLength(1);

    await openRecipeDockWhenOverlaid(page);
    await page.getByRole('button', { name: 'Stop AI' }).click();
    await page.getByRole('button', { name: 'Release camera & mic' }).click();
    await page.getByRole('button', { name: 'Virtual Try-On · VTON 3' }).click();
    await page.getByLabel('Garment direction').fill('A structured amber field jacket');
    await page.getByRole('button', { name: 'Start Virtual Try-On AI' }).click();
    await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
    await closeRecipeDockWhenOverlaid(page);
    await expectStableStageVideo(page);
    await expectNoDocumentOverflow(page);
    await expectActionInsideViewport(page, 'Record a take');

    const browser = await readBrowserState(page);
    expect(browser.cameraCalls).toBe(3);
    expect(browser.connections.map((connection) => connection.model)).toEqual([
      'lucy-2.5',
      'lucy-vton-3',
    ]);
    expectNoExternalProviderTraffic(network);
  });
}

test('Local Camera starts, records, and finalizes a playable take without provider work', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');
  await expect(page.getByLabel('Integration availability')).toContainText('AI video available');

  await page.getByRole('button', { name: 'Shelf' }).click();
  await page.getByRole('button', { name: 'New character recipe' }).click();
  await page.getByLabel(/^Name/).fill('Local blocked recipe');
  await page.getByLabel(/^Prompt text/).fill('Transform the adult subject into a field host.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Close creative tool' }).click();

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Start local preview' }).click();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await closeRecipeDockWhenOverlaid(page);
  await expect(page.getByRole('button', { name: 'Workshop', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Shelf' }).click();
  await expect(page.getByRole('button', { name: 'Use Local blocked recipe' })).toBeDisabled();
  await expect(page.getByText(/release camera & mic before inserting/i)).toBeVisible();
  await page.getByRole('button', { name: 'Close creative tool' }).click();
  await expect(page.getByRole('button', { name: 'Record a take' })).toBeEnabled();

  await page.getByRole('button', { name: 'Record a take' }).click();
  await expect(page.getByRole('button', { name: 'Finish take' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish take' }).click();

  await expect(page.getByRole('heading', { name: 'Latest take', exact: true })).toBeVisible();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download take' })).toHaveAttribute('href', /^blob:/);
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('heading', { name: 'Latest take' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Dock' })).toBeFocused();

  const browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.recorderStarts).toBe(2);
  expect(browser.recorderStops).toBe(2);
  expect(browser.connections).toEqual([]);
  expect(new Set(network.apiRequests.map(({ path }) => path))).toEqual(
    new Set(['/api/capabilities']),
  );
  expectNoExternalProviderTraffic(network);
});

test('Download initiation enables Close and releases the reviewed take without reacquiring media', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Start local preview' }).click();
  await closeRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Record a take' }).click();
  await page.getByRole('button', { name: 'Finish take' }).click();

  const playback = page.getByLabel('Recorded take playback');
  await expect(playback).toBeVisible();
  const closeTake = page.getByRole('button', { name: 'Close take' });
  await expect(closeTake).toBeDisabled();

  const downloadStarted = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download take' }).click();
  await downloadStarted;
  await expect(page.getByText('A download was started.', { exact: false })).toBeVisible();
  await expect(closeTake).toBeEnabled();
  await closeTake.click();

  await expect(page.getByRole('dialog', { name: 'Latest Take' })).toBeHidden();
  await expect(playback).toHaveCount(0);
  await expect(page.getByLabel('Studio media stage')).toHaveAttribute(
    'data-stage-presentation',
    'idle',
  );
  await expect(page.getByRole('button', { name: 'Dock' })).toBeFocused();

  const browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.createdObjectUrls).toHaveLength(1);
  expect(browser.revokedObjectUrls).toEqual(browser.createdObjectUrls);
  expect(browser.lifecycleEvents).toContain('local-video-stopped');
  expect(browser.lifecycleEvents).toContain('local-audio-stopped');
  expectNoExternalProviderTraffic(network);
});

test('ordinary Shelf closure and a breakpoint change preserve the unsaved recipe draft', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.setViewportSize({ width: 834, height: 1_112 });
  await page.goto('/');

  await page.getByRole('button', { name: 'Shelf' }).click();
  await page.getByRole('button', { name: 'New character recipe' }).click();
  await page.getByLabel(/^Name/).fill('Unsaved field host');
  await page.getByLabel(/^Prompt text/).fill('An adult field host in soft studio light.');
  await page.getByRole('button', { name: 'Close creative tool' }).click();
  await expect(page.getByRole('dialog', { name: 'Recipe Shelf' })).toBeHidden();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Shelf' }).click();
  await expect(page.getByLabel(/^Name/)).toHaveValue('Unsaved field host');
  await expect(page.getByLabel(/^Prompt text/)).toHaveValue(
    'An adult field host in soft studio light.',
  );
  await expectNoDocumentOverflow(page);
  expect((await readBrowserState(page)).cameraCalls).toBe(0);
  expectNoExternalProviderTraffic(network);
});

test('Lucy 2.5 starts, applies explicitly, falls back on disconnect, recovers, and resets', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');
  await expect(page.getByLabel('Integration availability')).toContainText('AI video available');

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await page.getByLabel('Character direction').fill('An adult paper-cut travel host');
  await page.getByRole('button', { name: 'Start Character AI' }).click();

  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText('AI live', { exact: true })).toBeVisible();

  await page.getByLabel('Character direction').fill('An adult paper-cut science host');
  await expect(page.getByText('Changes are pending', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByText('Changes are pending', { exact: true })).toHaveCount(0);

  let browser = await readBrowserState(page);
  expect(browser.connections).toEqual([
    {
      model: 'lucy-2.5',
      initial: {
        prompt: 'An adult paper-cut travel host',
        imageName: null,
        enhance: false,
      },
    },
  ]);
  expect(browser.applies).toEqual([
    {
      prompt: 'An adult paper-cut science host',
      imageName: null,
      enhance: false,
    },
  ]);

  await triggerProviderDisconnect(page);
  await expect(page.getByText('AI disconnected — local fallback', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Start Character AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText('AI live', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Reset AI' }).click();
  await expect(page.getByLabel('Character direction')).toHaveValue('');
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Character AI' })).toBeVisible();

  browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.requirementModels).toEqual(['lucy-2.5', 'lucy-2.5']);
  expect(browser.connections).toHaveLength(2);
  expect(browser.connections[1]?.initial.prompt).toBe('An adult paper-cut science host');
  expect(browser.disconnectCalls).toBe(2);
  expect(
    network.apiRequests
      .filter(({ path }) => path === '/api/realtime-token')
      .map(({ model }) => model),
  ).toEqual(['lucy-2.5', 'lucy-2.5']);
  expectNoExternalProviderTraffic(network);
});

test('a Lucy model take finalizes before the provider session is released', async ({ page }) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await page.getByLabel('Character direction').fill('An adult stop-motion field presenter');
  await page.getByRole('button', { name: 'Start Character AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();

  await closeRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Record a take' }).click();
  await expect(page.getByRole('button', { name: 'Finish take' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish take' }).click();

  await expect(page.getByRole('heading', { name: 'Latest take', exact: true })).toBeVisible();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await expect(page.getByLabel('Live local camera preview')).toHaveCount(0);
  await expect(page.getByLabel('Studio media stage')).toHaveAttribute(
    'data-stage-presentation',
    'playback',
  );
  await closeLatestTakeWhenOverlaid(page);
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await openRecipeDockWhenOverlaid(page);
  await expect(page.getByRole('button', { name: 'Start Character AI' })).toBeDisabled();
  await expect(
    page
      .getByRole('dialog', { name: 'Recipe Dock' })
      .getByText(
        'Download and close or discard the recorded take before starting or changing media.',
        { exact: true },
      ),
  ).toBeVisible();

  const browser = await readBrowserState(page);
  expect(browser.recorderStarts).toBe(2);
  expect(browser.recorderStops).toBe(2);
  expect(browser.disconnectCalls).toBe(1);
  const finalizationIndexes = browser.lifecycleEvents.flatMap((event, index) =>
    event === 'recorder-finalized' ? [index] : [],
  );
  const releaseIndexes = browser.lifecycleEvents.flatMap((event, index) =>
    event === 'provider-disconnected' || event.endsWith('-stopped') ? [index] : [],
  );
  expect(finalizationIndexes).toHaveLength(2);
  expect(releaseIndexes.length).toBeGreaterThan(0);
  expect(Math.min(...releaseIndexes)).toBeGreaterThan(Math.max(...finalizationIndexes));
  expect(browser.lifecycleEvents).toContain('provider-disconnected');
  expect(browser.lifecycleEvents).toContain('local-video-stopped');
  expect(browser.lifecycleEvents).toContain('local-audio-stopped');
  expectNoExternalProviderTraffic(network);
});

test('VTON 3 accepts a valid ephemeral garment image and starts with image-only state', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');
  await expect(page.getByLabel('Integration availability')).toContainText('AI video available');

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Virtual Try-On · VTON 3' }).click();
  await page.getByLabel('Garment reference image').setInputFiles({
    name: 'linen-overshirt.webp',
    mimeType: 'image/webp',
    buffer: Buffer.from('deterministic-garment-image'),
  });
  await expect(page.getByRole('button', { name: 'Clear image' })).toBeVisible();
  await expect(page.getByAltText('Current ephemeral reference preview')).toBeVisible();

  await page.getByRole('button', { name: 'Start Virtual Try-On AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText('AI live', { exact: true })).toBeVisible();

  const browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.requirementModels).toEqual(['lucy-vton-3']);
  expect(browser.connections).toEqual([
    {
      model: 'lucy-vton-3',
      initial: { prompt: '', imageName: 'linen-overshirt.webp', enhance: false },
    },
  ]);
  expect(
    network.apiRequests
      .filter(({ path }) => path === '/api/realtime-token')
      .map(({ model }) => model),
  ).toEqual(['lucy-vton-3']);
  expectNoExternalProviderTraffic(network);
});

test('Space records and finishes only outside editable controls', async ({ page }) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.setViewportSize({ width: 1_280, height: 720 });
  await page.goto('/');

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Start local preview' }).click();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await closeRecipeDockWhenOverlaid(page);

  const shelfLauncher = page.getByRole('button', { name: 'Shelf' });
  await shelfLauncher.click();
  await page.getByRole('button', { name: 'New character recipe' }).click();
  const nameInput = page.getByLabel(/^Name/);
  await nameInput.fill('Keyboard guard');
  await nameInput.press('Space');
  await expect(nameInput).toHaveValue('Keyboard guard ');
  expect((await readBrowserState(page)).recorderStarts).toBe(0);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Recipe Shelf' })).toBeHidden();
  await expect(shelfLauncher).toBeFocused();

  await page.getByRole('main').focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Finish take' })).toBeVisible();
  expect((await readBrowserState(page)).recorderStarts).toBe(2);

  await page.getByRole('main').focus();
  await page.keyboard.press('Space');
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();

  const browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.recorderStops).toBe(2);
  expect(browser.connections).toEqual([]);
  expect(new Set(network.apiRequests.map(({ path }) => path))).toEqual(
    new Set(['/api/capabilities']),
  );
  expectNoExternalProviderTraffic(network);
});
