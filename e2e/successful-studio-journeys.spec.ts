import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import {
  closeRecipeDockWhenOverlaid,
  createLocalTake,
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  FIXED_WEBM_BASE64,
  installSuccessfulStudioHarness,
  openRecipeDockWhenOverlaid,
  readBrowserState,
  startLocalPreview,
  triggerGenerationEnded,
  triggerGenerationTick,
  triggerProviderDisconnect,
} from './support/studioHarness';
import { STUDIO_VIEWPORT_SIZES } from './support/studioViewports';

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
  await expect
    .poll(
      async () => {
        const geometry = await page.getByRole('button', { name }).evaluate((element) => {
          const box = element.getBoundingClientRect();
          return {
            box: { x: box.x, y: box.y, width: box.width, height: box.height },
            viewport: {
              width: document.documentElement.clientWidth,
              height: document.documentElement.clientHeight,
            },
          };
        });
        const { box, viewport } = geometry;
        return (
          box.x >= -1 &&
          box.y >= -1 &&
          box.x + box.width <= viewport.width + 1 &&
          box.y + box.height <= viewport.height + 1
        );
      },
      { message: `${name} should settle fully inside the viewport` },
    )
    .toBe(true);
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

const exactViewports = [{ name: 'small mobile', ...STUDIO_VIEWPORT_SIZES.smallMobile }] as const;

const STAGE_CONTROLS_IDLE_TIMEOUT_MS = 3_000;

for (const viewport of exactViewports) {
  test(`${viewport.name} keeps every live/capture/review state viewport-bound`, async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'The exact visual-state matrix runs in Chromium.');
    const network = await installSuccessfulStudioHarness(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/studio');
    await expectNoDocumentOverflow(page);
    await expect(page.getByLabel('Studio session controls')).toBeVisible();
    await expectActionInsideViewport(page, 'Record New Video');
    const stableStageRect = await readStageRect(page);

    await page.getByRole('button', { name: 'Workshop', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Direct one clear visual change' }),
    ).toBeVisible();
    const workshopScroll = await expectInternalScrollOwnership(
      page,
      '[data-scroll-region="prompt-workshop"]',
    );
    if (viewport.width <= 390) {
      expect(workshopScroll.scrollHeight).toBeGreaterThan(workshopScroll.clientHeight);
    }
    await expectNoDocumentOverflow(page);
    await expectStableStageRect(page, stableStageRect);
    await page.getByRole('button', { name: 'Close creative tool' }).click();
    await expect(page.getByRole('dialog', { name: 'Prompt Workshop' })).toBeHidden();
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

    await page.getByRole('button', { name: 'Record' }).click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
    await expectActionInsideViewport(page, 'Stop recording');
    await expectNoDocumentOverflow(page);
    await page.getByRole('button', { name: 'Stop recording' }).click();

    await expect(page.getByLabel('Recorded take playback')).toHaveCount(1);
    await expect(page.getByLabel('Studio media stage')).toHaveAttribute(
      'data-stage-presentation',
      'playback',
    );
    await expect(page.getByRole('dialog', { name: 'Latest Take' })).toBeHidden();
    await expectStableStageRect(page, stableStageRect);
    await expectNoDocumentOverflow(page);

    await page
      .getByRole('group', { name: 'Recorded take controls' })
      .getByRole('button', { name: 'Voice' })
      .click();
    await expect(page.getByRole('dialog', { name: 'Voice Treatments' })).toBeVisible();
    const voiceScroll = await expectInternalScrollOwnership(
      page,
      '[data-scroll-region="take-review"]',
    );
    expect(voiceScroll.scrollHeight).toBeGreaterThanOrEqual(voiceScroll.clientHeight);
    await expectNoAxeViolations(page);
    await expectStableStageRect(page, stableStageRect);
    await page.getByRole('button', { name: 'Back to take review' }).click();

    await page
      .getByRole('dialog', { name: 'Latest Take' })
      .getByRole('button', { name: 'Discard' })
      .click();
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
    await expectActionInsideViewport(page, 'Record');

    const browser = await readBrowserState(page);
    expect(browser.cameraCalls).toBe(3);
    expect(browser.connections.map((connection) => connection.model)).toEqual([
      'lucy-latest',
      'lucy-vton-latest',
    ]);
    expectNoExternalProviderTraffic(network);
  });
}

test('@cross-browser focused media smoke reaches record, Voice, and review recovery', async ({
  page,
}, testInfo) => {
  test.skip(
    !['webkit', 'mobile'].includes(testInfo.project.name),
    'This smoke targets WebKit and the configured touch project.',
  );
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');

  const controls = page.getByLabel('Studio session controls');
  await startLocalPreview(page);
  const preview = page.getByLabel('Live local camera preview');
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute('playsinline', '');

  await controls.getByRole('button', { name: 'Record' }).click();
  const stop = controls.getByRole('button', { name: 'Stop recording' });
  await expect(stop).toBeVisible();
  await stop.click();

  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await controls
    .getByRole('group', { name: 'Recorded take controls' })
    .getByRole('button', { name: 'Voice' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Voice Treatments' })).toBeVisible();
  await expect(page.getByText('Take review → Voice treatments')).toBeVisible();
  await page.getByRole('button', { name: 'Back to take review' }).click();
  await page
    .getByRole('dialog', { name: 'Latest Take' })
    .getByRole('button', { name: 'Discard' })
    .click();
  await expect(page.getByLabel('Recorded take playback')).toHaveCount(0);

  const browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.recorderStarts).toBe(2);
  expect(browser.recorderStops).toBe(2);
  expectNoExternalProviderTraffic(network);
});

test('@touch controls recover while recording Stop remains reachable', async ({
  page,
}, testInfo) => {
  test.setTimeout(45_000);
  test.skip(testInfo.project.name !== 'mobile', 'This interaction requires a touch context.');
  const network = await installSuccessfulStudioHarness(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio');

  const mediaStage = page.getByLabel('Studio media stage');
  const controls = page.locator('[aria-label="Studio session controls"]');
  await startLocalPreview(page);
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();

  await expect(controls).toHaveAttribute('data-control-visibility', 'hidden', {
    timeout: STAGE_CONTROLS_IDLE_TIMEOUT_MS + 2_000,
  });
  await mediaStage.tap({ position: { x: 24, y: 96 } });
  await expect(controls).toHaveAttribute('data-control-visibility', 'visible');
  await controls.getByRole('button', { name: 'Record' }).click();

  const stopRecording = controls.getByRole('button', { name: 'Stop recording' });
  await expect(stopRecording).toBeVisible();
  await page.waitForTimeout(STAGE_CONTROLS_IDLE_TIMEOUT_MS + 250);
  await expect(controls).toHaveAttribute('data-control-visibility', 'visible');
  await expect(controls).not.toHaveAttribute('aria-hidden');
  await expect(controls).not.toHaveAttribute('inert');
  await expect(stopRecording).toBeVisible();
  await expectActionInsideViewport(page, 'Stop recording');

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });
  await expect(stopRecording).toBeVisible();
  await expectActionInsideViewport(page, 'Stop recording');
  await expectNoDocumentOverflow(page);
  await stopRecording.click();

  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await expect(controls).toHaveAttribute('data-control-visibility', 'hidden', {
    timeout: STAGE_CONTROLS_IDLE_TIMEOUT_MS + 2_000,
  });
  await mediaStage.tap({ position: { x: 24, y: 96 } });
  await expect(controls).toHaveAttribute('data-control-visibility', 'visible');
  const dismissPlaybackError = page.getByRole('button', { name: 'Dismiss Playback unavailable' });
  if (await dismissPlaybackError.isVisible()) await dismissPlaybackError.click();
  await controls
    .getByRole('group', { name: 'Recorded take controls' })
    .getByRole('button', { name: 'Voice' })
    .click();
  await expect(page.getByRole('dialog', { name: 'Voice Treatments' })).toBeVisible();

  expectNoExternalProviderTraffic(network);
});

test('the independent recording maximum warns and safely opens take review', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-07-28T12:00:00.000Z') });
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');

  const controls = page.getByLabel('Studio session controls');
  await startLocalPreview(page);
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await controls.getByRole('button', { name: 'Record' }).click();

  await page.clock.fastForward(270_000);
  await expect(
    page.getByRole('status', { name: 'Recording ends in 30 seconds or less' }),
  ).toBeVisible();
  await expect(
    page.getByRole('timer', {
      name: 'Recording elapsed time 4:30, maximum 5:00, 0:30 remaining',
    }),
  ).toHaveAttribute('data-recording-duration-status', 'warning');

  await page.clock.fastForward(30_000);
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await expect(
    page.getByRole('status', { name: 'Recording ended at the 5:00 maximum' }),
  ).toBeVisible();
  const takeControls = controls.getByRole('group', { name: 'Recorded take controls' });
  await expect(takeControls.getByRole('link', { name: 'Download' })).toBeVisible();
  await expect(takeControls.getByRole('button', { name: 'Discard' })).toBeVisible();
  await expect(takeControls.getByRole('button', { name: 'Voice' })).toBeVisible();
  await expect(takeControls.getByRole('button', { name: 'Release' })).toBeVisible();

  const browser = await readBrowserState(page);
  expect(browser.recorderStarts).toBe(2);
  expect(browser.recorderStops).toBe(2);
  const finalizationIndexes = browser.lifecycleEvents.flatMap((event, index) =>
    event === 'recorder-finalized' ? [index] : [],
  );
  const releaseIndexes = browser.lifecycleEvents.flatMap((event, index) =>
    event === 'local-video-stopped' || event === 'local-audio-stopped' ? [index] : [],
  );
  expect(finalizationIndexes).toHaveLength(2);
  expect(releaseIndexes.length).toBeGreaterThan(0);
  expect(
    Math.min(...releaseIndexes),
    `lifecycle order: ${browser.lifecycleEvents.join(', ')}`,
  ).toBeGreaterThan(Math.max(...finalizationIndexes));
  expectNoExternalProviderTraffic(network);
});

test('persistent controls preserve local media across VTON choice, AI stop, track toggles, and full shutdown', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/studio');

  const controls = page.getByLabel('Studio session controls');
  await controls.getByRole('button', { name: 'Record New Video' }).click();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await expect(controls.getByRole('button', { name: 'Start AI' })).toBeVisible();
  expect((await readBrowserState(page)).cameraCalls).toBe(1);

  await controls.getByRole('button', { name: 'Start AI' }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose live AI experience' });
  await expect(chooser.getByRole('heading', { name: 'Character Transformation' })).toBeVisible();
  await expect(chooser.getByRole('heading', { name: 'Virtual Try-On' })).toBeVisible();
  await expectNoDocumentOverflow(page);

  await chooser.getByRole('button', { name: 'Configure Virtual Try-On' }).click();
  const dock = page.getByRole('dialog', { name: 'Recipe Dock' });
  await expect(dock).toBeVisible();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await page.getByLabel('Garment direction').fill('A structured amber field jacket');
  await page.getByRole('button', { name: 'Start Virtual Try-On AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dock).toBeHidden();

  await controls.getByRole('button', { name: 'Stop AI' }).click();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  expect((await readBrowserState(page)).cameraCalls).toBe(1);

  await controls.getByRole('button', { name: 'Mute microphone' }).click();
  await controls.getByRole('button', { name: 'Turn camera off' }).click();
  const trackState = await page.getByLabel('Live local camera preview').evaluate((element) => {
    const stream = (element as HTMLVideoElement).srcObject as MediaStream;
    return {
      microphoneEnabled: stream.getAudioTracks()[0]?.enabled,
      cameraEnabled: stream.getVideoTracks()[0]?.enabled,
    };
  });
  expect(trackState).toEqual({ microphoneEnabled: false, cameraEnabled: false });

  await controls.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Studio idle', { exact: true })).toBeVisible();
  const browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.connections.map((connection) => connection.model)).toEqual(['lucy-vton-latest']);
  expect(browser.lifecycleEvents).toContain('local-video-stopped');
  expect(browser.lifecycleEvents).toContain('local-audio-stopped');
  await expectNoDocumentOverflow(page);
  expectNoExternalProviderTraffic(network);
});

test('no-key Local Camera records and finalizes without provider HTTP, WebSocket, SDK, or token work', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page, {
    elevenLabsAvailable: false,
    realtimeVideoAvailable: false,
    referenceImagesAvailable: false,
  });
  await page.goto('/studio');
  const availability = page.getByLabel('Integration availability');
  await expect(availability).toContainText('AI video not configured');
  await expect(availability).toContainText('Voice cloud not configured (optional)');

  await page.getByRole('button', { name: 'Shelf' }).click();
  await page.getByRole('button', { name: 'Try-on recipes' }).click();
  await page.getByRole('button', { name: 'New garment recipe' }).click();
  await page.getByLabel(/^Name/).fill('Local blocked recipe');
  await page.getByLabel(/^Prompt text/).fill('Apply the field host linen overshirt.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Close creative tool' }).click();

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Start local preview' }).click();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await closeRecipeDockWhenOverlaid(page);
  await expect(page.getByRole('button', { name: 'Workshop', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Shelf' }).click();
  await expect(page.getByRole('button', { name: 'Use Local blocked recipe' })).toBeEnabled();
  await expect(page.getByText(/release camera & mic before inserting/i)).toHaveCount(0);
  await page.getByRole('button', { name: 'Close creative tool' }).click();
  await expect(page.getByRole('button', { name: 'Record' })).toBeEnabled();

  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording' }).click();

  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Latest Take' })).toBeHidden();
  const takeControls = page.getByRole('group', { name: 'Recorded take controls' });
  await expect(takeControls.getByRole('link', { name: 'Download' })).toHaveAttribute(
    'href',
    /^blob:/,
  );
  await expectNoAxeViolations(page);
  await takeControls.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByLabel('Recorded take playback')).toHaveCount(0);

  const browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.recorderStarts).toBe(2);
  expect(browser.recorderStops).toBe(2);
  expect(browser.connections).toEqual([]);
  expect(new Set(network.apiRequests.map(({ path }) => path))).toEqual(
    new Set(['/api/capabilities']),
  );
  expect(network.providerSdkRequests).toEqual([]);
  expectNoExternalProviderTraffic(network);
});

test('saved voice preview, Apply, remux, Download, and Restore Original stay explicit and immutable', async ({
  page,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'Deterministic browser remux qualification runs in Chromium.',
  );
  test.setTimeout(60_000);
  const network = await installSuccessfulStudioHarness(page, {
    elevenLabsAvailable: true,
    stubMediaPlayback: false,
  });
  await page.goto('/studio');

  await createLocalTake(page);
  const takeDialog = page.getByRole('dialog', { name: 'Latest Take' });
  const originalDownload = takeDialog.getByRole('link', { name: 'Download take' });
  const originalUrl = await originalDownload.getAttribute('href');
  expect(originalUrl).toMatch(/^blob:/u);

  await takeDialog.getByRole('button', { name: 'Voice treatments' }).click();
  const voiceTreatments = page.getByRole('dialog', { name: 'Voice Treatments' });
  await expect(voiceTreatments).toBeVisible();
  await voiceTreatments.getByRole('button', { name: /Saved AI Voice/u }).click();

  await expect(voiceTreatments.getByRole('list', { name: 'Available voices' })).toContainText(
    'Northstar Narrator',
  );
  await voiceTreatments.getByRole('button', { name: 'Preview Northstar Narrator' }).click();
  await expect(voiceTreatments.getByLabel('Listen to Northstar Narrator preview')).toHaveAttribute(
    'src',
    /^blob:/u,
  );

  const listRequests = network.voiceRequests.filter(({ kind }) => kind === 'list');
  expect(listRequests.length).toBeGreaterThan(0);
  expect(
    listRequests.every(
      (request) =>
        request.voiceId === null &&
        request.providerIntent === 'voice' &&
        request.contentType === null &&
        request.bodyByteSize === 0,
    ),
  ).toBe(true);
  expect(network.voiceRequests.filter(({ kind }) => kind === 'preview')).toEqual([
    {
      kind: 'preview',
      voiceId: 'northstar-narrator',
      providerIntent: 'voice',
      contentType: null,
      bodyByteSize: 0,
    },
  ]);

  await voiceTreatments.getByRole('button', { name: 'Select Northstar Narrator' }).click();
  await expect(
    voiceTreatments.getByRole('button', { name: 'Apply treatment' }),
  ).toHaveAccessibleDescription(/Original audio.+provider credits/u);
  await voiceTreatments.getByRole('button', { name: 'Apply treatment' }).click();
  await expect(voiceTreatments.getByRole('button', { name: 'Treatment applied' })).toBeDisabled();
  await voiceTreatments.getByRole('button', { name: 'Back to take review' }).click();
  const processedTakeDialog = page.getByRole('dialog', { name: 'Latest Take' });
  const processedDownload = processedTakeDialog.getByRole('link', { name: 'Download take' });
  await expect(processedDownload).toHaveAttribute('href', /^blob:/u);
  const processedUrl = await processedDownload.getAttribute('href');
  expect(processedUrl).not.toBe(originalUrl);

  expect(network.voiceRequests.filter(({ kind }) => kind === 'convert')).toEqual([
    {
      kind: 'convert',
      voiceId: 'northstar-narrator',
      providerIntent: 'voice',
      contentType: 'audio/webm;codecs=opus',
      bodyByteSize: Buffer.from(FIXED_WEBM_BASE64, 'base64').byteLength,
    },
  ]);

  const processedDownloadStarted = page.waitForEvent('download');
  await processedDownload.click();
  await processedDownloadStarted;
  await expect(
    processedTakeDialog.getByRole('button', { name: 'Close and release' }),
  ).toBeEnabled();

  await processedTakeDialog.getByRole('button', { name: 'Voice treatments' }).click();
  const restoredVoiceTreatments = page.getByRole('dialog', { name: 'Voice Treatments' });
  await restoredVoiceTreatments.getByRole('button', { name: 'Original' }).click();
  await restoredVoiceTreatments.getByRole('button', { name: 'Restore original audio' }).click();
  await restoredVoiceTreatments.getByRole('button', { name: 'Back to take review' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Latest Take' }).getByRole('link', { name: 'Download take' }),
  ).toHaveAttribute('href', originalUrl ?? '');
  const browser = await readBrowserState(page);
  expect(browser.createdObjectUrls).toContain(originalUrl);
  expect(browser.revokedObjectUrls).toContain(processedUrl);
  expect(browser.revokedObjectUrls).not.toContain(originalUrl);
  expectNoExternalProviderTraffic(network);
});

test('Download initiation enables Release and clears the reviewed take without reacquiring media', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Start local preview' }).click();
  await closeRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Record' }).click();
  await page.getByRole('button', { name: 'Stop recording' }).click();

  const playback = page.getByLabel('Recorded take playback');
  await expect(playback).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Latest Take' })).toBeHidden();
  const takeControls = page.getByRole('group', { name: 'Recorded take controls' });
  const releaseTake = takeControls.getByRole('button', { name: 'Release' });
  await expect(releaseTake).toBeDisabled();

  const downloadStarted = page.waitForEvent('download');
  await takeControls.getByRole('link', { name: 'Download' }).click();
  await downloadStarted;
  await expect(releaseTake).toBeEnabled();
  await releaseTake.click();

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

test('Lucy 2.5 starts, applies explicitly, falls back on disconnect, recovers, and resets', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await expect(page.getByLabel('Integration availability')).toContainText('AI video configured');

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await page.getByLabel('Character direction').fill('An adult paper-cut travel host');
  await page.getByRole('button', { name: 'Start Character AI' }).click();

  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText(/^AI active/u)).toBeVisible();

  await page.getByLabel('Character direction').fill('An adult paper-cut science host');
  await expect(page.getByText('Changes are pending', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect(page.getByText('Changes are pending', { exact: true })).toHaveCount(0);

  let browser = await readBrowserState(page);
  expect(browser.connections).toEqual([
    {
      model: 'lucy-latest',
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
  await expect(page.getByText('AI stopped · local preview', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Start Character AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText(/^AI active/u)).toBeVisible();

  await page.getByRole('button', { name: 'Reset AI' }).click();
  await expect(page.getByLabel('Character direction')).toHaveValue('');
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Character AI' })).toBeVisible();

  browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.requirementModels).toEqual(['lucy-latest', 'lucy-latest']);
  expect(browser.connections).toHaveLength(2);
  expect(browser.connections[1]?.initial.prompt).toBe('An adult paper-cut science host');
  expect(browser.disconnectCalls).toBe(2);
  expect(
    network.apiRequests
      .filter(({ path }) => path === '/api/realtime-token')
      .map(({ model }) => model),
  ).toEqual(['lucy-latest', 'lucy-latest']);
  expectNoExternalProviderTraffic(network);
});

test('a Lucy model take finalizes before the provider session is released', async ({ page }) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await page.getByLabel('Character direction').fill('An adult stop-motion field presenter');
  await page.getByRole('button', { name: 'Start Character AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();

  await closeRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording' }).click();

  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Latest Take' })).toBeHidden();
  await expect(page.getByLabel('Live local camera preview')).toHaveCount(0);
  await expect(page.getByLabel('Studio media stage')).toHaveAttribute(
    'data-stage-presentation',
    'playback',
  );
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await openRecipeDockWhenOverlaid(page);
  await expect(page.getByRole('button', { name: 'Start Character AI' })).toBeDisabled();
  await expect(
    page
      .getByRole('dialog', { name: 'Recipe Dock' })
      .getByText(
        'Download and release or discard the recorded take before starting or changing media.',
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

test('the Decart maximum warns and finalizes an active take before expected release', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await page.getByLabel('Character direction').fill('An adult collage field presenter');
  await page.getByRole('button', { name: 'Start Character AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await closeRecipeDockWhenOverlaid(page);
  await expect(
    page.getByRole('timer', {
      name: /AI session maximum 5:00, elapsed \d:\d{2}, \d:\d{2} remaining/u,
    }),
  ).toBeVisible();

  await triggerGenerationTick(page, 270);
  await expect(page.getByText('AI session ending soon', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

  await triggerGenerationEnded(page, 299);
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();

  const browser = await readBrowserState(page);
  const finalizationIndexes = browser.lifecycleEvents.flatMap((event, index) =>
    event === 'recorder-finalized' ? [index] : [],
  );
  const releaseIndexes = browser.lifecycleEvents.flatMap((event, index) =>
    event === 'provider-disconnected' || event.endsWith('-stopped') ? [index] : [],
  );
  expect(finalizationIndexes).toHaveLength(2);
  expect(Math.min(...releaseIndexes)).toBeGreaterThan(Math.max(...finalizationIndexes));
  expect(browser.disconnectCalls).toBe(1);
  expectNoExternalProviderTraffic(network);
});

test('VTON 3 accepts a valid ephemeral garment image and starts with image-only state', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await expect(page.getByLabel('Integration availability')).toContainText('AI video configured');

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
  await expect(page.getByText(/^AI active/u)).toBeVisible();

  const browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.requirementModels).toEqual(['lucy-vton-latest']);
  expect(browser.connections).toEqual([
    {
      model: 'lucy-vton-latest',
      initial: { prompt: '', imageName: 'linen-overshirt.webp', enhance: false },
    },
  ]);
  expect(
    network.apiRequests
      .filter(({ path }) => path === '/api/realtime-token')
      .map(({ model }) => model),
  ).toEqual(['lucy-vton-latest']);
  expectNoExternalProviderTraffic(network);
});

test('switches to a browser-exposed phone camera while Capture Settings stays open', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await page.evaluate(() => {
    Object.defineProperty(navigator.mediaDevices, 'enumerateDevices', {
      configurable: true,
      value: () =>
        Promise.resolve([
          {
            kind: 'videoinput',
            deviceId: 'built-in-camera',
            groupId: 'built-in',
            label: 'FaceTime HD Camera',
            toJSON: () => ({}),
          },
          {
            kind: 'videoinput',
            deviceId: 'phone-camera',
            groupId: 'continuity',
            label: 'Creator’s iPhone Camera',
            toJSON: () => ({}),
          },
        ]),
    });
  });
  await startLocalPreview(page);

  await page.getByRole('button', { name: 'Open capture settings' }).click();
  const settingsDialog = page.getByRole('dialog', { name: 'Capture Settings' });
  const cameraSelector = page.getByLabel('Camera', { exact: true });
  await expect(settingsDialog).toBeVisible();
  await expect(cameraSelector).toContainText('Creator’s iPhone Camera');
  await cameraSelector.selectOption('phone-camera');
  await page.getByRole('button', { name: 'Apply settings' }).click();

  await expect(settingsDialog).toBeVisible();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await expect.poll(async () => (await readBrowserState(page)).cameraCalls).toBe(2);
  expect((await readBrowserState(page)).lifecycleEvents).toContain('local-video-stopped');
  expectNoExternalProviderTraffic(network);
});

test('Space records and finishes only outside editable controls', async ({ page }) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.setViewportSize({ width: 1_280, height: 720 });
  await page.goto('/studio');

  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Start local preview' }).click();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await closeRecipeDockWhenOverlaid(page);

  const shelfLauncher = page.getByRole('button', { name: 'Shelf' });
  await shelfLauncher.click();
  await page.getByRole('button', { name: 'Try-on recipes' }).click();
  await page.getByRole('button', { name: 'New garment recipe' }).click();
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
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
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
