import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { CreativeAssetStore } from '@studio/domain';
import {
  closeRecipeDockWhenOverlaid,
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  openRecipeDockWhenOverlaid,
  readBrowserState,
  type NetworkJourneyState,
} from './support/studioHarness';

const CAPTURE_TIME = new Date('2026-07-18T14:30:00.000Z');
const SCREENSHOT_ROOT = path.join(process.cwd(), 'screenshots');
const CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v3';
const FIXED_WEBP = Buffer.from(
  'UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/v3AgAA=',
  'base64',
);

const VIEWPORTS = [
  { folder: '01-full-desktop-1440x960', width: 1_440, height: 960 },
  { folder: '02-compact-desktop-1280x720', width: 1_280, height: 720 },
  { folder: '03-tablet-portrait-834x1112', width: 834, height: 1_112 },
  { folder: '04-mobile-portrait-390x844', width: 390, height: 844 },
  { folder: '05-small-mobile-320x568', width: 320, height: 568 },
] as const;

const SEEDED_SHELF = {
  schemaVersion: 3,
  savedPrompts: [
    {
      id: 'character-amber-host',
      title: 'Amber Field Host',
      prompt: 'Transform the adult subject into a cinematic field presenter.',
      modelModeId: 'lucy-2.5',
      source: 'manual',
      referenceImageAssetId: null,
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
      modelModeId: 'lucy-vton-3',
      source: 'manual',
      referenceImageAssetId: null,
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
      modelModeId: 'lucy-2.5',
      referenceImageAssetId: null,
      usedAt: '2026-07-18T13:00:00.000Z',
    },
    {
      id: 'recent-vton',
      prompt: 'A tailored linen travel overshirt in soft copper.',
      modelModeId: 'lucy-vton-3',
      referenceImageAssetId: null,
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
      notes: 'A grounded host treatment for field stories.',
      tags: ['host', 'editorial'],
      createdAt: '2026-07-16T14:30:00.000Z',
      updatedAt: '2026-07-18T12:30:00.000Z',
      lastUsedAt: '2026-07-18T12:30:00.000Z',
      useCount: 4,
    },
  ],
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
          realtimeVideo: { available: true, models: ['lucy-2.5', 'lucy-vton-3'] },
          elevenLabs: { available: true, modelId: 'eleven_multilingual_sts_v2' },
          referenceImages: {
            available: false,
            editAvailable: false,
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
              previewAvailable: false,
            },
          ],
          hasMore: false,
          nextPageToken: null,
          total: 1,
        }),
      });
    },
  );

  await page.route(
    (url) => url.pathname === '/api/elevenlabs/shared-voices',
    async (route) => {
      network.apiRequests.push({ path: '/api/elevenlabs/shared-voices', model: null });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          voices: [
            {
              voiceId: 'public-copper-atlas',
              publicOwnerId: 'owner-copper-atlas',
              name: 'Copper Atlas',
              category: 'narration',
              description: 'Textured editorial voice with a calm cadence',
              labels: { accent: 'North American', style: 'editorial' },
              previewAvailable: false,
            },
          ],
          page: 0,
          hasMore: false,
          nextPageToken: null,
          total: 1,
        }),
      });
    },
  );
};

const openShelf = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Recipe Shelf', exact: true })).toBeVisible();
};

const startLocalPreview = async (page: Page, closeDock = true): Promise<void> => {
  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Start local preview' }).click({ force: true });
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  if (closeDock) await closeRecipeDockWhenOverlaid(page);
};

const startCharacterAi = async (page: Page, closeDock = true): Promise<void> => {
  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await page.getByLabel('Character direction').fill('An adult paper-cut travel host');
  await page.getByRole('button', { name: 'Start Character AI' }).click({ force: true });
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText('AI live', { exact: true })).toBeVisible();
  if (closeDock) await closeRecipeDockWhenOverlaid(page);
};

const startVirtualTryOnAi = async (page: Page, closeDock = true): Promise<void> => {
  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Virtual Try-On · VTON 3' }).click();
  await page.getByLabel('Garment direction').fill('A structured amber field jacket');
  await page.getByRole('button', { name: 'Start Virtual Try-On AI' }).click({ force: true });
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText('AI live', { exact: true })).toBeVisible();
  if (closeDock) await closeRecipeDockWhenOverlaid(page);
};

const createLocalTake = async (page: Page): Promise<void> => {
  await startLocalPreview(page);
  await page.getByRole('button', { name: 'Record a take' }).click();
  await expect(page.getByRole('button', { name: 'Finish take' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish take' }).click();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Latest Take' })).toBeVisible();
};

const showVoiceTreatment = async (page: Page): Promise<void> => {
  await createLocalTake(page);
  await page.getByRole('button', { name: 'Voice treatments' }).click();
  await expect(page.getByRole('dialog', { name: 'Voice Treatments' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Back to take review' })).toBeVisible();
  const heading = page.getByRole('heading', { name: 'Voice treatment', exact: true });
  await expect(heading).toBeVisible();
  await heading.scrollIntoViewIfNeeded();
};

const openWorkshop = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Workshop', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Direct one clear visual change' })).toBeVisible();
};

const SCENARIOS: readonly Scenario[] = [
  {
    group: '01-studio',
    filename: 'local-idle.png',
    preparationOnly: true,
    setup: async (page) => {
      await openRecipeDockWhenOverlaid(page);
      await expect(page.getByRole('button', { name: 'Start local preview' })).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toContainText('Camera off');
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
      await page.getByRole('button', { name: 'Record a take' }).click();
      await expect(page.getByRole('button', { name: 'Finish take' })).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toHaveAttribute('data-recording', 'true');
    },
  },
  {
    group: '01-studio',
    filename: 'local-finalizing.png',
    setup: async (page) => {
      await startLocalPreview(page);
      await page.getByRole('button', { name: 'Record a take' }).click();
      await expect(page.getByRole('button', { name: 'Finish take' })).toBeVisible();
      await page.evaluate(() => {
        MediaRecorder.prototype.stop = function stopWithoutTerminalEvent() {
          if (this.state === 'inactive') return;
          Object.defineProperty(this, 'state', { configurable: true, value: 'inactive' });
        };
      });
      await page.getByRole('button', { name: 'Finish take' }).click();
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
      await openRecipeDockWhenOverlaid(page);
      await page.getByRole('button', { name: 'Start local preview' }).click({ force: true });
      await expect(page.getByRole('dialog', { name: 'Recipe Dock' })).toBeHidden();
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
    group: '02-recipe-dock',
    filename: 'character-prepared.png',
    preparationOnly: true,
    setup: async (page) => {
      await openRecipeDockWhenOverlaid(page);
      await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
      await page.getByLabel('Character direction').fill('An adult cinematic field presenter');
      await expect(page.getByRole('heading', { name: 'Character recipe' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Start Character AI' })).toBeEnabled();
    },
  },
  {
    group: '02-recipe-dock',
    filename: 'character-live-pending-changes.png',
    setup: async (page) => {
      await startCharacterAi(page, false);
      await page.getByLabel('Character direction').fill('An adult paper-cut science host');
      await expect(page.getByText('Changes are pending', { exact: true })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Apply changes' })).toBeEnabled();
    },
  },
  {
    group: '02-recipe-dock',
    filename: 'virtual-try-on-prepared.png',
    preparationOnly: true,
    setup: async (page) => {
      await openRecipeDockWhenOverlaid(page);
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
    group: '03-character-workshop',
    filename: 'transform-character.png',
    preparationOnly: true,
    setup: async (page) => {
      await openWorkshop(page);
      await page
        .getByRole('textbox', { name: 'Character concept', exact: true })
        .fill('documentary field presenter');
      await page.getByLabel('Adult age direction').selectOption('adult');
    },
  },
  {
    group: '03-character-workshop',
    filename: 'add-one-object.png',
    preparationOnly: true,
    setup: async (page) => {
      await openWorkshop(page);
      await page.getByRole('button', { name: 'Add one object' }).click();
      await page
        .getByRole('textbox', { name: 'Object to add', exact: true })
        .fill('a copper field notebook');
      await page
        .getByRole('textbox', { name: 'Specific placement', exact: true })
        .fill('held at chest height');
    },
  },
  {
    group: '03-character-workshop',
    filename: 'replace-one-object.png',
    preparationOnly: true,
    setup: async (page) => {
      await openWorkshop(page);
      await page.getByRole('button', { name: 'Replace one object' }).click();
      await page
        .getByRole('textbox', { name: 'Visible object to replace', exact: true })
        .fill('the paper notebook');
      await page
        .getByRole('textbox', { name: 'Replacement', exact: true })
        .fill('a compact field recorder');
    },
  },
  {
    group: '03-character-workshop',
    filename: 'restyle-one-object.png',
    preparationOnly: true,
    setup: async (page) => {
      await openWorkshop(page);
      await page.getByRole('button', { name: 'Restyle one object' }).click();
      await page
        .getByRole('textbox', { name: 'Object to restyle', exact: true })
        .fill('the field jacket');
      await page
        .getByRole('textbox', { name: 'Attribute', exact: true })
        .fill('material and color');
      await page
        .getByRole('textbox', { name: 'New look or value', exact: true })
        .fill('burnished amber canvas');
    },
  },
  {
    group: '04-recipe-shelf',
    filename: 'character-saved-recipes.png',
    preparationOnly: true,
    setup: async (page) => {
      await openShelf(page);
      await expect(page.getByRole('list', { name: 'Saved prompt recipes' })).toBeVisible();
      await expect(page.getByText('Amber Field Host', { exact: true })).toBeVisible();
    },
  },
  {
    group: '04-recipe-shelf',
    filename: 'character-recent-prompts.png',
    preparationOnly: true,
    setup: async (page) => {
      await openShelf(page);
      await page.getByRole('button', { name: /^Recent/u }).click();
      await expect(page.getByRole('list', { name: 'Recent successful prompts' })).toBeVisible();
    },
  },
  {
    group: '04-recipe-shelf',
    filename: 'character-recipes.png',
    preparationOnly: true,
    setup: async (page) => {
      await openShelf(page);
      await page.getByRole('button', { name: /^Characters/u }).click();
      await expect(page.getByRole('list', { name: 'Saved character recipes' })).toBeVisible();
    },
  },
  {
    group: '04-recipe-shelf',
    filename: 'virtual-try-on-saved-recipes.png',
    preparationOnly: true,
    setup: async (page) => {
      await openShelf(page);
      await page.getByRole('button', { name: 'Try-on recipes' }).click();
      await expect(page.getByText('Structured Amber Jacket', { exact: true })).toBeVisible();
      await expect(page.getByRole('list', { name: 'Saved prompt recipes' })).toBeVisible();
    },
  },
  {
    group: '04-recipe-shelf',
    filename: 'new-character-recipe.png',
    preparationOnly: true,
    setup: async (page) => {
      await openShelf(page);
      await page.getByRole('button', { name: 'New character recipe' }).click();
      await expect(page.getByRole('heading', { name: 'New Character recipe' })).toBeVisible();
      await page.getByRole('textbox', { name: /^Name/u }).fill('Copper Editorial Host');
      await page.getByRole('textbox', { name: 'Tags', exact: true }).fill('editorial, copper');
      await page
        .getByLabel('Prompt text')
        .fill('Transform the adult subject into an editorial host.');
    },
  },
  {
    group: '05-capture-settings',
    filename: 'local-before-preview.png',
    preparationOnly: true,
    setup: async (page) => {
      await page.getByRole('button', { name: 'Open capture settings' }).click();
      await expect(page.getByRole('dialog', { name: 'Capture Settings' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Sources and quality' })).toBeVisible();
      await expectCaptureDevicesSettled(page);
      await expect(page.getByText('Available after preview starts')).toBeVisible();
    },
  },
  {
    group: '05-capture-settings',
    filename: 'local-active-capture.png',
    setup: async (page) => {
      await startLocalPreview(page);
      await page.getByRole('button', { name: 'Open capture settings' }).click();
      await expect(page.getByRole('dialog', { name: 'Capture Settings' })).toBeVisible();
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
      await openRecipeDockWhenOverlaid(page);
      await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
      await page.getByLabel('Character direction').fill('An adult editorial field presenter');
      await closeRecipeDockWhenOverlaid(page);
      await page.getByRole('button', { name: 'Open capture settings' }).click();
      await expect(page.getByRole('dialog', { name: 'Capture Settings' })).toBeVisible();
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
      await page.getByText('Browse ElevenLabs voices · contacts provider', { exact: true }).click();
      const voice = page.getByRole('heading', { name: 'Northstar Narrator' });
      await expect(voice).toBeVisible();
      await voice.scrollIntoViewIfNeeded();
    },
  },
  {
    group: '06-take-review',
    filename: 'elevenlabs-public-voices.png',
    elevenLabs: true,
    setup: async (page) => {
      await showVoiceTreatment(page);
      await page.getByText('Browse ElevenLabs voices · contacts provider', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Northstar Narrator' })).toBeVisible();
      await page.getByRole('button', { name: 'Public library' }).click();
      const voice = page.getByRole('heading', { name: 'Copper Atlas' });
      await expect(voice).toBeVisible();
      await voice.scrollIntoViewIfNeeded();
    },
  },
];

const settlePage = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
};

const expectCaptureDevicesSettled = async (page: Page): Promise<void> => {
  await expect(page.getByText('Looking for available cameras…', { exact: true })).toBeHidden();
  await expect(page.getByText('Looking for available microphones…', { exact: true })).toBeHidden();
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
    await settlePage(page);
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
    await settlePage(page);
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

      await page.goto('/');
      await expect(page.getByRole('main')).toBeVisible();
      await expect(page.getByLabel('Integration availability')).toContainText('AI video available');
      await page.addStyleTag({
        content: `
          *, *::before, *::after {
            animation: none !important;
            backdrop-filter: none !important;
            -webkit-backdrop-filter: none !important;
            transition: none !important;
            caret-color: transparent !important;
          }
          [data-stage-audio="true"] > span[aria-hidden="true"] {
            --audio-level: 48% !important;
          }
        `,
      });

      await scenario.setup(page);
      await settlePage(page);
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
