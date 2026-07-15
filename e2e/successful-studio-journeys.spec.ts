import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type ModelId = 'lucy-2.5' | 'lucy-vton-3';

type SerializedSnapshot = {
  prompt: string;
  imageName: string | null;
  enhance: boolean;
};

type BrowserJourneyState = {
  cameraCalls: number;
  requirementModels: ModelId[];
  connections: Array<{ model: ModelId; initial: SerializedSnapshot }>;
  applies: SerializedSnapshot[];
  disconnectCalls: number;
  recorderStarts: number;
  recorderStops: number;
  lifecycleEvents: string[];
};

type NetworkJourneyState = {
  apiRequests: Array<{ path: string; model: ModelId | null }>;
  blockedExternalRequests: string[];
  blockedExternalWebSockets: string[];
};

const installSuccessfulStudioHarness = async (page: Page): Promise<NetworkJourneyState> => {
  const network: NetworkJourneyState = {
    apiRequests: [],
    blockedExternalRequests: [],
    blockedExternalWebSockets: [],
  };

  await page.addInitScript(() => {
    type TestModel = 'lucy-2.5' | 'lucy-vton-3';
    type TestSnapshot = { prompt: string; image: File | null; enhance: boolean };
    type TestConnectionOptions = {
      model: TestModel;
      initial: TestSnapshot;
      onRemoteStream(stream: MediaStream): void;
      onConnectionChange(state: string): void;
      onGenerationTick(seconds: number): void;
    };

    const state: BrowserJourneyState & {
      activeConnection: TestConnectionOptions | null;
    } = {
      cameraCalls: 0,
      requirementModels: [],
      connections: [],
      applies: [],
      disconnectCalls: 0,
      recorderStarts: 0,
      recorderStops: 0,
      lifecycleEvents: [],
      activeConnection: null,
    };
    const mediaResources: Array<{
      canvas: HTMLCanvasElement;
      audioContext: AudioContext;
      oscillator: OscillatorNode;
    }> = [];

    const serialize = (snapshot: TestSnapshot): SerializedSnapshot => ({
      prompt: snapshot.prompt,
      imageName: snapshot.image?.name ?? null,
      enhance: snapshot.enhance,
    });

    const createSyntheticStream = (): MediaStream => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Synthetic canvas context is unavailable.');
      context.fillStyle = '#35d0a0';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const video = canvas.captureStream(5);

      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      const oscillator = audioContext.createOscillator();
      oscillator.frequency.value = 220;
      oscillator.connect(destination);
      oscillator.start();
      mediaResources.push({ canvas, audioContext, oscillator });

      return new MediaStream([...video.getVideoTracks(), ...destination.stream.getAudioTracks()]);
    };

    class DeterministicMediaRecorder extends EventTarget {
      static isTypeSupported(mimeType: string): boolean {
        return mimeType.includes('webm');
      }

      readonly mimeType: string;
      state: RecordingState = 'inactive';

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        super();
        this.mimeType = options?.mimeType ?? 'video/webm';
      }

      start(): void {
        this.state = 'recording';
        state.recorderStarts += 1;
      }

      stop(): void {
        if (this.state === 'inactive') return;
        this.state = 'inactive';
        state.recorderStops += 1;
        const dataEvent = new Event('dataavailable');
        Object.defineProperty(dataEvent, 'data', {
          value: new Blob(['deterministic-e2e-recording'], { type: this.mimeType }),
        });
        this.dispatchEvent(dataEvent);
        this.dispatchEvent(new Event('stop'));
        state.lifecycleEvents.push('recorder-finalized');
      }
    }

    const developmentDriver = {
      getModelRequirements(model: TestModel) {
        state.requirementModels.push(model);
        return Promise.resolve({ width: 1_280, height: 720, frameRate: 30 });
      },
      connect(options: TestConnectionOptions) {
        const remote = createSyntheticStream();
        let disconnected = false;
        state.connections.push({ model: options.model, initial: serialize(options.initial) });
        state.activeConnection = options;
        queueMicrotask(() => {
          if (disconnected) return;
          options.onConnectionChange('connected');
          options.onRemoteStream(remote);
          options.onConnectionChange('generating');
          options.onGenerationTick(1);
        });
        return Promise.resolve({
          apply(snapshot: TestSnapshot) {
            state.applies.push(serialize(snapshot));
            options.onConnectionChange('generating');
            return Promise.resolve();
          },
          disconnect() {
            if (disconnected) return;
            disconnected = true;
            state.disconnectCalls += 1;
            state.lifecycleEvents.push('provider-disconnected');
            if (state.activeConnection === options) state.activeConnection = null;
            remote.getTracks().forEach((track) => track.stop());
          },
        });
      },
      triggerProviderDisconnect() {
        state.activeConnection?.onConnectionChange('disconnected');
      },
    };

    Object.defineProperty(window, '__lightframeE2EJourneyState', {
      configurable: true,
      value: state,
    });
    Object.defineProperty(window, '__lightframeDevelopmentRealtimeDriver', {
      configurable: true,
      value: developmentDriver,
    });
    Object.defineProperty(window, 'MediaRecorder', {
      configurable: true,
      value: DeterministicMediaRecorder,
    });
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () => {
          state.cameraCalls += 1;
          return Promise.resolve(createSyntheticStream());
        },
        enumerateDevices: () => Promise.resolve([]),
      },
    });
    Object.defineProperty(window, 'createImageBitmap', {
      configurable: true,
      value: () => Promise.resolve({ width: 1_024, height: 1_024, close: () => undefined }),
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: () => Promise.resolve(),
    });
    Object.defineProperty(window, 'confirm', {
      configurable: true,
      value: () => true,
    });
  });

  await page.routeWebSocket(
    (url) => !['127.0.0.1', 'localhost'].includes(url.hostname),
    async (webSocket) => {
      network.blockedExternalWebSockets.push(webSocket.url());
      await webSocket.close({ code: 1008, reason: 'External sockets are blocked in e2e.' });
    },
  );

  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const isLocal =
      ['127.0.0.1', 'localhost'].includes(requestUrl.hostname) ||
      (requestUrl.protocol === 'blob:' &&
        ['http://127.0.0.1:4173', 'http://localhost:4173'].includes(requestUrl.origin));
    if (!isLocal) {
      network.blockedExternalRequests.push(requestUrl.href);
      await route.abort('blockedbyclient');
      return;
    }

    if (requestUrl.pathname === '/api/capabilities') {
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
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

    if (requestUrl.pathname === '/api/realtime-token') {
      const payload = route.request().postDataJSON() as { model: ModelId };
      network.apiRequests.push({ path: requestUrl.pathname, model: payload.model });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          apiKey: 'short-lived-e2e-browser-token',
          expiresAt: '2030-01-01T00:00:00.000Z',
          constraints: { model: payload.model, maxSessionDurationSeconds: 300 },
        }),
      });
      return;
    }

    if (requestUrl.pathname.startsWith('/api/')) {
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          error: { code: 'unexpected-test-request', message: 'Unexpected API call in e2e.' },
        }),
      });
      return;
    }

    await route.continue();
  });

  return network;
};

const readBrowserState = (page: Page): Promise<BrowserJourneyState> =>
  page.evaluate(() => {
    const state = (
      window as typeof window & {
        __lightframeE2EJourneyState: BrowserJourneyState;
      }
    ).__lightframeE2EJourneyState;
    return {
      cameraCalls: state.cameraCalls,
      requirementModels: state.requirementModels,
      connections: state.connections,
      applies: state.applies,
      disconnectCalls: state.disconnectCalls,
      recorderStarts: state.recorderStarts,
      recorderStops: state.recorderStops,
      lifecycleEvents: state.lifecycleEvents,
    };
  });

const triggerProviderDisconnect = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const driver = (
      window as typeof window & {
        __lightframeDevelopmentRealtimeDriver: { triggerProviderDisconnect(): void };
      }
    ).__lightframeDevelopmentRealtimeDriver;
    driver.triggerProviderDisconnect();
  });

const expectNoExternalProviderTraffic = (network: NetworkJourneyState): void => {
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
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

test('Local Camera starts, records, and finalizes a playable take without provider work', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');
  await expect(page.getByLabel('Integration availability')).toContainText('AI video available');

  await page.getByRole('button', { name: 'Recipe Shelf' }).click();
  await page.getByRole('button', { name: 'New character recipe' }).click();
  await page.getByLabel(/^Name/).fill('Local blocked recipe');
  await page.getByLabel(/^Prompt text/).fill('Transform the adult subject into a field host.');
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.getByRole('button', { name: 'Close creative tool' }).click();

  await page.getByRole('button', { name: 'Start local preview' }).click();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Character workshop' })).toBeDisabled();
  await page.getByRole('button', { name: 'Recipe Shelf' }).click();
  await expect(page.getByRole('button', { name: 'Use Local blocked recipe' })).toBeDisabled();
  await expect(page.getByText(/release camera & mic before inserting/i)).toBeVisible();
  await page.getByRole('button', { name: 'Close creative tool' }).click();
  await expect(page.getByRole('button', { name: 'Record a take' })).toBeEnabled();

  await page.getByRole('button', { name: 'Record a take' }).click();
  await expect(page.getByRole('button', { name: 'Finish take' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish take' }).click();

  await expect(page.getByRole('heading', { name: 'Latest take' })).toBeVisible();
  await expect(page.getByLabel('Latest recorded take')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download take' })).toHaveAttribute('href', /^blob:/);
  await expectNoAxeViolations(page);
  await page.getByRole('button', { name: 'Discard' }).click();
  await expect(page.getByRole('button', { name: 'Record a take' })).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Latest take' })).toHaveCount(0);

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

test('Lucy 2.5 starts, applies explicitly, falls back on disconnect, recovers, and resets', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');
  await expect(page.getByLabel('Integration availability')).toContainText('AI video available');

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

  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await page.getByLabel('Character direction').fill('An adult stop-motion field presenter');
  await page.getByRole('button', { name: 'Start Character AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();

  await page.getByRole('button', { name: 'Record a take' }).click();
  await expect(page.getByRole('button', { name: 'Finish take & end AI' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish take & end AI' }).click();

  await expect(page.getByRole('heading', { name: 'Latest take' })).toBeVisible();
  await expect(page.getByLabel('Latest recorded take')).toBeVisible();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Start Character AI' })).toBeVisible();

  const browser = await readBrowserState(page);
  expect(browser.recorderStarts).toBe(2);
  expect(browser.recorderStops).toBe(2);
  expect(browser.disconnectCalls).toBe(1);
  expect(browser.lifecycleEvents).toEqual([
    'recorder-finalized',
    'recorder-finalized',
    'provider-disconnected',
  ]);
  expectNoExternalProviderTraffic(network);
});

test('VTON 3 accepts a valid ephemeral garment image and starts with image-only state', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');
  await expect(page.getByLabel('Integration availability')).toContainText('AI video available');

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
