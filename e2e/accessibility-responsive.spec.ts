import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

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
  if (!(await launcher.isVisible())) return;

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
  { name: 'full desktop', width: 1_440, height: 960 },
  { name: 'compact landscape desktop', width: 1_280, height: 720 },
  { name: 'tablet portrait', width: 834, height: 1_112 },
  { name: 'mobile portrait', width: 390, height: 844 },
  { name: 'small mobile', width: 320, height: 568 },
] as const;

for (const viewport of representativeViewports) {
  test(`${viewport.name} preparation is accessible and viewport-bound`, async ({ page }) => {
    const network = await installProviderFreeStudio(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/advanced');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByLabel('Integration availability')).toContainText('AI video available');

    const skipLink = page.getByRole('link', { name: 'Skip to studio' });
    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();
    await expectNoDocumentOverflow(page);

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

test('small-mobile Recipe Dock scrolls internally and Escape restores launcher focus', async ({
  page,
}) => {
  const network = await installProviderFreeStudio(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/advanced');

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
  await page.goto('/advanced');
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
  await page.goto('/advanced');

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
  await page.goto('/advanced');

  await openRecipeDockWhenOverlaid(page);
  const start = page.getByRole('button', { name: 'Start local preview' });
  await start.focus();
  await page.keyboard.press('Enter');

  const alert = page.getByRole('alert');
  await expect(alert).toContainText('Camera or microphone access was not allowed.');
  await expect(alert).toContainText('Allow access in browser settings, then try again.');
  await expect(alert).not.toContainText('Mocked camera permission denial.');
  expect(await cameraCalls(page)).toBe(1);
  expect(network.apiRequests).not.toContain('/api/realtime-token');
  expect(new Set(network.apiRequests)).toEqual(new Set(['/api/capabilities']));
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});
