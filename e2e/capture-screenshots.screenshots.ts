import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Locator, type Page } from '@playwright/test';
import type { CapabilitiesResponse } from '@studio/contracts';
import type { CreativeAssetStore } from '@studio/domain';
import {
  CREATIVE_ASSET_STORAGE_KEY,
  closeAiSettings,
  createLocalTake,
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  openAiSettings,
  readBrowserState,
  settleVisualPage,
  startCharacterAi,
  startLocalPreview,
  startVirtualTryOnAi,
  type NetworkJourneyState,
} from './support/studioHarness';
import { STUDIO_VIEWPORT_SIZES } from './support/studioViewports';

const CAPTURE_TIME = new Date('2026-07-18T14:30:00.000Z');
const SCREENSHOT_ROOT = path.resolve(
  process.env.LIGHTFRAME_SCREENSHOT_ROOT ?? path.join(process.cwd(), 'test-results', 'captures'),
);
const FIXED_WEBP = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v3AgAA=',
  'base64',
);

const VIEWPORTS = [
  { folder: '01-full-desktop-1440x960', ...STUDIO_VIEWPORT_SIZES.fullDesktop },
  { folder: '02-compact-desktop-1280x720', ...STUDIO_VIEWPORT_SIZES.compactDesktop },
  { folder: '03-tablet-portrait-834x1112', ...STUDIO_VIEWPORT_SIZES.tabletPortrait },
  { folder: '04-mobile-portrait-390x844', ...STUDIO_VIEWPORT_SIZES.mobilePortrait },
  { folder: '05-small-mobile-320x568', ...STUDIO_VIEWPORT_SIZES.smallMobile },
] as const;

const SEEDED_SHELF = {
  schemaVersion: 7,
  savedPrompts: [
    {
      id: 'character-amber-host',
      title: 'Amber Field Host',
      prompt: 'Transform the adult subject into a cinematic field presenter.',
      modelModeId: 'lucy-latest',
      source: 'manual',
      referenceImageAssetId: null,
      vtonInputKind: null,
      enhancePrompt: false,
      tags: ['editorial', 'warm'],
      createdAt: '2026-07-15T14:30:00.000Z',
      updatedAt: '2026-07-18T14:30:00.000Z',
      lastUsedAt: '2026-07-18T14:30:00.000Z',
      useCount: 3,
    },
    {
      id: 'vton-amber-jacket',
      title: 'Structured Amber Jacket',
      prompt: 'Replace the current top with a structured amber field jacket.',
      modelModeId: 'lucy-vton-latest',
      source: 'manual',
      referenceImageAssetId: null,
      vtonInputKind: 'prompt',
      enhancePrompt: false,
      tags: ['outerwear', 'amber'],
      createdAt: '2026-07-14T14:30:00.000Z',
      updatedAt: '2026-07-17T14:30:00.000Z',
      lastUsedAt: '2026-07-17T14:30:00.000Z',
      useCount: 2,
    },
  ],
  recentPrompts: [
    {
      id: 'recent-character',
      prompt: 'An adult stop-motion science presenter in a practical studio.',
      modelModeId: 'lucy-latest',
      referenceImageAssetId: null,
      vtonInputKind: null,
      enhancePrompt: false,
      usedAt: '2026-07-18T13:00:00.000Z',
    },
    {
      id: 'recent-vton',
      prompt: 'A tailored linen travel overshirt in soft copper.',
      modelModeId: 'lucy-vton-latest',
      referenceImageAssetId: null,
      vtonInputKind: 'prompt',
      enhancePrompt: false,
      usedAt: '2026-07-17T13:00:00.000Z',
    },
  ],
  savedCharacterPrompts: [
    {
      id: 'character-cinematic-presenter',
      name: 'Cinematic Field Presenter',
      prompt: 'Transform the adult subject into a cinematic documentary field presenter.',
      source: 'generator',
      promptIntent: 'character-transform',
      builderDraft: {
        intent: 'character-transform',
        presetId: null,
        customDetails: '',
        adultAge: 'adult',
        gender: null,
        characterBase: 'documentary field presenter',
        matchReference: false,
        appearance: 'natural editorial complexion',
        ethnicity: '',
        skinTone: '',
        bodyShape: '',
        hair: '',
        hairColor: '',
        outfit: 'structured amber field jacket',
        accessories: '',
        expression: 'focused half-smile',
        mood: 'grounded and cinematic',
        preserve: 'camera framing',
      },
      guidedDesign: null,
      referenceImageStatus: 'prompt-only',
      referenceImageAssetId: null,
      uploadedReferenceImageAssetId: null,
      finalReferenceKind: null,
      selectedWardrobeVariantId: null,
      defaultVoice: null,
      notes: 'A grounded host treatment for field stories.',
      tags: ['host', 'editorial'],
      createdAt: '2026-07-16T14:30:00.000Z',
      updatedAt: '2026-07-18T12:30:00.000Z',
      lastUsedAt: '2026-07-18T12:30:00.000Z',
      useCount: 4,
    },
  ],
  savedCharacterVariants: [],
} satisfies CreativeAssetStore;

type Scenario = {
  group: string;
  filename: string;
  preparationOnly?: boolean;
  elevenLabs?: boolean;
  setup(page: Page): Promise<void>;
};

const installVoiceRoutes = async (page: Page, network: NetworkJourneyState): Promise<void> => {
  await page.route(
    (url) => url.pathname === '/api/capabilities',
    async (route) => {
      network.apiRequests.push({ path: '/api/capabilities', model: null });
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
          elevenLabs: { available: true, modelId: 'eleven_multilingual_sts_v2' },
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
    },
  );

  await page.route(
    (url) => url.pathname === '/api/elevenlabs/voices',
    async (route) => {
      network.apiRequests.push({ path: '/api/elevenlabs/voices', model: null });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          voices: [
            {
              voiceId: 'workspace-northstar',
              name: 'Northstar Narrator',
              category: 'professional',
              description: 'Warm, grounded documentary narration',
              labels: { accent: 'Canadian', style: 'documentary' },
              traits: {
                language: 'en',
                gender: 'neutral',
                age: 'middle-aged',
                accent: 'Canadian',
                useCase: 'narration',
                descriptive: 'grounded',
              },
              previewAvailable: false,
              removable: true,
            },
          ],
          hasMore: false,
          nextPageToken: null,
          total: 1,
        }),
      });
    },
  );
};

const showVoiceTreatment = async (page: Page): Promise<void> => {
  await createLocalTake(page);
  await page.getByRole('button', { name: 'Voice treatments' }).click();
  await expect(page.getByRole('dialog', { name: 'Voice Treatments' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to take review' })).toBeVisible();
  const heading = page.getByRole('heading', { name: 'Select Treatment', exact: true });
  await expect(heading).toBeVisible();
  await heading.scrollIntoViewIfNeeded();
};

const SCENARIOS: readonly Scenario[] = [
  {
    group: '01-studio',
    filename: 'local-idle.png',
    preparationOnly: true,
    setup: async (page) => {
      await expect(page.getByRole('button', { name: 'Record New Video' })).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toContainText('Studio idle');
    },
  },
  {
    group: '01-studio',
    filename: 'local-preview.png',
    setup: async (page) => startLocalPreview(page),
  },
  {
    group: '01-studio',
    filename: 'local-recording.png',
    setup: async (page) => {
      await startLocalPreview(page);
      await page.getByRole('button', { name: 'Record' }).click();
      await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toHaveAttribute('data-recording', 'true');
    },
  },
  {
    group: '01-studio',
    filename: 'local-finalizing.png',
    setup: async (page) => {
      await startLocalPreview(page);
      await page.getByRole('button', { name: 'Record' }).click();
      await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
      await page.evaluate(() => {
        MediaRecorder.prototype.stop = function stopWithoutTerminalEvent() {
          if (this.state === 'inactive') return;
          Object.defineProperty(this, 'state', { configurable: true, value: 'inactive' });
        };
      });
      await page.getByRole('button', { name: 'Stop recording' }).click();
      await expect(page.getByText('Finalizing take…', { exact: true })).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toHaveAttribute(
        'data-stage-presentation',
        'finalizing',
      );
    },
  },
  {
    group: '01-studio',
    filename: 'stage-media-error.png',
    preparationOnly: true,
    setup: async (page) => {
      await page.evaluate(() => {
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
          configurable: true,
          value: () =>
            Promise.reject(
              new DOMException('Permission denied by screenshot harness.', 'NotAllowedError'),
            ),
        });
      });
      await page.getByRole('button', { name: 'Record New Video' }).click({ force: true });
      await expect(page.getByRole('dialog', { name: 'AI Settings' })).toBeHidden();
      await expect(
        page.getByRole('alert').filter({ hasText: 'Camera or microphone access was not allowed.' }),
      ).toBeVisible();
    },
  },
  {
    group: '01-studio',
    filename: 'character-ai-live.png',
    setup: async (page) => startCharacterAi(page),
  },
  {
    group: '01-studio',
    filename: 'virtual-try-on-ai-live.png',
    setup: async (page) => startVirtualTryOnAi(page),
  },
  {
    group: '02-ai-settings',
    filename: 'character-prepared.png',
    preparationOnly: true,
    setup: async (page) => {
      await openAiSettings(page);
      await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
      await page.getByLabel('Character direction').fill('An adult cinematic field presenter');
      await expect(page.getByRole('heading', { name: 'Character settings' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start Character AI' })).toBeEnabled();
    },
  },
  {
    group: '02-ai-settings',
    filename: 'character-live-pending-changes.png',
    setup: async (page) => {
      await startCharacterAi(page, false);
      await page.getByLabel('Character direction').fill('An adult paper-cut science host');
      await expect(page.getByText('Changes are pending', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Apply changes' })).toBeEnabled();
    },
  },
  {
    group: '02-ai-settings',
    filename: 'virtual-try-on-prepared.png',
    preparationOnly: true,
    setup: async (page) => {
      await openAiSettings(page);
      await page.getByRole('button', { name: 'Virtual Try-On · VTON 3' }).click();
      await page.getByLabel('Garment direction').fill('A tailored linen travel overshirt');
      await page.getByLabel('Garment reference image').setInputFiles({
        name: 'linen-overshirt.webp',
        mimeType: 'image/webp',
        buffer: FIXED_WEBP,
      });
      await expect(page.getByRole('button', { name: 'Clear image' })).toBeVisible();
      const preview = page.getByAltText('Current ephemeral reference preview');
      await expect(preview).toBeVisible();
      expect(
        await preview.evaluate(async (element) => {
          const image = element as HTMLImageElement;
          await image.decode();
          return image.naturalWidth > 0 && image.naturalHeight > 0;
        }),
      ).toBe(true);
    },
  },
  {
    group: '05-capture-settings',
    filename: 'local-before-preview.png',
    preparationOnly: true,
    setup: async (page) => {
      const settings = await openCaptureSettingsSurface(page);
      await expect(settings).toBeVisible();
      await expectCaptureDevicesSettled(page);
      await expect(page.getByText('Available after preview starts')).toBeVisible();
    },
  },
  {
    group: '05-capture-settings',
    filename: 'local-active-capture.png',
    setup: async (page) => {
      await startLocalPreview(page);
      const settings = await openCaptureSettingsSurface(page);
      await expect(settings).toBeVisible();
      await expectCaptureDevicesSettled(page);
      await expect(page.getByRole('heading', { name: 'Active capture' })).toBeVisible();
      expect((await readBrowserState(page)).cameraCalls).toBe(1);
    },
  },
  {
    group: '05-capture-settings',
    filename: 'character-provider-managed-quality.png',
    preparationOnly: true,
    setup: async (page) => {
      await openAiSettings(page);
      await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
      await page.getByLabel('Character direction').fill('An adult editorial field presenter');
      await closeAiSettings(page);
      const settings = await openCaptureSettingsSurface(page);
      await expect(settings).toBeVisible();
      await expectCaptureDevicesSettled(page);
      await expect(page.getByText('Provider-managed quality')).toBeVisible();
    },
  },
  {
    group: '06-take-review',
    filename: 'latest-take.png',
    setup: createLocalTake,
  },
  {
    group: '06-take-review',
    filename: 'local-voice-treatments.png',
    setup: showVoiceTreatment,
  },
  {
    group: '06-take-review',
    filename: 'elevenlabs-workspace-voices.png',
    elevenLabs: true,
    setup: async (page) => {
      await showVoiceTreatment(page);
      await page
        .getByText('Browse saved ElevenLabs voices · contacts provider', { exact: true })
        .click();
      const voice = page.getByRole('heading', { name: 'Northstar Narrator' });
      await expect(voice).toBeVisible();
      await voice.scrollIntoViewIfNeeded();
    },
  },
  {
    group: '06-take-review',
    filename: 'elevenlabs-saved-voice-search.png',
    elevenLabs: true,
    setup: async (page) => {
      await showVoiceTreatment(page);
      await page
        .getByText('Browse saved ElevenLabs voices · contacts provider', { exact: true })
        .click();
      await expect(page.getByRole('heading', { name: 'Northstar Narrator' })).toBeVisible();
      await page.getByRole('textbox', { name: 'Search voices' }).fill('Northstar');
      await page.getByRole('button', { name: 'Search', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Northstar Narrator' })).toBeVisible();
    },
  },
];

const expectCaptureDevicesSettled = async (page: Page): Promise<void> => {
  await expect(page.getByText('Looking for available cameras…', { exact: true })).toBeHidden();
  await expect(page.getByText('Looking for available microphones…', { exact: true })).toBeHidden();
};

const openCaptureSettingsSurface = async (page: Page): Promise<Locator> => {
  const inlineSettings = page.locator('[data-desktop-capture-settings]');
  if ((await inlineSettings.count()) > 0) {
    // The docked desktop panel rests collapsed.
    await page.locator('[data-desktop-capture-settings-toggle]').click();
    await expect(inlineSettings).toBeVisible();
    return inlineSettings;
  }

  await page.getByRole('button', { name: 'Open capture settings' }).click();
  const dialog = page.getByRole('dialog', { name: 'Capture Settings' });
  await expect(dialog).toBeVisible();
  return dialog;
};

const expectActiveStageVideo = async (page: Page): Promise<void> => {
  const video = page.locator('figure video[aria-hidden="false"]');
  if ((await video.count()) === 0) return;

  const presentation = await page
    .getByLabel('Studio media stage')
    .getAttribute('data-stage-presentation');

  if (presentation === 'playback') {
    await expect(video).toHaveAttribute('aria-label', 'Recorded take playback');
    await expect(video).toHaveAttribute('src', /^blob:/u);
    await expect(video).toHaveAttribute('data-media-fit', 'contain');
    await expect
      .poll(() =>
        video.evaluate(
          (element) =>
            (element as HTMLVideoElement).readyState >= HTMLMediaElement.HAVE_METADATA &&
            (element as HTMLVideoElement).duration > 0,
        ),
      )
      .toBe(true);
    return;
  }

  await video.evaluate(async (element) => {
    const media = element as HTMLVideoElement;
    await media.play();
  });

  await expect
    .poll(() =>
      video.evaluate(
        (element) =>
          (element as HTMLVideoElement).readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
          (element as HTMLVideoElement).videoWidth > 0 &&
          (element as HTMLVideoElement).videoHeight > 0,
      ),
    )
    .toBe(true);

  expect(
    await video.evaluate((element) => {
      const stream = (element as HTMLVideoElement).srcObject;
      return (
        stream instanceof MediaStream &&
        stream.getVideoTracks().some((track) => track.readyState === 'live')
      );
    }),
  ).toBe(true);

  await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    const stage = media.closest('figure');
    if (!stage) throw new Error('The active video is not inside the studio stage.');

    const syntheticFrameSize = Math.min(stage.clientWidth, stage.clientHeight);
    media.pause();
    media.srcObject = null;
    media.style.setProperty('inset', '0 auto 0 50%', 'important');
    media.style.setProperty('width', `${syntheticFrameSize}px`, 'important');
    media.style.setProperty('height', '100%', 'important');
    media.style.setProperty('transform', 'translateX(-50%)', 'important');
    media.style.setProperty('background', '#35d0a0', 'important');
  });
};

const captureStableViewport = async (
  page: Page,
  target: string,
  viewport: (typeof VIEWPORTS)[number],
): Promise<void> => {
  const playback =
    (await page.getByLabel('Studio media stage').getAttribute('data-stage-presentation')) ===
    'playback';
  if (playback) {
    await settleVisualPage(page);
    const png = await page.screenshot({ animations: 'disabled', fullPage: false, scale: 'css' });
    expect(png.byteLength).toBeGreaterThan(100);
    expect(png.readUInt32BE(16)).toBe(viewport.width);
    expect(png.readUInt32BE(20)).toBe(viewport.height);
    await writeFile(target, png);
    return;
  }

  let previous: Buffer | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const png = await page.screenshot({
      animations: 'disabled',
      fullPage: false,
      scale: 'css',
    });

    if (previous?.equals(png)) {
      expect(png.byteLength).toBeGreaterThan(100);
      expect(png.readUInt32BE(16)).toBe(viewport.width);
      expect(png.readUInt32BE(20)).toBe(viewport.height);
      await writeFile(target, png);
      return;
    }

    previous = png;
    await settleVisualPage(page);
  }

  throw new Error(`Viewport did not produce two identical frames: ${target}`);
};

for (const viewport of VIEWPORTS) {
  for (const scenario of SCENARIOS) {
    test(`${viewport.folder} / ${scenario.group} / ${scenario.filename}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.clock.setFixedTime(CAPTURE_TIME);
      await page.emulateMedia({ reducedMotion: 'reduce' });

      const network = await installSuccessfulStudioHarness(page, { stubMediaPlayback: false });
      if (scenario.elevenLabs) await installVoiceRoutes(page, network);
      await page.addInitScript(() => {
        Object.defineProperty(window.performance, 'now', {
          configurable: true,
          value: () => 0,
        });
      });
      await page.addInitScript(({ key, value }) => window.localStorage.setItem(key, value), {
        key: CREATIVE_ASSET_STORAGE_KEY,
        value: JSON.stringify(SEEDED_SHELF),
      });

      await page.goto('/studio/create');
      await expect(page.getByRole('main')).toBeVisible();
      await page.getByLabel('Integration availability').getByRole('button').click();
      await expect(page.getByRole('region', { name: 'Studio availability details' })).toContainText(
        'Live AI Beta enabled',
      );
      await page.keyboard.press('Escape');
      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            animation: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            transition: none !important;
            caret-color: transparent !important;
          }
        `,
      });

      await scenario.setup(page);
      await settleVisualPage(page);
      await expectActiveStageVideo(page);
      await expectNoDocumentOverflow(page);
      expectNoExternalProviderTraffic(network);

      if (scenario.preparationOnly) {
        const browser = await readBrowserState(page);
        expect(browser.cameraCalls).toBe(0);
        expect(browser.requirementModels).toEqual([]);
        expect(browser.connections).toEqual([]);
        expect(browser.recorderStarts).toBe(0);
        expect(network.apiRequests.length).toBeGreaterThan(0);
        expect(
          network.apiRequests.every(({ path: requestPath }) => requestPath === '/api/capabilities'),
        ).toBe(true);
      }

      const target = path.join(SCREENSHOT_ROOT, viewport.folder, scenario.group, scenario.filename);
      await mkdir(path.dirname(target), { recursive: true });
      await captureStableViewport(page, target, viewport);
    });
  }
}
