import { expect, test, type Page } from '@playwright/test';
import {
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  openCharacterOptions,
  openRecipeDockWhenOverlaid,
  readBrowserState,
} from './support/studioHarness';

const CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v5';

const openCharacterBuilder = async (page: Page): Promise<void> => {
  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Create new character' }).click();
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeVisible();
  await page.getByRole('button', { name: 'Adult', exact: true }).click();
  await page.getByRole('button', { name: /^Preview(?: |$)/u }).click();
  await expect(page.getByRole('button', { name: 'Generate Preview' })).toBeEnabled();
};

test('optimized reference hydrates its stored Lucy prompt atomically and survives refresh', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');

  await openCharacterBuilder(page);
  await page.getByRole('button', { name: 'Generate Preview' }).click();
  await expect(page.getByText('This preview matches the current character.')).toBeVisible();
  expect(network.referenceImageGenerations).toHaveLength(1);
  expect(network.referencePromptOptimizations).toHaveLength(1);
  expect(network.referenceWorkflowCalls).toEqual(['optimize', 'generate']);

  const generated = network.referenceImageGenerations[0];
  const optimized = network.referencePromptOptimizations[0];
  expect(generated).toBeDefined();
  expect(optimized).toBeDefined();
  if (!generated || !optimized) throw new Error('The deterministic reference was not generated.');
  expect(generated.rawPrompt).toBe(optimized.request.rawPrompt);
  expect(generated.options).toEqual(optimized.request.options);
  expect(generated.options.framing).toBe('full_body');
  expect(generated.options.orientation).toBe('auto');
  expect(generated.optimization.enabled).toBe(true);
  if (!generated.optimization.enabled) throw new Error('Prompt optimization was bypassed.');
  expect(generated.optimization.result.optimizedImagePrompt).toBe(
    optimized.response.result.optimizedImagePrompt,
  );
  expect(generated.imagePromptSentToProvider).toBe(optimized.response.result.optimizedImagePrompt);
  expect(generated.optimization.result.lucy25CharacterPrompt).toBe(
    optimized.response.result.lucy25CharacterPrompt,
  );
  expect(generated.optimization.result.recommendedSettings).toMatchObject({
    framing: 'full_body',
    orientation: 'landscape',
    size: '1536x1024',
  });

  await page.getByRole('button', { name: 'Save Character', exact: true }).click();
  const nameDialog = page.getByRole('dialog', { name: 'Name your character' });
  await nameDialog.getByRole('textbox', { name: /Character name/u }).fill('Field correspondent');
  await nameDialog.getByRole('button', { name: 'Save Character', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeHidden();
  expect(network.referenceImageContentReads).toContain(generated.assetId);

  await openRecipeDockWhenOverlaid(page);
  await expect(page.getByAltText('Current persisted reference preview')).toBeVisible();
  await page.getByRole('button', { name: 'Start Character AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();

  let browser = await readBrowserState(page);
  expect(browser.connections).toEqual([
    {
      model: 'lucy-latest',
      initial: {
        prompt: optimized.response.result.lucy25CharacterPrompt,
        imageName: `reference-${generated.assetId}.png`,
        enhance: true,
      },
    },
  ]);
  expect(browser.applies).toEqual([]);

  const recentRawPrompt = await page.evaluate((storageKey) => {
    const serialized = localStorage.getItem(storageKey);
    if (!serialized) return null;
    const store = JSON.parse(serialized) as { recentPrompts?: Array<{ prompt?: string }> };
    return store.recentPrompts?.[0]?.prompt ?? null;
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(recentRawPrompt).toBe(generated.rawPrompt);
  expect(recentRawPrompt).not.toBe(optimized.response.result.lucy25CharacterPrompt);

  const manuallyEditedLucyPrompt = `${optimized.response.result.lucy25CharacterPrompt} Keep the hand-painted badge visible.`;
  await page.getByLabel('Character direction').fill(manuallyEditedLucyPrompt);
  await page.getByRole('button', { name: 'Apply changes' }).click();
  await expect.poll(async () => (await readBrowserState(page)).applies.length).toBe(1);
  browser = await readBrowserState(page);
  expect(browser.applies).toEqual([
    {
      prompt: manuallyEditedLucyPrompt,
      imageName: `reference-${generated.assetId}.png`,
      enhance: true,
    },
  ]);

  await page.reload();
  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  await page.getByRole('button', { name: /^Recent\b/u }).click();
  await expect(page.getByAltText('Recent character reference')).toHaveCount(2);
  await page
    .getByRole('button', { name: `Use recent prompt: ${generated.rawPrompt}`, exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Recipe Shelf' })).toBeHidden();

  await openRecipeDockWhenOverlaid(page);
  await expect(page.getByAltText('Current persisted reference preview')).toBeVisible();
  await page.getByRole('button', { name: 'Start Character AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();

  browser = await readBrowserState(page);
  expect(browser.connections[0]?.initial).toEqual({
    prompt: optimized.response.result.lucy25CharacterPrompt,
    imageName: `reference-${generated.assetId}.png`,
    enhance: true,
  });
  expect(browser.applies).toEqual([]);
  expect(network.referenceImageGenerations).toHaveLength(1);
  expect(network.referenceWorkflowCalls).toEqual(['optimize', 'generate']);
  expect(network.referenceImageMetadataReads).toContain(generated.assetId);
  expectNoExternalProviderTraffic(network);
});

test('saved character opens in Builder and updates its original record after regeneration', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');

  await openCharacterBuilder(page);
  await page.getByRole('button', { name: 'Generate Preview' }).click();
  await expect(page.getByText('This preview matches the current character.')).toBeVisible();
  const firstAssetId = network.referenceImageGenerations[0]?.assetId;
  expect(firstAssetId).toBeDefined();
  if (!firstAssetId) throw new Error('The first deterministic reference was not generated.');

  await page.getByRole('button', { name: 'Save Character', exact: true }).click();
  const createNameDialog = page.getByRole('dialog', { name: 'Name your character' });
  await createNameDialog
    .getByRole('textbox', { name: /Character name/u })
    .fill('Immutable astronomy host');
  await createNameDialog.getByRole('button', { name: 'Save Character', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeHidden();

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

  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  await page.getByRole('button', { name: /^Characters\b/u }).click();
  await expect(page.getByAltText('Reference image for Immutable astronomy host')).toHaveAttribute(
    'src',
    new RegExp(firstAssetId, 'u'),
  );
  await page.getByRole('button', { name: 'Edit Immutable astronomy host' }).click();
  const builder = page.getByRole('dialog', { name: 'Edit Immutable astronomy host' });
  await expect(builder).toBeVisible();
  await builder.getByRole('button', { name: /^Preview(?: |$)/u }).click();
  await expect(builder.getByText('This preview matches the current character.')).toBeVisible();
  await expect(builder.getByRole('img', { name: /direction preview/u })).toHaveAttribute(
    'src',
    new RegExp(firstAssetId, 'u'),
  );

  await builder.getByRole('button', { name: 'Regenerate' }).click();
  await page
    .getByRole('dialog', { name: 'Regenerate character preview' })
    .getByRole('button', { name: 'Regenerate', exact: true })
    .click();
  await expect.poll(() => network.referenceImageGenerations.length).toBe(2);
  const secondAssetId = network.referenceImageGenerations[1]?.assetId;
  expect(secondAssetId).toBeDefined();
  if (!secondAssetId) throw new Error('The regenerated deterministic reference was not stored.');
  expect(secondAssetId).not.toBe(firstAssetId);

  await builder.getByRole('button', { name: 'Save Changes' }).click();
  const editNameDialog = page.getByRole('dialog', { name: 'Name your character' });
  await expect(editNameDialog.getByRole('textbox', { name: /Character name/u })).toHaveValue(
    'Immutable astronomy host',
  );
  await editNameDialog.getByRole('button', { name: 'Save Character', exact: true }).click();
  await expect(builder).toBeHidden();

  const edited = await page.evaluate((storageKey) => {
    const serialized = localStorage.getItem(storageKey);
    if (!serialized) return null;
    const store = JSON.parse(serialized) as {
      savedCharacterPrompts?: Array<{
        name?: string;
        referenceImageAssetId?: string | null;
      }>;
    };
    return {
      count: store.savedCharacterPrompts?.length ?? 0,
      character: store.savedCharacterPrompts?.[0] ?? null,
    };
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(edited).toMatchObject({
    count: 1,
    character: {
      name: 'Immutable astronomy host',
      referenceImageAssetId: secondAssetId,
    },
  });
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
          schemaVersion: 5,
          savedPrompts: [],
          recentPrompts: [
            {
              id: 'missing-recent',
              prompt,
              modelModeId: 'lucy-latest',
              referenceImageAssetId: assetId,
              vtonInputKind: null,
              enhancePrompt: false,
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
  await page.goto('/studio');

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
