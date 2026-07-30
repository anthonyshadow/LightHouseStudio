import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { STUDIO_VIEWPORT_SIZES } from './support/studioViewports';

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

    if (requestUrl.pathname.startsWith('/api/')) {
      state.apiRequests.push(requestUrl.pathname);
      if (requestUrl.pathname === '/api/capabilities') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            realtimeVideo: { available: true, models: ['lucy-2.5', 'lucy-vton-3'] },
            elevenLabs: { available: false, modelId: null },
            referenceImages: {
              available: false,
              editAvailable: false,
              providerId: 'openai',
              modelId: 'gpt-image-2',
              sizes: ['1024x1024', '1024x1536', '1536x1024'],
              quality: 'high',
              optimizer: {
                available: false,
                model: 'gpt-5.6',
                version: 'lucy-character-reference-v1',
              },
            },
          }),
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

const openRecipeDockWhenOverlaid = async (page: Page) => {
  const launcher = page.getByRole('button', { name: 'Dock' });
  await expect(launcher).toBeVisible();
  await launcher.click();
  await expect(page.getByRole('dialog', { name: 'Recipe Dock' })).toBeVisible();
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
  { name: 'compact landscape desktop', ...STUDIO_VIEWPORT_SIZES.compactDesktop },
  { name: 'tablet portrait', ...STUDIO_VIEWPORT_SIZES.tabletPortrait },
  { name: 'mobile portrait', ...STUDIO_VIEWPORT_SIZES.mobilePortrait },
  { name: 'small mobile', ...STUDIO_VIEWPORT_SIZES.smallMobile },
] as const;

for (const viewport of representativeViewports) {
  test(`${viewport.name} preparation is accessible and viewport-bound`, async ({ page }) => {
    const network = await installProviderFreeStudio(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/studio');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'First take guide' })).toContainText(
      'Start camera → choose Character → Record → optional Voice → Download',
    );
    await expect(page.getByLabel('Integration availability')).toContainText('AI video configured');

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
    expect(new Set(network.apiRequests)).toEqual(new Set(['/api/capabilities']));
  });
}

test('first-take guidance is dismissible without durable onboarding state', async ({ page }) => {
  await installProviderFreeStudio(page);
  await page.goto('/studio');

  const guide = page.getByRole('complementary', { name: 'First take guide' });
  await expect(guide).toBeVisible();
  await guide.getByRole('button', { name: 'Dismiss first take guide' }).click();
  await expect(guide).toBeHidden();

  await page.reload();
  await expect(page.getByRole('complementary', { name: 'First take guide' })).toBeVisible();
});

test('small-mobile Builder review shortcut survives 200% text and keeps one preview', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const network = await installProviderFreeStudio(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/studio');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '200%';
  });

  await page.getByRole('button', { name: /Open character options/u }).click();
  await page.getByRole('button', { name: 'Create new character' }).click();
  const dialog = page.getByRole('dialog', { name: 'Build Your Character' });
  const shortcut = dialog.getByRole('button', { name: 'Review & Generate' });
  await expect(shortcut).toBeVisible();
  await shortcut.click();

  const preview = dialog.getByRole('complementary', {
    name: 'Character Direction Preview',
  });
  await expect(preview).toBeFocused();
  await expect(dialog.getByRole('complementary')).toHaveCount(1);
  await expectNoDocumentOverflow(page);
  await expectNoAxeViolations(page);
  expect(await cameraCalls(page)).toBe(0);
  expect(new Set(network.apiRequests)).toEqual(new Set(['/api/capabilities']));
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
  expect(new Set(network.apiRequests)).toEqual(new Set(['/api/capabilities']));
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});

test('large text keeps critical preparation controls usable at a narrow width', async ({
  page,
}) => {
  const network = await installProviderFreeStudio(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/studio');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '150%';
  });

  await openRecipeDockWhenOverlaid(page);
  await expect(page.getByRole('button', { name: 'Start local preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await expect(page.getByLabel('Character direction')).toBeVisible();
  await expectNoDocumentOverflow(page);
  await expectNoAxeViolations(page);
  expect(await cameraCalls(page)).toBe(0);
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
  expect(new Set(network.apiRequests)).toEqual(new Set(['/api/capabilities']));
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
  await expect(page.getByRole('dialog', { name: 'Capture Settings' })).toBeVisible();
  await page.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Start Camera + Mic' }).click();
  await expect(page.getByRole('alert')).toContainText(
    'Camera or microphone access was not allowed.',
  );
  expect(await cameraCalls(page)).toBe(2);
  expect(network.apiRequests).not.toContain('/api/realtime-token');
  expect(new Set(network.apiRequests)).toEqual(new Set(['/api/capabilities']));
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});
