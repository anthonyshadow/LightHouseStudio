import { expect, test, type Page } from '@playwright/test';
import {
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  openRecipeDockWhenOverlaid,
  readBrowserState,
} from './support/studioHarness';

const CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v2';
const LEGACY_CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v1';

const openCharacterWorkshop = async (page: Page, concept: string): Promise<void> => {
  await page.getByRole('button', { name: 'Workshop', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Character Workshop' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Character concept', exact: true }).fill(concept);
  await expect(page.getByRole('button', { name: 'Generate reference image' })).toBeEnabled();
};

test('generated reference hydrates into Lucy and its exact Recent version survives refresh', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');

  await openCharacterWorkshop(page, 'botanical field correspondent');
  await page.getByRole('button', { name: 'Generate reference image' }).click();
  await expect(page.getByText('Reference image attached', { exact: true })).toBeVisible();
  await expect(page.getByAltText('Generated front-facing character reference')).toBeVisible();
  expect(network.referenceImageGenerations).toHaveLength(1);

  const generated = network.referenceImageGenerations[0];
  expect(generated).toBeDefined();
  if (!generated) throw new Error('The deterministic reference was not generated.');

  await page.getByRole('button', { name: 'Use in working draft' }).click();
  await expect(page.getByRole('dialog', { name: 'Character Workshop' })).toBeHidden();
  expect(network.referenceImageMetadataReads).toContain(generated.assetId);
  expect(network.referenceImageContentReads).toContain(generated.assetId);

  await openRecipeDockWhenOverlaid(page);
  await expect(page.getByAltText('Current persisted reference preview')).toBeVisible();
  await page.getByRole('button', { name: 'Start Character AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();

  let browser = await readBrowserState(page);
  expect(browser.connections).toEqual([
    {
      model: 'lucy-2.5',
      initial: {
        prompt: generated.workshopPrompt,
        imageName: `reference-${generated.assetId}.png`,
        enhance: false,
      },
    },
  ]);

  await page.reload();
  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  await page.getByRole('button', { name: /^Recent\b/u }).click();
  await expect(page.getByAltText('Recent character reference')).toBeVisible();
  await page.getByRole('button', { name: /^Use recent prompt:/u }).click();
  await expect(page.getByRole('dialog', { name: 'Recipe Shelf' })).toBeHidden();

  await openRecipeDockWhenOverlaid(page);
  await expect(page.getByAltText('Current persisted reference preview')).toBeVisible();
  await page.getByRole('button', { name: 'Start Character AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();

  browser = await readBrowserState(page);
  expect(browser.connections[0]?.initial).toEqual({
    prompt: generated.workshopPrompt,
    imageName: `reference-${generated.assetId}.png`,
    enhance: false,
  });
  expect(network.referenceImageGenerations).toHaveLength(1);
  expect(network.referenceImageMetadataReads.filter((id) => id === generated.assetId).length).toBe(
    2,
  );
  expectNoExternalProviderTraffic(network);
});

test('saved character restores its original asset after workshop regeneration', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');

  await openCharacterWorkshop(page, 'paper-cut astronomy presenter');
  await page.getByRole('button', { name: 'Generate reference image' }).click();
  await expect(page.getByText('Reference image attached', { exact: true })).toBeVisible();
  const firstAssetId = network.referenceImageGenerations[0]?.assetId;
  expect(firstAssetId).toBeDefined();
  if (!firstAssetId) throw new Error('The first deterministic reference was not generated.');

  await page.getByRole('button', { name: 'Save to Recipe Shelf' }).click();
  await page.getByLabel('Recipe name').fill('Immutable astronomy host');
  await page.getByRole('button', { name: 'Save recipe' }).click();

  await page.getByRole('button', { name: 'Regenerate' }).click();
  await expect.poll(() => network.referenceImageGenerations.length).toBe(2);
  const secondAssetId = network.referenceImageGenerations[1]?.assetId;
  expect(secondAssetId).toBeDefined();
  if (!secondAssetId) throw new Error('The regenerated deterministic reference was not stored.');
  expect(secondAssetId).not.toBe(firstAssetId);
  await expect(page.getByText('Reference image attached', { exact: true })).toBeVisible();
  await expect(page.getByAltText('Generated front-facing character reference')).toHaveAttribute(
    'src',
    new RegExp(secondAssetId, 'u'),
  );

  const persistedAssetId = await page.evaluate((storageKey) => {
    const serialized = localStorage.getItem(storageKey);
    if (!serialized) return null;
    const store = JSON.parse(serialized) as {
      savedCharacterPrompts?: Array<{ name?: string; referenceImageAssetId?: string | null }>;
    };
    return (
      store.savedCharacterPrompts?.find((item) => item.name === 'Immutable astronomy host')
        ?.referenceImageAssetId ?? null
    );
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(persistedAssetId).toBe(firstAssetId);

  await page.getByRole('button', { name: 'Close creative tool' }).click();
  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  await page.getByRole('button', { name: /^Characters\b/u }).click();
  await expect(page.getByAltText('Reference image for Immutable astronomy host')).toHaveAttribute(
    'src',
    new RegExp(firstAssetId, 'u'),
  );
  await page.getByRole('button', { name: 'Open Immutable astronomy host in workshop' }).click();
  await expect(page.getByRole('dialog', { name: 'Character Workshop' })).toBeVisible();
  await expect(page.getByText('Reference image attached', { exact: true })).toBeVisible();
  await expect(page.getByAltText('Generated front-facing character reference')).toHaveAttribute(
    'src',
    new RegExp(firstAssetId, 'u'),
  );
  expectNoExternalProviderTraffic(network);
});

test('missing persisted asset keeps the shelf open until explicit text-only recovery', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  const missingAssetId = '99999999-9999-4999-8999-999999999999';
  const missingPrompt = 'Substitute the character in the video with a missing archive host.';
  await page.addInitScript(
    ({ assetId, prompt, storageKey }) => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          schemaVersion: 2,
          savedPrompts: [],
          recentPrompts: [
            {
              id: 'missing-recent',
              prompt,
              modelModeId: 'lucy-2.5',
              referenceImageAssetId: assetId,
              usedAt: '2030-01-02T00:00:00.000Z',
            },
          ],
          savedCharacterPrompts: [],
        }),
      );
    },
    {
      assetId: missingAssetId,
      prompt: missingPrompt,
      storageKey: CREATIVE_ASSET_STORAGE_KEY,
    },
  );
  await page.goto('/');

  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  await page.getByRole('button', { name: /^Recent\b/u }).click();
  await page.getByRole('button', { name: /^Use recent prompt:/u }).click();

  const shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await expect(shelf).toBeVisible();
  const recoveryAlert = page.getByRole('alert');
  await expect(recoveryAlert).toContainText('This local reference asset is no longer available');
  await expect(recoveryAlert.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue without reference' })).toBeVisible();
  expect(network.referenceImageMetadataReads).toEqual([missingAssetId]);

  await recoveryAlert.getByRole('button', { name: 'Retry' }).click();
  await expect.poll(() => network.referenceImageMetadataReads.length).toBe(2);
  await page.getByRole('button', { name: 'Continue without reference' }).click();
  await expect(shelf).toBeHidden();

  await openRecipeDockWhenOverlaid(page);
  await expect(page.getByLabel('Character direction')).toHaveValue(missingPrompt);
  await expect(page.getByAltText('Current persisted reference preview')).toHaveCount(0);
  expectNoExternalProviderTraffic(network);
});

test('legacy v1 text-only shelf migrates to v2 with null reference identities', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page, {
    referenceImagesAvailable: false,
  });
  await page.addInitScript(
    ({ legacyKey }) => {
      localStorage.setItem(
        legacyKey,
        JSON.stringify({
          schemaVersion: 1,
          savedPrompts: [
            {
              id: 'legacy-host',
              title: 'Legacy text host',
              prompt: 'Transform the adult subject into a monochrome field host.',
              modelModeId: 'lucy-2.5',
              source: 'manual',
              tags: ['legacy'],
              createdAt: '2029-12-01T00:00:00.000Z',
              updatedAt: '2029-12-02T00:00:00.000Z',
              lastUsedAt: null,
              useCount: 0,
            },
          ],
          recentPrompts: [
            {
              id: 'legacy-recent',
              prompt: 'Transform the adult subject into a monochrome field host.',
              modelModeId: 'lucy-2.5',
              usedAt: '2029-12-03T00:00:00.000Z',
            },
          ],
          savedCharacterPrompts: [],
        }),
      );
    },
    { legacyKey: LEGACY_CREATIVE_ASSET_STORAGE_KEY },
  );
  await page.goto('/');

  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Use Legacy text host' })).toBeVisible();

  const migrated = await page.evaluate((storageKey) => {
    const serialized = localStorage.getItem(storageKey);
    if (!serialized) return null;
    return JSON.parse(serialized) as {
      schemaVersion: number;
      savedPrompts: Array<{ referenceImageAssetId?: string | null }>;
      recentPrompts: Array<{ referenceImageAssetId?: string | null }>;
    };
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(migrated?.schemaVersion).toBe(2);
  expect(migrated?.savedPrompts[0]?.referenceImageAssetId).toBeNull();
  expect(migrated?.recentPrompts[0]?.referenceImageAssetId).toBeNull();
  expect(network.referenceImageGenerations).toEqual([]);
  expectNoExternalProviderTraffic(network);
});
