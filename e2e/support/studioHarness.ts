import { expect, type Page } from '@playwright/test';
import { installSyntheticBrowserMedia } from './studioHarness.browser.js';
import { installProviderNetworkDriver } from './studioHarness.network.js';
import type { NetworkJourneyState, StudioHarnessOptions } from './studioHarness.types.js';

export const installSuccessfulStudioHarness = async (
  page: Page,
  options: StudioHarnessOptions = {},
): Promise<NetworkJourneyState> => {
  await installSyntheticBrowserMedia(page, options);
  return installProviderNetworkDriver(page, options);
};

export const openCharacterOptions = async (page: Page): Promise<void> => {
  const desktopTrigger = page
    .getByRole('navigation', { name: 'Creative workspace tools' })
    .getByRole('button', { name: /^(Select Character|Selected character:)/u });
  if (await desktopTrigger.isVisible()) {
    await desktopTrigger.click();
    return;
  }
  const shelfTrigger = page.getByRole('button', { name: 'Shelf', exact: true });
  await expect(shelfTrigger).toBeVisible();
  await shelfTrigger.click();
  await expect(page.getByRole('dialog', { name: 'Recipe Shelf' })).toBeVisible();
};

export {
  closeRecipeDockWhenOverlaid,
  confirmSaveVideo,
  createLocalTake,
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  openRecipeDockWhenOverlaid,
  settleVisualPage,
  startCharacterAi,
  startLocalPreview,
  startVirtualTryOnAi,
} from './studioHarness.actions.js';
export {
  FIXED_WEBM_BASE64,
  readBrowserState,
  triggerGenerationEnded,
  triggerGenerationTick,
  triggerProviderDisconnect,
} from './studioHarness.browser.js';
export { CREATIVE_ASSET_STORAGE_KEY, readCreativeAssetStore } from './creativeAssetStorage.js';
export type { NetworkJourneyState } from './studioHarness.types.js';
