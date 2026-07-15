import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = { cameraCalls: 0 };
    Object.defineProperty(window, '__lightframeTestState', {
      configurable: true,
      value: state,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          state.cameraCalls += 1;
          return Promise.reject(
            new DOMException('A test must opt into camera capture.', 'NotAllowedError'),
          );
        },
        enumerateDevices: () => Promise.resolve([]),
      },
    });
  });

  await page.routeWebSocket(
    (url) => !['127.0.0.1', 'localhost'].includes(url.hostname),
    async (webSocket) => {
      await webSocket.close({ code: 1008, reason: 'External sockets are blocked in e2e.' });
    },
  );
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.fallback();
  });

  await page.route('**/api/capabilities', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        realtimeVideo: { available: true, models: ['lucy-2.5', 'lucy-vton-3'] },
        elevenLabs: { available: false, modelId: null },
      }),
    });
  });
});

test('prepares a character recipe accessibly without camera or provider work', async ({ page }) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiRequests.push(url.pathname);
  });

  await page.goto('/');

  const icon = page.locator('link[rel~="icon"]');
  await expect(icon).toHaveAttribute('href', '/favicon.svg');
  const iconResponse = await page.request.get('/favicon.svg');
  expect(iconResponse.status()).toBe(200);
  expect(iconResponse.headers()['content-type']).toContain('image/svg+xml');

  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByLabel('Live studio stage')).toContainText(
    'Your stage is private until you start.',
  );
  await expect(page.getByLabel('Integration availability')).toContainText('AI video available');

  const skipLink = page.getByRole('link', { name: 'Skip to studio' });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();

  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await expect(page.getByRole('button', { name: 'Character · Lucy 2.5' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Character direction').fill('  An adult documentary photographer  ');
  await page.getByRole('button', { name: 'Open structured prompt workshop' }).click();

  await expect(page.getByRole('heading', { name: 'Direct one clear visual change' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use in working draft' })).toBeDisabled();
  await page.getByLabel('Character concept').fill('botanical field host');
  await expect(page.getByRole('button', { name: 'Use in working draft' })).toBeEnabled();
  await page.getByRole('button', { name: 'Close creative tool' }).click();
  await page.getByRole('button', { name: 'Character workshop' }).click();
  await expect(page.getByLabel('Character concept')).toHaveValue('botanical field host');

  const cameraCalls = await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __lightframeTestState: { cameraCalls: number };
    };
    return testWindow.__lightframeTestState.cameraCalls;
  });
  expect(cameraCalls).toBe(0);
  expect(apiRequests.length).toBeGreaterThan(0);
  expect(new Set(apiRequests)).toEqual(new Set(['/api/capabilities']));
  expect(apiRequests).not.toContain('/api/realtime-token');
});

test('development proxy preserves exact Origin validation for provider mutations', async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:4173').origin;
  const safeInvalidRequests = [
    request.post('/api/realtime-token', {
      headers: { Origin: origin },
      data: { model: 'unsupported-model' },
    }),
    request.post('/api/elevenlabs/shared-voices/import', {
      headers: { Origin: origin },
      data: {},
    }),
    request.post('/api/elevenlabs/voice-changer/recording', {
      headers: { Origin: origin, 'Content-Type': 'audio/webm' },
      data: 'invalid-without-a-voice-id',
    }),
  ];

  for (const response of await Promise.all(safeInvalidRequests)) {
    expect(response.status()).toBe(400);
    expect((await response.json()).error.code).not.toBe('forbidden_origin');
  }

  const mismatchedOrigin = await request.post('/api/realtime-token', {
    headers: { Origin: 'http://127.0.0.1:4100' },
    data: { model: 'unsupported-model' },
  });
  expect(mismatchedOrigin.status()).toBe(403);
  expect((await mismatchedOrigin.json()).error.code).toBe('forbidden_origin');
});
