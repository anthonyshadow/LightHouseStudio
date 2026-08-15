import { expect, test } from '@playwright/test';
import {
  apiErrorResponseSchema,
  type CapabilitiesResponse,
  VIDEO_PROVIDER_INTENT_HEADER,
  VIDEO_PROVIDER_INTENT_VALUE,
  VOICE_PROVIDER_INTENT_HEADER,
  VOICE_PROVIDER_INTENT_VALUE,
} from '@studio/contracts';
import { openAiSettings } from './support/studioHarness';

test.beforeEach(async ({ page, request, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:4173').origin;
  for (const context of [request, page.request]) {
    const login = await context.post('/api/auth/login', {
      headers: { Origin: origin },
      data: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });
    expect(login.ok()).toBe(true);
  }

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
      } satisfies CapabilitiesResponse),
    });
  });
});

test('prepares a visual configuration accessibly without camera or provider work', async ({
  page,
}) => {
  const apiRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiRequests.push(url.pathname);
  });

  await page.goto('/studio/create');

  const icon = page.locator('link[rel~="icon"]');
  await expect(icon).toHaveAttribute('href', '/favicon.svg');
  const iconResponse = await page.request.get('/favicon.svg');
  expect(iconResponse.status()).toBe(200);
  expect(iconResponse.headers()['content-type']).toContain('image/svg+xml');

  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByLabel('Studio media stage')).toContainText(
    'Camera and microphone remain off until you start local preview.',
  );
  await page.getByLabel('Integration availability').getByRole('button').click();
  await expect(page.getByRole('region', { name: 'Studio availability details' })).toContainText(
    'Live AI Beta enabled',
  );
  await page.keyboard.press('Escape');

  const skipLink = page.getByRole('link', { name: 'Skip to studio' });
  await skipLink.focus();
  await expect(skipLink).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('main')).toBeFocused();

  await openAiSettings(page);
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await expect(page.getByRole('button', { name: 'Character · Lucy 2.5' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByLabel('Character direction').fill('  An adult documentary photographer  ');
  const workshopLauncher = page.getByRole('button', {
    name: 'Open structured prompt workshop',
  });
  await workshopLauncher.focus();
  await expect(workshopLauncher).toBeFocused();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('heading', { name: 'Direct one clear visual change' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use in working draft' })).toBeDisabled();
  await page.getByRole('textbox', { name: 'Object to add', exact: true }).fill('a copper notebook');
  await page
    .getByRole('textbox', { name: 'Specific placement', exact: true })
    .fill('held at chest height');
  await expect(page.getByRole('button', { name: 'Use in working draft' })).toBeEnabled();
  await page.getByRole('button', { name: 'Use in working draft' }).click();
  await expect(page.getByRole('dialog', { name: 'Prompt Workshop' })).toBeHidden();

  const workshopTool = page.getByRole('button', { name: 'Workshop', exact: true });
  await workshopTool.focus();
  await expect(workshopTool).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Object to add', exact: true })).toHaveValue(
    'a copper notebook',
  );
  await expect(page.getByRole('textbox', { name: 'Specific placement', exact: true })).toHaveValue(
    'held at chest height',
  );

  const cameraCalls = await page.evaluate(() => {
    const testWindow = window as typeof window & {
      __lightframeTestState: { cameraCalls: number };
    };
    return testWindow.__lightframeTestState.cameraCalls;
  });
  expect(cameraCalls).toBe(0);
  expect(apiRequests.length).toBeGreaterThan(0);
  expect(new Set(apiRequests)).toEqual(
    new Set(['/api/auth/me', '/api/capabilities', '/api/creative-library']),
  );
  expect(apiRequests).not.toContain('/api/realtime-token');
});

test('development proxy preserves exact Origin validation for provider mutations', async ({
  request,
  baseURL,
}) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:4173').origin;
  const realtimeResponse = await request.post('/api/realtime-token', {
    headers: { Origin: origin },
    data: { model: 'unsupported-model' },
  });
  expect(realtimeResponse.status()).toBe(503);
  expect(apiErrorResponseSchema.parse(await realtimeResponse.json()).error.code).toBe(
    'feature_unavailable',
  );

  const voiceResponse = await request.post('/api/elevenlabs/voice-changer/recording', {
    headers: {
      Origin: origin,
      'Content-Type': 'audio/webm',
      [VOICE_PROVIDER_INTENT_HEADER]: VOICE_PROVIDER_INTENT_VALUE,
    },
    data: 'invalid-without-a-voice-id',
  });
  expect(voiceResponse.status()).toBe(400);
  expect(apiErrorResponseSchema.parse(await voiceResponse.json()).error.code).not.toBe(
    'forbidden_origin',
  );

  const mismatchedOrigin = await request.post('/api/realtime-token', {
    headers: { Origin: 'http://127.0.0.1:4100' },
    data: { model: 'unsupported-model' },
  });
  expect(mismatchedOrigin.status()).toBe(403);
  expect(apiErrorResponseSchema.parse(await mismatchedOrigin.json()).error.code).toBe(
    'forbidden_origin',
  );
});

test('same-origin browser video-job reads work when fetch omits Origin', async ({ page }) => {
  const jobId = crypto.randomUUID();
  let requestHeaders: Record<string, string> | null = null;
  await page.route(`**/api/video-jobs/${jobId}`, async (route) => {
    requestHeaders = await route.request().allHeaders();
    await route.continue();
  });
  await page.goto('/');

  const result = await page.evaluate(
    async ({ header, value, id }) => {
      const response = await fetch(`/api/video-jobs/${id}`, {
        headers: { [header]: value },
      });
      const payload: unknown = await response.json();
      return { status: response.status, payload };
    },
    {
      header: VIDEO_PROVIDER_INTENT_HEADER,
      value: VIDEO_PROVIDER_INTENT_VALUE,
      id: jobId,
    },
  );

  expect(requestHeaders).not.toBeNull();
  expect(requestHeaders).not.toHaveProperty('origin');
  expect(requestHeaders).toMatchObject({ referer: 'http://127.0.0.1:4173/' });
  expect(result.status).toBe(404);
  expect(apiErrorResponseSchema.parse(result.payload).error.code).toBe('not_found');
});
