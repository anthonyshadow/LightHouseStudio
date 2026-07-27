import { expect, test, type Page } from '@playwright/test';
import {
  createLocalTake,
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  openRecipeDockWhenOverlaid,
  startCharacterAi,
  startLocalPreview,
  startVirtualTryOnAi,
  type NetworkJourneyState,
} from './support/studioHarness';
import { VISUAL_CASE_MATRIX, type VisualScenarioId } from './studioVisualMatrix';

const CAPTURE_TIME = new Date('2026-07-18T14:30:00.000Z');

type VisualScenario = {
  id: VisualScenarioId;
  setup(page: Page): Promise<void>;
};

type VisualCase = {
  viewport: (typeof VISUAL_CASE_MATRIX)[number]['viewport'];
  scenario: VisualScenario;
  baseline: string;
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

const VISUAL_SCENARIOS: Record<VisualScenarioId, VisualScenario> = {
  idle: {
    id: 'idle',
    setup: async (page) => {
      await openRecipeDockWhenOverlaid(page);
      await expect(page.getByRole('button', { name: 'Start local preview' })).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toContainText('Studio idle');
    },
  },
  recording: {
    id: 'recording',
    setup: async (page) => {
      await startLocalPreview(page);
      await page.getByRole('button', { name: 'Record' }).click();
      await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
      await expect(page.getByLabel('Studio media stage')).toHaveAttribute('data-recording', 'true');
    },
  },
  'character-live': {
    id: 'character-live',
    setup: startCharacterAi,
  },
  'ai-experience-choice': {
    id: 'ai-experience-choice',
    setup: async (page) => {
      const controls = page.getByLabel('Studio session controls');
      await controls.getByRole('button', { name: 'Start Camera + Mic' }).click();
      await expect(page.getByLabel('Live local camera preview')).toBeVisible();
      await controls.getByRole('button', { name: 'Start AI' }).click();
      await expect(page.getByRole('dialog', { name: 'Choose AI experience' })).toBeVisible();
    },
  },
  finalizing: {
    id: 'finalizing',
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
  'media-error': {
    id: 'media-error',
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
  'vton-live': {
    id: 'vton-live',
    setup: startVirtualTryOnAi,
  },
  'workshop-overlay': {
    id: 'workshop-overlay',
    setup: async (page) => {
      await page.getByRole('button', { name: 'Workshop', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: 'Direct one clear visual change' }),
      ).toBeVisible();
      await page
        .getByRole('textbox', { name: 'Object to add', exact: true })
        .fill('a copper field notebook');
      await page
        .getByRole('textbox', { name: 'Specific placement', exact: true })
        .fill('held at chest height');
    },
  },
  'capture-overlay': {
    id: 'capture-overlay',
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
  'review-overlay': {
    id: 'review-overlay',
    setup: createLocalTake,
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
      const network = await prepareVisualPage(page);
      await scenario.setup(page);
      await settlePage(page);
      await stabilizeActiveStageVideo(page);
      await expectNoDocumentOverflow(page);
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
