import { expect, test, type Locator, type Page } from '@playwright/test';
import { installSuccessfulStudioHarness } from './support/studioHarness';

const CREATIVE_ASSET_STORAGE_KEY = 'realtime-creator-studio.creative-assets.v3';

const openBuilder = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Build Your Character' }).click();
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeVisible();
};

const chooseDocumentaryPresenter = async (page: Page): Promise<void> => {
  await page
    .getByRole('button', { name: /Documentary Presenter/u })
    .first()
    .click();
  await expect(page.getByRole('button', { name: 'Save Character' })).toBeEnabled();
};

const openConstraints = async (page: Page): Promise<void> => {
  const summary = page.locator('summary').filter({ hasText: 'Preserve and constraints' });
  const drawer = summary.locator('..');
  if ((await drawer.getAttribute('open')) === null) await summary.click();
};

test('retired entries canonicalize to the mounted Studio experience', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  for (const entry of ['/advanced', '/guided', '/?new=1', '/?characterFlow=guided']) {
    await page.goto(entry);
    await expect(page).toHaveURL(/\/$/u);
    await expect(page.getByRole('heading', { name: 'Lightframe Studio' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Build Your Character' })).toBeVisible();
  }
});

test('retired entry canonicalization replaces history instead of preserving the old route', async ({
  page,
}) => {
  await installSuccessfulStudioHarness(page);
  await page.goto('/');
  await page.goto('/advanced');
  await expect(page).toHaveURL(/\/$/u);

  await page.goBack();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('heading', { name: 'Lightframe Studio' })).toBeVisible();
});

test('retired project entries canonicalize and open the legacy-project manager', async ({
  page,
}) => {
  await installSuccessfulStudioHarness(page);
  for (const entry of ['/projects', '/?project=project-42', '/guided?project=project-42']) {
    await page.goto(entry);
    await expect(page).toHaveURL(/\/$/u);
    await expect(page.getByRole('dialog', { name: 'Legacy Projects' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Legacy projects', exact: true })).toBeVisible();
  }
});

test('direction preview is last on narrow screens and remains beside the form on desktop', async ({
  page,
}) => {
  await installSuccessfulStudioHarness(page);
  await page.setViewportSize({ width: 1_440, height: 960 });
  await page.goto('/');
  await openBuilder(page);

  const dialog = page.getByRole('dialog', { name: 'Build Your Character' });
  const preview = dialog.getByRole('complementary', {
    name: 'Character Direction Preview',
  });
  const firstSection = dialog.locator('section[aria-labelledby="character-starters-heading"]');
  const finalSection = dialog.locator('section[aria-labelledby="character-preserve-heading"]');
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

  const desktopFirst = await rect(firstSection);
  const desktopPreview = await rect(preview);
  expect(desktopPreview.left).toBeGreaterThanOrEqual(desktopFirst.right);
  expect(Math.abs(desktopPreview.top - desktopFirst.top)).toBeLessThanOrEqual(1);

  await page.setViewportSize({ width: 390, height: 844 });

  const narrowFinal = await rect(finalSection);
  const narrowPreview = await rect(preview);
  expect(narrowPreview.top).toBeGreaterThanOrEqual(narrowFinal.bottom);
});

test('a demo character is optional for preview generation and save', async ({ page }) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');
  await openBuilder(page);

  const dialog = page.getByRole('dialog', { name: 'Build Your Character' });
  const demos = dialog.locator('section[aria-labelledby="character-starters-heading"]');
  await expect(demos.getByRole('heading', { name: 'Try a demo character' })).toBeVisible();
  await expect(
    demos.getByText('Optional: choose any of the nine demos for a complete, editable direction.'),
  ).toBeVisible();
  expect(
    await demos
      .getByRole('button')
      .evaluateAll((buttons) =>
        buttons.every((button) => button.getAttribute('aria-pressed') === 'false'),
      ),
  ).toBe(true);

  await dialog.getByRole('button', { name: 'Adult', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Save Character' })).toBeEnabled();
  await dialog.getByRole('button', { name: 'Generate Preview' }).click();
  await expect(dialog.getByText('This preview matches the current character.')).toBeVisible();
  expect(network.referenceWorkflowCalls).toEqual(['optimize', 'generate']);

  await dialog.getByRole('button', { name: 'Save Character', exact: true }).click();
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
    name: 'New Character 01',
    builderDraft: { presetId: null, adultAge: 'adult' },
    guidedDesign: { starterId: null },
  });
});

test('prompt-only save performs no image request and immediately preloads the Dock', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');
  await openBuilder(page);
  await chooseDocumentaryPresenter(page);

  await page.getByRole('button', { name: 'Save Character' }).evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error('Save Character is not a button.');
    button.click();
    button.click();
  });
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeHidden();
  expect(network.referenceWorkflowCalls).toEqual([]);
  expect(network.referenceImageGenerations).toEqual([]);

  await page.getByRole('button', { name: 'Dock', exact: true }).click();
  await expect(page.getByText('Documentary Presenter 01 is preloaded.')).toBeVisible();
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
      name: 'Documentary Presenter 01',
      referenceImageStatus: 'prompt-only',
      useCount: 0,
    },
  });

  const dock = page.getByRole('dialog', { name: 'Recipe Dock' });
  await dock.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  const shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await shelf.getByRole('button', { name: /^Characters/u }).click();
  await expect(
    shelf.getByRole('button', { name: 'Documentary Presenter 01', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await shelf.getByRole('button', { name: 'Close creative tool' }).click();

  await openBuilder(page);
  await expect(
    page
      .getByRole('dialog', { name: 'Build Your Character' })
      .getByRole('button', { name: 'Save Character', exact: true }),
  ).toBeDisabled();
});

test('Generate Preview always optimizes, and stale form edits detach the image from Save', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/');
  await openBuilder(page);
  await chooseDocumentaryPresenter(page);

  await page.getByRole('button', { name: 'Generate Preview' }).click();
  await expect(page.getByText('This preview matches the current character.')).toBeVisible();
  expect(network.referenceWorkflowCalls).toEqual(['optimize', 'generate']);

  await openConstraints(page);
  const constraints = page.getByLabel('Optional Custom Constraints');
  await constraints.fill('Keep the enamel field badge visible.');
  await expect(page.getByText(/Regenerate to attach an image/u)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save Character (prompt only)' })).toBeEnabled();
  await page.getByRole('button', { name: 'Save Character (prompt only)' }).click();
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
  await page.goto('/');
  await openBuilder(page);
  await chooseDocumentaryPresenter(page);
  await page.getByRole('button', { name: 'Generate Preview' }).click();
  await expect(page.getByText('This preview matches the current character.')).toBeVisible();

  const generated = network.referenceImageGenerations[0];
  const optimized = network.referencePromptOptimizations[0]?.response.result;
  expect(generated).toBeDefined();
  expect(optimized).toBeDefined();
  await page.getByRole('button', { name: 'Save Character', exact: true }).click();
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
  const workshop = page.getByRole('dialog', { name: 'Character Workshop' });
  await workshop.getByRole('button', { name: 'Detach generated reference image' }).click();
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
  await page.goto('/');
  await openBuilder(page);
  await chooseDocumentaryPresenter(page);
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
  await page.goto('/');
  await openBuilder(page);
  await chooseDocumentaryPresenter(page);
  await openConstraints(page);
  await page.getByLabel('Optional Custom Constraints').fill('Use a copper lapel pin.');
  await page.getByRole('button', { name: 'Close character builder' }).click();
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeHidden();

  await page.reload();
  await openBuilder(page);
  await expect(page.getByLabel('Optional Custom Constraints')).toHaveValue(
    'Use a copper lapel pin.',
  );
  await page.getByRole('button', { name: 'Reset Draft' }).click();
  await page.getByRole('button', { name: 'Reset Draft', exact: true }).last().click();
  await expect(page.getByLabel('Optional Custom Constraints')).toHaveValue('');
  await expect(page.getByRole('button', { name: 'Save Character' })).toBeDisabled();
});

test('unfinished Shelf edits block character Save without blocking builder editing', async ({
  page,
}) => {
  await installSuccessfulStudioHarness(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Shelf', exact: true }).click();
  const shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await shelf.getByRole('button', { name: 'New character recipe' }).click();
  await shelf.getByLabel(/^Name/u).fill('Unfinished shelf character');
  await shelf.getByRole('button', { name: 'Close creative tool' }).click();

  await openBuilder(page);
  await page
    .getByRole('button', { name: /Documentary Presenter/u })
    .first()
    .click();
  const save = page.getByRole('button', { name: 'Save Character', exact: true });
  await expect(save).toHaveAttribute('aria-disabled', 'true');
  await expect(
    page.getByText(
      'Save or discard the unfinished Recipe Shelf changes before saving this character.',
    ),
  ).toBeVisible();
});
