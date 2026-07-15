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

const expectNoHorizontalOverflow = async (page: Page) => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));

  expect(
    dimensions.scrollWidth,
    `document width ${dimensions.scrollWidth}px exceeded viewport width ${dimensions.clientWidth}px`,
  ).toBeLessThanOrEqual(dimensions.clientWidth + 1);
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
  { name: 'small mobile', width: 320, height: 568 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1_112 },
  { name: 'laptop', width: 1_280, height: 720 },
  { name: 'desktop', width: 1_440, height: 960 },
  { name: 'large desktop', width: 1_920, height: 1_080 },
] as const;

for (const viewport of representativeViewports) {
  test(`${viewport.name} preparation has no Axe violations or horizontal overflow`, async ({
    page,
  }) => {
    const network = await installProviderFreeStudio(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('/');

    await expect(page.getByRole('main')).toBeVisible();
    await expect(page.getByLabel('Integration availability')).toContainText('AI video available');

    const skipLink = page.getByRole('link', { name: 'Skip to studio' });
    await skipLink.focus();
    await expect(skipLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('main')).toBeFocused();

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

    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
    expect(await cameraCalls(page)).toBe(0);
    expect(network.blockedExternalRequests).toEqual([]);
    expect(network.blockedExternalWebSockets).toEqual([]);
    expect(new Set(network.apiRequests)).toEqual(new Set(['/api/capabilities']));
  });
}

test('large text keeps critical preparation controls usable at a narrow width', async ({
  page,
}) => {
  const network = await installProviderFreeStudio(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto('/');
  await page.evaluate(() => {
    document.documentElement.style.fontSize = '150%';
  });

  await expect(page.getByRole('button', { name: 'Start local preview' })).toBeVisible();
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await expect(page.getByLabel('Character direction')).toBeVisible();
  await expectNoHorizontalOverflow(page);
  await expectNoAxeViolations(page);
  expect(await cameraCalls(page)).toBe(0);
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
});

test('empty VTON Start is blocked before camera access or token issuance', async ({ page }) => {
  const network = await installProviderFreeStudio(page);
  await page.goto('/');

  const vtonMode = page.getByRole('button', { name: 'Virtual Try-On · VTON 3' });
  await vtonMode.focus();
  await page.keyboard.press('Enter');
  await expect(vtonMode).toHaveAttribute('aria-pressed', 'true');

  const start = page.getByRole('button', { name: 'Start Virtual Try-On AI' });
  await start.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('alert')).toContainText(
    'Add a prompt, a reference image, or both before starting AI.',
  );
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
  await page.goto('/');

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
