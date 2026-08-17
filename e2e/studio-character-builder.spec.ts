import { expect, test, type Page } from '@playwright/test';
import {
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  openCharacterOptions,
  readCreativeAssetStore,
  readBrowserState,
} from './support/studioHarness';
import { REFERENCE_PNG } from './support/mediaFixtures';

const openBuilder = async (page: Page): Promise<void> => {
  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Create new character' }).click();
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeVisible();
};

const selectSavedCharacter = async (page: Page, name: string): Promise<void> => {
  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  const characters = page.getByRole('dialog', { name: 'Characters' });
  await characters
    .getByRole('article')
    .filter({ hasText: name })
    .getByRole('button', { name: 'Use in Studio' })
    .click();
  await expect(characters).toBeHidden();
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

test('character direction supports preview generation and save', async ({ page }) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio/create');
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

  const saved = (await readCreativeAssetStore(page))?.savedCharacterPrompts[0];
  expect(saved).toMatchObject({
    name: 'Adult Guide',
    builderDraft: { presetId: null, adultAge: 'adult' },
    guidedDesign: { starterId: null },
  });
});

test('prompt-only save performs no image request and immediately selects the Character', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio/create');
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

  await expect(
    page.getByRole('button', {
      name: 'Selected character: Field Presenter. Open character options',
    }),
  ).toBeVisible();
  const savedStore = await readCreativeAssetStore(page);
  const saved = {
    count: savedStore?.savedCharacterPrompts.length ?? 0,
    character: savedStore?.savedCharacterPrompts[0] ?? null,
  };
  expect(saved).toMatchObject({
    count: 1,
    character: {
      name: 'Field Presenter',
      referenceImageStatus: 'prompt-only',
      useCount: 0,
    },
  });

  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  const characters = page.getByRole('dialog', { name: 'Characters' });
  await expect(
    characters.getByRole('article').filter({ hasText: 'Field Presenter' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');

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
  await page.goto('/studio/create');
  await openBuilder(page);
  await chooseAdultCharacterDirection(page);
  await page.getByRole('button', { name: 'Save Character', exact: true }).click();
  await confirmCharacterName(page, 'Saved Field Host');
  await expect(page.getByRole('dialog', { name: 'Build Your Character' })).toBeHidden();

  const savedPrompt =
    (await readCreativeAssetStore(page))?.savedCharacterPrompts[0]?.prompt ?? null;
  expect(savedPrompt).toBeTruthy();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Select Character', exact: true })).toBeVisible();
  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  let characters = page.getByRole('dialog', { name: 'Characters' });
  await expect(
    characters.getByRole('article').filter({ hasText: 'Saved Field Host' }),
  ).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(characters).toBeHidden();
  await expect(page.getByRole('button', { name: 'Select Character', exact: true })).toBeFocused();

  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  characters = page.getByRole('dialog', { name: 'Characters' });
  await characters
    .getByRole('article')
    .filter({ hasText: 'Saved Field Host' })
    .getByRole('button', { name: 'Use in Studio' })
    .click();

  await expect(characters).toBeHidden();
  await expect(
    page.getByRole('button', {
      name: 'Selected character: Saved Field Host. Open character options',
    }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Record New Video' }).click();
  await expect(page.getByLabel('Live local camera preview', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Start AI', exact: true }).click();
  let chooser = page.getByRole('dialog', { name: 'Choose live AI experience' });
  await expect(chooser.getByLabel('Decart start disclosure')).toContainText('at most 300 seconds');
  expect(network.apiRequests.filter(({ path }) => path === '/api/realtime-token')).toHaveLength(0);
  await chooser.getByRole('button', { name: 'Start with Saved Field Host' }).click();
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
  characters = page.getByRole('dialog', { name: 'Characters' });
  await characters
    .getByRole('article')
    .filter({ hasText: 'Saved Field Host' })
    .getByRole('button', { name: 'Use in Studio' })
    .click();
  await page.getByRole('button', { name: 'Start AI', exact: true }).click();
  chooser = page.getByRole('dialog', { name: 'Choose live AI experience' });
  await expect(chooser.getByLabel('Decart start disclosure')).toContainText('Stop AI ends usage');
  await chooser.getByRole('button', { name: 'Start with Saved Field Host' }).click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  expect((await readBrowserState(page)).connections[0]?.model).toBe('lucy-latest');
});

test('image-only upload saves and preloads without starting AI, then appears in Recent after Start', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio/create');
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

  const beforeStartStore = await readCreativeAssetStore(page);
  const beforeStart = {
    recentCount: beforeStartStore?.recentPrompts.length ?? 0,
    character: beforeStartStore?.savedCharacterPrompts[0] ?? null,
  };
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

  await page.getByRole('button', { name: 'Record New Video' }).click();
  await page.getByRole('button', { name: 'Start AI', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Choose live AI experience' })
    .getByRole('button', { name: 'Start with Portrait Coach' })
    .click();
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
  const recent = (await readCreativeAssetStore(page))?.recentPrompts[0];
  expect(recent).toMatchObject({
    prompt: '',
    characterName: 'Portrait Coach',
    referenceImageAssetId: uploaded?.assetId,
    savedCharacterPromptId: beforeStart?.character?.id,
  });

  await page.getByRole('button', { name: 'Stop AI' }).click();
  await expect(page.getByRole('button', { name: /Recipe|Shelf|Dock/u })).toHaveCount(0);
});

test('prompt plus upload saves the uploaded source directly with enhancement off', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio/create');
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
  const saved = (await readCreativeAssetStore(page))?.savedCharacterPrompts[0];
  expect(saved).toMatchObject({
    referenceImageAssetId: uploaded?.assetId,
    uploadedReferenceImageAssetId: uploaded?.assetId,
    finalReferenceKind: 'uploaded',
  });

  await expect(
    page.getByRole('button', {
      name: 'Selected character: Direct Source Presenter. Open character options',
    }),
  ).toBeVisible();
  expect((await readBrowserState(page)).connections).toEqual([]);
});

test('uploaded draft references restore across reload and Detach does not contact a provider', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio/create');
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
  await expect(dialog).toBeHidden();
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
  await page.goto('/studio/create');
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

test('combined preview composes from the immutable upload and selects the generated Character', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio/create');
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
  const saved = (await readCreativeAssetStore(page))?.savedCharacterPrompts[0];
  expect(saved).toMatchObject({
    referenceImageAssetId: composition?.assetId,
    uploadedReferenceImageAssetId: network.referenceImageUploads[0]?.assetId,
    finalReferenceKind: 'generated',
  });

  await expect(
    page.getByRole('button', {
      name: 'Selected character: Combined Presenter. Open character options',
    }),
  ).toBeVisible();
  expect((await readBrowserState(page)).connections).toEqual([]);
});

test('Generate Preview always optimizes, and stale form edits detach the image from Save', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio/create');
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

  const savedReferenceId =
    (await readCreativeAssetStore(page))?.savedCharacterPrompts[0]?.referenceImageAssetId ?? null;
  expect(savedReferenceId).toBeNull();
});

test('image-backed save preserves the exact generated asset and optimized Lucy preload', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio/create');
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

  const saved = (await readCreativeAssetStore(page))?.savedCharacterPrompts[0];
  expect(saved).toMatchObject({
    referenceImageAssetId: generated?.assetId,
    referenceImageStatus: 'persisted-reference',
    useCount: 0,
  });

  await expect(
    page.getByRole('button', {
      name: 'Selected character: Generated Presenter. Open character options',
    }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Workshop', exact: true }).click();
  const workshop = page.getByRole('dialog', { name: 'Prompt Workshop' });
  await expect(workshop.getByRole('button', { name: 'Transform character' })).toHaveCount(0);
  await expect(workshop.getByRole('button', { name: /Detach generated reference/u })).toHaveCount(
    0,
  );
  await workshop.getByRole('button', { name: 'Close creative tool' }).click();

  await page.getByRole('button', { name: 'Record New Video' }).click();
  await page.getByRole('button', { name: 'Start AI', exact: true }).click();
  await page
    .getByRole('dialog', { name: 'Choose live AI experience' })
    .getByRole('button', { name: 'Start with Generated Presenter' })
    .click();
  await expect(page.getByLabel('Live transformed camera preview')).toBeVisible();
  expect((await readBrowserState(page)).connections[0]?.initial.prompt).toBe(
    optimized?.lucy25CharacterPrompt,
  );
  await expect
    .poll(async () => (await readCreativeAssetStore(page))?.savedCharacterPrompts[0]?.useCount ?? 0)
    .toBe(1);
});

test('regeneration distinguishes a fresh image from an instructed source-image edit', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio/create');
  await openBuilder(page);
  await chooseAdultCharacterDirection(page);
  await page.getByRole('button', { name: 'Generate Preview' }).click();
  await expect(page.getByText('This preview matches the current character.')).toBeVisible();
  const originalAssetId = network.referenceImageGenerations[0]?.assetId;
  expect(originalAssetId).toBeDefined();

  await page.getByRole('button', { name: 'Regenerate' }).click();
  const freshRegeneration = page.getByRole('dialog', { name: 'Regenerate character preview' });
  await expect(freshRegeneration).toBeVisible();
  await freshRegeneration.getByRole('button', { name: 'Regenerate', exact: true }).click();
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
  const instructedRegeneration = page.getByRole('dialog', {
    name: 'Regenerate character preview',
  });
  await instructedRegeneration.getByRole('button', { name: 'Regenerate', exact: true }).click();
  await expect.poll(() => network.referenceImageEdits.length).toBe(1);
  expect(network.referenceImageEdits[0]).toMatchObject({
    sourceAssetId: network.referenceImageGenerations[1]?.assetId,
    changeInstructions: 'Use a warmer key light while preserving the exact character identity.',
  });
});

test('drafts survive close and reload, while Reset Draft starts fresh', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await page.goto('/studio/create');
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
  await page.goto('/studio/create');

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

  await selectSavedCharacter(page, 'Saved Field Host');
  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Edit Saved Field Host' }).click();

  const discardPrompt = page.getByRole('dialog', { name: 'Unfinished character draft' });
  await expect(discardPrompt).toContainText('An unfinished character draft exists');
  await discardPrompt.getByRole('button', { name: 'Cancel' }).click();
  await expect(discardPrompt).toBeHidden();
  await expect(page.getByRole('dialog', { name: 'Character' })).toBeVisible();

  await page.getByRole('button', { name: 'Create new character' }).click();
  const resumedCreate = page.getByRole('dialog', { name: 'Build Your Character' });
  await expect(resumedCreate).toBeVisible();
  await openConstraints(page);
  await expect(page.getByLabel('Optional Custom Constraints')).toHaveValue(
    'unfinished draft marker',
  );
  await page.getByRole('button', { name: 'Close character builder' }).click();

  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Edit Saved Field Host' }).click();
  await page
    .getByRole('dialog', { name: 'Unfinished character draft' })
    .getByRole('button', { name: 'Continue' })
    .click();

  const editBuilder = page.getByRole('dialog', { name: 'Edit Saved Field Host' });
  await expect(editBuilder).toBeVisible();
  await openConstraints(page);
  await expect(page.getByLabel('Optional Custom Constraints')).toHaveValue('');
});

test('unfinished Outfit Builder work requires confirmed discard before returning to Outfit selection', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto('/studio/create');
  await page.getByRole('button', { name: 'Select Outfit' }).click();
  const selector = page.getByRole('dialog', { name: 'Outfit' });
  await selector.getByRole('button', { name: 'Create new outfit' }).click();
  const builder = page.getByRole('dialog', { name: 'Create a new outfit' });
  await builder.getByLabel('Garment direction').fill('An unfinished garment direction.');
  await expect(builder.locator('[data-outfit-builder-dirty]')).toHaveAttribute(
    'data-outfit-builder-dirty',
    'true',
  );

  // Declining the discard keeps the unfinished draft on screen.
  await builder.getByRole('button', { name: 'Close panel' }).click();
  const discardPrompt = page.getByRole('dialog', {
    name: 'Discard the unfinished outfit changes?',
  });
  await expect(discardPrompt).toBeVisible();
  await expect(discardPrompt).toContainText('The draft cannot be recovered.');
  await discardPrompt.getByRole('button', { name: 'Keep editing' }).click();
  await expect(discardPrompt).toBeHidden();
  await expect(builder).toBeVisible();

  // Only an explicit discard returns to Outfit selection.
  await builder.getByRole('button', { name: 'Close panel' }).click();
  await page
    .getByRole('dialog', { name: 'Discard the unfinished outfit changes?' })
    .getByRole('button', { name: 'Discard changes' })
    .click();
  await expect(selector).toBeVisible();
  expect((await readBrowserState(page)).cameraCalls).toBe(0);
  expectNoExternalProviderTraffic(network);
});
