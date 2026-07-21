import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  expectNoExternalProviderTraffic,
  FIXED_WEBM_BASE64,
  installSuccessfulStudioHarness,
  readBrowserState,
  type StudioHarnessOptions,
  triggerProviderDisconnect,
  type NetworkJourneyState,
} from './support/studioHarness';
import { GUIDED_AI_READY_TIMEOUT_MS } from '../apps/web/src/features/guided-experience/guidedExperienceModel';

const CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v3';

const REPRESENTATIVE_VIEWPORTS = [
  { name: 'compact phone', width: 320, height: 568 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1_112 },
  { name: 'desktop', width: 1_440, height: 960 },
] as const;

const openFreshGuidedCreate = async (
  page: Page,
  options: StudioHarnessOptions = {},
): Promise<{ readonly network: NetworkJourneyState }> => {
  const network = await installSuccessfulStudioHarness(page, {
    referenceImagesAvailable: true,
    ...options,
  });
  await page.goto('/?new=1');
  await expect(page.getByRole('heading', { name: 'Create Your Character' })).toBeVisible();
  return { network };
};

const drawerFor = (page: Page, name: string): Locator =>
  page.locator('details').filter({ has: page.getByRole('heading', { name, exact: true }) });

const openDrawer = async (page: Page, name: string): Promise<Locator> => {
  const drawer = drawerFor(page, name);
  if ((await drawer.getAttribute('open')) === null) await drawer.locator('summary').click();
  await expect(drawer).toHaveAttribute('open', '');
  return drawer;
};

const expectNoHorizontalOverflow = async (page: Page): Promise<void> => {
  const overflow = await page.evaluate(() => {
    const viewportWidth = document.documentElement.clientWidth;
    const visibleTargets = Array.from(
      document.querySelectorAll<HTMLElement>('button, input, textarea, img, [role="img"], summary'),
    ).filter((element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0;
    });
    const escapingTargets = visibleTargets
      .map((element) => {
        const box = element.getBoundingClientRect();
        return {
          label:
            element.getAttribute('aria-label') ??
            element.textContent?.replace(/\s+/gu, ' ').trim().slice(0, 80) ??
            element.tagName,
          left: box.left,
          right: box.right,
          width: box.width,
        };
      })
      .filter(
        ({ left, right, width }) =>
          left < -1 || right > viewportWidth + 1 || width > viewportWidth + 1,
      );

    return {
      viewportWidth,
      documentWidth: document.documentElement.scrollWidth,
      bodyWidth: document.body.scrollWidth,
      escapingTargets,
    };
  });

  expect(overflow.documentWidth, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(
    overflow.viewportWidth + 1,
  );
  expect(overflow.bodyWidth, JSON.stringify(overflow, null, 2)).toBeLessThanOrEqual(
    overflow.viewportWidth + 1,
  );
  expect(overflow.escapingTargets).toEqual([]);
};

const saveDocumentaryPresenterPromptOnly = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /Documentary Presenter/u }).click();
  await page.getByRole('button', { name: 'Save Character' }).click();
  await expect(
    page.getByRole('heading', { name: 'Would you like a reference image?' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Continue with Prompt Only' }).click();
  await expect(page.getByRole('heading', { name: 'Go Live with AI' })).toBeVisible();
};

const startLocalCameraPreview = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Start Camera Preview' }).click();
  await expect(page.getByText('Camera and microphone permission', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue & Allow' }).click();
  await expect(page.getByRole('heading', { name: 'Local preview ready' })).toBeVisible();
  await expect(page.getByText('✓ Camera ready', { exact: true })).toBeVisible();
  await expect(page.getByText('✓ Microphone ready', { exact: true })).toBeVisible();
};

const startAiSession = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Start AI Session' }).click();
  await expect(page.getByRole('heading', { name: "You're live with AI" })).toBeVisible();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
};

test('the guided workflow is the default for every user and Advanced stays explicit', async ({
  page,
}) => {
  await openFreshGuidedCreate(page);

  await expect(page.getByRole('link', { name: 'Advanced Studio' })).toHaveAttribute(
    'href',
    '/advanced',
  );
  await expect(page.getByRole('link', { name: 'My Projects' })).toHaveAttribute(
    'href',
    '/projects',
  );
});

test('every character category is an independent disclosure drawer', async ({ page }) => {
  await openFreshGuidedCreate(page);

  const categoryNames = [
    'Start with a character',
    'Presentation',
    'Adult age',
    'Appearance',
    'Skin tone',
    'Body shape',
    'Hairstyle',
    'Hair color',
    'Outfit',
    'Accessories',
    'Role',
    'Style',
    'Expression',
    'Mood / vibe',
    'Background',
    'Preserve and constraints',
  ] as const;
  for (const name of categoryNames) await expect(drawerFor(page, name)).toHaveCount(1);

  const presentation = drawerFor(page, 'Presentation');
  const appearance = drawerFor(page, 'Appearance');
  await presentation.locator('summary').click();
  await expect(presentation).toHaveAttribute('open', '');
  await expect(appearance).not.toHaveAttribute('open', '');

  await appearance.locator('summary').click();
  await expect(appearance).toHaveAttribute('open', '');
  await expect(presentation).toHaveAttribute('open', '');

  await presentation.locator('summary').click();
  await expect(presentation).not.toHaveAttribute('open', '');
  await expect(appearance).toHaveAttribute('open', '');
});

test('Show All and custom hair remain presentation-independent on a compact phone', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await openFreshGuidedCreate(page);

  const presentation = await openDrawer(page, 'Presentation');
  const woman = presentation.getByRole('button', { name: /Woman/u });
  await woman.click();
  await expect(woman).toHaveAttribute('aria-pressed', 'true');

  const hair = await openDrawer(page, 'Hairstyle');
  await hair.getByRole('button', { name: 'Show All' }).click();
  await expect(
    hair.getByRole('region', { name: 'man Hairstyle options', exact: true }),
  ).toBeVisible();
  await hair.getByRole('button', { name: 'Fade' }).click();
  await expect(woman).toHaveAttribute('aria-pressed', 'true');

  await hair.getByRole('button', { name: 'Show Suggestions' }).click();
  await expect(hair.getByText('Current choice: Fade', { exact: true })).toBeVisible();
  await expect(hair.getByText(/Outside current suggestions/u)).toBeVisible();

  await hair.getByRole('button', { name: 'Describe My Own' }).click();
  const customHair = hair.getByLabel('Describe the hairstyle you want');
  await customHair.fill('Waist-length silver locs with swept fringe');
  await expect(customHair).toHaveValue('Waist-length silver locs with swept fringe');
  await expect(woman).toHaveAttribute('aria-pressed', 'true');
  await expectNoHorizontalOverflow(page);
});

for (const viewport of REPRESENTATIVE_VIEWPORTS) {
  test(`${viewport.name} keeps open guided choices inside the viewport`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await openFreshGuidedCreate(page);

    const presentation = await openDrawer(page, 'Presentation');
    await presentation.getByRole('button', { name: /Woman/u }).click();

    for (const name of ['Skin tone', 'Body shape', 'Hairstyle', 'Hair color', 'Outfit']) {
      await openDrawer(page, name);
    }

    await expect(drawerFor(page, 'Body shape').getByRole('button')).toHaveCount(8);
    await expect(drawerFor(page, 'Hairstyle').getByRole('button')).toHaveCount(8);
    await expect(drawerFor(page, 'Hair color').getByRole('button')).toHaveCount(8);
    await expect(drawerFor(page, 'Outfit').getByRole('button')).toHaveCount(8);
    await expect(drawerFor(page, 'Skin tone').getByRole('button')).toHaveCount(8);

    await expectNoHorizontalOverflow(page);

    const visualAssetFailures = await page.evaluate(async () => {
      const visuals = Array.from(
        document.querySelectorAll<HTMLElement>('details[open] [role="img"]'),
      );
      const sources = [
        ...new Set(
          visuals
            .map(
              (element) =>
                getComputedStyle(element).backgroundImage.match(/url\(["']?(.*?)["']?\)/u)?.[1],
            )
            .filter((value): value is string => Boolean(value)),
        ),
      ];

      return (
        await Promise.all(
          sources.map(
            (source) =>
              new Promise<string | null>((resolve) => {
                const image = new Image();
                image.onload = () =>
                  resolve(image.naturalWidth > 0 && image.naturalHeight > 0 ? null : source);
                image.onerror = () => resolve(source);
                image.src = source;
              }),
          ),
        )
      ).filter((value): value is string => value !== null);
    });
    expect(visualAssetFailures).toEqual([]);

    const fittingModes = await page
      .locator(
        'section[aria-labelledby="guided-bodyShape-heading"] [role="img"], section[aria-labelledby="guided-hair-heading"] [role="img"], section[aria-labelledby="guided-outfit-heading"] [role="img"]',
      )
      .evaluateAll((elements) =>
        elements.map((element) => getComputedStyle(element).backgroundSize),
      );
    expect(fittingModes).not.toHaveLength(0);
    expect(new Set(fittingModes)).toEqual(new Set(['contain']));
  });
}

test('prompt-only save does not request or generate a reference image', async ({ page }) => {
  const { network } = await openFreshGuidedCreate(page);
  await saveDocumentaryPresenterPromptOnly(page);

  expect(network.referenceWorkflowCalls).toEqual([]);
  expect(network.referenceImageGenerations).toEqual([]);
  expectNoExternalProviderTraffic(network);
  const browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(0);
  expect(browser.connections).toEqual([]);
});

test('camera preview is explicitly local before any AI token or connection', async ({ page }) => {
  const { network } = await openFreshGuidedCreate(page);
  await saveDocumentaryPresenterPromptOnly(page);

  await page.getByRole('button', { name: 'Start Camera Preview' }).click();
  await expect(page.getByText('Camera and microphone permission', { exact: true })).toBeVisible();
  let browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(0);
  expect(browser.connections).toEqual([]);

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Start Camera Preview' })).toBeEnabled();
  await expect.poll(async () => (await readBrowserState(page)).cameraCalls).toBe(0);

  await page.getByRole('button', { name: 'Start Camera Preview' }).click();
  await expect(page.getByText('Camera and microphone permission', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue & Allow' }).click();
  await expect(page.getByRole('heading', { name: 'Local preview ready' })).toBeVisible();
  await expect(page.getByText('✓ Camera ready', { exact: true })).toBeVisible();
  await expect(page.getByText('✓ Microphone ready', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start AI Session' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Stop Camera' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Start Camera Preview' })).toHaveCount(0);
  await expect.poll(async () => (await readBrowserState(page)).cameraCalls).toBe(1);

  browser = await readBrowserState(page);
  expect(browser.connections).toEqual([]);
  expect(network.apiRequests.filter(({ path }) => path === '/api/realtime-token')).toEqual([]);
  expectNoExternalProviderTraffic(network);
});

test('duplicate camera and AI actions remain single-flight and reach the live state', async ({
  page,
}) => {
  const { network } = await openFreshGuidedCreate(page);
  await saveDocumentaryPresenterPromptOnly(page);

  await page.getByRole('button', { name: 'Start Camera Preview' }).click();
  await expect(page.getByText('Camera and microphone permission', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Continue & Allow' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });

  await expect(page.getByRole('heading', { name: 'Local preview ready' })).toBeVisible();
  await expect.poll(async () => (await readBrowserState(page)).cameraCalls).toBe(1);

  await page.getByRole('button', { name: 'Start AI Session' }).evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });

  await expect(page.getByRole('heading', { name: "You're live with AI" })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to Record' })).toBeVisible();
  await expect.poll(async () => (await readBrowserState(page)).connections.length).toBe(1);
  expect(network.apiRequests.filter(({ path }) => path === '/api/realtime-token')).toHaveLength(1);
  expectNoExternalProviderTraffic(network);
});

test('Start AI retries a failed startup capability check without restarting local media', async ({
  page,
}) => {
  const { network } = await openFreshGuidedCreate(page, {
    capabilityFailuresBeforeSuccess: 20,
  });
  await saveDocumentaryPresenterPromptOnly(page);
  await startLocalCameraPreview(page);

  await expect(page.getByText('! AI status needs retry', { exact: true })).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByRole('button', { name: 'Start AI Session' })).toBeEnabled();
  network.setCapabilityFailuresRemaining(0);
  await page.getByRole('button', { name: 'Start AI Session' }).click();

  await expect(page.getByRole('heading', { name: "You're live with AI" })).toBeVisible();
  const browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.connections).toHaveLength(1);
  expect(
    network.apiRequests.filter(({ path }) => path === '/api/capabilities').length,
  ).toBeGreaterThanOrEqual(5);
  expect(network.apiRequests.filter(({ path }) => path === '/api/realtime-token')).toHaveLength(1);
  expectNoExternalProviderTraffic(network);
});

test('a connected AI session without transformed video returns to the reusable local preview', async ({
  page,
}) => {
  await openFreshGuidedCreate(page, { realtimeProvidesVideo: false });
  await saveDocumentaryPresenterPromptOnly(page);
  await startLocalCameraPreview(page);
  await page.clock.install({ time: new Date('2026-07-20T12:00:00.000Z') });

  await page.getByRole('button', { name: 'Start AI Session' }).click();
  await expect(page.getByRole('heading', { name: 'Connecting your character' })).toBeVisible();
  await page.clock.runFor(GUIDED_AI_READY_TIMEOUT_MS + 100);

  await expect(page.getByRole('heading', { name: 'Local preview ready' })).toBeVisible();
  await expect(
    page.getByText(/AI did not provide a live transformed video in time/u),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start AI Session' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Stop Camera' })).toBeEnabled();
});

test('Stop AI preserves a reusable local preview and Stop Camera can be restarted', async ({
  page,
}) => {
  const { network } = await openFreshGuidedCreate(page);
  await saveDocumentaryPresenterPromptOnly(page);
  await startLocalCameraPreview(page);

  await page.getByRole('button', { name: 'Stop Camera' }).click();
  await expect(page.getByRole('button', { name: 'Start Camera Preview' })).toBeVisible();
  let browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.connections).toEqual([]);
  expect(browser.lifecycleEvents).toEqual(
    expect.arrayContaining(['local-video-stopped', 'local-audio-stopped']),
  );

  await startLocalCameraPreview(page);
  await startAiSession(page);
  await page.getByRole('button', { name: 'Stop AI' }).click();
  await expect(page.getByRole('heading', { name: 'Local preview ready' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start AI Session' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop Camera' })).toBeVisible();

  browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(2);
  expect(browser.connections).toHaveLength(1);
  expect(browser.disconnectCalls).toBe(1);
  expect(browser.lifecycleEvents.filter((event) => event === 'local-video-stopped')).toHaveLength(
    1,
  );

  await startAiSession(page);
  await page.getByRole('button', { name: 'Stop Camera' }).click();
  await expect(page.getByRole('button', { name: 'Start Camera Preview' })).toBeVisible();
  browser = await readBrowserState(page);
  expect(browser.connections).toHaveLength(2);
  expect(browser.disconnectCalls).toBe(2);
  expect(browser.lifecycleEvents.filter((event) => event === 'local-video-stopped')).toHaveLength(
    2,
  );
  expectNoExternalProviderTraffic(network);
});

test('an unexpected AI disconnect returns to the local preview and can reconnect', async ({
  page,
}) => {
  const { network } = await openFreshGuidedCreate(page);
  await saveDocumentaryPresenterPromptOnly(page);
  await startLocalCameraPreview(page);
  await startAiSession(page);

  await triggerProviderDisconnect(page);
  await expect(page.getByRole('heading', { name: 'Local preview ready' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start AI Session' })).toBeVisible();
  await expect(page.getByText(/AI connection ended/u).first()).toBeVisible();
  let browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.connections).toHaveLength(1);

  await startAiSession(page);
  browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.connections).toHaveLength(2);
  expectNoExternalProviderTraffic(network);
});

test('reference generation is explicit and unchanged characters can reuse it without a second generation', async ({
  page,
}) => {
  const { network } = await openFreshGuidedCreate(page);
  await page.getByRole('button', { name: /Documentary Presenter/u }).click();
  await page.getByRole('button', { name: 'Save Character' }).click();
  await page.getByRole('button', { name: 'Generate Reference & Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Generate a character reference' })).toBeVisible();
  expect(network.referenceWorkflowCalls).toEqual([]);
  await page.getByRole('button', { name: 'Generate Reference & Continue' }).click();
  await expect(page.getByRole('heading', { name: 'Go Live with AI' })).toBeVisible();

  expect(network.referenceWorkflowCalls).toEqual(['optimize', 'generate']);
  expect(network.referenceImageGenerations).toHaveLength(1);
  const generated = network.referenceImageGenerations[0];
  if (!generated) throw new Error('The deterministic reference was not generated.');
  const expectedLivePrompt = generated.optimization.enabled
    ? generated.optimization.result.lucy25CharacterPrompt
    : generated.rawPrompt;

  const referencePreview = page.getByAltText(/Generated reference for/u);
  await expect(referencePreview).toBeVisible();
  await expect(referencePreview).toHaveAttribute('src', new RegExp(generated.assetId, 'u'));
  await expect(
    page.getByText('Generated reference attached to this character', { exact: true }),
  ).toBeVisible();
  expect(network.referenceImageContentReads).toContain(generated.assetId);
  const savedReference = await page.evaluate(
    ({ assetId, storageKey }) => {
      const serialized = localStorage.getItem(storageKey);
      if (!serialized) return null;
      const store = JSON.parse(serialized) as {
        savedCharacterPrompts?: Array<{
          referenceImageStatus?: string;
          referenceImageAssetId?: string | null;
        }>;
      };
      const saved = store.savedCharacterPrompts?.find(
        (character) => character.referenceImageAssetId === assetId,
      );
      return saved
        ? {
            referenceImageStatus: saved.referenceImageStatus ?? null,
            referenceImageAssetId: saved.referenceImageAssetId ?? null,
          }
        : null;
    },
    { assetId: generated.assetId, storageKey: CREATIVE_ASSET_STORAGE_KEY },
  );
  expect(savedReference).toEqual({
    referenceImageStatus: 'persisted-reference',
    referenceImageAssetId: generated.assetId,
  });

  await startLocalCameraPreview(page);
  let browser = await readBrowserState(page);
  expect(browser.connections).toEqual([]);
  await startAiSession(page);
  browser = await readBrowserState(page);
  expect(browser.connections).toEqual([
    {
      model: 'lucy-2.5',
      initial: {
        prompt: expectedLivePrompt,
        imageName: `reference-${generated.assetId}.png`,
        enhance: true,
      },
    },
  ]);

  await page.getByRole('button', { name: 'Edit Character' }).click();
  await expect(page.getByRole('heading', { name: 'Create Your Character' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Save Character' }).click();
  await expect(page.getByRole('button', { name: 'Keep Existing Reference' })).toBeVisible();
  await page.getByRole('button', { name: 'Keep Existing Reference' }).click();
  await expect(page.getByRole('heading', { name: 'Go Live with AI' })).toBeVisible();

  expect(network.referenceImageGenerations).toHaveLength(1);
  expectNoExternalProviderTraffic(network);
});

test('390px prompt-only journey reaches a truthful original-voice download without overflow', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { network } = await openFreshGuidedCreate(page);
  await expectNoHorizontalOverflow(page);

  await saveDocumentaryPresenterPromptOnly(page);
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Start Camera Preview' }).click();
  await expect(page.getByText('Camera and microphone permission', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Continue & Allow' }).click();
  await expect(page.getByRole('heading', { name: 'Local preview ready' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await startAiSession(page);
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Continue to Record' }).click();
  await expect(page.getByRole('heading', { name: 'Record Your Take' })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole('button', { name: 'Start Recording' }).click();
  await expect(page.getByRole('button', { name: 'Stop Recording' })).toBeVisible({
    timeout: 6_000,
  });
  await expect(page.getByRole('button', { name: 'Stop AI' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stop Camera' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Stop Camera' }).click();
  await expect(page.getByRole('heading', { name: 'Review your take' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  const stoppedResources = await readBrowserState(page);
  expect(stoppedResources.disconnectCalls).toBe(1);
  expect(stoppedResources.lifecycleEvents).toEqual(
    expect.arrayContaining([
      'provider-video-stopped',
      'provider-audio-stopped',
      'local-video-stopped',
      'local-audio-stopped',
    ]),
  );

  await page.getByRole('button', { name: 'Use This Take' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a voice' })).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await page.getByRole('button', { name: 'Keep Original Voice' }).click();
  await expect(page.getByRole('heading', { name: 'Your video is ready!' })).toBeVisible();
  await expect(page.getByText('Original voice', { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  const downloadStarted = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download Video' }).click();
  const download = await downloadStarted;
  expect(download.suggestedFilename()).toMatch(/documentary-presenter.*\.webm$/u);
  await expect(page.getByRole('heading', { name: 'All Done!' })).toBeVisible();
  await expect(
    page.getByText('Camera off · Microphone off · AI session ended', { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(network.referenceWorkflowCalls).toEqual([]);
  expect(network.referenceImageGenerations).toEqual([]);
  const browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(1);
  expect(browser.connections).toHaveLength(1);
  expect(browser.recorderStarts).toBeGreaterThanOrEqual(1);
  expect(browser.recorderStops).toBe(browser.recorderStarts);
  expectNoExternalProviderTraffic(network);
});

test('Chromium applies a workspace voice to the recorded take and reaches Download', async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== 'chromium', 'The local WebCodecs remux is verified in Chromium.');
  const { network } = await openFreshGuidedCreate(page, { elevenLabsAvailable: true });
  await saveDocumentaryPresenterPromptOnly(page);
  await startLocalCameraPreview(page);
  await startAiSession(page);
  await page.getByRole('button', { name: 'Continue to Record' }).click();
  await page.getByRole('button', { name: 'Start Recording' }).click();
  await expect(page.getByRole('button', { name: 'Stop Recording' })).toBeVisible({
    timeout: 6_000,
  });
  await page.getByRole('button', { name: 'Stop Recording' }).click();
  await expect(page.getByRole('heading', { name: 'Review your take' })).toBeVisible();
  await page.getByRole('button', { name: 'Use This Take' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a voice' })).toBeVisible();

  await page.getByRole('button', { name: /Load My Voices/u }).click();
  await expect(page.getByText('Northstar Narrator', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Select Northstar Narrator' }).click();
  await page.getByRole('button', { name: 'Apply Northstar Narrator to recorded audio' }).click();
  await expect(page.getByRole('heading', { name: 'Your new voice is ready' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByRole('button', { name: 'Northstar Narrator' })).toBeEnabled();

  expect(
    network.apiRequests.filter(({ path }) => path === '/api/elevenlabs/voice-changer/recording'),
  ).toHaveLength(1);
  await page.getByRole('button', { name: 'Use This Voice' }).click();
  await expect(page.getByRole('heading', { name: 'Your video is ready!' })).toBeVisible();
  await expect(page.getByText('Northstar Narrator', { exact: true })).toBeVisible();
  expectNoExternalProviderTraffic(network);
});

test('the browser can lazy-load MediaBunny without a Vite optimized-dependency 504', async ({
  page,
}) => {
  const dependencyResponses: Array<{ url: string; status: number }> = [];
  const dependencyFailures: string[] = [];
  page.on('response', (response) => {
    if (/mediabunny/iu.test(response.url())) {
      dependencyResponses.push({ url: response.url(), status: response.status() });
    }
  });
  page.on('requestfailed', (request) => {
    if (/mediabunny/iu.test(request.url())) dependencyFailures.push(request.url());
  });

  await openFreshGuidedCreate(page);
  const importResult = await page.evaluate(async () => {
    const modulePath = '/src/adapters/media-processing/replaceAudioTrack.ts';
    const mediaModule = (await import(modulePath)) as {
      replaceRecordingAudio(
        originalVideo: Blob,
        replacementAudio: Blob,
        signal: AbortSignal,
      ): Promise<unknown>;
    };
    try {
      await mediaModule.replaceRecordingAudio(
        new Blob([], { type: 'video/webm' }),
        new Blob([], { type: 'audio/webm' }),
        new AbortController().signal,
      );
      return { loaded: true, error: null };
    } catch (error) {
      return {
        loaded: true,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  expect(importResult.loaded).toBe(true);
  expect(importResult.error ?? '').not.toMatch(
    /504|Outdated Optimize Dep|Failed to fetch dynamically imported module/iu,
  );
  await expect.poll(() => dependencyResponses.length).toBeGreaterThan(0);
  expect(
    dependencyResponses.every(({ status }) => status < 400),
    JSON.stringify(dependencyResponses, null, 2),
  ).toBe(true);
  expect(dependencyFailures).toEqual([]);
});

test('Chromium can remux replacement audio into a real recorded take', async ({
  browserName,
  page,
}) => {
  test.skip(browserName !== 'chromium', 'WebCodecs output support is browser-specific.');
  await openFreshGuidedCreate(page);

  const remuxed = await page.evaluate(async (webmBase64) => {
    const modulePath = '/src/adapters/media-processing/replaceAudioTrack.ts';
    const mediaModule = (await import(modulePath)) as {
      replaceRecordingAudio(
        originalVideo: Blob,
        replacementAudio: AudioBuffer,
        signal: AbortSignal,
      ): Promise<{ blob: Blob; mimeType: string }>;
    };
    const sourceBytes = Uint8Array.from(atob(webmBase64), (character) => character.charCodeAt(0));
    const replacement = new AudioBuffer({
      length: 9_600,
      numberOfChannels: 1,
      sampleRate: 48_000,
    });
    const samples = replacement.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin((index / replacement.sampleRate) * Math.PI * 440) * 0.08;
    }
    const result = await mediaModule.replaceRecordingAudio(
      new Blob([sourceBytes], { type: 'video/webm' }),
      replacement,
      new AbortController().signal,
    );
    return { size: result.blob.size, mimeType: result.mimeType };
  }, FIXED_WEBM_BASE64);

  expect(remuxed.size).toBeGreaterThan(100);
  expect(remuxed.mimeType).toMatch(/^video\/webm/u);
});
