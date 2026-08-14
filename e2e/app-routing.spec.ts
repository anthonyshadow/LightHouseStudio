import { expect, test, type Page } from '@playwright/test';
import type { CreativeAssetStore } from '@studio/domain';
import {
  CREATIVE_ASSET_STORAGE_KEY,
  expectNoExternalProviderTraffic,
  installSuccessfulStudioHarness,
  openCharacterOptions,
  readBrowserState,
  readCreativeAssetStore,
  startLocalPreview,
} from './support/studioHarness';
import { ENTRY_PATH, STUDIO_PATH } from './support/studioRoutes';
import { installProjectHarness, TEST_PROJECT_ID } from './support/projectHarness';
import { installCampaignHarness, TEST_CAMPAIGN_ID } from './support/campaignHarness';
import { loadDecodableH264VideoFixture } from './support/existingVideoHarness';

const loginFromEntry = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Log in' }).click();
  const dialog = page.getByRole('dialog', { name: 'Log in to Lightframe' });
  await expect(dialog.getByLabel('Login')).toHaveValue('demo@lightframe.local');
  await expect(dialog.getByLabel('Password')).toHaveValue('lightframe-demo');
  await dialog.getByRole('button', { name: 'Log in' }).click();
};

const SEEDED_PROJECT_CREATIVE_STORE = {
  schemaVersion: 7,
  savedPrompts: [],
  recentPrompts: [],
  savedCharacterPrompts: [
    {
      id: 'project-field-host',
      name: 'Project Field Host',
      prompt: 'An adult documentary field host in a structured amber jacket.',
      source: 'generator',
      promptIntent: 'character-transform',
      builderDraft: {
        intent: 'character-transform',
        presetId: null,
        customDetails: '',
        adultAge: 'adult',
        gender: null,
        characterBase: 'documentary field host',
        matchReference: false,
        appearance: 'natural editorial complexion',
        ethnicity: '',
        skinTone: '',
        bodyShape: '',
        hair: '',
        hairColor: '',
        outfit: 'structured amber jacket',
        accessories: '',
        expression: 'focused half-smile',
        mood: 'grounded',
        preserve: 'camera framing',
      },
      guidedDesign: null,
      referenceImageStatus: 'prompt-only',
      referenceImageAssetId: null,
      uploadedReferenceImageAssetId: null,
      finalReferenceKind: null,
      selectedWardrobeVariantId: null,
      defaultVoice: null,
      notes: '',
      tags: ['project'],
      createdAt: '2026-08-13T12:00:00.000Z',
      updatedAt: '2026-08-13T12:00:00.000Z',
      lastUsedAt: '2026-08-13T12:00:00.000Z',
      useCount: 1,
    },
  ],
  savedCharacterVariants: [],
} satisfies CreativeAssetStore;

test('entry stays provider-free and Login opens a focused Studio runtime', async ({ page }) => {
  const network = await installSuccessfulStudioHarness(page);
  await page.goto(ENTRY_PATH);

  await expect(page).toHaveTitle('Enter Lightframe Studio');
  await expect(page.getByRole('heading', { name: 'Enter Lightframe Studio' })).toBeAttached();
  const enter = page.getByRole('button', { name: 'Log in' });
  await expect(enter).toBeVisible();
  await expect(page.getByLabel('Studio media stage')).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow');
  expect(network.apiRequests).toEqual([]);
  expectNoExternalProviderTraffic(network);
  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({
      cameraCalls: 0,
      requirementModels: [],
      connections: [],
      recorderStarts: 0,
    });

  await loginFromEntry(page);
  await expect(page).toHaveURL(new RegExp(`${STUDIO_PATH}$`, 'u'));
  await expect(page).toHaveTitle('Lightframe Studio');
  await expect(page.locator('#studio-main')).toBeFocused();
  await expect(page.getByLabel('Studio media stage')).toBeVisible();
});

test('Back and Forward restore focus at each application boundary', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(ENTRY_PATH);
  await loginFromEntry(page);
  await expect(page.locator('#studio-main')).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('button', { name: 'Enter Studio' })).toBeFocused();

  await page.goForward();
  await expect(page).toHaveURL(/\/studio$/u);
  await expect(page.locator('#studio-main')).toBeFocused();
});

test('direct and refreshed Studio entries preserve one stage', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(STUDIO_PATH);
  await expect(page.getByLabel('Studio media stage')).toHaveCount(1);

  await page.reload();
  await expect(page).toHaveURL(/\/studio$/u);
  await expect(page.getByLabel('Studio media stage')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Record New Video' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload Video' })).toBeVisible();
  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({ cameraCalls: 0, requirementModels: [], connections: [] });
});

test('saved video, character, and outfit routes preserve the shared Studio stage', async ({
  page,
}) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(STUDIO_PATH);
  const stageVideo = page.getByLabel('Studio media stage').locator('video');
  await stageVideo.evaluate((video) => {
    (window as typeof window & { __sharedLibraryStage?: HTMLVideoElement }).__sharedLibraryStage =
      video as HTMLVideoElement;
  });

  for (const library of [
    { label: 'Saved Videos', path: '/studio/videos', empty: 'No saved videos yet' },
    { label: 'Saved Characters', path: '/studio/characters', empty: 'No saved characters yet' },
    { label: 'Saved Outfits', path: '/studio/outfits', empty: 'No saved outfits yet' },
  ]) {
    await page.getByRole('button', { name: 'Lightframe Demo account menu' }).click();
    await page.getByRole('menuitem', { name: library.label }).click();
    await expect(page).toHaveURL(new RegExp(`${library.path}$`, 'u'));
    const dialog = page.getByRole('dialog', { name: library.label });
    await expect(dialog.getByRole('heading', { name: library.empty })).toBeVisible();
    if (library.path === '/studio/characters') {
      await expect(dialog.getByRole('button', { name: 'Create new character' })).toBeVisible();
    }
    expect(
      await stageVideo.evaluate(
        (video) =>
          (window as typeof window & { __sharedLibraryStage?: HTMLVideoElement })
            .__sharedLibraryStage === video,
      ),
    ).toBe(true);
    await dialog.getByRole('button', { name: 'Close panel' }).click();
    await expect(page).toHaveURL(/\/studio$/u);
  }
});

test('Projects Quick Start, lifecycle, refresh, and explicit library exit stay in one Studio shell', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  const projects = await installProjectHarness(page);
  await page.goto('/studio/projects');

  await expect(page).toHaveTitle('Projects · Lightframe Studio');
  await expect(page.getByText('No active Projects yet', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Studio media stage')).toHaveCount(1);
  await expect(page.getByLabel('Studio media stage')).toBeHidden();
  await page.getByRole('button', { name: 'Quick Start' }).click();

  await expect(page).toHaveURL(new RegExp(`/studio/projects/${TEST_PROJECT_ID}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'No source yet' })).toBeVisible();
  expect(projects.operationKeys).toHaveLength(1);
  expect(projects.operationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({ cameraCalls: 0, requirementModels: [], connections: [], recorderStarts: 0 });

  await page.getByRole('button', { name: 'Rename' }).click();
  const rename = page.getByRole('dialog', { name: 'Rename Project' });
  await rename.getByRole('textbox', { name: /Project name/u }).fill('Launch edit');
  await rename.getByRole('button', { name: 'Rename Project' }).click();
  await expect(page.getByRole('heading', { name: 'Launch edit' })).toBeVisible();

  await page.getByRole('button', { name: 'Archive' }).click();
  await page
    .getByRole('dialog', { name: 'Archive Project' })
    .getByRole('button', { name: 'Archive Project' })
    .click();
  await expect(page.getByText('Archived', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Launch edit' })).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page
    .getByRole('dialog', { name: 'Restore Project' })
    .getByRole('button', { name: 'Restore Project' })
    .click();
  await expect(page.getByText('Draft', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Lightframe Demo account menu' }).click();
  await expect(page.getByText('Global libraries · exits Project')).toBeVisible();
  await page.getByRole('menuitem', { name: 'Saved Videos (exits Project)' }).click();
  await expect(page).toHaveURL(/\/studio\/videos$/u);
  await page.reload();
  await expect(page).toHaveURL(/\/studio\/videos$/u);
  await expect(page.getByRole('dialog', { name: 'Saved Videos' })).toBeVisible();
  expectNoExternalProviderTraffic(network);
});

test('an uploaded Project source accepts once and resumes on the same stage after refresh', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  const projects = await installProjectHarness(page, true);
  const fixture = await loadDecodableH264VideoFixture();
  await page.goto(`/studio/projects/${TEST_PROJECT_ID}`);

  const stage = page.getByLabel('Studio media stage');
  const stageVideo = stage.locator('video');
  await expect(stage).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No source yet' })).toBeVisible();
  await page.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
    name: 'project-source.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  });

  await expect(page.getByRole('heading', { name: 'Immutable original' })).toBeVisible();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await expect(stageVideo).toHaveAttribute('src', /^blob:/u);
  const firstObjectUrl = await stageVideo.getAttribute('src');
  expect(projects.sourceOperationKeys).toHaveLength(1);
  expect(projects.sourceOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Immutable original' })).toBeVisible();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await expect(stageVideo).toHaveAttribute('src', /^blob:/u);
  expect(await stageVideo.getAttribute('src')).not.toBe(firstObjectUrl);
  await expect(page.getByRole('button', { name: 'Upload' })).toBeDisabled();
  expect(projects.sourceOperationKeys).toHaveLength(1);
  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({ requirementModels: [], connections: [] });
  expectNoExternalProviderTraffic(network);
});

test('an accepted Project operation reconnects after refresh and presents its retained result without resubmission', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  const projects = await installProjectHarness(page, true, {
    completeProcessingAfterReopen: true,
  });
  await page.addInitScript(
    ({ storageKey, store }) => window.localStorage.setItem(storageKey, JSON.stringify(store)),
    { storageKey: CREATIVE_ASSET_STORAGE_KEY, store: SEEDED_PROJECT_CREATIVE_STORE },
  );
  const fixture = await loadDecodableH264VideoFixture();
  await page.goto(`/studio/projects/${TEST_PROJECT_ID}`);
  await page.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
    name: 'project-processing-source.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  });
  await expect(page.getByRole('heading', { name: 'Immutable original' })).toBeVisible();

  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  await page
    .getByRole('dialog', { name: 'Recipe Shelf' })
    .getByRole('button', { name: 'Use Project Field Host' })
    .click();
  await page.getByRole('button', { name: 'Save creative setup' }).click();
  await expect(page.getByText('Creative setup saved as one Project checkpoint.')).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Creative workspace tools' })
    .getByRole('button', { name: 'Edit Video', exact: true })
    .click();
  const existingVideo = page.getByRole('dialog', { name: 'Use existing video' });
  await expect(
    existingVideo.getByRole('button', { name: 'Start Project Character Swap' }),
  ).toBeEnabled();
  await existingVideo.getByRole('button', { name: 'Start Project Character Swap' }).click();

  await expect.poll(() => projects.processingOperationKeys).toHaveLength(1);
  expect(projects.processingOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  expect(projects.processingProviderIntents).toEqual(['video']);
  await existingVideo.getByRole('button', { name: 'Close panel' }).click();
  await page.getByRole('button', { name: 'Archive' }).click();
  const archive = page.getByRole('dialog', { name: 'Archive Project' });
  await expect(archive.getByRole('button', { name: 'Archive Project' })).toBeDisabled();
  await expect(archive).toContainText('accepted provider work is active');
  await expect(archive).toContainText('accepted remote work may continue');
  await archive.getByRole('button', { name: 'Cancel' }).click();
  await page.reload();

  await expect(page.getByText('Character Swap accepted / queued', { exact: true })).toBeVisible();
  await expect(page.getByText('Result ready', { exact: true })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Revision 5', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Studio media stage').locator('video')).toHaveAttribute(
    'src',
    /^blob:/u,
  );
  expect(projects.processingOperationKeys).toHaveLength(1);
  expect(projects.processingReconcileCount).toBeGreaterThanOrEqual(1);
  expect(network.apiRequests.some(({ path }) => path.startsWith('/api/video-jobs'))).toBe(false);
  expectNoExternalProviderTraffic(network);
});

test('a Project checkpoints a reusable Character, adopts a local render, and refreshes without provider contact', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  const projects = await installProjectHarness(page, true);
  await page.addInitScript(
    ({ storageKey, store }) => window.localStorage.setItem(storageKey, JSON.stringify(store)),
    { storageKey: CREATIVE_ASSET_STORAGE_KEY, store: SEEDED_PROJECT_CREATIVE_STORE },
  );
  const fixture = await loadDecodableH264VideoFixture();
  await page.goto(`/studio/projects/${TEST_PROJECT_ID}`);
  await page.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
    name: 'project-edit-source.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  });
  await expect(page.getByRole('heading', { name: 'Immutable original' })).toBeVisible();

  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  const shelf = page.getByRole('dialog', { name: 'Recipe Shelf' });
  await shelf.getByRole('button', { name: 'Use Project Field Host' }).click();
  await expect(shelf).not.toBeVisible();
  const creativeStore = await readCreativeAssetStore(page);
  const selectedCharacter = creativeStore?.savedCharacterPrompts.find(
    (character) => character.id === 'project-field-host',
  );
  expect(selectedCharacter).toBeDefined();
  await page.getByRole('button', { name: 'Save creative setup' }).click();
  await expect(page.getByText('Creative setup saved as one Project checkpoint.')).toBeVisible();
  expect(projects.checkpointRequests).toHaveLength(1);
  expect(projects.checkpointRequests[0]?.proposal.selectedCharacter).toMatchObject({
    characterId: 'project-field-host',
    characterLabel: 'Project Field Host',
    characterRevision: selectedCharacter?.updatedAt,
  });
  await expect(page.getByText('Project Field Host changed after this checkpoint.')).toHaveCount(0);

  await page
    .getByRole('navigation', { name: 'Creative workspace tools' })
    .getByRole('button', { name: 'Edit Video', exact: true })
    .click();
  const existingVideo = page.getByRole('dialog', { name: 'Use existing video' });
  await expect(existingVideo).toBeVisible();
  await existingVideo.getByRole('button', { name: 'Adjust video' }).click();
  await page.getByRole('button', { name: 'Lighting', exact: true }).click();
  await page.getByRole('slider', { name: 'Brightness' }).fill('12');
  await page.getByRole('button', { name: 'Render preview' }).click();

  const adoption = page.getByRole('dialog', {
    name: 'Adopt Render preview as Project working media?',
  });
  await expect(adoption).toBeVisible({ timeout: 60_000 });
  await adoption.getByRole('button', { name: 'Adopt as working media' }).click();
  await expect(adoption).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('Durable working media ready', { exact: true })).toBeVisible();
  await expect(page.getByText('No Saved Video or Video Version was created')).toBeVisible();
  expect(projects.workingMediaOperationKeys).toHaveLength(1);
  expect(projects.workingMediaOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);

  await page.getByRole('button', { name: 'Save creative setup' }).click();
  await expect(page.getByText('Revision 5', { exact: true })).toBeVisible();
  expect(projects.checkpointRequests).toHaveLength(2);

  await page.reload();
  await expect(page.getByText('Revision 5', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Immutable original' })).toBeVisible();
  await expect(page.getByLabel('Studio media stage').locator('video')).toHaveAttribute(
    'src',
    /^blob:/u,
  );
  expect(projects.checkpointRequests).toHaveLength(2);
  expect(projects.workingMediaOperationKeys).toHaveLength(1);
  expectNoExternalProviderTraffic(network);
});

test('Campaign creation reaches a Campaign Project without activating media or providers', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  const campaigns = await installCampaignHarness(page);
  await page.goto('/studio/campaigns');

  await expect(page).toHaveTitle('Campaigns · Lightframe Studio');
  await expect(page.getByText('No Campaigns yet', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Studio media stage')).toBeHidden();
  await page.getByRole('button', { name: 'Create Campaign' }).click();
  const create = page.getByRole('dialog', { name: 'Create Campaign' });
  await create.getByRole('textbox', { name: /Campaign name/u }).fill('Summer launch');
  await create.getByRole('textbox', { name: /Brief/u }).fill('Keep the launch focused.');
  await create.getByRole('button', { name: 'Create Campaign' }).click();

  await expect(page).toHaveURL(new RegExp(`/studio/campaigns/${TEST_CAMPAIGN_ID}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'Summer launch' })).toBeVisible();
  await page.getByRole('button', { name: 'New Project' }).click();
  await expect(page).toHaveURL(new RegExp(`/studio/projects/${TEST_PROJECT_ID}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'No source yet' })).toBeVisible();
  expect(campaigns.campaignOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  expect(campaigns.projectOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({ cameraCalls: 0, requirementModels: [], connections: [], recorderStarts: 0 });
  expectNoExternalProviderTraffic(network);
});

test('a protected Project deep link returns to the same URL after login', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await installProjectHarness(page, true);
  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({
        error: { code: 'authentication_required', message: 'Sign in to continue.' },
      }),
    });
  });
  await page.goto(`/studio/projects/${TEST_PROJECT_ID}`);

  const login = page.getByRole('dialog', { name: 'Log in to Lightframe' });
  await expect(login).toBeVisible();
  await login.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(new RegExp(`/studio/projects/${TEST_PROJECT_ID}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'No source yet' })).toBeVisible();
});

test('recording and temporary-take work cannot be lost silently through Back', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(ENTRY_PATH);
  await loginFromEntry(page);
  await startLocalPreview(page);
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/studio$/u);
  await expect(page.getByRole('dialog', { name: 'Finish the take before leaving' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay in Studio' }).click();
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();

  await page.goBack();
  const discard = page.getByRole('dialog', { name: 'Discard temporary work and leave?' });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Discard and leave' }).click();
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole('button', { name: 'Enter Studio' })).toBeVisible();
});
