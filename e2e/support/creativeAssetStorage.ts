import type { CreativeAssetStore } from '@studio/domain';
import type { Page } from '@playwright/test';
import { TEST_AUTH_SESSION } from './authFixture.js';

export const CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v6';

export const readCreativeAssetStore = async (page: Page): Promise<CreativeAssetStore | null> =>
  page.evaluate(
    ({ ownerUserId, storageKey }) => {
      const serialized =
        localStorage.getItem(`${storageKey}.${ownerUserId}`) ?? localStorage.getItem(storageKey);
      if (!serialized) return null;
      const persisted = JSON.parse(serialized) as {
        readonly store?: CreativeAssetStore;
      } & CreativeAssetStore;
      return persisted.store ?? persisted;
    },
    {
      ownerUserId: TEST_AUTH_SESSION.user.id,
      storageKey: CREATIVE_ASSET_STORAGE_KEY,
    },
  );
