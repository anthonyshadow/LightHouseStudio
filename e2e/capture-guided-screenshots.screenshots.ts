import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  readBrowserState,
  type NetworkJourneyState,
} from './support/studioHarness';

const CAPTURE_TIME = new Date('2026-07-20T14:30:00.000Z');
const VIEWPORT = { width: 1_440, height: 960 } as const;
const STORY_IMAGE_ROOT = path.join(
  process.cwd(),
  'docs/userStories/11-new-user-character-ai-voice-download/images',
);

const settlePage = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images, async (image) => {
        if (!image.complete) {
          await new Promise<void>((resolve) => {
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          });
        }
        if (image.complete && image.naturalWidth > 0) await image.decode().catch(() => undefined);
      }),
    );
    document.querySelectorAll('video').forEach((video) => {
      video.pause();
      video.controls = false;
      try {
        video.currentTime = 0;
      } catch {
        // A synthetic recording may not expose a seekable range yet.
      }
    });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
};

const pauseStageClock = async (page: Page): Promise<void> => {
  const currentTime = await page.evaluate(() => Date.now());
  await page.clock.pauseAt(currentTime + 50);
};

const captureStableViewport = async (page: Page, filename: string): Promise<void> => {
  const target = path.join(STORY_IMAGE_ROOT, filename);
  await mkdir(path.dirname(target), { recursive: true });
  let previous: Buffer | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await settlePage(page);
    const png = await page.screenshot({ animations: 'disabled', fullPage: false, scale: 'css' });
    if (previous?.equals(png)) {
      expect(png.byteLength).toBeGreaterThan(100);
      expect(png.readUInt32BE(16)).toBe(VIEWPORT.width);
      expect(png.readUInt32BE(20)).toBe(VIEWPORT.height);
      await writeFile(target, png);
      return;
    }
    previous = png;
  }

  throw new Error(`Guided viewport did not produce two identical frames: ${target}`);
};

const openGuidedCreate = async (page: Page): Promise<{ readonly network: NetworkJourneyState }> => {
  await page.setViewportSize(VIEWPORT);
  await page.clock.install({ time: CAPTURE_TIME });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const network = await installSuccessfulStudioHarness(page, {
    referenceImagesAvailable: true,
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
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
  await expect(page.getByRole('heading', { name: 'Create Your Character' })).toBeVisible();
  await expect(page.getByText('Saved privately in this browser')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Start with a character' })).toBeVisible();
  return { network };
};

const selectWomanProfile = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /Documentary Presenter/u }).click();
  const presentation = page.locator('section[aria-labelledby="guided-gender-heading"]');
  const details = presentation.locator('details');
  if ((await details.getAttribute('open')) === null) await presentation.locator('summary').click();
  await presentation
    .getByRole('group', { name: 'Gender presentation' })
    .getByRole('button', { name: /Woman/u })
    .click();
  await expect(
    page
      .getByRole('group', { name: 'Gender presentation' })
      .getByRole('button', { name: /Woman/u }),
  ).toHaveAttribute('aria-pressed', 'true');
};

const assertProviderFree = async (page: Page, network: NetworkJourneyState): Promise<void> => {
  expect(network.referenceWorkflowCalls).toEqual([]);
  expect(network.referenceImageGenerations).toEqual([]);
  const browser = await readBrowserState(page);
  expect(browser.cameraCalls).toBe(0);
  expect(browser.connections).toEqual([]);
  expectNoExternalProviderTraffic(network);
};

const chooseDrawerOption = async (
  section: ReturnType<Page['locator']>,
  optionName: string,
  leaveOpen = false,
): Promise<void> => {
  const details = section.locator('details');
  const summary = section.locator('summary');
  if ((await details.getAttribute('open')) === null) await summary.click();
  await section.getByRole('button', { name: optionName, exact: true }).click();
  if (!leaveOpen) await summary.click();
};

test('guided story / initial Create experience', async ({ page }) => {
  const { network } = await openGuidedCreate(page);

  await captureStableViewport(page, '07-guided-create-initial.png');
  await assertProviderFree(page, network);
});

test('guided story / woman profile visual suggestions', async ({ page }) => {
  const { network } = await openGuidedCreate(page);
  await selectWomanProfile(page);

  const bodyShape = page.locator('section[aria-labelledby="guided-bodyShape-heading"]');
  const hairstyle = page.locator('section[aria-labelledby="guided-hair-heading"]');
  const hairColor = page.locator('section[aria-labelledby="guided-hairColor-heading"]');
  const outfit = page.locator('section[aria-labelledby="guided-outfit-heading"]');
  await chooseDrawerOption(hairstyle, 'Long waves');
  await chooseDrawerOption(hairColor, 'Auburn/red');
  await chooseDrawerOption(outfit, 'Professional');
  await chooseDrawerOption(bodyShape, 'Athletic', true);
  await bodyShape.scrollIntoViewIfNeeded();
  await expect(bodyShape.getByRole('button')).toHaveCount(8);
  await expect(hairstyle.locator('summary')).toContainText('Long waves');

  await captureStableViewport(page, '08-guided-woman-profile.png');
  await assertProviderFree(page, network);
});

test('guided story / optional reference decision', async ({ page }) => {
  const { network } = await openGuidedCreate(page);
  await selectWomanProfile(page);
  await page.getByRole('button', { name: 'Save Character' }).click();

  const heading = page.getByRole('heading', { name: 'Would you like a reference image?' });
  await expect(heading).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue with Prompt Only' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Generate Reference & Continue' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Keep Existing Reference' })).toHaveCount(0);
  await heading.scrollIntoViewIfNeeded();

  await captureStableViewport(page, '09-guided-reference-choice.png');
  await assertProviderFree(page, network);
});

test('guided story / live through download stages', async ({ page }) => {
  const { network } = await openGuidedCreate(page);
  await page.getByRole('button', { name: /Documentary Presenter/u }).click();
  await page.getByRole('button', { name: 'Save Character' }).click();
  await page.getByRole('button', { name: 'Continue with Prompt Only' }).click();

  await page.getByRole('button', { name: 'Start Camera Preview' }).click();
  await page.getByRole('button', { name: 'Continue & Allow' }).click();
  await expect(page.getByRole('heading', { name: 'Local preview ready' })).toBeVisible();
  await page.getByRole('heading', { name: 'Go Live with AI' }).scrollIntoViewIfNeeded();
  await pauseStageClock(page);
  await captureStableViewport(page, '10-guided-local-camera.png');

  await page.getByRole('button', { name: 'Start AI Session' }).click();
  await expect(page.getByRole('heading', { name: "You're live with AI" })).toBeVisible();
  await page.getByRole('heading', { name: 'Go Live with AI' }).scrollIntoViewIfNeeded();
  await captureStableViewport(page, '10-guided-live.png');

  await page.getByRole('button', { name: 'Continue to Record' }).click();
  await page.getByRole('button', { name: 'Start Recording' }).click();
  await page.clock.runFor(4_000);
  await expect(page.getByRole('button', { name: 'Stop Recording' })).toBeVisible();
  await page.clock.runFor(27_000);
  await page.getByRole('button', { name: 'Stop Recording' }).click();
  await expect(page.getByRole('heading', { name: 'Review your take' })).toBeVisible();
  await page.getByRole('heading', { name: 'Record Your Take' }).scrollIntoViewIfNeeded();
  await captureStableViewport(page, '11-guided-take-review.png');

  await page.getByRole('button', { name: 'Use This Take' }).click();
  await expect(page.getByRole('heading', { name: 'Choose a voice' })).toBeVisible();
  await page.getByRole('heading', { name: 'Add Voice' }).scrollIntoViewIfNeeded();
  await captureStableViewport(page, '12-guided-voice-choice.png');

  await page.getByRole('button', { name: 'Keep Original Voice' }).click();
  await expect(page.getByRole('heading', { name: 'Your video is ready' })).toBeVisible();
  await page.getByRole('heading', { name: 'Download & Done' }).scrollIntoViewIfNeeded();
  await captureStableViewport(page, '13-guided-download-ready.png');

  expect(network.referenceWorkflowCalls).toEqual([]);
  expect(network.referenceImageGenerations).toEqual([]);
  expectNoExternalProviderTraffic(network);
});
