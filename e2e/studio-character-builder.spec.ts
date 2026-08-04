import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  openCharacterOptions,
  readBrowserState,
} from './support/studioHarness';

const CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v6';
const REFERENCE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const openBuilder = async (page: Page): Promise<void> => {
  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Create new character' }).click();
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeVisible();
};

const chooseAdultCharacterDirection = async (
  page: Page,
  expectSaveEnabled = true,
): Promise<void> => {
  await page.getByRole('button', { name: 'Adult', exact: true }).click();
  await page.getByRole('button', { name: /^Preview(?: |$)/u }).click();
  if (expectSaveEnabled) {
    await expect(page.getByRole('button', { name: 'Save Character' })).toBeEnabled();
  }
};

const confirmCharacterName = async (
  page: Page,
  name: string,
  submitLabel: 'Save Character' | 'Save & Use Character' = 'Save Character',
): Promise<void> => {
  const dialog = page.getByRole('dialog', { name: 'Name your character' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: /Character name/u }).fill(name);
  await dialog.getByRole('button', { name: submitLabel, exact: true }).click();
};

const openConstraints = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: /^Refine details(?: |$)/u }).click();
};

test('all three Builder steps remain directly available across desktop and narrow layouts', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await installSuccessfulStudioHarness(page);
  await page.setViewportSize({ width: 1_440, height: 960 });
  await page.goto('/studio');
  await openBuilder(page);

  const dialog = page.getByRole('dialog', { name: 'Build Your Character' });
  const steps = dialog.getByRole('navigation', { name: 'Character builder steps' });
  const firstSection = dialog.getByRole('region', {
    name: /Set your foundation/u,
  });
  const rect = (locator: Locator) =>
    locator.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        top: bounds.top,
        right: bounds.right,
        bottom: bounds.bottom,
      };
    });

  const desktopSteps = await rect(steps);
  const desktopFirst = await rect(firstSection);
  expect(desktopFirst.left).toBeGreaterThanOrEqual(desktopSteps.right);
  await expect(steps.getByRole('button')).toHaveCount(3);
  for (const button of await steps.getByRole('button').all()) await expect(button).toBeEnabled();
  await expect(dialog.getByRole('complementary')).toHaveCount(1);

  for (const viewport of [
    { width: 1_280, height: 720 },
    { width: 834, height: 1_112 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    const contained = await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return (
        bounds.left >= 0 &&
        bounds.top >= 0 &&
        bounds.right <= document.documentElement.clientWidth &&
        bounds.bottom <= document.documentElement.clientHeight &&
        document.documentElement.scrollWidth <= document.documentElement.clientWidth
      );
    });
    expect(contained, `${viewport.width}×${viewport.height} containment`).toBe(true);
    for (const button of await steps.getByRole('button').all()) {
      const bounds = await button.boundingBox();
      expect(bounds?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }

  await page.setViewportSize({ width: 390, height: 844 });

  const narrowSteps = await rect(steps);
  const narrowFirst = await rect(firstSection);
  expect(narrowFirst.top).toBeGreaterThanOrEqual(narrowSteps.bottom);
  await expect(dialog.getByRole('complementary')).toHaveCount(0);
  await steps.getByRole('button', { name: /^Preview(?: |$)/u }).click();
  await expect(dialog.getByRole('heading', { name: 'Ready to Generate?' })).toBeFocused();
  const preview = dialog.getByRole('complementary', {
    name: 'Character Direction Preview',
  });
  await expect(preview).toBeVisible();
  await expect(dialog.getByRole('complementary')).toHaveCount(1);
});

test('character direction supports preview generation and save', async ({ page }) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await openBuilder(page);

  const dialog = page.getByRole('dialog', { name: 'Build Your Character' });
  await chooseAdultCharacterDirection(page);
  await expect(dialog.getByRole('button', { name: 'Save Character' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Generate Preview' }).click();
  await expect(dialog.getByText('This preview matches the current character.')).toBeVisible();
  expect(network.referenceWorkflowCalls).toEqual(['optimize', 'generate']);

  await dialog.getByRole('button', { name: 'Save Character', exact: true }).click();
  await confirmCharacterName(page, 'Adult Guide');
  await expect(dialog).toBeHidden();

  const saved = await page.evaluate((storageKey) => {
    const payload = localStorage.getItem(storageKey);
    if (!payload) return null;
    const store = JSON.parse(payload) as {
      savedCharacterPrompts?: Array<{
        name?: string;
        builderDraft?: { presetId?: string | null; adultAge?: string | null } | null;
        guidedDesign?: { starterId?: string | null } | null;
      }>;
    };
    return store.savedCharacterPrompts?.[0] ?? null;
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(saved).toMatchObject({
    name: 'Adult Guide',
    builderDraft: { presetId: null, adultAge: 'adult' },
    guidedDesign: { starterId: null },
  });
});

test('prompt-only save performs no image request and immediately preloads the Dock', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await openBuilder(page);
  await chooseAdultCharacterDirection(page);

  await page.getByRole('button', { name: 'Save Character' }).evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error('Save Character is not a button.');
    button.click();
    button.click();
  });
  await confirmCharacterName(page, 'Field Presenter');
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeHidden();
  expect(network.referenceWorkflowCalls).toEqual([]);
  expect(network.referenceImageGenerations).toEqual([]);

  await page.getByRole('button', { name: 'Dock', exact: true }).click();
  await expect(page.getByText('Field Presenter is preloaded.')).toBeVisible();
  const saved = await page.evaluate((storageKey) => {
    const payload = localStorage.getItem(storageKey);
    if (!payload) return null;
    const store = JSON.parse(payload) as {
      savedCharacterPrompts?: Array<{
        name?: string;
        referenceImageStatus?: string;
        useCount?: number;
      }>;
    };
    return {
      count: store.savedCharacterPrompts?.length ?? 0,
      character: store.savedCharacterPrompts?.[0] ?? null,
    };
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(saved).toMatchObject({
    count: 1,
    character: {
      name: 'Field Presenter',
      referenceImageStatus: 'prompt-only',
      useCount: 0,
    },
  });

  const dock = page.getByRole('dialog', { name: 'Recipe Dock' });
  await dock.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  const shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await shelf.getByRole('button', { name: /^Characters/u }).click();
  await expect(shelf.getByRole('button', { name: 'Field Presenter', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await shelf.getByRole('button', { name: 'Close creative tool' }).click();

  await openBuilder(page);
  await expect(
    page
      .getByRole('dialog', { name: 'Build Your Character' })
      .getByRole('button', { name: 'Save Character', exact: true }),
  ).toBeDisabled();
});

test('saved-character selection survives reload and completes Use through Start', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await openBuilder(page);
  await chooseAdultCharacterDirection(page);
  await page.getByRole('button', { name: 'Save Character', exact: true }).click();
  await confirmCharacterName(page, 'Shelf Field Host');
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeHidden();

  const savedPrompt = await page.evaluate((storageKey) => {
    const payload = localStorage.getItem(storageKey);
    if (!payload) return null;
    const store = JSON.parse(payload) as {
      savedCharacterPrompts?: Array<{ prompt?: string }>;
    };
    return store.savedCharacterPrompts?.[0]?.prompt ?? null;
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(savedPrompt).toBeTruthy();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Select Character', exact: true })).toBeVisible();
  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  let shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await expect(shelf.getByRole('button', { name: /^Characters/u })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.keyboard.press('Escape');
  await expect(shelf).toBeHidden();
  await expect(page.getByRole('button', { name: 'Shelf', exact: true })).toBeFocused();

  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await expect(shelf.getByRole('button', { name: /^Characters/u })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await shelf.getByRole('button', { name: 'Use Shelf Field Host' }).click();

  await expect(shelf).toBeHidden();
  await expect(
    page.getByRole('button', {
      name: 'Selected character: Shelf Field Host. Open character options',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Record New Video' }).click();
  await expect(page.getByLabel('Live local camera preview', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start AI', exact: true }).click();
  let chooser = page.getByRole('dialog', { name: 'Choose live AI experience' });
  await expect(chooser.getByLabel('Decart start disclosure')).toContainText('at most 300 seconds');
  expect(network.apiRequests.filter(({ path }) => path === '/api/realtime-token')).toHaveLength(0);
  await chooser.getByRole('button', { name: 'Start with Shelf Field Host' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();

  expect((await readBrowserState(page)).connections).toEqual([
    {
      model: 'lucy-latest',
      initial: {
        prompt: savedPrompt,
        imageName: null,
        enhance: false,
      },
    },
  ]);

  await page.reload();
  await page.getByRole('button', { name: 'Record New Video' }).click();
  await expect(page.getByLabel('Live local camera preview', { exact: true })).toBeVisible();
  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await expect(shelf.getByRole('button', { name: /^Characters/u })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await shelf.getByRole('button', { name: 'Use Shelf Field Host' }).click();
  await page.getByRole('button', { name: 'Start AI', exact: true }).click();
  chooser = page.getByRole('dialog', { name: 'Choose live AI experience' });
  await expect(chooser.getByLabel('Decart start disclosure')).toContainText('Stop AI ends usage');
  await chooser.getByRole('button', { name: 'Start with Shelf Field Host' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  expect((await readBrowserState(page)).connections[0]?.model).toBe('lucy-latest');
});

test('image-only upload saves and preloads without starting AI, then appears in Recent after Start', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await openBuilder(page);
  const dialog = page.getByRole('dialog', { name: 'Build Your Character' });
  await dialog.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: 'portrait.png',
    mimeType: 'image/png',
    buffer: REFERENCE_PNG,
  });

  await expect(dialog.getByAltText('Current uploaded character reference')).toBeVisible();
  await expect(dialog.getByText('portrait.png', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: /^Preview(?: |$)/u }).click();
  await expect(
    dialog.getByText('Uploaded reference — no generated preview', { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Save & Use Image Only' })).toBeEnabled();
  expect(network.referenceWorkflowCalls).toEqual(['upload']);
  const uploaded = network.referenceImageUploads[0];
  expect(uploaded).toBeDefined();

  await dialog.getByRole('button', { name: 'Save & Use Image Only' }).click();
  await confirmCharacterName(page, 'Portrait Coach', 'Save & Use Character');
  await expect(dialog).toBeHidden();
  expect((await readBrowserState(page)).connections).toEqual([]);

  const beforeStart = await page.evaluate((storageKey) => {
    const payload = localStorage.getItem(storageKey);
    if (!payload) return null;
    const store = JSON.parse(payload) as {
      recentPrompts?: unknown[];
      savedCharacterPrompts?: Array<{
        id?: string;
        name?: string;
        prompt?: string;
        referenceImageAssetId?: string | null;
        uploadedReferenceImageAssetId?: string | null;
        finalReferenceKind?: string | null;
        builderDraft?: unknown;
        guidedDesign?: unknown;
      }>;
    };
    return {
      recentCount: store.recentPrompts?.length ?? 0,
      character: store.savedCharacterPrompts?.[0] ?? null,
    };
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(beforeStart).toMatchObject({
    recentCount: 0,
    character: {
      name: 'Portrait Coach',
      prompt: '',
      referenceImageAssetId: uploaded?.assetId,
      uploadedReferenceImageAssetId: uploaded?.assetId,
      finalReferenceKind: 'uploaded',
      builderDraft: null,
      guidedDesign: null,
    },
  });

  await page.getByRole('button', { name: 'Dock', exact: true }).click();
  const dock = page.getByRole('dialog', { name: 'Recipe Dock' });
  await expect(dock.getByLabel('Character direction')).toHaveValue('');
  await expect(dock.getByAltText('Current persisted reference preview')).toBeVisible();
  await expect(dock.getByRole('checkbox')).not.toBeChecked();
  await dock.getByRole('button', { name: 'Start Character AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();

  expect((await readBrowserState(page)).connections).toEqual([
    {
      model: 'lucy-latest',
      initial: {
        prompt: '',
        imageName: `reference-${uploaded?.assetId}.png`,
        enhance: false,
      },
    },
  ]);
  const recent = await page.evaluate((storageKey) => {
    const payload = localStorage.getItem(storageKey);
    if (!payload) return null;
    const store = JSON.parse(payload) as {
      recentPrompts?: Array<Record<string, unknown>>;
    };
    return store.recentPrompts?.[0] ?? null;
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(recent).toMatchObject({
    prompt: '',
    characterName: 'Portrait Coach',
    referenceImageAssetId: uploaded?.assetId,
    savedCharacterPromptId: beforeStart?.character?.id,
  });

  await dock.getByRole('button', { name: 'Stop AI' }).click();
  await expect(dock.getByRole('button', { name: 'Start Character AI' })).toBeVisible();
  await dock.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  const shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await shelf.getByRole('button', { name: /^Recent\b/u }).click();
  await expect(shelf.getByText('Portrait Coach', { exact: true })).toBeVisible();
  await expect(shelf.getByText('Image only', { exact: true })).toBeVisible();
  await expect(shelf.getByAltText('Recent character reference')).toBeVisible();
});

test('prompt plus upload saves the uploaded source directly with enhancement off', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await openBuilder(page);
  const dialog = page.getByRole('dialog', { name: 'Build Your Character' });
  await dialog.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: 'direct-source.png',
    mimeType: 'image/png',
    buffer: REFERENCE_PNG,
  });
  await expect(dialog.getByAltText('Current uploaded character reference')).toBeVisible();
  await chooseAdultCharacterDirection(page);
  await dialog.getByRole('button', { name: 'Save Character', exact: true }).click();
  await confirmCharacterName(page, 'Direct Source Presenter');
  await expect(dialog).toBeHidden();

  expect(network.referenceWorkflowCalls).toEqual(['upload']);
  const uploaded = network.referenceImageUploads[0];
  const saved = await page.evaluate((storageKey) => {
    const payload = localStorage.getItem(storageKey);
    if (!payload) return null;
    const store = JSON.parse(payload) as {
      savedCharacterPrompts?: Array<Record<string, unknown>>;
    };
    return store.savedCharacterPrompts?.[0] ?? null;
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(saved).toMatchObject({
    referenceImageAssetId: uploaded?.assetId,
    uploadedReferenceImageAssetId: uploaded?.assetId,
    finalReferenceKind: 'uploaded',
  });

  await page.getByRole('button', { name: 'Dock', exact: true }).click();
  const dock = page.getByRole('dialog', { name: 'Recipe Dock' });
  await expect(dock.getByLabel('Character direction')).toHaveValue(
    /Substitute the character in the video with/u,
  );
  await expect(dock.getByAltText('Current persisted reference preview')).toBeVisible();
  await expect(dock.getByRole('checkbox')).not.toBeChecked();
  expect((await readBrowserState(page)).connections).toEqual([]);
});

test('uploaded draft references restore across reload and Detach does not contact a provider', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await openBuilder(page);
  let dialog = page.getByRole('dialog', { name: 'Build Your Character' });
  await dialog.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: 'restorable-source.png',
    mimeType: 'image/png',
    buffer: REFERENCE_PNG,
  });
  await expect(dialog.getByAltText('Current uploaded character reference')).toBeVisible();
  await dialog.getByRole('button', { name: 'Close character builder' }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await openBuilder(page);
  dialog = page.getByRole('dialog', { name: 'Build Your Character' });
  await expect(dialog.getByText('restorable-source.png', { exact: true })).toBeVisible();
  await expect(dialog.getByAltText('Current uploaded character reference')).toBeVisible();
  expect(network.referenceImageMetadataReads).toContain(
    network.referenceImageUploads[0]?.assetId ?? '',
  );

  await dialog.getByRole('button', { name: 'Detach uploaded character reference' }).click();
  await expect(dialog.getByAltText('Current uploaded character reference')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Save & Use Image Only' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Close character builder' }).click();
  await page.reload();
  await openBuilder(page);
  await expect(
    page
      .getByRole('dialog', { name: 'Build Your Character' })
      .getByAltText('Current uploaded character reference'),
  ).toHaveCount(0);
  expect(network.referenceWorkflowCalls).toEqual(['upload']);
});

test('invalid device files fail accessibly before any upload request', async ({ page }) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await openBuilder(page);
  const dialog = page.getByRole('dialog', { name: 'Build Your Character' });
  await dialog.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: 'not-an-image.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('not an image'),
  });

  await expect(dialog.getByRole('alert')).toContainText(/JPEG, PNG, or WebP/u);
  await expect(dialog.getByAltText('Current uploaded character reference')).toHaveCount(0);
  expect(network.referenceWorkflowCalls).toEqual([]);
});

test('combined preview composes from the immutable upload and preloads the generated recipe', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await openBuilder(page);
  const dialog = page.getByRole('dialog', { name: 'Build Your Character' });
  await dialog.locator('input[type="file"][accept*="image/png"]').setInputFiles({
    name: 'source.png',
    mimeType: 'image/png',
    buffer: REFERENCE_PNG,
  });
  await expect(dialog.getByAltText('Current uploaded character reference')).toBeVisible();
  await chooseAdultCharacterDirection(page);

  await dialog.getByRole('button', { name: 'Generate Combined Preview' }).click();
  await expect(dialog.getByText('This preview matches the current character.')).toBeVisible();
  expect(network.referenceWorkflowCalls).toEqual(['upload', 'optimize', 'compose']);
  expect(network.referenceImageCompositions[0]).toMatchObject({
    sourceAssetId: network.referenceImageUploads[0]?.assetId,
  });

  await dialog.getByRole('button', { name: 'Save Character', exact: true }).click();
  await confirmCharacterName(page, 'Combined Presenter');
  await expect(dialog).toBeHidden();
  const composition = network.referenceImageCompositions[0];
  const saved = await page.evaluate((storageKey) => {
    const payload = localStorage.getItem(storageKey);
    if (!payload) return null;
    const store = JSON.parse(payload) as {
      savedCharacterPrompts?: Array<Record<string, unknown>>;
    };
    return store.savedCharacterPrompts?.[0] ?? null;
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(saved).toMatchObject({
    referenceImageAssetId: composition?.assetId,
    uploadedReferenceImageAssetId: network.referenceImageUploads[0]?.assetId,
    finalReferenceKind: 'generated',
  });

  await page.getByRole('button', { name: 'Dock', exact: true }).click();
  const dock = page.getByRole('dialog', { name: 'Recipe Dock' });
  await expect(dock.getByLabel('Character direction')).toHaveValue(
    network.referencePromptOptimizations[0]?.response.result.lucy25CharacterPrompt ?? '',
  );
  await expect(dock.getByRole('checkbox')).toBeChecked();
  expect((await readBrowserState(page)).connections).toEqual([]);
});

test('Generate Preview always optimizes, and stale form edits detach the image from Save', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await openBuilder(page);
  await chooseAdultCharacterDirection(page);

  await page.getByRole('button', { name: 'Generate Preview' }).click();
  await expect(page.getByText('This preview matches the current character.')).toBeVisible();
  expect(network.referenceWorkflowCalls).toEqual(['optimize', 'generate']);

  await openConstraints(page);
  const constraints = page.getByLabel('Optional Custom Constraints');
  await constraints.fill('Keep the enamel field badge visible.');
  await page.getByRole('button', { name: /^Preview(?: |$)/u }).click();
  await expect(page.getByText(/Regenerate to attach an image/u)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Character (prompt only)' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save Character (prompt only)' }).click();
  await confirmCharacterName(page, 'Copper Presenter');
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeHidden();

  const savedReferenceId = await page.evaluate((storageKey) => {
    const payload = localStorage.getItem(storageKey);
    if (!payload) return 'missing';
    const store = JSON.parse(payload) as {
      savedCharacterPrompts?: Array<{ referenceImageAssetId?: string | null }>;
    };
    return store.savedCharacterPrompts?.[0]?.referenceImageAssetId ?? null;
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(savedReferenceId).toBeNull();
});

test('image-backed save preserves the exact generated asset and optimized Lucy preload', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await openBuilder(page);
  await chooseAdultCharacterDirection(page);
  await page.getByRole('button', { name: 'Generate Preview' }).click();
  await expect(page.getByText('This preview matches the current character.')).toBeVisible();

  const generated = network.referenceImageGenerations[0];
  const optimized = network.referencePromptOptimizations[0]?.response.result;
  expect(generated).toBeDefined();
  expect(optimized).toBeDefined();
  await page.getByRole('button', { name: 'Save Character', exact: true }).click();
  await confirmCharacterName(page, 'Generated Presenter');
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeHidden();

  const saved = await page.evaluate((storageKey) => {
    const payload = localStorage.getItem(storageKey);
    if (!payload) return null;
    const store = JSON.parse(payload) as {
      savedCharacterPrompts?: Array<{
        referenceImageAssetId?: string | null;
        referenceImageStatus?: string;
        useCount?: number;
      }>;
    };
    return store.savedCharacterPrompts?.[0] ?? null;
  }, CREATIVE_ASSET_STORAGE_KEY);
  expect(saved).toMatchObject({
    referenceImageAssetId: generated?.assetId,
    referenceImageStatus: 'persisted-reference',
    useCount: 0,
  });

  await page.getByRole('button', { name: 'Dock', exact: true }).click();
  const dock = page.getByRole('dialog', { name: 'Recipe Dock' });
  await expect(dock.getByLabel('Character direction')).toHaveValue(
    optimized?.lucy25CharacterPrompt ?? '',
  );
  await expect(dock.getByAltText('Current persisted reference preview')).toBeVisible();
  await expect(dock.getByRole('checkbox')).toBeChecked();

  await dock.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Workshop', exact: true }).click();
  const workshop = page.getByRole('dialog', { name: 'Prompt Workshop' });
  await expect(workshop.getByRole('button', { name: 'Transform character' })).toHaveCount(0);
  await expect(workshop.getByRole('button', { name: /Detach generated reference/u })).toHaveCount(
    0,
  );
  await workshop.getByRole('button', { name: 'Close creative tool' }).click();

  await page.getByRole('button', { name: 'Dock', exact: true }).click();
  await page.getByRole('button', { name: 'Start Character AI' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate((storageKey) => {
        const payload = localStorage.getItem(storageKey);
        if (!payload) return 0;
        const store = JSON.parse(payload) as {
          savedCharacterPrompts?: Array<{ useCount?: number }>;
        };
        return store.savedCharacterPrompts?.[0]?.useCount ?? 0;
      }, CREATIVE_ASSET_STORAGE_KEY),
    )
    .toBe(1);
});

test('regeneration distinguishes a fresh image from an instructed source-image edit', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await openBuilder(page);
  await chooseAdultCharacterDirection(page);
  await page.getByRole('button', { name: 'Generate Preview' }).click();
  await expect(page.getByText('This preview matches the current character.')).toBeVisible();
  const originalAssetId = network.referenceImageGenerations[0]?.assetId;
  expect(originalAssetId).toBeDefined();

  await page.getByRole('button', { name: 'Regenerate' }).click();
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect.poll(() => network.referenceImageGenerations.length).toBe(2);
  expect(network.referenceImageEdits).toHaveLength(0);

  await expect(page.getByRole('dialog', { name: 'Regenerate character preview' })).toBeHidden();
  await page
    .getByRole('dialog', { name: 'Build Your Character' })
    .getByRole('button', { name: 'Regenerate' })
    .click();
  await page
    .getByLabel('What would you like changed?')
    .fill('Use a warmer key light while preserving the exact character identity.');
  await page.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect.poll(() => network.referenceImageEdits.length).toBe(1);
  expect(network.referenceImageEdits[0]).toMatchObject({
    sourceAssetId: network.referenceImageGenerations[1]?.assetId,
    changeInstructions: 'Use a warmer key light while preserving the exact character identity.',
  });
});

test('drafts survive close and reload, while Reset Draft starts fresh', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await openBuilder(page);
  await chooseAdultCharacterDirection(page);
  await openConstraints(page);
  await page.getByLabel('Optional Custom Constraints').fill('Use a copper lapel pin.');
  await page.getByRole('button', { name: 'Close character builder' }).click();
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeHidden();

  await page.reload();
  await openBuilder(page);
  await openConstraints(page);
  await expect(page.getByLabel('Optional Custom Constraints')).toHaveValue(
    'Use a copper lapel pin.',
  );
  await page.getByRole('button', { name: 'Reset Draft' }).click();
  await page
    .getByRole('dialog', { name: 'Reset this character draft?' })
    .getByRole('button', { name: 'Reset Draft', exact: true })
    .click();
  await expect(page.getByLabel('Optional Custom Constraints')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Save Character' })).toBeDisabled();
});

test('editing a character requires explicit discard of a different unfinished draft', async ({
  page,
}) => {
  await installSuccessfulStudioHarness(page);
  await page.goto('/studio');

  await openBuilder(page);
  await chooseAdultCharacterDirection(page);
  await page.getByRole('button', { name: 'Save Character', exact: true }).click();
  await confirmCharacterName(page, 'Saved Field Host');
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeHidden();

  await openBuilder(page);
  await chooseAdultCharacterDirection(page);
  await openConstraints(page);
  await page.getByLabel('Optional Custom Constraints').fill('unfinished draft marker');
  await page.getByRole('button', { name: 'Close character builder' }).click();

  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  let shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await shelf.getByRole('button', { name: /^Characters/u }).click();
  await shelf.getByRole('button', { name: 'Edit Saved Field Host' }).click();

  const discardPrompt = page.getByRole('dialog', { name: 'Unfinished character draft' });
  await expect(discardPrompt).toContainText('An unfinished character draft exists');
  await discardPrompt.getByRole('button', { name: 'Cancel' }).click();
  await expect(discardPrompt).toBeHidden();
  await expect(shelf).toBeVisible();

  await shelf.getByRole('button', { name: 'New character recipe' }).click();
  const resumedCreate = page.getByRole('dialog', { name: 'Build Your Character' });
  await expect(resumedCreate).toBeVisible();
  await openConstraints(page);
  await expect(page.getByLabel('Optional Custom Constraints')).toHaveValue(
    'unfinished draft marker',
  );
  await page.getByRole('button', { name: 'Close character builder' }).click();

  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await shelf.getByRole('button', { name: /^Characters/u }).click();
  await shelf.getByRole('button', { name: 'Edit Saved Field Host' }).click();
  await page
    .getByRole('dialog', { name: 'Unfinished character draft' })
    .getByRole('button', { name: 'Continue' })
    .click();

  const editBuilder = page.getByRole('dialog', { name: 'Edit Saved Field Host' });
  await expect(editBuilder).toBeVisible();
  await openConstraints(page);
  await expect(page.getByLabel('Optional Custom Constraints')).toHaveValue('');
});

test('unfinished Outfit Builder work requires confirmed discard before returning to Shelf', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio');
  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  const shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await shelf.getByRole('button', { name: 'Try-on recipes' }).click();
  await shelf.getByRole('button', { name: 'New garment recipe' }).click();
  const builder = page.getByRole('dialog', { name: 'Create a new outfit' });
  await builder.getByLabel('Garment direction').fill('An unfinished garment direction.');
  await expect(builder.locator('[data-outfit-builder-dirty]')).toHaveAttribute(
    'data-outfit-builder-dirty',
    'true',
  );

  await page.evaluate(() => {
    const testWindow = window as typeof window & { __outfitConfirmMessages?: string[] };
    testWindow.__outfitConfirmMessages = [];
    window.confirm = (message) => {
      testWindow.__outfitConfirmMessages?.push(String(message ?? ''));
      return false;
    };
  });
  await builder.getByRole('button', { name: 'Close panel' }).click();
  await expect(builder).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __outfitConfirmMessages?: string[] }).__outfitConfirmMessages,
    ),
  ).toEqual(['Discard the unfinished outfit changes? The draft cannot be recovered.']);

  await page.evaluate(() => {
    window.confirm = () => true;
  });
  await builder.getByRole('button', { name: 'Close panel' }).click();
  await expect(shelf).toBeVisible();
  expect((await readBrowserState(page)).cameraCalls).toBe(0);
  expectNoExternalProviderTraffic(network);
});
