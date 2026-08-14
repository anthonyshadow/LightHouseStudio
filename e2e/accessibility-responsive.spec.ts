import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { CapabilitiesResponse } from '@studio/contracts';
import { TEST_AUTH_SESSION } from './support/authFixture';
import { STUDIO_VIEWPORT_SIZES } from './support/studioViewports';
import {
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  openCharacterOptions,
  openRecipeDockWhenOverlaid,
} from './support/studioHarness';
import { installCampaignHarness } from './support/campaignHarness';
import { loadDecodableH264VideoFixture } from './support/existingVideoHarness';
import { installProjectHarness, TEST_PROJECT_ID } from './support/projectHarness';

type MockStudioState = {
  apiRequests: string[];
  blockedExternalRequests: string[];
  blockedExternalWebSockets: string[];
};

type BrowserTestState = {
  cameraCalls: number;
};

const installProviderFreeStudio = async (page: Page): Promise<MockStudioState> => {
  const state: MockStudioState = {
    apiRequests: [],
    blockedExternalRequests: [],
    blockedExternalWebSockets: [],
  };

  await page.addInitScript(() => {
    const browserState: BrowserTestState = { cameraCalls: 0 };
    Object.defineProperty(window, '__lightframeAccessibilityTestState', {
      configurable: true,
      value: browserState,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          browserState.cameraCalls += 1;
          return Promise.reject(
            new DOMException('Mocked camera permission denial.', 'NotAllowedError'),
          );
        },
        enumerateDevices: () => Promise.resolve([]),
      },
    });
  });

  await page.routeWebSocket(
    (url) => !['127.0.0.1', 'localhost'].includes(url.hostname),
    async (webSocket) => {
      state.blockedExternalWebSockets.push(webSocket.url());
      await webSocket.close({ code: 1008, reason: 'External sockets are blocked in e2e.' });
    },
  );

  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const isLocal = ['127.0.0.1', 'localhost'].includes(requestUrl.hostname);
    if (!isLocal) {
      state.blockedExternalRequests.push(requestUrl.href);
      await route.abort('blockedbyclient');
      return;
    }

    if (requestUrl.pathname === '/api/auth/me') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TEST_AUTH_SESSION),
      });
      return;
    }

    if (requestUrl.pathname.startsWith('/api/')) {
      state.apiRequests.push(requestUrl.pathname);
      if (requestUrl.pathname === '/api/capabilities') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            realtimeVideo: { available: true },
            videoProcessing: {
              characterSwap: {
                available: false,
                inputPreparation: 'none',
                referencePolicy: 'optional',
                promptInput: 'editable',
                promptEnhancement: true,
                terminalFailureRelease: 'automatic',
                outputResolutions: ['720p'],
              },
              virtualTryOn: {
                available: false,
                inputPreparation: 'none',
                referencePolicy: 'optional',
                promptInput: 'editable',
                promptEnhancement: true,
                terminalFailureRelease: 'automatic',
                outputResolutions: ['720p'],
              },
            },
            elevenLabs: { available: false, modelId: null },
            referenceImages: {
              available: false,
              editAvailable: false,
              providerId: 'openai',
              modelId: 'gpt-image-2',
              sizes: ['1024x1024', '1024x1536', '1536x1024'],
              optimizer: {
                available: false,
                model: 'gpt-5.6',
                version: 'lucy-character-reference-v1',
              },
            },
            wardrobe: { addOutfitAvailable: false },
            savedVideos: { directMultipartUpload: false },
          } satisfies CapabilitiesResponse),
        });
        return;
      }

      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'unexpected-test-request', message: 'Provider calls are blocked in e2e.' },
        }),
      });
      return;
    }

    await route.continue();
  });

  return state;
};

const cameraCalls = async (page: Page): Promise<number> =>
  page.evaluate(() => {
    const testWindow = window as typeof window & {
      __lightframeAccessibilityTestState: BrowserTestState;
    };
    return testWindow.__lightframeAccessibilityTestState.cameraCalls;
  });

const expectNoDocumentOverflow = async (page: Page) => {
  const dimensions = await page.evaluate(() => ({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clientHeight: document.documentElement.clientHeight,
    scrollHeight: document.documentElement.scrollHeight,
    bodyScrollWidth: document.body.scrollWidth,
    bodyScrollHeight: document.body.scrollHeight,
  }));

  expect(
    dimensions.scrollWidth,
    `document width ${dimensions.scrollWidth}px exceeded viewport width ${dimensions.viewportWidth}px`,
  ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(
    dimensions.bodyScrollWidth,
    `body width ${dimensions.bodyScrollWidth}px exceeded viewport width ${dimensions.viewportWidth}px`,
  ).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(
    dimensions.scrollHeight,
    `document height ${dimensions.scrollHeight}px exceeded viewport height ${dimensions.viewportHeight}px`,
  ).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
  expect(
    dimensions.bodyScrollHeight,
    `body height ${dimensions.bodyScrollHeight}px exceeded viewport height ${dimensions.viewportHeight}px`,
  ).toBeLessThanOrEqual(dimensions.viewportHeight + 1);

  expect(dimensions.clientWidth).toBeLessThanOrEqual(dimensions.viewportWidth + 1);
  expect(dimensions.clientHeight).toBeLessThanOrEqual(dimensions.viewportHeight + 1);
};

const expectNoAxeViolations = async (page: Page) => {
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.flatMap((node) => node.target),
  }));

  expect(summary).toEqual([]);
};

const representativeViewports = [
  { name: 'full desktop', ...STUDIO_VIEWPORT_SIZES.fullDesktop },
  { name: 'small mobile', ...STUDIO_VIEWPORT_SIZES.smallMobile },
] as const;

for (const viewport of representativeViewports) {
  test(`${viewport.name} preparation is accessible and viewport-bound`, async ({ page }) => {
    const network = await installProviderFreeStudio(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/studio');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'First take guide' })).toContainText(
      'Record New Video or Upload Video → review',
    );
    await expect(
      page
        .getByRole('complementary', { name: 'First take guide' })
        .getByText('Virtual Try On · Character Swap · Voice → Save', { exact: true }),
    ).toBeVisible();
    const stageFrameBox = await page.locator('[data-stage-frame]').boundingBox();
    const guideBox = await page.locator('[data-first-success-guide]').boundingBox();
    expect(stageFrameBox).not.toBeNull();
    expect(guideBox).not.toBeNull();
    expect(guideBox!.x).toBeGreaterThanOrEqual(stageFrameBox!.x);
    expect(guideBox!.x + guideBox!.width).toBeLessThanOrEqual(
      stageFrameBox!.x + stageFrameBox!.width,
    );
    expect(guideBox!.y).toBeGreaterThanOrEqual(stageFrameBox!.y);
    expect(guideBox!.y + guideBox!.height).toBeLessThanOrEqual(
      stageFrameBox!.y + stageFrameBox!.height,
    );
    const availability = page.getByLabel('Integration availability');
    await availability.getByRole('button').click();
    await expect(page.getByRole('region', { name: 'Studio availability details' })).toContainText(
      'AI video configured',
    );

    const statusTrigger = availability.getByRole('button');
    const accountTrigger = page.getByRole('button', { name: 'Lightframe Demo account menu' });
    await expect(accountTrigger).toBeVisible();
    const statusTriggerBox = await statusTrigger.boundingBox();
    const accountTriggerBox = await accountTrigger.boundingBox();
    expect(statusTriggerBox).not.toBeNull();
    expect(accountTriggerBox).not.toBeNull();
    expect(accountTriggerBox!.x).toBeGreaterThan(statusTriggerBox!.x);
    expect(accountTriggerBox!.x + accountTriggerBox!.width).toBeLessThanOrEqual(viewport.width);
    expect(
      await accountTrigger.evaluate((trigger) => getComputedStyle(trigger).backgroundColor),
    ).not.toBe('rgba(0, 0, 0, 0)');

    await accountTrigger.click();
    const accountMenu = page.getByRole('menu', { name: 'Account and saved libraries' });
    await expect(accountMenu).toBeVisible();
    await expect(page.getByRole('region', { name: 'Studio availability details' })).toHaveCount(0);
    await expect
      .poll(() =>
        accountMenu.evaluate((menu) => {
          const bounds = menu.getBoundingClientRect();
          const topmost = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          );
          return topmost !== null && (topmost === menu || menu.contains(topmost));
        }),
      )
      .toBe(true);
    await page.keyboard.press('Escape');

    await availability.getByRole('button').click();
    const availabilityMenu = page.getByRole('region', { name: 'Studio availability details' });
    await expect(availabilityMenu).toBeVisible();
    await expect
      .poll(() =>
        availabilityMenu.evaluate((menu) => {
          const bounds = menu.getBoundingClientRect();
          const topmost = document.elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          );
          return topmost !== null && (topmost === menu || menu.contains(topmost));
        }),
      )
      .toBe(true);
    await availability.getByRole('button').click();

    const skipLink = page.getByRole('link', { name: 'Skip to studio' });
    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await expectNoDocumentOverflow(page);
    await expect(page.getByRole('button', { name: 'Dock' })).toHaveAccessibleDescription(
      'Set up camera or AI',
    );
    await expect(page.getByRole('button', { name: 'Workshop' })).toHaveAccessibleDescription(
      'Advanced · build one visual change',
    );

    await openRecipeDockWhenOverlaid(page);
    const characterMode = page.getByRole('button', { name: 'Character · Lucy 2.5' });
    await characterMode.focus();
    await page.keyboard.press('Enter');
    await expect(characterMode).toHaveAttribute('aria-pressed', 'true');

    const direction = page.getByLabel('Character direction');
    await direction.focus();
    await page.keyboard.type('An adult field correspondent');
    await expect(direction).toHaveValue('An adult field correspondent');

    const workshop = page.getByRole('button', { name: 'Open structured prompt workshop' });
    await workshop.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'Direct one clear visual change' }),
    ).toBeVisible();

    await expectNoDocumentOverflow(page);
    await expectNoAxeViolations(page);
    expect(await cameraCalls(page)).toBe(0);
    expect(network.blockedExternalRequests).toEqual([]);
    expect(network.blockedExternalWebSockets).toEqual([]);
    expect(new Set(network.apiRequests)).toEqual(
      new Set(['/api/capabilities', '/api/creative-library']),
    );
  });
}

test('small-mobile Project output review reflows at 200% text with accessible save choices', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await installProjectHarness(page, true);
  await page.setViewportSize(STUDIO_VIEWPORT_SIZES.smallMobile);
  await page.goto(`/studio/projects/${TEST_PROJECT_ID}`);
  const fixture = await loadDecodableH264VideoFixture();
  await page.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
    name: 'accessible-project-output.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  const createTrigger = page.getByRole('button', { name: 'Save as New Video' });
  const appendTrigger = page.getByRole('button', { name: 'Add Version' });
  await expect(createTrigger).toBeVisible();
  await expect(appendTrigger).toBeVisible();
  for (const trigger of [createTrigger, appendTrigger]) {
    const bounds = await trigger.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await expectNoDocumentOverflow(page);
  await expectNoAxeViolations(page);

  await createTrigger.click();
  const dialog = page.getByRole('dialog', { name: 'Save as New Video' });
  await expect(dialog.getByLabel('Video title')).toBeFocused();
  await expectNoDocumentOverflow(page);
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(createTrigger).toBeFocused();
  expectNoExternalProviderTraffic(network);
});

test('small-mobile Builder steps survive 200% text and keep one preview', async ({ page }) => {
  test.setTimeout(60_000);
  const network = await installProviderFreeStudio(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/studio');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'New character recipe' }).click();
  const dialog = page.getByRole('dialog', { name: 'Build Your Character' });
  const previewStep = dialog.getByRole('button', {
    name: /^Preview(?: |$)/u,
  });
  await expect(previewStep).toBeVisible();
  await previewStep.click();

  const preview = dialog.getByRole('complementary', {
    name: 'Character Direction Preview',
  });
  await expect(dialog.getByRole('heading', { name: 'Ready to Generate?' })).toBeFocused();
  await expect(preview).toBeVisible();
  await expect(dialog.getByRole('complementary')).toHaveCount(1);
  await expectNoDocumentOverflow(page);
  await expectNoAxeViolations(page);
  expect(await cameraCalls(page)).toBe(0);
  expect(new Set(network.apiRequests)).toEqual(
    new Set(['/api/capabilities', '/api/creative-library']),
  );
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});

test('mobile Campaign organization remains keyboard-accessible at 200% text', async ({ page }) => {
  const network = await installProviderFreeStudio(page);
  await installCampaignHarness(page, true);
  await page.setViewportSize(STUDIO_VIEWPORT_SIZES.mobilePortrait);
  await page.goto('/studio/campaigns');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  await expect(page.getByRole('heading', { name: 'Campaigns', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Summer launch' })).toBeVisible();
  await expectNoDocumentOverflow(page);
  const createTrigger = page.getByRole('button', { name: 'Create Campaign' });
  await createTrigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Create Campaign' });
  await expect(dialog.getByRole('heading', { name: 'Create Campaign' })).toBeFocused();
  await expectNoDocumentOverflow(page);
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(createTrigger).toBeFocused();
  expect(await cameraCalls(page)).toBe(0);
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});

test('phone and tablet keep AI preparation in Dock and Shelf with no header selector', async ({
  page,
}) => {
  const network = await installProviderFreeStudio(page);
  await page.setViewportSize(STUDIO_VIEWPORT_SIZES.compactDesktop);
  await page.goto('/studio');
  const desktopRail = page.getByRole('navigation', { name: 'Creative workspace tools' });
  await expect
    .poll(() =>
      desktopRail
        .locator('button')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
    )
    .toEqual(['Dock', 'Edit Video', 'Select Character', 'Select Outfit', 'Workshop', 'Shelf']);
  await expect(page.getByRole('button', { name: /Open Select AI options/u })).toHaveCount(0);

  for (const viewport of [
    STUDIO_VIEWPORT_SIZES.tabletPortrait,
    STUDIO_VIEWPORT_SIZES.mobilePortrait,
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/studio');
    const rail = page.getByRole('navigation', { name: 'Creative workspace tools' });
    await expect(rail.getByRole('button')).toHaveCount(4);
    await expect(rail.getByRole('button', { name: 'Select Character' })).toHaveCount(0);
    await expect(rail.getByRole('button', { name: 'Select Outfit' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Select AI/u })).toHaveCount(0);

    const dock = rail.getByRole('button', { name: 'Dock' });
    await dock.click();
    const recipeDock = page.getByRole('dialog', { name: 'Recipe Dock' });
    await expect(recipeDock.getByRole('button', { name: 'Character · Lucy 2.5' })).toBeVisible();
    await expect(recipeDock.getByRole('button', { name: 'Virtual Try-On · VTON 3' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dock).toBeFocused();

    const shelf = rail.getByRole('button', { name: 'Shelf' });
    await shelf.click();
    const recipeShelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
    await expect(recipeShelf.getByRole('button', { name: /^Characters/u })).toBeVisible();
    await expect(recipeShelf.getByRole('button', { name: /^Try-on recipes/u })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(shelf).toBeFocused();
  }
  expect(await cameraCalls(page)).toBe(0);
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});

test('desktop Outfit Builder saves and selects a prompt outfit without media or provider work', async ({
  page,
}) => {
  const network = await installProviderFreeStudio(page);
  await page.setViewportSize(STUDIO_VIEWPORT_SIZES.compactDesktop);
  await page.goto('/studio');

  await page.getByRole('button', { name: 'Select Outfit', exact: true }).click();
  const selector = page.getByRole('dialog', { name: 'Outfit' });
  await selector.getByRole('button', { name: 'Create new outfit' }).click();
  const builder = page.getByRole('dialog', { name: 'Create a new outfit' });
  await builder.getByLabel('Garment direction').fill('A structured copper linen overshirt.');
  await builder.getByRole('checkbox', { name: 'Enhance prompt' }).check();
  await builder.getByRole('button', { name: 'Continue to save' }).click();
  await builder.getByLabel('Outfit name').fill('Copper overshirt');
  await builder.getByRole('button', { name: 'Save & Select' }).click();

  await expect(builder).toBeHidden();
  const selectedOutfit = page.getByRole('button', {
    name: 'Selected outfit: Copper overshirt. Open outfit options',
  });
  await expect(selectedOutfit).toBeVisible();
  await selectedOutfit.click();
  await expect(page.getByRole('dialog', { name: 'Outfit' })).toContainText('Copper overshirt');
  expect(await cameraCalls(page)).toBe(0);
  expect(new Set(network.apiRequests)).toEqual(
    new Set(['/api/capabilities', '/api/creative-library']),
  );
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});

test('small-mobile Recipe Dock scrolls internally and Escape restores launcher focus', async ({
  page,
}) => {
  const network = await installProviderFreeStudio(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/studio');

  const launcher = page.getByRole('button', { name: 'Dock' });
  await launcher.focus();
  await expect(launcher).toBeFocused();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Recipe Dock' });
  await expect(dialog).toBeVisible();
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();

  const scrollRegion = page.locator('[data-scroll-region="recipe-dock"]');
  await expect(scrollRegion).toBeVisible();
  const beforeScroll = await scrollRegion.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      scrollTop: element.scrollTop,
      overflowY: style.overflowY,
    };
  });
  expect(beforeScroll.overflowY).toMatch(/auto|scroll/u);
  expect(beforeScroll.scrollHeight).toBeGreaterThan(beforeScroll.clientHeight);

  await scrollRegion.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect.poll(() => scrollRegion.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expectNoDocumentOverflow(page);

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(launcher).toBeFocused();
  await expectNoDocumentOverflow(page);
  expect(await cameraCalls(page)).toBe(0);
  expect(new Set(network.apiRequests)).toEqual(
    new Set(['/api/capabilities', '/api/creative-library']),
  );
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});

test('empty VTON Start is blocked before camera access or token issuance', async ({ page }) => {
  const network = await installProviderFreeStudio(page);
  await page.goto('/studio');

  await openRecipeDockWhenOverlaid(page);
  const vtonMode = page.getByRole('button', { name: 'Virtual Try-On · VTON 3' });
  await vtonMode.focus();
  await page.keyboard.press('Enter');
  await expect(vtonMode).toHaveAttribute('aria-pressed', 'true');

  const start = page.getByRole('button', { name: 'Start Virtual Try-On AI' });
  await expect(start).toBeDisabled();
  await expect(
    page.getByText('Add a garment direction or garment reference to start.'),
  ).toBeVisible();
  expect(await cameraCalls(page)).toBe(0);
  expect(network.apiRequests).not.toContain('/api/realtime-token');
  expect(new Set(network.apiRequests)).toEqual(
    new Set(['/api/capabilities', '/api/creative-library']),
  );
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});

test('explicit local Start surfaces a sanitized camera denial without provider work', async ({
  page,
}) => {
  const network = await installProviderFreeStudio(page);
  await page.goto('/studio');

  await openRecipeDockWhenOverlaid(page);
  const start = page.getByRole('button', { name: 'Start local preview' });
  await start.focus();
  await page.keyboard.press('Enter');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Camera or microphone access was not allowed.');
  await expect(alert).toContainText('Allow access in browser settings, then try again.');
  await expect(alert).not.toContainText('Mocked camera permission denial.');
  await expect(alert.getByRole('button', { name: 'Capture settings' })).toBeVisible();
  expect(await cameraCalls(page)).toBe(1);
  expect(network.apiRequests).not.toContain('/api/realtime-token');

  await alert.getByRole('button', { name: 'Capture settings' }).click();
  const inlineSettings = page.locator('[data-desktop-capture-settings]');
  if ((await inlineSettings.count()) > 0) {
    await expect(inlineSettings).toBeVisible();
  } else {
    await expect(page.getByRole('dialog', { name: 'Capture Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Close panel' }).click();
  }
  await page.getByRole('button', { name: 'Record New Video' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Camera or microphone access was not allowed.',
  );
  expect(await cameraCalls(page)).toBe(2);
  expect(network.apiRequests).not.toContain('/api/realtime-token');
  expect(new Set(network.apiRequests)).toEqual(
    new Set(['/api/capabilities', '/api/creative-library']),
  );
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});
