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

export const startLocalPreview = async (page: Page, closeDock = true): Promise<void> => {
  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Start local preview' }).click({ force: true });
  await expect(page.getByLabel('Live local camera preview')).toBeVisible();
  if (closeDock) await closeRecipeDockWhenOverlaid(page);
};

export const startCharacterAi = async (page: Page, closeDock = true): Promise<void> => {
  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Character · Lucy 2.5' }).click();
  await page.getByLabel('Character direction').fill('An adult paper-cut travel host');
  await page.getByRole('button', { name: 'Start Character AI' }).click({ force: true });
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText(/^AI active/u)).toBeVisible();
  if (closeDock) await closeRecipeDockWhenOverlaid(page);
};

export const startVirtualTryOnAi = async (page: Page, closeDock = true): Promise<void> => {
  await openRecipeDockWhenOverlaid(page);
  await page.getByRole('button', { name: 'Virtual Try-On · VTON 3' }).click();
  await page.getByLabel('Garment direction').fill('A structured amber field jacket');
  await page.getByRole('button', { name: 'Start Virtual Try-On AI' }).click({ force: true });
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect(page.getByText(/^AI active/u)).toBeVisible();
  if (closeDock) await closeRecipeDockWhenOverlaid(page);
};

export const createLocalTake = async (page: Page): Promise<void> => {
  await startLocalPreview(page);
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Latest Take' })).toBeHidden();
  await page.getByRole('button', { name: 'Take', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Latest Take' })).toBeVisible();
};
