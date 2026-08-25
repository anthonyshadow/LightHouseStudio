import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import type { CapabilitiesResponse } from '@studio/contracts';
import type { CreativeAssetStore } from '@studio/domain';
import { TEST_AUTH_SESSION } from './support/authFixture';
import { STUDIO_VIEWPORT_SIZES } from './support/studioViewports';
import { CAMPAIGNS_PATH } from './support/studioRoutes';
import {
  CREATIVE_ASSET_STORAGE_KEY,
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  readBrowserState,
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
            realtimeVideo: { available: true, betaEnabled: true },
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
            creativeLibrary: { cloudMirror: false },
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

// Dashboard composition is a product contract at every canonical responsive level, not only at
// the shell navigation switch.
const dashboardViewports = [
  { name: 'full desktop', ...STUDIO_VIEWPORT_SIZES.fullDesktop },
  { name: 'compact desktop', ...STUDIO_VIEWPORT_SIZES.compactDesktop },
  { name: 'tablet portrait', ...STUDIO_VIEWPORT_SIZES.tabletPortrait },
  { name: 'mobile portrait', ...STUDIO_VIEWPORT_SIZES.mobilePortrait },
  { name: 'small mobile', ...STUDIO_VIEWPORT_SIZES.smallMobile },
] as const;

const LOCAL_CREATIVE_STORE = {
  schemaVersion: 7,
  savedPrompts: [
    {
      id: 'local-dashboard-prompt',
      title: 'Local Dashboard Prompt',
      prompt: 'The preserved local creative-library prompt.',
      modelModeId: 'lucy-latest',
      source: 'manual',
      referenceImageAssetId: null,
      vtonInputKind: null,
      enhancePrompt: false,
      tags: ['local'],
      createdAt: '2026-08-20T12:00:00.000Z',
      updatedAt: '2026-08-20T12:00:00.000Z',
      lastUsedAt: '2026-08-20T12:00:00.000Z',
      useCount: 1,
    },
  ],
  recentPrompts: [],
  savedCharacterPrompts: [],
  savedCharacterVariants: [],
} satisfies CreativeAssetStore;

const REMOTE_CREATIVE_STORE = {
  ...LOCAL_CREATIVE_STORE,
  savedPrompts: [
    {
      ...LOCAL_CREATIVE_STORE.savedPrompts[0]!,
      id: 'remote-dashboard-prompt',
      title: 'Remote Dashboard Prompt',
      tags: ['remote'],
    },
  ],
} satisfies CreativeAssetStore;

for (const viewport of representativeViewports) {
  test(`${viewport.name} preparation is accessible and viewport-bound`, async ({ page }) => {
    const network = await installProviderFreeStudio(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/studio/create');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByLabel('Studio media stage')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upload Video' })).toBeVisible();
    const stageFrameBox = await page.locator('[data-stage-frame]').boundingBox();
    expect(stageFrameBox).not.toBeNull();
    const availability = page.getByLabel('Integration availability');
    await availability.getByRole('button').click();
    await expect(page.getByRole('region', { name: 'Studio availability details' })).toContainText(
      'Live AI Beta enabled',
    );

    // Studio shares the shell navigation: the rail from 48rem up, the bottom bar below it.
    const desktopNavigation = page.getByRole('navigation', { name: 'Primary', exact: true });
    const mobileNavigation = page.getByRole('navigation', { name: 'Mobile primary', exact: true });
    const railLayout = viewport.width >= 768;
    await expect(desktopNavigation).toBeVisible({ visible: railLayout });
    await expect(mobileNavigation).toBeVisible({ visible: !railLayout });

    const statusTrigger = availability.getByRole('button');
    const accountTrigger = page.getByRole('button', { name: 'Lightframe Demo account menu' });
    await expect(accountTrigger).toBeVisible();
    const statusTriggerBox = await statusTrigger.boundingBox();
    const accountTriggerBox = await accountTrigger.boundingBox();
    expect(statusTriggerBox).not.toBeNull();
    expect(accountTriggerBox).not.toBeNull();
    // Account stays last: below status in the rail, right of it in the compact top bar.
    if (railLayout) {
      expect(accountTriggerBox!.y).toBeGreaterThan(statusTriggerBox!.y);
    } else {
      expect(accountTriggerBox!.x).toBeGreaterThan(statusTriggerBox!.x);
    }
    expect(accountTriggerBox!.x + accountTriggerBox!.width).toBeLessThanOrEqual(viewport.width);
    if (!railLayout) {
      // The compact top bar keeps a filled account trigger; the rail places it on the rail surface.
      expect(
        await accountTrigger.evaluate((trigger) => getComputedStyle(trigger).backgroundColor),
      ).not.toBe('rgba(0, 0, 0, 0)');
    }

    await accountTrigger.click();
    const accountMenu = page.getByRole('menu', { name: 'Account' });
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
    // With no media the editor has nothing to open, and says so rather than only greying out.
    await expect(page.getByRole('button', { name: 'Edit Video' })).toHaveAccessibleDescription(
      'Record or upload a video to edit it.',
    );
    await expect(page.getByRole('button', { name: /Recipe|Shelf|Dock|Workshop/u })).toHaveCount(0);

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

for (const viewport of dashboardViewports) {
  test(`${viewport.name} Dashboard keeps Refined Momentum navigation and content viewport-bound`, async ({
    page,
  }) => {
    const network = await installSuccessfulStudioHarness(page);
    await installCampaignHarness(page, true);
    await installProjectHarness(page, true, { includeUnassignedVideo: true });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByText('Welcome back, Lightframe Demo', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create video' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Continue Work' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Recent Work' })).toBeVisible();
    await expect(page.getByText('3 recent items', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Make your first reusable video' })).toHaveCount(
      0,
    );
    await expect(page.getByRole('heading', { name: 'Processing Queue' })).toHaveCount(0);
    await expect(page.getByLabel('Studio media stage')).toHaveCount(0);

    const [createBox, dashboardHeaderBox, continueBox, recentBox, shellBox] = await Promise.all([
      page.getByRole('button', { name: 'Create video' }).boundingBox(),
      page
        .getByRole('region', { name: 'Dashboard' })
        .locator(':scope > div > header')
        .boundingBox(),
      page.locator('[data-continue-section]').boundingBox(),
      page.locator('[data-recent-section]').boundingBox(),
      page.getByRole('region', { name: 'Dashboard' }).locator(':scope > div').boundingBox(),
    ]);
    expect(createBox).not.toBeNull();
    expect(dashboardHeaderBox).not.toBeNull();
    expect(continueBox).not.toBeNull();
    expect(recentBox).not.toBeNull();
    expect(shellBox).not.toBeNull();
    expect(createBox!.y + createBox!.height).toBeLessThanOrEqual(viewport.height);
    if (viewport.width < 640) {
      expect(dashboardHeaderBox!.height).toBeLessThanOrEqual(viewport.height / 3 + 16);
    }
    expect(shellBox!.width).toBeLessThanOrEqual(1_408 + 1);
    if (viewport.width >= 1_280) {
      expect(recentBox!.x).toBeGreaterThan(continueBox!.x + continueBox!.width);
      expect(recentBox!.width).toBeGreaterThan(continueBox!.width);
    } else {
      expect(recentBox!.y).toBeGreaterThan(continueBox!.y + continueBox!.height);
    }

    const desktopNavigation = page.getByRole('navigation', { name: 'Primary', exact: true });
    const mobileNavigation = page.getByRole('navigation', {
      name: 'Mobile primary',
      exact: true,
    });
    const organizationHeader = page.getByRole('banner');
    const main = page.getByRole('main');

    if (viewport.width >= 768) {
      await expect(desktopNavigation).toBeVisible();
      await expect(mobileNavigation).toBeHidden();
      const [headerBox, mainBox] = await Promise.all([
        organizationHeader.boundingBox(),
        main.boundingBox(),
      ]);
      expect(headerBox).not.toBeNull();
      expect(mainBox).not.toBeNull();
      expect(headerBox!.x).toBeLessThanOrEqual(1);
      expect(headerBox!.y).toBeLessThanOrEqual(1);
      expect(headerBox!.height).toBeGreaterThanOrEqual(viewport.height - 1);
      expect(mainBox!.x).toBeGreaterThanOrEqual(headerBox!.x + headerBox!.width - 1);
    } else {
      await expect(desktopNavigation).toBeHidden();
      await expect(mobileNavigation).toBeVisible();
      const mobileNavigationBox = await mobileNavigation.boundingBox();
      expect(mobileNavigationBox).not.toBeNull();
      expect(mobileNavigationBox!.x).toBeLessThanOrEqual(1);
      expect(mobileNavigationBox!.width).toBeGreaterThanOrEqual(viewport.width - 1);
      expect(mobileNavigationBox!.y + mobileNavigationBox!.height).toBeGreaterThanOrEqual(
        viewport.height - 1,
      );
      for (const trigger of await mobileNavigation.getByRole('button').all()) {
        const bounds = await trigger.boundingBox();
        expect(bounds).not.toBeNull();
        expect(bounds!.height).toBeGreaterThanOrEqual(44);
      }
    }

    await expectNoDocumentOverflow(page);
    await expectNoAxeViolations(page);
    expect((await readBrowserState(page)).cameraCalls).toBe(0);
    expectNoExternalProviderTraffic(network);
  });
}

test('Settings brings back the getting-started guide the Dashboard dismissed', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await installCampaignHarness(page);
  await installProjectHarness(page);
  await page.goto('/dashboard');

  const guide = page.getByRole('heading', { name: 'Make your first reusable video' });
  await expect(guide).toBeVisible();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(guide).toHaveCount(0);

  // Settings is reached from the profile card, and the Dashboard is still mounted underneath it:
  // the preference has one owner, so restoring it here shows the guide there without a remount.
  await page.getByRole('button', { name: 'Lightframe Demo account menu' }).click();
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await expect(settings).toBeVisible();
  await settings.getByRole('button', { name: 'Show the guide again' }).click();
  // The panel reflects its own change: the control it offered is replaced by the settled state.
  await expect(settings.getByRole('button', { name: 'Show the guide again' })).toHaveCount(0);
  await expect(settings.getByText(/The guide is available/u)).toBeVisible();

  // The Dashboard is `aria-hidden` behind the modal, so its guide is only assertable once closed.
  await page.keyboard.press('Escape');
  await expect(settings).toHaveCount(0);
  await expect(guide).toBeVisible();
});

test('first-run Dashboard explains the first reusable-video flow at every canonical width', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await installCampaignHarness(page);
  await installProjectHarness(page);
  await page.goto('/dashboard');

  const createVideo = page.getByRole('button', { name: 'Create video' });
  const firstRun = page.locator('[data-first-run]');
  await expect(createVideo).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Make your first reusable video' })).toBeVisible();
  await expect(
    page.getByText(/Record in Studio or upload a source, edit and save versions/u),
  ).toBeVisible();
  await expect(page.getByText('0 recent items', { exact: true })).toBeVisible();

  for (const viewport of dashboardViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const [createBox, firstRunBox, continueBox] = await Promise.all([
      createVideo.boundingBox(),
      firstRun.boundingBox(),
      page.locator('[data-continue-section]').boundingBox(),
    ]);
    expect(createBox, viewport.name).not.toBeNull();
    expect(firstRunBox, viewport.name).not.toBeNull();
    expect(continueBox, viewport.name).not.toBeNull();
    expect(createBox!.y + createBox!.height, viewport.name).toBeLessThanOrEqual(viewport.height);
    expect(firstRunBox!.y + firstRunBox!.height, viewport.name).toBeLessThanOrEqual(
      viewport.height,
    );
    expect(continueBox!.y, viewport.name).toBeGreaterThanOrEqual(
      firstRunBox!.y + firstRunBox!.height,
    );

    await expectNoDocumentOverflow(page);
    await expectNoAxeViolations(page);
  }

  expect((await readBrowserState(page)).cameraCalls).toBe(0);
  expectNoExternalProviderTraffic(network);
});

test('paused account-library sync keeps the Dashboard and recovery controls unoccluded', async ({
  page,
}) => {
  await page.addInitScript(
    ({ storageKey, store }) => localStorage.setItem(storageKey, JSON.stringify(store)),
    { storageKey: CREATIVE_ASSET_STORAGE_KEY, store: LOCAL_CREATIVE_STORE },
  );
  const network = await installSuccessfulStudioHarness(page, {
    creativeLibraryRemoteState: { revision: 1, store: REMOTE_CREATIVE_STORE },
  });
  await installCampaignHarness(page, true);
  await installProjectHarness(page, true, { includeUnassignedVideo: true });
  await page.goto('/dashboard');

  const notice = page.locator('[data-creative-sync-notice]');
  const noticeRegion = page.locator('[data-shell-notice-region]');
  const main = page.getByRole('main');
  const createVideo = page.getByRole('button', { name: 'Create video' });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('Account library sync paused');

  for (const viewport of dashboardViewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });

    const [noticeBox, noticeRegionBox, mainBox, createBox] = await Promise.all([
      notice.boundingBox(),
      noticeRegion.boundingBox(),
      main.boundingBox(),
      createVideo.boundingBox(),
    ]);
    expect(noticeBox).not.toBeNull();
    expect(noticeRegionBox).not.toBeNull();
    expect(mainBox).not.toBeNull();
    expect(createBox).not.toBeNull();
    expect(noticeBox!.x).toBeGreaterThanOrEqual(-1);
    expect(noticeBox!.x + noticeBox!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(noticeBox!.y).toBeGreaterThanOrEqual(noticeRegionBox!.y - 1);
    expect(noticeBox!.y + noticeBox!.height).toBeLessThanOrEqual(
      noticeRegionBox!.y + noticeRegionBox!.height + 1,
    );
    expect(mainBox!.y).toBeGreaterThanOrEqual(noticeRegionBox!.y + noticeRegionBox!.height - 1);
    expect(createBox!.x).toBeGreaterThanOrEqual(-1);
    expect(createBox!.x + createBox!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(createBox!.y + createBox!.height).toBeLessThanOrEqual(viewport.height);

    const regionScroll = await noticeRegion.evaluate((region) => ({
      clientHeight: region.clientHeight,
      scrollHeight: region.scrollHeight,
    }));
    expect(regionScroll.scrollHeight).toBeLessThanOrEqual(regionScroll.clientHeight + 1);

    for (const action of await notice.getByRole('button').all()) {
      const actionBox = await action.boundingBox();
      expect(actionBox).not.toBeNull();
      expect(actionBox!.x).toBeGreaterThanOrEqual(noticeBox!.x - 1);
      expect(actionBox!.x + actionBox!.width).toBeLessThanOrEqual(
        noticeBox!.x + noticeBox!.width + 1,
      );
      expect(actionBox!.y).toBeGreaterThanOrEqual(noticeRegionBox!.y - 1);
      expect(actionBox!.y + actionBox!.height).toBeLessThanOrEqual(
        noticeRegionBox!.y + noticeRegionBox!.height + 1,
      );
    }

    if (viewport.width < 768) {
      const mobileNavigationBox = await page
        .getByRole('navigation', { name: 'Mobile primary', exact: true })
        .boundingBox();
      expect(mobileNavigationBox).not.toBeNull();
      expect(createBox!.y + createBox!.height).toBeLessThanOrEqual(mobileNavigationBox!.y - 1);
    }

    await expectNoDocumentOverflow(page);
  }

  await expectNoAxeViolations(page);
  expect((await readBrowserState(page)).cameraCalls).toBe(0);
  expectNoExternalProviderTraffic(network);
});

test('small-mobile Dashboard remains usable at 200% text', async ({ page }) => {
  const network = await installSuccessfulStudioHarness(page);
  await installCampaignHarness(page, true);
  await installProjectHarness(page, true, { includeUnassignedVideo: true });
  await page.setViewportSize(STUDIO_VIEWPORT_SIZES.smallMobile);
  await page.goto('/dashboard');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create video' })).toBeVisible();
  const mobileNavigation = page.getByRole('navigation', {
    name: 'Mobile primary',
    exact: true,
  });
  await expect(mobileNavigation).toBeVisible();
  for (const trigger of await mobileNavigation.getByRole('button').all()) {
    const bounds = await trigger.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
  }
  await expectNoDocumentOverflow(page);
  expect((await readBrowserState(page)).cameraCalls).toBe(0);
  expectNoExternalProviderTraffic(network);
});

test('small-mobile Project output review reflows at 200% text with accessible save choices', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await installProjectHarness(page, true);
  await page.setViewportSize(STUDIO_VIEWPORT_SIZES.smallMobile);
  await page.goto(`/projects/${TEST_PROJECT_ID}/workspace`);
  const fixture = await loadDecodableH264VideoFixture();
  await page.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
    name: 'accessible-project-output.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  });
  await page.getByRole('tab', { name: 'Save', exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  const saveTrigger = page.getByRole('button', { name: 'Save video · Keep as it is' });
  const mobileNavigation = page.getByRole('navigation', { name: 'Mobile primary' });
  await expect(saveTrigger).toBeVisible();
  const [saveBounds, navigationBounds] = await Promise.all([
    saveTrigger.boundingBox(),
    mobileNavigation.boundingBox(),
  ]);
  expect(saveBounds).not.toBeNull();
  expect(navigationBounds).not.toBeNull();
  expect(saveBounds!.height).toBeGreaterThanOrEqual(44);
  expect(saveBounds!.y + saveBounds!.height).toBeLessThanOrEqual(navigationBounds!.y + 1);
  await expectNoDocumentOverflow(page);
  await expectNoAxeViolations(page);

  await saveTrigger.click();
  const dialog = page.getByRole('dialog', { name: 'Save video' });
  await expect(dialog.getByRole('form', { name: 'Save destination' })).toBeVisible();
  await expect(dialog.getByRole('radio', { name: 'New video' })).toBeChecked();
  await expect(
    dialog.getByRole('radio', { name: 'New version of an existing video' }),
  ).toBeVisible();
  await expect(dialog.getByLabel('Video title')).toBeFocused();
  await expectNoDocumentOverflow(page);
  await expectNoAxeViolations(page);
  await page.keyboard.press('Escape');
  await expect(saveTrigger).toBeFocused();
  expectNoExternalProviderTraffic(network);
});

test('Project workspace keeps a 16:9 stage and the shared navigation at responsive widths', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await installProjectHarness(page, true);

  for (const viewport of [
    { width: 1440, height: 960, mobile: false, stacked: false },
    { width: 1280, height: 720, mobile: false, stacked: false },
    { width: 834, height: 1112, mobile: false, stacked: true },
    { width: 390, height: 844, mobile: true, stacked: true },
    { width: 320, height: 568, mobile: true, stacked: true },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto(`/projects/${TEST_PROJECT_ID}/workspace`);

    const stageFrame = page.locator('[data-stage-frame]');
    const inspectorNavigation = page.getByRole('tablist', { name: 'Project tasks' });
    await expect(stageFrame).toBeVisible();
    await expect(inspectorNavigation).toBeVisible();
    const [stageBox, inspectorBox] = await Promise.all([
      stageFrame.boundingBox(),
      inspectorNavigation.boundingBox(),
    ]);
    expect(stageBox).not.toBeNull();
    expect(inspectorBox).not.toBeNull();
    expect(Math.abs(stageBox!.width / stageBox!.height - 16 / 9)).toBeLessThan(0.03);
    if (viewport.stacked) {
      expect(inspectorBox!.y).toBeGreaterThan(stageBox!.y + stageBox!.height);
    } else {
      expect(inspectorBox!.x).toBeGreaterThan(stageBox!.x + stageBox!.width);
    }

    if (viewport.mobile) {
      await expect(page.getByRole('navigation', { name: 'Mobile primary' })).toBeVisible();
    } else {
      await expect(page.getByRole('navigation', { name: 'Primary', exact: true })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Mobile primary' })).toBeHidden();
    }
    await expect(page.getByRole('button', { name: 'Projects', exact: true })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expectNoDocumentOverflow(page);
  }

  expectNoExternalProviderTraffic(network);
});

test('small-mobile Builder steps survive 200% text and keep one preview', async ({ page }) => {
  test.setTimeout(60_000);
  const network = await installProviderFreeStudio(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/studio/create');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  await page.getByRole('button', { name: 'Quick Create' }).click();
  await page.getByRole('menuitem', { name: 'Create Asset' }).click();
  await page
    .getByRole('dialog', { name: 'Create Asset' })
    .getByRole('button', { name: 'Character' })
    .click();
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
  await page.goto(CAMPAIGNS_PATH);
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

  const activeCampaigns = page.getByRole('list', { name: 'Active Campaigns' });
  const openCampaign = activeCampaigns.getByRole('button', { name: 'Open' });
  await openCampaign.focus();
  await page.keyboard.press('Enter');
  const newProject = page.getByRole('button', { name: 'New Project' });
  await expect(newProject).toBeVisible();
  await newProject.focus();
  await page.keyboard.press('Enter');
  const projectDialog = page.getByRole('dialog', { name: 'New Project' });
  await projectDialog.getByLabel('Project name').fill('Launch social cut');
  await projectDialog.getByRole('button', { name: 'Create Project' }).click();
  await expect(page.getByRole('heading', { name: 'Launch social cut' })).toBeVisible();
  await expect(page.getByText('Campaign: Summer launch', { exact: true })).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectNoAxeViolations(page);
  const campaignBreadcrumb = page.getByRole('button', { name: '← Summer launch' });
  await campaignBreadcrumb.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Summer launch' })).toBeVisible();
  expect(await cameraCalls(page)).toBe(0);
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});

test('phone and tablet expose supported creative tools without Recipe UI', async ({ page }) => {
  const network = await installProviderFreeStudio(page);
  await page.setViewportSize(STUDIO_VIEWPORT_SIZES.compactDesktop);
  await page.goto('/studio/create');
  const desktopRail = page.getByRole('navigation', { name: 'Creative workspace tools' });
  await expect
    .poll(() =>
      desktopRail
        .locator('button')
        .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
    )
    .toEqual(['Edit Video', 'Select Character', 'Select Outfit']);
  await expect(page.getByRole('button', { name: /Open Select AI options/u })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Recipe|Shelf|Dock/u })).toHaveCount(0);

  for (const viewport of [
    STUDIO_VIEWPORT_SIZES.tabletPortrait,
    STUDIO_VIEWPORT_SIZES.mobilePortrait,
  ]) {
    await page.setViewportSize(viewport);
    await page.goto('/studio/create');
    const rail = page.getByRole('navigation', { name: 'Creative workspace tools' });
    // The same three tools at every width. They used to vanish below 64rem with no entry point
    // and no explanation, so a phone or tablet operator concluded the AI tools did not exist.
    // The visible labels shorten on a compact rail; the accessible names do not.
    await expect
      .poll(() =>
        rail
          .locator('button')
          .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label'))),
      )
      .toEqual(['Edit Video', 'Select Character', 'Select Outfit']);
    await expect(page.getByRole('button', { name: /Select AI/u })).toHaveCount(0);

    // A blocked tool still states its condition here, rather than hiding it in `title` where a
    // touch user can never reach it.
    await expect(rail.getByRole('button', { name: 'Edit Video' })).toBeDisabled();
    await expect(rail.locator('[data-tool-blocked]').first()).toBeVisible();

    await expect(rail.getByRole('button', { name: /Recipe|Shelf|Dock/u })).toHaveCount(0);
    const quickCreate = page.getByRole('button', { name: 'Quick Create' });
    await quickCreate.click();
    await page.getByRole('menuitem', { name: 'Create Asset' }).click();
    const launcher = page.getByRole('dialog', { name: 'Create Asset' });
    for (const assetType of ['Video', 'Character', 'Outfit', 'Add Voice']) {
      await expect(launcher.getByRole('button', { name: assetType, exact: true })).toBeVisible();
    }
    await expect(launcher.getByText(/Recipe/u)).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(quickCreate).toBeFocused();
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
  await page.goto('/studio/create');

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

test('empty VTON Start is blocked before camera access or token issuance', async ({ page }) => {
  const network = await installProviderFreeStudio(page);
  await page.goto('/studio/create/live');

  const chooser = page.getByRole('dialog', { name: 'Choose live AI experience' });
  await expect(chooser).toBeVisible();
  await chooser.getByRole('button', { name: 'Configure Virtual Try-On' }).click();
  await expect(page.getByRole('dialog', { name: 'AI Settings' })).toBeVisible();
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
  await page.goto('/studio/create');

  const start = page.getByRole('button', { name: 'Start camera' });
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
    // Recovery opens the collapsed desktop panel and lands focus inside it.
    await expect(inlineSettings).toBeVisible();
    await expect(inlineSettings).toBeFocused();
  } else {
    await expect(page.getByRole('dialog', { name: 'Capture Settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Close panel' }).click();
  }
  await page.getByRole('button', { name: 'Start camera' }).click();
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
