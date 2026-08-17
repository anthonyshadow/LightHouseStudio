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
  const trigger = page
    .getByRole('navigation', { name: 'Creative workspace tools' })
    .getByRole('button', { name: /^(Select Character|Selected character:)/u });
  await expect(trigger).toBeVisible();
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Character' })).toBeVisible();
};

export {
  closeAiSettings,
  confirmSaveVideo,
  createLocalTake,
  discardTake,
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  openAiSettings,
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
