import type { Page } from '@playwright/test';
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

export {
  closeRecipeDockWhenOverlaid,
  expectNoDocumentOverflow,
  expectNoExternalProviderTraffic,
  openRecipeDockWhenOverlaid,
} from './studioHarness.actions.js';
export {
  FIXED_WEBM_BASE64,
  readBrowserState,
  triggerProviderDisconnect,
} from './studioHarness.browser.js';
export type {
  BrowserJourneyState,
  MockReferenceImageAsset,
  ModelId,
  NetworkJourneyState,
  SerializedSnapshot,
  StudioHarnessOptions,
} from './studioHarness.types.js';
