import { expect, test, type Page } from '@playwright/test';
import type { CreativeAssetStore } from '@studio/domain';
import {
  installFakeVideoJobRoutes,
  loadDecodableH264VideoFixture,
  loadH264VideoFixture,
} from './support/existingVideoHarness';
import {
  CREATIVE_ASSET_STORAGE_KEY,
  closeRecipeDockWhenOverlaid,
  createLocalTake,
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  openRecipeDockWhenOverlaid,
  openCharacterOptions,
  settleVisualPage,
  startLocalPreview,
  type NetworkJourneyState,
} from './support/studioHarness';
import { REFERENCE_PNG } from './support/mediaFixtures';
import { VISUAL_CASE_MATRIX, type VisualScenarioId } from './studioVisualMatrix';

const CAPTURE_TIME = new Date('2026-07-18T14:30:00.000Z');
const SEEDED_CHARACTER_STORE = {
  schemaVersion: 7,
  savedPrompts: [],
  recentPrompts: [],
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

type VisualScenario = {
  id: VisualScenarioId;
  setup(page: Page): Promise<void>;
};

type VisualCase = {
  viewport: (typeof VISUAL_CASE_MATRIX)[number]['viewport'];
  scenario: VisualScenario;
  baseline: string;
};

const expectStandardStudioLayout = async (
  page: Page,
  viewport: { width: number; height: number },
): Promise<void> => {
  const stage = page.getByLabel('Studio media stage');
  if ((await stage.count()) === 0) return;

  const frame = stage.locator('[data-stage-frame]');
  const controls = stage.locator('[data-stage-controls-region]');
  const videoEditorActive = (await page.locator('[data-video-edit-active="true"]').count()) > 0;
  const toolRail = page.locator('[data-studio-tool-rail]');
  const capture = page.locator('[data-capture-controls]');
  const [stageBox, frameBox, controlsBox, toolRailBox, captureBox] = await Promise.all([
    stage.boundingBox(),
    frame.boundingBox(),
    videoEditorActive ? Promise.resolve(null) : controls.boundingBox(),
    toolRail.boundingBox(),
    capture.boundingBox(),
  ]);

  expect(stageBox).not.toBeNull();
  expect(frameBox).not.toBeNull();
  if (!videoEditorActive) expect(controlsBox).not.toBeNull();
  expect(toolRailBox).not.toBeNull();
  expect(captureBox).not.toBeNull();
  if (!stageBox || !frameBox || !toolRailBox || !captureBox) return;

  if (controlsBox) {
    expect(controlsBox.y).toBeGreaterThanOrEqual(frameBox.y + frameBox.height - 1);
    expect(controlsBox.y + controlsBox.height).toBeLessThanOrEqual(viewport.height + 1);
  }

  if (viewport.width >= 1_024) {
    expect(toolRailBox.x + toolRailBox.width).toBeLessThanOrEqual(stageBox.x);
    expect(captureBox.x).toBeGreaterThanOrEqual(stageBox.x + stageBox.width);
  } else {
    expect(toolRailBox.y).toBeGreaterThanOrEqual(stageBox.y + stageBox.height - 1);
    expect(captureBox.y).toBeGreaterThanOrEqual(toolRailBox.y + toolRailBox.height - 1);
  }
};

const stabilizeActiveStageVideo = async (page: Page): Promise<void> => {
  const video = page.locator('figure video[aria-hidden="false"]');
  if ((await video.count()) === 0) return;

  const presentation = await page
    .getByLabel('Studio media stage')
    .getAttribute('data-stage-presentation');

  if (presentation === 'playback') {
    await expect(video).toHaveAttribute('aria-label', 'Recorded take playback');
    await expect(video).toHaveAttribute('src', /^blob:/u);
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
    await (element as HTMLVideoElement).play();
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

  await video.evaluate((element) => {
    const media = element as HTMLVideoElement;
    const frame = media.closest('[data-stage-frame]');
    if (!frame) throw new Error('The active video is not inside the studio stage frame.');

    const syntheticFrameSize = Math.min(frame.clientWidth, frame.clientHeight);
    media.pause();
    media.srcObject = null;
    media.style.setProperty('inset', '0 auto 0 50%', 'important');
    media.style.setProperty('width', `${syntheticFrameSize}px`, 'important');
    media.style.setProperty('height', '100%', 'important');
    media.style.setProperty('transform', 'translateX(-50%)', 'important');
    media.style.setProperty('background', '#35d0a0', 'important');
  });
};

const prepareVisualPage = async (page: Page, entryRoute: boolean): Promise<NetworkJourneyState> => {
  await page.clock.setFixedTime(CAPTURE_TIME);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const network = await installSuccessfulStudioHarness(page, {
    elevenLabsAvailable: true,
    stubMediaPlayback: false,
  });
  await page.addInitScript(() => {
    Object.defineProperty(window.performance, 'now', {
      configurable: true,
      value: () => 0,
    });
  });
  await page.addInitScript(
    ({ storageKey, store }) => {
      window.localStorage.setItem(storageKey, JSON.stringify(store));
    },
    { storageKey: CREATIVE_ASSET_STORAGE_KEY, store: SEEDED_CHARACTER_STORE },
  );

  await page.goto(entryRoute ? '/' : '/studio');
  await expect(page.getByRole('main')).toBeVisible();
  if (entryRoute) {
    await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
  } else {
    await page.getByLabel('Integration availability').getByRole('button').click();
    await expect(page.getByRole('region', { name: 'Studio availability details' })).toContainText(
      'AI video configured',
    );
    await page.keyboard.press('Escape');
  }
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
        transition: none !important;
        caret-color: transparent !important;
        scrollbar-width: none !important;
      }
      *::-webkit-scrollbar {
        display: none !important;
        width: 0 !important;
        height: 0 !important;
      }
    `,
  });
  return network;
};

const openCharacterBuilder = async (page: Page): Promise<void> => {
  await openCharacterOptions(page);
  await page
    .getByRole('button', { name: /^(Create new character|New character recipe)$/u })
    .click();
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeVisible();
};

const openSavedCharacters = async (page: Page): Promise<void> => {
  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  const shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await expect(shelf).toBeVisible();
  const characters = shelf.getByRole('button', { name: /^Characters/u });
  await expect(characters).toHaveAttribute('aria-pressed', 'true');
  await expect(shelf.getByRole('list', { name: 'Saved character recipes' })).toBeVisible();
};

const selectSeededCharacter = async (page: Page): Promise<void> => {
  await openSavedCharacters(page);
  await page.getByRole('button', { name: 'Use Cinematic Field Presenter' }).click();
  await expect(
    page.getByRole('button', {
      name: 'Selected character: Cinematic Field Presenter. Open character options',
    }),
  ).toBeVisible();
};

const openExistingVideoChooser = async (page: Page) => {
  await page.getByRole('button', { name: 'Upload Video' }).click();
  const dialog = page.getByRole('dialog', { name: 'Use existing video' });
  await expect(dialog).toBeVisible();
  return dialog;
};

const selectVisualVideo = async (page: Page, decodable = false) => {
  const dialog = await openExistingVideoChooser(page);
  const fixture = decodable ? await loadDecodableH264VideoFixture() : await loadH264VideoFixture();
  await dialog.locator('input[type="file"]').first().setInputFiles({
    name: 'visual-source.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  });
  await expect(dialog.getByRole('heading', { name: 'Current video' })).toBeVisible();
  await expect(dialog).toContainText('1280 × 720');
  return { dialog, fixture };
};

const addVisualStep = async (
  dialog: ReturnType<Page['getByRole']>,
  modelId: 'lucy-latest' | 'lucy-vton-latest',
  prompt: string,
) => {
  await dialog
    .getByRole('button', {
      name: modelId === 'lucy-latest' ? 'Character Swap' : 'Virtual Try On',
      exact: true,
    })
    .click();
  await dialog.locator('article').last().locator('textarea').fill(prompt);
};

const VISUAL_SCENARIOS: Record<VisualScenarioId, VisualScenario> = {
  'entry-initial': {
    id: 'entry-initial',
    setup: async (page) => {
      await expect(page.getByRole('heading', { name: 'Enter Lightframe Studio' })).toBeAttached();
      await expect(page.getByRole('button', { name: 'Log in' })).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toHaveCount(0);
    },
  },
  'studio-initial-closed': {
    id: 'studio-initial-closed',
    setup: async (page) => {
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'Record New Video', exact: true }),
      ).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toContainText('Studio idle');
    },
  },
  'studio-initial-portrait': {
    id: 'studio-initial-portrait',
    setup: async (page) => {
      const settings = page.locator('[data-desktop-capture-settings]');
      await settings.getByText('Portrait · 9:16', { exact: true }).click();
      const stage = page.getByLabel('Studio media stage');
      await expect(stage).toHaveAttribute('data-stage-aspect-ratio', '9:16');
      await settings.locator('[data-scroll-region="capture-settings"]').evaluate((element) => {
        element.scrollTop = 0;
      });
      await expect(stage.getByText('Your private creative stage.')).toBeVisible();
      await expect(stage.getByText('Create a video', { exact: true })).toBeVisible();
      await expect(
        stage.getByText('Record New Video or Upload Video → review', { exact: true }),
      ).toBeVisible();
      await expect(
        stage.getByText('Virtual Try On · Character Swap · Voice → Save', { exact: true }),
      ).toBeVisible();
      const guideTitle = stage.locator('[data-guide-title]');
      await expect(guideTitle).toHaveCSS('white-space', 'nowrap');
      const guideTitleBox = await guideTitle.evaluate((element) => ({
        clientWidth: element.clientWidth,
        clientHeight: element.clientHeight,
        scrollWidth: element.scrollWidth,
        scrollHeight: element.scrollHeight,
      }));
      expect(guideTitleBox.scrollWidth).toBe(guideTitleBox.clientWidth);
      expect(guideTitleBox.scrollHeight).toBe(guideTitleBox.clientHeight);
      const frameBox = await stage.locator('[data-stage-frame]').boundingBox();
      const guideBox = await stage.locator('[data-first-success-guide]').boundingBox();
      expect(frameBox).not.toBeNull();
      expect(guideBox).not.toBeNull();
      expect(guideBox!.x).toBeGreaterThanOrEqual(frameBox!.x);
      expect(guideBox!.x + guideBox!.width).toBeLessThanOrEqual(frameBox!.x + frameBox!.width);
      expect(guideBox!.y).toBeGreaterThanOrEqual(frameBox!.y);
      expect(guideBox!.y + guideBox!.height).toBeLessThanOrEqual(frameBox!.y + frameBox!.height);
    },
  },
  'local-camera-live': {
    id: 'local-camera-live',
    setup: async (page) => {
      const desktop = (page.viewportSize()?.width ?? 1_024) >= 1_024;
      const defaultAspectRatio = desktop ? '16:9' : '9:16';
      await startLocalPreview(page);
      await expect(page.getByLabel('Live local camera preview')).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toHaveAttribute(
        'data-stage-presentation',
        'live',
      );
      await expect(page.getByLabel('Studio media stage')).toHaveAttribute(
        'data-stage-aspect-ratio',
        defaultAspectRatio,
      );
      if (desktop) {
        await expect(page.locator('[data-desktop-capture-settings]')).toBeVisible();
        await expect(page.getByText('Landscape · 16:9', { exact: true })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Open capture settings' })).toHaveCount(0);
      } else {
        await expect(page.locator('[data-desktop-capture-settings]')).toHaveCount(0);
        await expect(page.getByRole('button', { name: 'Open capture settings' })).toBeVisible();
      }
    },
  },
  'recording-active': {
    id: 'recording-active',
    setup: async (page) => {
      const desktop = (page.viewportSize()?.width ?? 1_024) >= 1_024;
      const switchedAspectRatio = desktop ? '9:16' : '16:9';
      if (!desktop) await page.getByRole('button', { name: 'Open capture settings' }).click();
      const captureSettings = desktop
        ? page.locator('[data-desktop-capture-settings]')
        : page.getByRole('dialog', { name: 'Capture Settings' });
      await captureSettings
        .getByText(switchedAspectRatio === '9:16' ? 'Portrait · 9:16' : 'Landscape · 16:9', {
          exact: true,
        })
        .click();
      await expect(page.getByLabel('Studio media stage')).toHaveAttribute(
        'data-stage-aspect-ratio',
        switchedAspectRatio,
      );
      if (!desktop) {
        await page.keyboard.press('Escape');
        await expect(captureSettings).toBeHidden();
      }
      await startLocalPreview(page);
      await page.getByRole('button', { name: 'Record' }).click();
      await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toHaveAttribute('data-recording', 'true');
      await expect(page.getByLabel('Studio media stage')).toHaveAttribute(
        'data-stage-aspect-ratio',
        switchedAspectRatio,
      );
    },
  },
  'selected-character-ai-live': {
    id: 'selected-character-ai-live',
    setup: async (page) => {
      await selectSeededCharacter(page);
      await page
        .getByRole('button', { name: 'Record New Video', exact: true })
        .click({ force: true });
      await expect(page.getByLabel('Live local camera preview')).toBeVisible();
      await closeRecipeDockWhenOverlaid(page);
      const controls = page.getByLabel('Studio session controls');
      await controls.getByRole('button', { name: 'Start AI' }).click();
      await page.getByRole('button', { name: 'Start with Cinematic Field Presenter' }).click();
      await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
      await expect(page.getByText(/^AI active/u)).toBeVisible();
    },
  },
  'character-builder-combined-ready': {
    id: 'character-builder-combined-ready',
    setup: async (page) => {
      await openCharacterBuilder(page);
      const builder = page.getByRole('dialog', { name: 'Build Your Character' });
      await builder.locator('input[type="file"][accept*="image/png"]').setInputFiles({
        name: 'source.png',
        mimeType: 'image/png',
        buffer: REFERENCE_PNG,
      });
      await expect(builder.getByAltText('Current uploaded character reference')).toBeVisible();
      await builder.getByRole('button', { name: 'Adult', exact: true }).click();
      await builder.getByRole('button', { name: /^Preview(?: |$)/u }).click();
      await builder.getByRole('button', { name: 'Generate Combined Preview' }).click();
      await expect(builder.getByText('This preview matches the current character.')).toBeVisible();
      const preview = builder.getByRole('complementary', {
        name: 'Character Direction Preview',
      });
      await preview.scrollIntoViewIfNeeded();
      await expect(preview).toBeVisible();
      await expect(builder.getByRole('button', { name: 'Save Character' })).toBeEnabled();
    },
  },
  'saved-character-selection': {
    id: 'saved-character-selection',
    setup: async (page) => {
      await openSavedCharacters(page);
      await expect(page.getByTitle('Select Cinematic Field Presenter')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Characters 1', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    },
  },
  'take-playback-review-settled': {
    id: 'take-playback-review-settled',
    setup: async (page) => {
      await createLocalTake(page);
      const review = page.getByRole('dialog', { name: 'Latest Take' });
      await expect(review.getByRole('heading', { name: 'Latest take', exact: true })).toBeVisible();
      await expect(review.getByRole('button', { name: 'Save Video' })).toBeVisible();
      await expect(review.getByText('Loading studio tool…', { exact: true })).toHaveCount(0);
    },
  },
  'upload-chooser': {
    id: 'upload-chooser',
    setup: async (page) => {
      const dialog = await openExistingVideoChooser(page);
      await expect(dialog.getByRole('button', { name: 'Upload from device' })).toBeVisible();
      await expect(dialog).toContainText('MP4/H.264, MOV/H.264, or WebM/VP8');
    },
  },
  'upload-validated-setup': {
    id: 'upload-validated-setup',
    setup: async (page) => {
      const { dialog } = await selectVisualVideo(page);
      await addVisualStep(dialog, 'lucy-latest', 'Transform into a documentary field presenter.');
      await expect(dialog).toContainText('One visual-processing submission');
      await expect(
        dialog.getByRole('button', { name: 'Character Swap', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect(
        dialog.getByRole('button', { name: 'Virtual Try On', exact: true }),
      ).toBeEnabled();
    },
  },
  'upload-processing': {
    id: 'upload-processing',
    setup: async (page) => {
      const { dialog, fixture } = await selectVisualVideo(page);
      await installFakeVideoJobRoutes(page, fixture, { processingReadsBeforeReady: 100 });
      await addVisualStep(dialog, 'lucy-latest', 'Transform into a documentary field presenter.');
      await dialog.getByRole('button', { name: 'Apply Character Swap' }).click();
      await expect(
        dialog.getByRole('heading', { name: 'Generating character swap…' }),
      ).toBeVisible();
    },
  },
  'upload-result': {
    id: 'upload-result',
    setup: async (page) => {
      const { dialog, fixture } = await selectVisualVideo(page);
      await installFakeVideoJobRoutes(page, fixture);
      await addVisualStep(dialog, 'lucy-latest', 'Transform into a documentary field presenter.');
      await dialog.getByRole('button', { name: 'Apply Character Swap' }).click();
      await expect(dialog.getByRole('heading', { name: 'Your result is ready' })).toBeVisible();
    },
  },
  'video-edit-lighting-dirty': {
    id: 'video-edit-lighting-dirty',
    setup: async (page) => {
      const { dialog } = await selectVisualVideo(page, true);
      await dialog.getByRole('button', { name: 'Adjust video' }).click();
      await page.getByRole('button', { name: 'Lighting', exact: true }).click();
      await page.getByRole('slider', { name: 'Brightness' }).fill('34');
      await expect(page.getByRole('heading', { name: 'Lighting settings' })).toBeVisible();
      await expect(page.getByRole('slider', { name: 'Brightness' })).toHaveValue('34');
    },
  },
  'video-edit-crop-dirty': {
    id: 'video-edit-crop-dirty',
    setup: async (page) => {
      const { dialog } = await selectVisualVideo(page, true);
      await dialog.getByRole('button', { name: 'Adjust video' }).click();
      await page.getByRole('button', { name: 'Crop', exact: true }).click();
      await page.getByRole('button', { name: '1:1', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Crop settings' })).toBeVisible();
      await expect(page.getByRole('button', { name: '1:1', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
    },
  },
  'vton-prepared-with-reference': {
    id: 'vton-prepared-with-reference',
    setup: async (page) => {
      await openRecipeDockWhenOverlaid(page);
      const dock = page.getByRole('dialog', { name: 'Recipe Dock' });
      await dock.getByRole('button', { name: 'Virtual Try-On · VTON 3' }).click();
      await dock.getByLabel('Garment direction').fill('A tailored linen travel overshirt');
      await dock.getByLabel('Garment reference image').setInputFiles({
        name: 'linen-overshirt.png',
        mimeType: 'image/png',
        buffer: REFERENCE_PNG,
      });
      await expect(dock.getByAltText('Current ephemeral reference preview')).toBeVisible();
      await expect(dock.getByRole('button', { name: 'Start Virtual Try-On AI' })).toBeEnabled();
    },
  },
  'voice-browser-loaded': {
    id: 'voice-browser-loaded',
    setup: async (page) => {
      await createLocalTake(page);
      await page.getByRole('button', { name: 'Voice treatments' }).click();
      const treatments = page.getByRole('dialog', { name: 'Voice Treatments' });
      await expect(
        treatments.getByRole('heading', { name: 'Select Treatment', exact: true }),
      ).toBeVisible();
      await treatments.getByRole('button', { name: /Saved AI Voice/u }).click();
      await expect(treatments.getByRole('heading', { name: 'Saved Voices' })).toBeVisible();
      await expect(treatments.getByText('Northstar Narrator', { exact: true })).toBeVisible();
      await expect(treatments.getByText('Loading saved voices…', { exact: true })).toHaveCount(0);
    },
  },
  'take-finalizing': {
    id: 'take-finalizing',
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
    },
  },
  'media-permission-error': {
    id: 'media-permission-error',
    setup: async (page) => {
      await page.evaluate(() => {
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
          configurable: true,
          value: () =>
            Promise.reject(
              new DOMException('Permission denied by visual test.', 'NotAllowedError'),
            ),
        });
      });
      await openRecipeDockWhenOverlaid(page);
      await page.getByRole('button', { name: 'Start local preview' }).click({ force: true });
      await expect(
        page.getByRole('alert').filter({ hasText: 'Camera or microphone access was not allowed.' }),
      ).toBeVisible();
    },
  },
};

const VISUAL_CASES: readonly VisualCase[] = VISUAL_CASE_MATRIX.map(({ viewport, scenario }) => ({
  viewport,
  scenario: VISUAL_SCENARIOS[scenario.id],
  baseline: scenario.baseline,
}));

test.describe('curated Studio visual regression', () => {
  for (const visualCase of VISUAL_CASES) {
    const { viewport, scenario, baseline } = visualCase;
    test(`${viewport.id} / ${scenario.id}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const network = await prepareVisualPage(page, scenario.id === 'entry-initial');
      await scenario.setup(page);
      await settleVisualPage(page);
      await stabilizeActiveStageVideo(page);
      await expect(page.getByText('Loading studio tool…', { exact: true })).toHaveCount(0);
      await expectNoDocumentOverflow(page);
      await expectStandardStudioLayout(page, viewport);
      expectNoExternalProviderTraffic(network);

      await expect(page).toHaveScreenshot([viewport.folder, ...baseline.split('/')], {
        animations: 'disabled',
        fullPage: false,
        maxDiffPixelRatio: 0.005,
        scale: 'css',
      });
    });
  }
});
