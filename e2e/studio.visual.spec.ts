import { expect, test, type Page } from '@playwright/test';
import {
  closeRecipeDockWhenOverlaid,
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  openRecipeDockWhenOverlaid,
  type NetworkJourneyState,
} from './support/studioHarness';

const CAPTURE_TIME = new Date('2026-07-18T14:30:00.000Z');

const VIEWPORTS = [
  { id: 'desktop', folder: '01-full-desktop-1440x960', width: 1_440, height: 960 },
  { id: 'compact', folder: '02-compact-desktop-1280x720', width: 1_280, height: 720 },
  { id: 'tablet', folder: '03-tablet-portrait-834x1112', width: 834, height: 1_112 },
  { id: 'mobile', folder: '04-mobile-portrait-390x844', width: 390, height: 844 },
  { id: 'small-mobile', folder: '05-small-mobile-320x568', width: 320, height: 568 },
] as const;

type VisualScenario = {
  id: string;
  baseline: readonly [group: string, filename: string];
  setup(page: Page): Promise<void>;
};

type VisualCase = {
  viewport: (typeof VIEWPORTS)[number];
  scenario: VisualScenario;
};

const settlePage = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
};

const startLocalPreview = async (page: Page): Promise<void> => {
  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Start local preview' }).click({ force: true });
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  await closeRecipeDockWhenOverlaid(page);
};

const startCharacterAi = async (page: Page): Promise<void> => {
  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await page.getByLabel('Character direction').fill('An adult paper-cut travel host');
  await page.getByRole('button', { name: 'Start Character AI' }).click({ force: true });
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText('AI live', { exact: true })).toBeVisible();
  await closeRecipeDockWhenOverlaid(page);
};

const startVirtualTryOnAi = async (page: Page): Promise<void> => {
  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Virtual Try-On · VTON 3' }).click();
  await page.getByLabel('Garment direction').fill('A structured amber field jacket');
  await page.getByRole('button', { name: 'Start Virtual Try-On AI' }).click({ force: true });
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText('AI live', { exact: true })).toBeVisible();
  await closeRecipeDockWhenOverlaid(page);
};

const createLocalTake = async (page: Page): Promise<void> => {
  await startLocalPreview(page);
  await page.getByRole('button', { name: 'Record a take' }).click();
  await expect(page.getByRole('button', { name: 'Finish take' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish take' }).click();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Latest Take' })).toBeVisible();
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

const prepareVisualPage = async (page: Page): Promise<NetworkJourneyState> => {
  await page.clock.setFixedTime(CAPTURE_TIME);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const network = await installSuccessfulStudioHarness(page, { stubMediaPlayback: false });
  await page.addInitScript(() => {
    Object.defineProperty(window.performance, 'now', {
      configurable: true,
      value: () => 0,
    });
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
  return network;
};

const CORE_SCENARIOS: readonly VisualScenario[] = [
  {
    id: 'idle',
    baseline: ['01-studio', 'local-idle.png'],
    setup: async (page) => {
      await openRecipeDockWhenOverlaid(page);
      await expect(page.getByRole('button', { name: 'Start local preview' })).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toContainText('Camera off');
    },
  },
  {
    id: 'recording',
    baseline: ['01-studio', 'local-recording.png'],
    setup: async (page) => {
      await startLocalPreview(page);
      await page.getByRole('button', { name: 'Record a take' }).click();
      await expect(page.getByRole('button', { name: 'Finish take' })).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toHaveAttribute('data-recording', 'true');
    },
  },
  {
    id: 'character-live',
    baseline: ['01-studio', 'character-ai-live.png'],
    setup: startCharacterAi,
  },
];

const FOCUSED_SCENARIOS: readonly VisualScenario[] = [
  {
    id: 'finalizing',
    baseline: ['01-studio', 'local-finalizing.png'],
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
    },
  },
  {
    id: 'media-error',
    baseline: ['01-studio', 'stage-media-error.png'],
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
  {
    id: 'vton-live',
    baseline: ['01-studio', 'virtual-try-on-ai-live.png'],
    setup: startVirtualTryOnAi,
  },
  {
    id: 'workshop-overlay',
    baseline: ['03-character-workshop', 'transform-character.png'],
    setup: async (page) => {
      await page.getByRole('button', { name: 'Workshop', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Direct one clear visual change' }),
      ).toBeVisible();
      await page
        .getByRole('textbox', { name: 'Character concept', exact: true })
        .fill('documentary field presenter');
      await page.getByLabel('Adult age direction').selectOption('adult');
    },
  },
  {
    id: 'capture-overlay',
    baseline: ['05-capture-settings', 'local-before-preview.png'],
    setup: async (page) => {
      await page.getByRole('button', { name: 'Open capture settings' }).click();
      await expect(page.getByRole('dialog', { name: 'Capture Settings' })).toBeVisible();
      await expect(page.getByText('Looking for available cameras…', { exact: true })).toBeHidden();
      await expect(
        page.getByText('Looking for available microphones…', { exact: true }),
      ).toBeHidden();
      await expect(page.getByText('Available after preview starts')).toBeVisible();
    },
  },
  {
    id: 'review-overlay',
    baseline: ['06-take-review', 'latest-take.png'],
    setup: createLocalTake,
  },
];

const FOCUSED_VIEWPORTS = [VIEWPORTS[0], VIEWPORTS[4]] as const;
const VISUAL_CASES: readonly VisualCase[] = [
  ...VIEWPORTS.flatMap((viewport) => CORE_SCENARIOS.map((scenario) => ({ viewport, scenario }))),
  ...FOCUSED_VIEWPORTS.flatMap((viewport) =>
    FOCUSED_SCENARIOS.map((scenario) => ({ viewport, scenario })),
  ),
];

if (VISUAL_CASES.length !== 27) {
  throw new Error(
    `The curated visual suite must contain exactly 27 cases, got ${VISUAL_CASES.length}.`,
  );
}

test.describe('curated Studio visual regression', () => {
  for (const visualCase of VISUAL_CASES) {
    const { viewport, scenario } = visualCase;
    test(`${viewport.id} / ${scenario.id}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const network = await prepareVisualPage(page);
      await scenario.setup(page);
      await settlePage(page);
      await stabilizeActiveStageVideo(page);
      await expectNoDocumentOverflow(page);
      expectNoExternalProviderTraffic(network);

      await expect(page).toHaveScreenshot(
        [viewport.folder, scenario.baseline[0], scenario.baseline[1]],
        {
          animations: 'disabled',
          fullPage: false,
          maxDiffPixelRatio: 0.005,
          scale: 'css',
        },
      );
    });
  }
});
