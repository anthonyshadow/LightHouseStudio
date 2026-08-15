import { expect, type Page } from '@playwright/test';
import type { NetworkJourneyState } from './studioHarness.types.js';

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

export const confirmSaveVideo = async (page: Page, name?: string): Promise<void> => {
  const dialog = page.getByRole('dialog', { name: 'Save to Assets' });
  await expect(dialog).toBeVisible();
  const nameField = dialog.getByRole('textbox', { name: 'Video name (optional)' });
  if (name !== undefined) await nameField.fill(name);
  await dialog.getByRole('button', { name: 'Save to Assets' }).click();
  await expect(dialog).toBeHidden();
};

export const settleVisualPage = async (page: Page): Promise<void> => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
    });
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
};

export const openAiSettings = async (page: Page): Promise<void> => {
  const settings = page.getByRole('dialog', { name: 'AI Settings' });
  if (await settings.isVisible()) return;

  await page.getByRole('button', { name: 'Quick Create' }).click();
  await page.getByRole('menuitem', { name: 'Live AI · Beta' }).click();
  const chooser = page.getByRole('dialog', { name: 'Choose live AI experience' });
  await expect(chooser).toBeVisible();
  await chooser.getByRole('button', { name: 'Configure Virtual Try-On' }).click();
  await expect(settings).toBeVisible();
};

export const closeAiSettings = async (page: Page): Promise<void> => {
  const dialog = page.getByRole('dialog', { name: 'AI Settings' });
  if (!(await dialog.isVisible())) return;

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
};

export const startLocalPreview = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Record New Video' }).click();
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
};

export const startCharacterAi = async (page: Page, closeSettings = true): Promise<void> => {
  await openAiSettings(page);
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await page.getByLabel('Character direction').fill('An adult paper-cut travel host');
  await page.getByRole('button', { name: 'Start Character AI' }).click({ force: true });
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText(/^AI active/u)).toBeVisible();
  if (closeSettings) await closeAiSettings(page);
};

export const startVirtualTryOnAi = async (page: Page, closeSettings = true): Promise<void> => {
  await openAiSettings(page);
  await page.getByRole('button', { name: 'Virtual Try-On · VTON 3' }).click();
  await page.getByLabel('Garment direction').fill('A structured amber field jacket');
  await page.getByRole('button', { name: 'Start Virtual Try-On AI' }).click({ force: true });
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText(/^AI active/u)).toBeVisible();
  if (closeSettings) await closeAiSettings(page);
};

export const createLocalTake = async (page: Page): Promise<void> => {
  await startLocalPreview(page);
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Latest Take' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Edit Video', exact: true })).toBeEnabled();
  const takeControls = page.getByRole('group', { name: 'Recorded take controls' });
  await expect(takeControls.getByRole('button', { name: 'Edit video' })).toHaveCount(0);
  await takeControls.getByRole('button', { name: 'Voice' }).click();
  await page.getByRole('button', { name: 'Back to take review' }).click();
  await expect(page.getByRole('dialog', { name: 'Latest Take' })).toBeVisible();
};
