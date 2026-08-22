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
import {
  CAMPAIGNS_PATH,
  DASHBOARD_PATH,
  ENTRY_PATH,
  LEGACY_CAMPAIGNS_PATH,
  STUDIO_PATH,
} from './support/studioRoutes';
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

const openProjectTask = async (
  page: Page,
  task: 'Original' | 'Create' | 'Save' | 'History',
): Promise<void> => {
  await page.getByRole('tab', { name: task, exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: task, exact: true })).toBeVisible();
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

test('entry stays provider-free and Login opens Dashboard without starting media', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page, { initiallyAuthenticated: false });
  await page.goto(ENTRY_PATH);

  await expect(page).toHaveTitle('Enter Lightframe Studio');
  await expect(page.getByRole('heading', { name: 'Lightframe' })).toBeAttached();
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
  await expect(page).toHaveURL(new RegExp(`${DASHBOARD_PATH}$`, 'u'));
  await expect(page).toHaveTitle('Dashboard · Lightframe');
  await expect(page.locator('#studio-main')).toBeFocused();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByLabel('Studio media stage')).toHaveCount(0);
});

test('the pre-rename singular Campaign URLs redirect to their canonical plural paths', async ({
  page,
}) => {
  await installSuccessfulStudioHarness(page);
  await installCampaignHarness(page, true);

  await page.goto(LEGACY_CAMPAIGNS_PATH);
  await expect(page).toHaveURL(new RegExp(`${CAMPAIGNS_PATH}$`, 'u'));
  await expect(page).toHaveTitle('Campaigns · Lightframe Studio');

  await page.goto(`${LEGACY_CAMPAIGNS_PATH}/${TEST_CAMPAIGN_ID}`);
  await expect(page).toHaveURL(new RegExp(`${CAMPAIGNS_PATH}/${TEST_CAMPAIGN_ID}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'Summer launch' })).toBeVisible();
});

test('Back and Forward restore focus across canonical organization routes', async ({ page }) => {
  await installSuccessfulStudioHarness(page, { initiallyAuthenticated: false });
  await page.goto(ENTRY_PATH);
  await loginFromEntry(page);
  await expect(page.locator('#studio-main')).toBeFocused();

  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await expect(page).toHaveURL(/\/assets$/u);
  await expect(page.locator('#studio-main')).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${DASHBOARD_PATH}$`, 'u'));
  await expect(page.locator('#studio-main')).toBeFocused();

  await page.goForward();
  await expect(page).toHaveURL(/\/assets$/u);
  await expect(page.locator('#studio-main')).toBeFocused();
});

test('direct and refreshed Studio entries preserve one stage', async ({ page }) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(STUDIO_PATH);
  await expect(page.getByLabel('Studio media stage')).toHaveCount(1);

  await page.reload();
  await expect(page).toHaveURL(new RegExp(`${STUDIO_PATH}$`, 'u'));
  await expect(page.getByLabel('Studio media stage')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Start camera' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload Video' })).toBeVisible();
  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({ cameraCalls: 0, requirementModels: [], connections: [] });
});

test('Asset libraries open with no Studio stage and hand a selection back to it', async ({
  page,
}) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(STUDIO_PATH);
  await expect(page.getByLabel('Studio media stage')).toHaveCount(1);

  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  for (const library of [
    { label: 'Videos', path: '/assets/videos', empty: 'No videos in Assets yet' },
    { label: 'Characters', path: '/assets/characters', empty: 'No saved characters yet' },
    { label: 'Outfits', path: '/assets/outfits', empty: 'No saved outfits yet' },
  ]) {
    await page.getByRole('button', { name: `Open ${library.label}` }).click();
    await expect(page).toHaveURL(new RegExp(`${library.path}$`, 'u'));
    const dialog = page.getByRole('dialog', { name: library.label });
    await expect(dialog.getByRole('heading', { name: library.empty })).toBeVisible();
    if (library.path === '/assets/characters') {
      await expect(dialog.getByRole('button', { name: 'Create new character' })).toBeVisible();
    }
    // A library needs no camera, so it gets none: the stage is absent, not hidden behind CSS.
    await expect(page.getByLabel('Studio media stage')).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Close panel' }).click();
    await expect(page).toHaveURL(/\/assets$/u);
  }

  // Creating from a library still lands in Studio with the runtime mounted, which is the path the
  // shell's handoff channel exists to serve.
  await page.getByRole('button', { name: 'Open Characters' }).click();
  await page
    .getByRole('dialog', { name: 'Characters' })
    .getByRole('button', { name: 'Create new character' })
    .click();
  await expect(page).toHaveURL(new RegExp(`${STUDIO_PATH}$`, 'u'));
  await expect(page.getByLabel('Studio media stage')).toHaveCount(1);
  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({ cameraCalls: 0, connections: [] });
});

test('closing an Asset library consumes its history entry instead of stacking the hub', async ({
  page,
}) => {
  await installSuccessfulStudioHarness(page);
  await page.goto(DASHBOARD_PATH);
  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await expect(page).toHaveURL(/\/assets$/u);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.getByRole('button', { name: 'Open Videos' }).click();
    await expect(page).toHaveURL(/\/assets\/videos$/u);
    await page
      .getByRole('dialog', { name: 'Videos' })
      .getByRole('button', { name: 'Close panel' })
      .click();
    await expect(page).toHaveURL(/\/assets$/u);
  }

  // Three open/close pairs used to bury the Dashboard under six entries.
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${DASHBOARD_PATH}$`, 'u'));
});

test('Projects quick creation, lifecycle, refresh, and explicit Assets exit keep one shell', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  const projects = await installProjectHarness(page);
  await page.goto('/projects');

  await expect(page).toHaveTitle('Projects · Lightframe Studio');
  await expect(page.getByText('No active Projects yet', { exact: true })).toBeVisible();
  // The Projects list owns no live media, so no stage is mounted for it at all.
  await expect(page.getByLabel('Studio media stage')).toHaveCount(0);
  await page.getByRole('button', { name: 'New Project' }).click();
  await page.getByRole('button', { name: 'Create without a name' }).click();

  await expect(page).toHaveURL(new RegExp(`/projects/${TEST_PROJECT_ID}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'Untitled Project' })).toBeVisible();
  await expect(page.getByText('No original video yet • Choose one below to begin.')).toBeVisible();
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

  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await page.getByRole('button', { name: 'Open Videos' }).click();
  await expect(page).toHaveURL(/\/assets\/videos$/u);
  await page.reload();
  await expect(page).toHaveURL(/\/assets\/videos$/u);
  await expect(page.getByRole('dialog', { name: 'Videos' })).toBeVisible();
  expectNoExternalProviderTraffic(network);
});

test('Project overview gives the title the full tablet content width', async ({ page }) => {
  await page.setViewportSize({ width: 834, height: 1112 });
  await installSuccessfulStudioHarness(page);
  await installProjectHarness(page, true);
  await page.goto(`/projects/${TEST_PROJECT_ID}`);

  const title = page.getByRole('heading', { name: 'Untitled Project' });
  const identity = page.locator('[data-detail-identity]');
  const actions = page.locator('[data-detail-actions]');
  await expect(title).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Add original video' })).toBeVisible();

  const [titleBox, identityBox, actionsBox] = await Promise.all([
    title.boundingBox(),
    identity.boundingBox(),
    actions.boundingBox(),
  ]);
  expect(titleBox).not.toBeNull();
  expect(identityBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(Math.abs(titleBox!.width - identityBox!.width)).toBeLessThanOrEqual(2);
  expect(actionsBox!.y).toBeGreaterThan(titleBox!.y + titleBox!.height);
});

test('an uploaded Project source accepts once and resumes on the same stage after refresh', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  const projects = await installProjectHarness(page, true);
  const fixture = await loadDecodableH264VideoFixture();
  await page.goto(`/projects/${TEST_PROJECT_ID}/workspace`);

  const stage = page.getByLabel('Studio media stage');
  const stageVideo = stage.locator('video');
  await expect(stage).toBeVisible();
  await expect(page.getByRole('heading', { name: 'No original video yet' })).toBeVisible();
  await page.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
    name: 'project-source.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  });

  await expect(page.getByRole('heading', { name: 'Original video ready' })).toBeVisible();
  await expect(page.getByText('Autosaved', { exact: true })).toBeVisible();
  await expect(stageVideo).toHaveAttribute('src', /^blob:/u);
  const firstObjectUrl = await stageVideo.getAttribute('src');
  expect(projects.sourceOperationKeys).toHaveLength(1);
  expect(projects.sourceOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);

  await page.reload();
  // Reopening a Project with a source lands on Create, the step it is now up to, so ask for the
  // Source task explicitly to check what the refresh restored.
  await openProjectTask(page, 'Original');
  await expect(page.getByRole('heading', { name: 'Original video ready' })).toBeVisible();
  await expect(page.getByText('Autosaved', { exact: true })).toBeVisible();
  // Reopening streams the accepted source from its ranged content route rather than downloading
  // it into a Blob, so the stage binds the app-owned URL instead of a fresh object URL.
  await expect(stageVideo).toHaveAttribute('src', /\/source\/content$/u);
  expect(await stageVideo.getAttribute('src')).not.toBe(firstObjectUrl);
  await expect(page.getByRole('button', { name: 'Upload' })).toBeDisabled();
  expect(projects.sourceOperationKeys).toHaveLength(1);

  // The wrong source is recoverable without deleting the Project: remove it and choose again.
  await page.getByRole('button', { name: 'Remove original video' }).click();
  const removeDialog = page.getByRole('dialog', { name: 'Remove original video' });
  await expect(removeDialog).toBeVisible();
  await removeDialog.getByRole('button', { name: 'Remove original video' }).click();

  await expect(page.getByRole('heading', { name: 'No original video yet' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload' })).toBeEnabled();
  await page.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
    name: 'replacement-source.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  });
  await expect(page.getByRole('heading', { name: 'Original video ready' })).toBeVisible();
  await expect(page.getByText('replacement-source.mp4')).toBeVisible();
  expect(projects.sourceOperationKeys).toHaveLength(2);
  expect(projects.sourceOperationKeys[1]).not.toBe(projects.sourceOperationKeys[0]);

  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({ requirementModels: [], connections: [] });
  expectNoExternalProviderTraffic(network);
});

test('a Project saves exact Versions, reconciles response loss, and retains truthful history', async ({
  page,
}) => {
  const network = await installSuccessfulStudioHarness(page);
  const projects = await installProjectHarness(page, true, {
    includeUnassignedVideo: true,
    loseAppendOutputResponseOnce: true,
  });
  const fixture = await loadDecodableH264VideoFixture();
  await page.goto(`/projects/${TEST_PROJECT_ID}/workspace`);
  await page.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
    name: 'project-output-source.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  });
  await openProjectTask(page, 'Save');
  await expect(page.getByRole('heading', { name: 'Review and save' })).toBeVisible();

  await page.getByRole('button', { name: 'Save as New Video' }).click();
  const createDialog = page.getByRole('dialog', { name: 'Save as New Video' });
  await createDialog.getByLabel('Video title').fill('Launch master');
  await createDialog.getByRole('button', { name: 'Save as New Video' }).click();
  await expect(page.getByText('Saved “Launch master” as Version 1.')).toBeVisible();
  expect(projects.outputRequests[0]?.target).toEqual({ kind: 'new', title: 'Launch master' });

  await page.getByRole('button', { name: 'Add Version' }).click();
  const picker = page.getByRole('dialog', { name: 'Choose Add Version target' });
  await expect(picker.getByText('Launch master', { exact: true })).toBeVisible();
  await picker.getByRole('button', { name: /Launch master/u }).click();
  const confirmation = page.getByRole('dialog', { name: 'Confirm Add Version' });
  await expect(confirmation).toContainText('Current Version 1');
  await confirmation.getByRole('button', { name: 'Add Version' }).click();
  await expect(page.getByText('The save reply never arrived.')).toBeVisible();
  expect(projects.outputOperationKeys).toHaveLength(2);
  expect(projects.outputRequests[1]?.target).toMatchObject({ kind: 'version' });

  const pendingOperationId = projects.outputOperationKeys[1];
  await page.reload();
  await openProjectTask(page, 'Save');
  await expect(page.getByText('Added Version 2 to “Launch master”.')).toBeVisible();
  await expect(page.getByText('Completed', { exact: true })).toBeVisible();
  expect(projects.outputOperationKeys).toHaveLength(3);
  expect(projects.outputOperationKeys[2]).toBe(pendingOperationId);
  expect(projects.outputRequests[2]).toEqual(projects.outputRequests[1]);

  await openProjectTask(page, 'History');
  const versionHistory = page.getByRole('list', { name: 'Saved video Version history' });
  const olderVersion = versionHistory.getByRole('listitem').filter({ hasText: 'Version 1' });
  await expect(
    page.getByRole('heading', { name: 'Processing attempts and results' }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Project changes' })).toBeVisible();
  await expect(olderVersion).toContainText('Saved at change 2');
  await expect(versionHistory).toContainText('Version 2 · Current in Saved Videos');

  const [firstDownload] = await Promise.all([
    page.waitForEvent('download'),
    olderVersion.getByRole('link', { name: 'Download Launch master, Version 1' }).click(),
  ]);
  expect(firstDownload.suggestedFilename()).toBe('project-output-source.mp4');

  await olderVersion.getByRole('button', { name: 'Preview Version 1' }).click();
  const versionPreview = page.getByRole('dialog', { name: 'Launch master · Version 1' });
  await expect(versionPreview.getByLabel('Preview of Launch master, Version 1')).toBeVisible();
  await versionPreview.getByRole('button', { name: 'Use in Project' }).click();
  await expect(
    page.getByText(/original video and the video’s current version were not changed/u),
  ).toBeVisible();
  expect(projects.reuseOperationKeys).toHaveLength(1);
  await page.keyboard.press('Escape');

  await openProjectTask(page, 'Save');
  await page.getByRole('button', { name: 'Add Version' }).click();
  await expect(page.getByRole('dialog', { name: 'Choose Add Version target' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('button', { name: 'Assets', exact: true }).click();
  await page.getByRole('button', { name: 'Open Videos' }).click();
  const gallery = page.getByRole('dialog', { name: 'Videos' });
  await expect(gallery.getByText('No Project').first()).toBeVisible();
  await expect(gallery.getByRole('heading', { name: 'Legacy unassigned' })).toBeVisible();
  await expect(gallery.getByRole('link', { name: /^Download / }).first()).toBeVisible();

  await gallery.getByLabel('More actions for Launch master').click();
  await gallery.getByRole('button', { name: 'Remove from Assets' }).click();
  await page
    .getByRole('dialog', { name: 'Remove video from Assets' })
    .getByRole('button', { name: 'Remove from Assets' })
    .click();
  await expect(gallery.getByRole('heading', { name: 'Launch master' })).toHaveCount(0);

  await page.goto(`/projects/${TEST_PROJECT_ID}/workspace`);
  await openProjectTask(page, 'History');
  const retainedHistory = page.getByRole('list', { name: 'Saved video Version history' });
  const retainedOlderVersion = retainedHistory
    .getByRole('listitem')
    .filter({ hasText: 'Version 1' });
  await expect(retainedOlderVersion).toContainText('Removed from your videos');
  const [retainedDownload] = await Promise.all([
    page.waitForEvent('download'),
    retainedOlderVersion.getByRole('link', { name: 'Download Launch master, Version 1' }).click(),
  ]);
  expect(retainedDownload.suggestedFilename()).toBe('project-output-source.mp4');
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
  await page.goto(`/projects/${TEST_PROJECT_ID}/workspace`);
  await page.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
    name: 'project-processing-source.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  });
  await expect(page.getByRole('heading', { name: 'Original video ready' })).toBeVisible();

  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  await page
    .getByRole('dialog', { name: 'Characters' })
    .getByRole('article')
    .filter({ hasText: 'Project Field Host' })
    .getByRole('button', { name: 'Use in Studio' })
    .click();
  await openProjectTask(page, 'Create');
  await page.getByRole('button', { name: 'Save progress' }).click();
  await expect(
    page.getByText('Progress saved. Saving on its own starts no paid AI work.'),
  ).toBeVisible();
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
  await expect(existingVideo).toBeHidden();
  await page.getByRole('button', { name: '← Project overview' }).click();
  await page.getByRole('button', { name: 'Archive' }).click();
  const archive = page.getByRole('dialog', { name: 'Archive Project' });
  await expect(archive.getByRole('button', { name: 'Archive Project' })).toBeDisabled();
  await expect(archive).toContainText('accepted provider work is running');
  await expect(archive).toContainText('accepted remote work may continue');
  await archive.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Continue editing' }).click();
  await page.reload();

  await openProjectTask(page, 'Create');
  await expect(page.getByText('Character Swap accepted / queued', { exact: true })).toBeVisible();
  await expect(page.getByText('Result ready', { exact: true })).toBeVisible({ timeout: 15_000 });
  // After a refresh the retained result is streamed from its content route, not re-downloaded.
  await expect(page.getByLabel('Studio media stage').locator('video')).toHaveAttribute(
    'src',
    /\/content$/u,
  );
  await openProjectTask(page, 'History');
  await expect(
    page.getByRole('tabpanel', { name: 'History' }).getByText(/^Change 5 ·/u),
  ).toBeVisible();
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
  await page.goto(`/projects/${TEST_PROJECT_ID}/workspace`);
  await page.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
    name: 'project-edit-source.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  });
  await expect(page.getByRole('heading', { name: 'Original video ready' })).toBeVisible();

  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  const characters = page.getByRole('dialog', { name: 'Characters' });
  await characters
    .getByRole('article')
    .filter({ hasText: 'Project Field Host' })
    .getByRole('button', { name: 'Use in Studio' })
    .click();
  await expect(characters).not.toBeVisible();
  await openProjectTask(page, 'Create');
  const creativeStore = await readCreativeAssetStore(page);
  const selectedCharacter = creativeStore?.savedCharacterPrompts.find(
    (character) => character.id === 'project-field-host',
  );
  expect(selectedCharacter).toBeDefined();
  await page.getByRole('button', { name: 'Save progress' }).click();
  await expect(
    page.getByText('Progress saved. Saving on its own starts no paid AI work.'),
  ).toBeVisible();
  expect(projects.checkpointRequests).toHaveLength(1);
  expect(projects.checkpointRequests[0]?.proposal.selectedCharacter).toMatchObject({
    characterId: 'project-field-host',
    characterLabel: 'Project Field Host',
    characterRevision: selectedCharacter?.updatedAt,
  });
  await expect(page.getByText('Project Field Host changed after you saved progress.')).toHaveCount(
    0,
  );

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
    name: 'Make this render the current cut?',
  });
  await expect(adoption).toBeVisible({ timeout: 60_000 });
  await adoption.getByRole('button', { name: 'Use as the current cut' }).click();
  await expect(adoption).toBeHidden({ timeout: 30_000 });
  await expect(page.getByText('Current cut ready', { exact: true })).toBeVisible();
  await expect(page.getByText('No video or version was saved')).toBeVisible();
  expect(projects.workingMediaOperationKeys).toHaveLength(1);
  expect(projects.workingMediaOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);

  await page.getByRole('button', { name: 'Save progress' }).click();
  expect(projects.checkpointRequests).toHaveLength(2);
  await openProjectTask(page, 'History');
  await expect(
    page.getByRole('tabpanel', { name: 'History' }).getByText(/^Change 5 ·/u),
  ).toBeVisible();

  await page.reload();
  await openProjectTask(page, 'History');
  await expect(
    page.getByRole('tabpanel', { name: 'History' }).getByText(/^Change 5 ·/u),
  ).toBeVisible();
  await openProjectTask(page, 'Original');
  await expect(page.getByRole('heading', { name: 'Original video ready' })).toBeVisible();
  // The adopted cut is streamed from its content route after the refresh, never buffered first.
  await expect(page.getByLabel('Studio media stage').locator('video')).toHaveAttribute(
    'src',
    /\/content$/u,
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
  await page.goto(CAMPAIGNS_PATH);

  await expect(page).toHaveTitle('Campaigns · Lightframe Studio');
  await expect(page.getByText('No Campaigns yet', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Studio media stage')).toHaveCount(0);
  await page.getByRole('button', { name: 'Create Campaign' }).click();
  const create = page.getByRole('dialog', { name: 'Create Campaign' });
  await create.getByRole('textbox', { name: /Campaign name/u }).fill('Summer launch');
  await create.getByRole('textbox', { name: /Brief/u }).fill('Keep the launch focused.');
  await create.getByRole('button', { name: 'Create Campaign' }).click();

  await expect(page).toHaveURL(new RegExp(`${CAMPAIGNS_PATH}/${TEST_CAMPAIGN_ID}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'Summer launch' })).toBeVisible();
  await page.getByRole('button', { name: 'New Project' }).click();
  const createProject = page.getByRole('dialog', { name: 'New Project' });
  await createProject.getByLabel('Project name').fill('Launch social cut');
  await createProject.getByRole('button', { name: 'Create Project' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${TEST_PROJECT_ID}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'Launch social cut' })).toBeVisible();
  await expect(page.getByText('No original video yet • Choose one below to begin.')).toBeVisible();
  expect(campaigns.campaignOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  expect(campaigns.projectOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  await expect
    .poll(async () => readBrowserState(page))
    .toMatchObject({ cameraCalls: 0, requirementModels: [], connections: [], recorderStarts: 0 });
  expectNoExternalProviderTraffic(network);
});

test('Prompt 13 MVP journey resumes one Campaign Project through exact Version delivery', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const network = await installSuccessfulStudioHarness(page);
  const campaigns = await installCampaignHarness(page);
  await page.addInitScript(
    ({ storageKey, store }) => window.localStorage.setItem(storageKey, JSON.stringify(store)),
    { storageKey: CREATIVE_ASSET_STORAGE_KEY, store: SEEDED_PROJECT_CREATIVE_STORE },
  );
  await page.goto(CAMPAIGNS_PATH);

  await page.getByRole('button', { name: 'Create Campaign' }).click();
  const createCampaign = page.getByRole('dialog', { name: 'Create Campaign' });
  await createCampaign.getByRole('textbox', { name: /Campaign name/u }).fill('Summer launch');
  await createCampaign.getByRole('textbox', { name: /Brief/u }).fill('Keep the launch focused.');
  await createCampaign.getByRole('button', { name: 'Create Campaign' }).click();
  await page.getByRole('button', { name: 'New Project' }).click();
  const createProject = page.getByRole('dialog', { name: 'New Project' });
  await createProject.getByLabel('Project name').fill('Campaign master Project');
  await createProject.getByRole('button', { name: 'Create Project' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${TEST_PROJECT_ID}$`, 'u'));
  expect(campaigns.campaignOperationKeys).toHaveLength(1);
  expect(campaigns.campaignOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  expect(campaigns.projectOperationKeys).toHaveLength(1);
  expect(campaigns.projectOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);

  const projects = await installProjectHarness(page, true, {
    campaignId: TEST_CAMPAIGN_ID,
    completeProcessingAfterReopen: true,
    loseAppendOutputResponseOnce: true,
  });
  const fixture = await loadDecodableH264VideoFixture();
  await page.reload();
  await expect(page.getByRole('button', { name: '← Summer launch' })).toBeVisible();
  await expect(page.getByText('Campaign: Summer launch', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Add original video' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${TEST_PROJECT_ID}/workspace$`, 'u'));
  // Both the overview and the workspace expose a Source file input, so scope to the workspace task
  // panel rather than racing the route transition.
  const workspaceSource = page.getByRole('tabpanel', { name: 'Original' });
  await expect(workspaceSource).toBeVisible();
  await workspaceSource.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
    name: 'campaign-project-source.mp4',
    mimeType: 'video/mp4',
    buffer: fixture,
  });
  await expect(page.getByRole('heading', { name: 'Original video ready' })).toBeVisible();
  expect(projects.sourceOperationKeys).toHaveLength(1);
  expect(projects.sourceOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);

  await openCharacterOptions(page);
  await page.getByRole('button', { name: 'Choose saved character' }).click();
  await page
    .getByRole('dialog', { name: 'Characters' })
    .getByRole('article')
    .filter({ hasText: 'Project Field Host' })
    .getByRole('button', { name: 'Use in Studio' })
    .click();
  await openProjectTask(page, 'Create');
  await page.getByRole('button', { name: 'Save progress' }).click();
  await expect(
    page.getByText('Progress saved. Saving on its own starts no paid AI work.'),
  ).toBeVisible();
  expect(projects.checkpointRequests).toHaveLength(1);
  expect(projects.checkpointRequests[0]?.proposal.selectedCharacter).toMatchObject({
    characterId: 'project-field-host',
    characterLabel: 'Project Field Host',
  });

  await page
    .getByRole('navigation', { name: 'Creative workspace tools' })
    .getByRole('button', { name: 'Edit Video', exact: true })
    .click();
  const existingVideo = page.getByRole('dialog', { name: 'Use existing video' });
  await existingVideo.getByRole('button', { name: 'Start Project Character Swap' }).click();
  await expect.poll(() => projects.processingOperationKeys).toHaveLength(1);
  expect(projects.processingOperationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
  expect(projects.processingProviderIntents).toEqual(['video']);
  await expect(existingVideo).toBeHidden();

  await page.reload();
  await openProjectTask(page, 'Create');
  await expect(page.getByText('Character Swap accepted / queued', { exact: true })).toBeVisible();
  await expect(page.getByText('Result ready', { exact: true })).toBeVisible({ timeout: 15_000 });
  expect(projects.processingOperationKeys).toHaveLength(1);
  expect(projects.processingReconcileCount).toBeGreaterThanOrEqual(1);

  await page.getByRole('button', { name: '← Project overview' }).click();
  await page.getByRole('button', { name: '← Summer launch' }).click();
  const activeProjects = page.getByRole('list', { name: 'Active Projects in Summer launch' });
  await activeProjects.getByRole('button', { name: 'Open' }).click();
  await expect(page.getByRole('heading', { name: 'Untitled Project' })).toBeVisible();
  await page.getByRole('button', { name: 'Continue editing' }).click();
  await openProjectTask(page, 'Create');
  await expect(page.getByText('Result ready', { exact: true })).toBeVisible();
  expect(projects.processingOperationKeys).toHaveLength(1);

  await openProjectTask(page, 'Save');
  await page.getByRole('button', { name: 'Save as New Video' }).click();
  const createVideo = page.getByRole('dialog', { name: 'Save as New Video' });
  await createVideo.getByLabel('Video title').fill('Campaign master');
  await createVideo.getByRole('button', { name: 'Save as New Video' }).click();
  await expect(page.getByText('Saved “Campaign master” as Version 1.')).toBeVisible();
  await page.getByRole('button', { name: 'Add Version' }).click();
  await page
    .getByRole('dialog', { name: 'Choose Add Version target' })
    .getByRole('button', { name: /Campaign master/u })
    .click();
  await page
    .getByRole('dialog', { name: 'Confirm Add Version' })
    .getByRole('button', { name: 'Add Version' })
    .click();
  await expect(page.getByText('The save reply never arrived.')).toBeVisible();
  expect(projects.outputOperationKeys).toHaveLength(2);
  const pendingAppendKey = projects.outputOperationKeys[1];
  expect(pendingAppendKey).toMatch(/^[0-9a-f-]{36}$/u);
  expect(pendingAppendKey).not.toBe(projects.outputOperationKeys[0]);

  await page.reload();
  await openProjectTask(page, 'Save');
  await expect(page.getByText('Added Version 2 to “Campaign master”.')).toBeVisible();
  expect(projects.outputOperationKeys).toHaveLength(3);
  expect(projects.outputOperationKeys[2]).toBe(pendingAppendKey);
  expect(projects.outputRequests[2]).toEqual(projects.outputRequests[1]);
  await openProjectTask(page, 'History');
  const history = page.getByRole('list', { name: 'Saved video Version history' });
  const firstVersion = history.getByRole('listitem').filter({ hasText: 'Version 1' });
  await expect(history).toContainText('Version 2 · Current in Saved Videos');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    firstVersion.getByRole('link', { name: 'Download Campaign master, Version 1' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('campaign-project-source.mp4');

  await page.getByRole('button', { name: '← Project overview' }).click();
  await page.getByRole('button', { name: '← Summer launch' }).click();
  await page.getByRole('button', { name: 'Archive' }).click();
  await page
    .getByRole('dialog', { name: 'Archive Campaign' })
    .getByRole('button', { name: 'Archive Campaign' })
    .click();
  await expect(page.getByText('Archived', { exact: true })).toBeVisible();
  await expect(page.getByText('Campaign archived', { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole('list', { name: 'Active Projects in Summer launch' })
      .getByRole('button', { name: 'Open' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Restore' }).click();
  await page
    .getByRole('dialog', { name: 'Restore Campaign' })
    .getByRole('button', { name: 'Restore Campaign' })
    .click();
  await expect(page.getByText('Active', { exact: true })).toBeVisible();
  expect(campaigns.lifecycleRequests).toEqual([
    { action: 'archive', expectedVersion: 1 },
    { action: 'restore', expectedVersion: 2 },
  ]);
  expect(network.apiRequests.some(({ path }) => path.startsWith('/api/video-jobs'))).toBe(false);
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
  await page.goto(`/projects/${TEST_PROJECT_ID}/workspace`);

  const login = page.getByRole('dialog', { name: 'Log in to Lightframe' });
  await expect(login).toBeVisible();
  await login.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL(new RegExp(`/projects/${TEST_PROJECT_ID}/workspace$`, 'u'));
  await expect(page.getByRole('heading', { name: 'No original video yet' })).toBeVisible();
});

test('recording and temporary-take work cannot be lost silently through Back', async ({ page }) => {
  await installSuccessfulStudioHarness(page, { initiallyAuthenticated: false });
  await page.goto(ENTRY_PATH);
  await loginFromEntry(page);
  await page.getByRole('button', { name: 'Create video' }).click();
  await expect(page).toHaveURL(new RegExp(`${STUDIO_PATH}$`, 'u'));
  await startLocalPreview(page);
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${STUDIO_PATH}$`, 'u'));
  await expect(page.getByRole('dialog', { name: 'Finish the take before leaving' })).toBeVisible();
  await page.getByRole('button', { name: 'Stay in Studio' }).click();
  await expect(page).toHaveURL(new RegExp(`${STUDIO_PATH}$`, 'u'));
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();

  await page.goBack();
  const discard = page.getByRole('dialog', { name: 'Discard temporary work and leave?' });
  await expect(discard).toBeVisible();
  await discard.getByRole('button', { name: 'Discard and leave' }).click();
  await expect(page).toHaveURL(new RegExp(`${DASHBOARD_PATH}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
});

test('an expiring session explains what an unsaved take loses before returning to login', async ({
  page,
}) => {
  await installSuccessfulStudioHarness(page, { initiallyAuthenticated: false });
  await page.goto(ENTRY_PATH);
  await loginFromEntry(page);
  await page.getByRole('button', { name: 'Create video' }).click();
  await expect(page).toHaveURL(new RegExp(`${STUDIO_PATH}$`, 'u'));
  await startLocalPreview(page);
  await page.getByRole('button', { name: 'Record' }).click();
  await page.getByRole('button', { name: 'Stop recording' }).click();
  await expect(page.getByLabel('Recorded take playback')).toBeVisible();

  // The exact signal the API transport raises on any same-origin 401 (see
  // apps/web/src/adapters/api-client/transport.ts). Overriding /api/auth/me would not reach this
  // path: it is only called during restore, not mid-session.
  await page.evaluate(() => window.dispatchEvent(new Event('lightframe:authentication-required')));

  const expiry = page.getByRole('dialog', { name: 'Your session ended' });
  await expect(expiry).toBeVisible();
  await expect(expiry).toContainText('The current temporary take');
  // Holding the redirect is the whole point: the work is still in memory while this is open.
  await expect(page).toHaveURL(new RegExp(`${STUDIO_PATH}$`, 'u'));

  await expiry.getByRole('button', { name: 'Log in again' }).click();
  await expect(page).toHaveURL(new RegExp(`${ENTRY_PATH}$`, 'u'));
  await expect(
    page.getByText('Your session ended. Log in again to pick up where you left off.'),
  ).toBeVisible();
});
