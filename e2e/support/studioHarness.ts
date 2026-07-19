import { createHash } from 'node:crypto';
import { expect, type Page } from '@playwright/test';

// A 64px mint VP8/Opus WebM used by the deterministic MediaRecorder. Keeping a
// real media container here lets the stable main-stage playback exercise the
// browser's recorded-source path instead of relying on an invalid text blob.
const FIXED_WEBM_BASE64 =
  'GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQRChYECGFOAZwEAAAAAAAPHEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHWTbuMU6uEElTDZ1OsggGJTbuMU6uEHFO7a1OsggOx7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsCrXsYMPQkBNgIxMYXZmNjIuMy4xMDBXQYxMYXZmNjIuMy4xMDBEiYhAagAAAAAAABZUrmtAra4BAAAAAAAAP9eBAXPFiE2mk5i4/Zn+nIEAIrWcg3VuZIiBAIaFVl9WUDiDgQEj44OEC+vCAOCQsIFAuoFAmoECVbCEVbmBAa4BAAAAAAAAXNeBAnPFiJrGl6+a4otJnIEAIrWcg3VuZIiBAIaGQV9PUFVTVqqDYy6gVruEBMS0AIOBAuGRn4EBtYhA53AAAAAAAGJkgRBjopNPcHVzSGVhZAEBOAGAuwAAAAAAElTDZ0DVc3OfY8CAZ8iZRaOHRU5DT0RFUkSHjExhdmY2Mi4zLjEwMHNz1mPAi2PFiE2mk5i4/Zn+Z8ihRaOHRU5DT0RFUkSHlExhdmM2Mi4xMS4xMDAgbGlidnB4Z8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMC4yMDAwMDAwMDAAc3PXY8CLY8WImsaXr5rii0lnyKJFo4dFTkNPREVSRIeVTGF2YzYyLjExLjEwMCBsaWJvcHVzZ8ihRaOIRFVSQVRJT05Eh5MwMDowMDowMC4yMDgwMDAwMDAAH0O2dUFH54EAo6CCAACACIIus9vut8Yiydk1Igkj/XNos8ZUDdGd8vz2MKO6gQAAgBADAJ0BKkAAQAAARwiFhYiFhIgCAgJ08luZhVWRB7sxegD+9fmr0//f7H//f7H//f7H/v50AKOZggAVgAikiHym31yBd+ehDC8B0hVsEPLSMKOWggApgAicj4HpIUJspisqtfWHNlvUQKOTggA9gAicjDp1JdFgdoOprHux2aOUggBRgAicj4HpKUuFVSZIMbH2jsCjk4IAZYAInIwlpyVeaTexeOR+tlCjlIIAeYAInI+B6SlLjAufLYbvtF9Ao5SCAI2ACJyMOnUl0V0DEtfAAWmxyKOSggChgAickgPUbL0GlSYkM3WQo5KCALWACJyPgekpS4VPZkeaNSqgnaGUggDJAAgF64Joa2wKFQPSWqLsI8B1ooQAzf5gHFO7a5G7j7OBALeK94EB8YICZPCBJQ==';

// A valid one-pixel PNG. Browser-side image validation is deterministically
// stubbed to 1024x1024 by the harness, so these bytes exercise the complete
// fetch/File handoff while keeping the fixture tiny and fast.
const REFERENCE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const REFERENCE_PNG = Buffer.from(REFERENCE_PNG_BASE64, 'base64');

export type MockReferenceImageAsset = {
  assetId: string;
  mimeType: 'image/png';
  width: 1024;
  height: 1024;
  byteSize: number;
  source: 'generated';
  provider: 'openai';
  model: 'gpt-image-2';
  promptHash: string;
  createdAt: string;
  contentUrl: string;
};

export type ModelId = 'lucy-2.5' | 'lucy-vton-3';

export type SerializedSnapshot = {
  prompt: string;
  imageName: string | null;
  enhance: boolean;
};

export type BrowserJourneyState = {
  cameraCalls: number;
  requirementModels: ModelId[];
  connections: Array<{ model: ModelId; initial: SerializedSnapshot }>;
  applies: SerializedSnapshot[];
  disconnectCalls: number;
  recorderStarts: number;
  recorderStops: number;
  lifecycleEvents: string[];
  createdObjectUrls: string[];
  revokedObjectUrls: string[];
};

export type NetworkJourneyState = {
  apiRequests: Array<{ path: string; model: ModelId | null }>;
  referenceImageGenerations: Array<{
    requestId: string;
    workshopPrompt: string;
    assetId: string;
  }>;
  referenceImageMetadataReads: string[];
  referenceImageContentReads: string[];
  blockedExternalRequests: string[];
  blockedExternalWebSockets: string[];
};

export type StudioHarnessOptions = {
  stubMediaPlayback?: boolean;
  referenceImagesAvailable?: boolean;
};

const canonicalPrompt = (value: string): string =>
  value.replace(/\s+/gu, ' ').trim().slice(0, 4_000).toLocaleLowerCase('en-US');

const promptHash = (value: string): string =>
  createHash('sha256').update(canonicalPrompt(value), 'utf8').digest('hex');

const assetIdForSequence = (sequence: number): string =>
  `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`;

const createMockReferenceAsset = (
  sequence: number,
  workshopPrompt: string,
): MockReferenceImageAsset => {
  const assetId = assetIdForSequence(sequence);
  return {
    assetId,
    mimeType: 'image/png',
    width: 1024,
    height: 1024,
    byteSize: REFERENCE_PNG.byteLength,
    source: 'generated',
    provider: 'openai',
    model: 'gpt-image-2',
    promptHash: promptHash(workshopPrompt),
    createdAt: '2030-01-01T00:00:00.000Z',
    contentUrl: `/api/reference-images/${assetId}/content`,
  };
};

export const installSuccessfulStudioHarness = async (
  page: Page,
  options: StudioHarnessOptions = {},
): Promise<NetworkJourneyState> => {
  const network: NetworkJourneyState = {
    apiRequests: [],
    referenceImageGenerations: [],
    referenceImageMetadataReads: [],
    referenceImageContentReads: [],
    blockedExternalRequests: [],
    blockedExternalWebSockets: [],
  };
  const assets = new Map<string, MockReferenceImageAsset>();
  const assetsByRequestId = new Map<string, MockReferenceImageAsset>();
  let assetSequence = 0;

  await page.addInitScript(
    ({ fixedWebmBase64, stubMediaPlayback }) => {
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
        createdObjectUrls: [],
        revokedObjectUrls: [],
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
      const fixedWebm = Uint8Array.from(atob(fixedWebmBase64), (character) =>
        character.charCodeAt(0),
      );

      const createSyntheticStream = (owner: 'local' | 'provider'): MediaStream => {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('Synthetic canvas context is unavailable.');
        context.fillStyle = '#35d0a0';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const video = canvas.captureStream(5);
        const videoTrack = video.getVideoTracks()[0];
        if (videoTrack) {
          Object.defineProperty(videoTrack, 'label', {
            configurable: true,
            value: 'Synthetic camera',
          });
          const stop = videoTrack.stop.bind(videoTrack);
          videoTrack.stop = () => {
            if (videoTrack.readyState === 'ended') return;
            state.lifecycleEvents.push(`${owner}-video-stopped`);
            stop();
          };
        }

        const audioContext = new AudioContext();
        const destination = audioContext.createMediaStreamDestination();
        const oscillator = audioContext.createOscillator();
        oscillator.frequency.value = 220;
        oscillator.connect(destination);
        oscillator.start();
        mediaResources.push({ canvas, audioContext, oscillator });
        const audioTrack = destination.stream.getAudioTracks()[0];
        if (audioTrack) {
          Object.defineProperty(audioTrack, 'label', {
            configurable: true,
            value: 'Synthetic microphone',
          });
          const stop = audioTrack.stop.bind(audioTrack);
          audioTrack.stop = () => {
            if (audioTrack.readyState === 'ended') return;
            state.lifecycleEvents.push(`${owner}-audio-stopped`);
            stop();
          };
        }

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
            value: new Blob([fixedWebm], { type: this.mimeType }),
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
          const remote = createSyntheticStream('provider');
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
            return Promise.resolve(createSyntheticStream('local'));
          },
          enumerateDevices: () => Promise.resolve([]),
        },
      });
      Object.defineProperty(window, 'createImageBitmap', {
        configurable: true,
        value: () => Promise.resolve({ width: 1_024, height: 1_024, close: () => undefined }),
      });
      if (stubMediaPlayback) {
        Object.defineProperty(HTMLMediaElement.prototype, 'play', {
          configurable: true,
          value: () => Promise.resolve(),
        });
      }
      Object.defineProperty(window, 'confirm', {
        configurable: true,
        value: () => true,
      });
      const createObjectUrl = URL.createObjectURL.bind(URL);
      const revokeObjectUrl = URL.revokeObjectURL.bind(URL);
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: (blob: Blob) => {
          const objectUrl = createObjectUrl(blob);
          state.createdObjectUrls.push(objectUrl);
          return objectUrl;
        },
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: (objectUrl: string) => {
          state.revokedObjectUrls.push(objectUrl);
          revokeObjectUrl(objectUrl);
        },
      });
    },
    {
      fixedWebmBase64: FIXED_WEBM_BASE64,
      stubMediaPlayback: options.stubMediaPlayback ?? true,
    },
  );

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
          referenceImages: {
            available: options.referenceImagesAvailable ?? true,
            modelId: 'gpt-image-2',
            size: '1024x1024',
            quality: 'high',
          },
        }),
      });
      return;
    }

    if (requestUrl.pathname === '/api/reference-images' && route.request().method() === 'POST') {
      const payload = route.request().postDataJSON() as {
        requestId: string;
        workshopPrompt: string;
      };
      let asset = assetsByRequestId.get(payload.requestId);
      if (!asset) {
        assetSequence += 1;
        asset = createMockReferenceAsset(assetSequence, payload.workshopPrompt);
        assetsByRequestId.set(payload.requestId, asset);
        assets.set(asset.assetId, asset);
      }
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.referenceImageGenerations.push({
        requestId: payload.requestId,
        workshopPrompt: payload.workshopPrompt,
        assetId: asset.assetId,
      });
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ asset }),
      });
      return;
    }

    const metadataMatch = requestUrl.pathname.match(/^\/api\/reference-images\/([0-9a-f-]+)$/u);
    if (metadataMatch) {
      const assetId = metadataMatch[1] ?? '';
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.referenceImageMetadataReads.push(assetId);
      const asset = assets.get(assetId);
      if (!asset) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'not_found',
              message: 'That local reference image is no longer available.',
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(asset),
      });
      return;
    }

    const contentMatch = requestUrl.pathname.match(
      /^\/api\/reference-images\/([0-9a-f-]+)\/content$/u,
    );
    if (contentMatch) {
      const assetId = contentMatch[1] ?? '';
      network.apiRequests.push({ path: requestUrl.pathname, model: null });
      network.referenceImageContentReads.push(assetId);
      if (!assets.has(assetId)) {
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({
            error: {
              code: 'not_found',
              message: 'That local reference image is no longer available.',
            },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: REFERENCE_PNG,
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

export const readBrowserState = (page: Page): Promise<BrowserJourneyState> =>
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
      createdObjectUrls: state.createdObjectUrls,
      revokedObjectUrls: state.revokedObjectUrls,
    };
  });

export const triggerProviderDisconnect = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const driver = (
      window as typeof window & {
        __lightframeDevelopmentRealtimeDriver: { triggerProviderDisconnect(): void };
      }
    ).__lightframeDevelopmentRealtimeDriver;
    driver.triggerProviderDisconnect();
  });

export const expectNoExternalProviderTraffic = (network: NetworkJourneyState): void => {
  expect(network.blockedExternalRequests).toEqual([]);
  expect(network.blockedExternalWebSockets).toEqual([]);
};

export const expectNoDocumentOverflow = async (page: Page): Promise<void> => {
  const dimensions = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    bodyWidth: document.body.scrollWidth,
    bodyHeight: document.body.scrollHeight,
  }));

  expect(dimensions.documentWidth).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.bodyWidth).toBeLessThanOrEqual(dimensions.width + 1);
  expect(dimensions.documentHeight).toBeLessThanOrEqual(dimensions.height + 1);
  expect(dimensions.bodyHeight).toBeLessThanOrEqual(dimensions.height + 1);
};

export const openRecipeDockWhenOverlaid = async (page: Page): Promise<void> => {
  const launcher = page.getByRole('button', { name: 'Dock' });
  await expect(launcher).toBeVisible();
  await launcher.click();
  await expect(page.getByRole('dialog', { name: 'Recipe Dock' })).toBeVisible();
};

export const closeRecipeDockWhenOverlaid = async (page: Page): Promise<void> => {
  const dialog = page.getByRole('dialog', { name: 'Recipe Dock' });
  if (!(await dialog.isVisible())) return;

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
};
