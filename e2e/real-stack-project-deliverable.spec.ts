import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { loadDecodableH264VideoFixture } from './support/existingVideoHarness';

/**
 * The one journey that runs against the stack CI provisions — a real login, real Project routes,
 * real bytes stored and served back — rather than the in-page simulators every other spec uses.
 *
 * The simulators exist for failure injection: a lost response, a provider that never settles, a
 * disconnect mid-upload. None of them can prove the server honours its own contract, because each
 * one *is* the contract, restated in the test. This spec is where that proof lives: if the API
 * changed what it stores or serves for a Project's deliverable, this is the check that goes red.
 *
 * It drives only what needs no provider: create a Project, upload a source, adopt an on-device
 * render as the current cut, save it as a new Video, and download the bytes the server kept. Every
 * external host is blocked and reported, so a regression that started contacting one fails here
 * too.
 */

const ORIGIN_FALLBACK = 'http://127.0.0.1:4173';
const DEMO_LOGIN = { login: 'demo@lightframe.local', password: 'lightframe-demo' } as const;

const login = async (context: APIRequestContext, origin: string): Promise<void> => {
  const response = await context.post('/api/auth/login', {
    headers: { Origin: origin },
    data: DEMO_LOGIN,
  });
  expect(
    response.ok(),
    `Login failed with ${response.status()}: ${await response.text()}\n` +
      'A 502 means the API is not running: start the full stack with `bun run dev`, or let ' +
      '`bun run test:e2e` start it for you. Serving only the web app is not enough.',
  ).toBe(true);
};

const openProjectTask = async (
  page: Page,
  task: 'Original' | 'Create' | 'Save' | 'History',
): Promise<void> => {
  await page.getByRole('tab', { name: task, exact: true }).click();
  await expect(page.getByRole('tabpanel', { name: task, exact: true })).toBeVisible();
};

type BlockedTraffic = { readonly requests: string[]; readonly webSockets: string[] };

const blockExternalHosts = async (page: Page): Promise<BlockedTraffic> => {
  const blocked: BlockedTraffic = { requests: [], webSockets: [] };
  await page.routeWebSocket(
    (url) => !['127.0.0.1', 'localhost'].includes(url.hostname),
    async (webSocket) => {
      blocked.webSockets.push(webSocket.url());
      await webSocket.close({ code: 1008, reason: 'External sockets are blocked in e2e.' });
    },
  );
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.protocol !== 'blob:' && !['127.0.0.1', 'localhost'].includes(url.hostname)) {
      blocked.requests.push(url.href);
      await route.abort('blockedbyclient');
      return;
    }
    await route.fallback();
  });
  return blocked;
};

/** What the journey leaves behind on the server, so it can be taken back down afterwards. */
type Residue = { projectId: string | null; savedVideoId: string | null };

const removeResidue = async (
  context: APIRequestContext,
  origin: string,
  residue: Residue,
): Promise<void> => {
  const headers = { Origin: origin };
  if (residue.savedVideoId !== null) {
    await context.delete(`/api/videos/${residue.savedVideoId}`, { headers });
  }
  if (residue.projectId !== null) {
    // Deletion sits behind archive on purpose; the cleanup walks the same two steps an operator
    // would, each against the version the previous one produced.
    const archived = await context.post(`/api/projects/${residue.projectId}/archive`, {
      headers,
      data: { expectedVersion: (await currentProjectVersion(context, residue.projectId)) ?? 1 },
    });
    if (archived.ok()) {
      await context.post(`/api/projects/${residue.projectId}/tombstone`, {
        headers,
        data: {
          expectedVersion: (await currentProjectVersion(context, residue.projectId)) ?? 1,
          confirmation: 'permanent-delete',
        },
      });
    }
  }
};

const currentProjectVersion = async (
  context: APIRequestContext,
  projectId: string,
): Promise<number | null> => {
  const response = await context.get(`/api/projects/${projectId}`);
  if (!response.ok()) return null;
  const body = (await response.json()) as { readonly project?: { readonly version?: number } };
  return typeof body.project?.version === 'number' ? body.project.version : null;
};

test.beforeEach(async ({ page, request, baseURL }) => {
  const origin = new URL(baseURL ?? ORIGIN_FALLBACK).origin;
  for (const context of [request, page.request]) await login(context, origin);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: () =>
          Promise.reject(
            new DOMException('A test must opt into camera capture.', 'NotAllowedError'),
          ),
        enumerateDevices: () => Promise.resolve([]),
      },
    });
  });
});

test('a Project goes from an uploaded source to a downloadable deliverable through the running API', async ({
  page,
  baseURL,
}) => {
  // Two real encodes and three real uploads; the simulator journeys' budget is not this one's.
  test.setTimeout(240_000);
  const origin = new URL(baseURL ?? ORIGIN_FALLBACK).origin;
  const residue: Residue = { projectId: null, savedVideoId: null };
  const blocked = await blockExternalHosts(page);
  const fixture = await loadDecodableH264VideoFixture();
  const title = `Real-stack deliverable ${Date.now()}`;

  try {
    // 1. Create — the Project exists on the server before anything else happens to it.
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByRole('button', { name: 'Create without a name' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/u);
    residue.projectId = /\/projects\/([0-9a-f-]{36})$/u.exec(new URL(page.url()).pathname)![1]!;
    await expect(page.getByRole('heading', { name: 'Untitled Project' })).toBeVisible();

    // 2. Upload — real bytes through the real source route, accepted once and streamed back.
    await page.goto(`/projects/${residue.projectId}/workspace`);
    await expect(page.getByRole('heading', { name: 'No original video yet' })).toBeVisible();
    await page.locator('input[type="file"][accept*="video/mp4"]').setInputFiles({
      name: 'real-stack-source.mp4',
      mimeType: 'video/mp4',
      buffer: fixture,
    });
    await expect(page.getByRole('heading', { name: 'Original video ready' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(/^Autosaved ·/u)).toBeVisible();
    const source = await page.request.get(`/api/projects/${residue.projectId}/source`);
    expect(source.ok(), await source.text()).toBe(true);
    expect(await source.json()).toMatchObject({
      source: { kind: 'uploaded', filename: 'real-stack-source.mp4' },
    });

    // 3. Adopt — an on-device render becomes the current cut, uploaded as working media.
    await page
      .getByRole('navigation', { name: 'Creative workspace tools' })
      .getByRole('button', { name: 'Edit video', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Edit video' })).toBeVisible();
    await page.getByRole('button', { name: 'Lighting', exact: true }).click();
    await page.getByRole('slider', { name: 'Brightness' }).fill('12');
    await page.getByRole('button', { name: 'Render preview' }).click();
    const adoption = page.getByRole('dialog', { name: 'Make this render the current cut?' });
    await expect(adoption).toBeVisible({ timeout: 60_000 });
    await adoption.getByRole('button', { name: 'Use as the current cut' }).click();
    await expect(adoption).toBeHidden({ timeout: 60_000 });
    // The editor keeps the workspace covered until the render has actually been stored — a real
    // upload takes longer than a simulator's reply — and hands back to whichever task the Project
    // is now up to. The adoption notice lives in Create, so ask for that task before reading it.
    await expect(page.locator('[data-project-route]')).toBeVisible({ timeout: 60_000 });
    await openProjectTask(page, 'Create');
    await expect(page.getByText('Edit is now the current cut', { exact: true })).toBeVisible();
    const workingMedia = await page.request.get(`/api/projects/${residue.projectId}/working-media`);
    expect(workingMedia.ok(), await workingMedia.text()).toBe(true);

    // 4. Save — the cut is rendered into a real Video with real bytes behind it.
    await openProjectTask(page, 'Save');
    await expect(page.getByRole('heading', { name: 'Current cut' })).toBeVisible();
    await page.getByRole('button', { name: /^Save video ·/u }).click();
    const destination = page.getByRole('form', { name: 'Save destination' });
    await expect(destination).toBeVisible();
    await destination.getByLabel('Video title').fill(title);
    await page.getByRole('button', { name: 'Save video · New video' }).click();
    await expect(page.getByText(`Saved “${title}” as Version 1.`)).toBeVisible({
      timeout: 60_000,
    });

    // The server, not the client, says what was saved: the output history names the Video, and
    // the Video's own record carries the token later mutations must compare against.
    const outputs = await page.request.get(`/api/projects/${residue.projectId}/outputs?pageSize=1`);
    expect(outputs.ok(), await outputs.text()).toBe(true);
    const history = (await outputs.json()) as {
      readonly outputs: readonly {
        readonly savedVideo: { readonly id: string; readonly title: string };
        readonly version: { readonly ordinal: number };
        readonly isCurrentForProject: boolean;
      }[];
    };
    expect(history.outputs).toHaveLength(1);
    expect(history.outputs[0]).toMatchObject({
      savedVideo: { title },
      version: { ordinal: 1 },
      isCurrentForProject: true,
    });
    residue.savedVideoId = history.outputs[0]!.savedVideo.id;
    const video = await page.request.get(`/api/videos/${residue.savedVideoId}`);
    expect(video.ok(), await video.text()).toBe(true);
    expect(await video.json()).toMatchObject({ title, versionCount: 1, revision: 1 });

    // 5. Download — the bytes come back from where the server put them, as a file.
    const download = page.getByRole('link', { name: `Download ${title}, Version 1` });
    await expect(download).toBeVisible();
    const href = await download.getAttribute('href');
    expect(href).toMatch(/\/content\?download=true$/u);
    const [file] = await Promise.all([page.waitForEvent('download'), download.click()]);
    expect(file.suggestedFilename()).toMatch(/\.mp4$/u);
    const served = await page.request.get(href!);
    expect(served.status()).toBe(200);
    expect(served.headers()['content-type']).toMatch(/^video\/mp4/u);
    expect((await served.body()).byteLength).toBeGreaterThan(0);

    // The overview reads the same history back from the server and offers the same bytes — by a
    // different door: the card downloads through the Project's own output route, the save panel
    // through the Video's. The Video is also named twice on the overview (the deliverable card and
    // the attached-assets list), so the download control, which only the card carries, is what to
    // pin, and the proof is that both routes serve one file.
    await page.goto(`/projects/${residue.projectId}`);
    const overviewDownload = page.getByRole('link', { name: `Download ${title}, Version 1` });
    await expect(overviewDownload).toBeVisible();
    const overviewHref = await overviewDownload.getAttribute('href');
    expect(overviewHref).toMatch(
      new RegExp(
        `^/api/projects/${residue.projectId}/outputs/[0-9a-f-]{36}/content\\?download=true$`,
        'u',
      ),
    );
    const servedFromProject = await page.request.get(overviewHref!);
    expect(servedFromProject.status()).toBe(200);
    expect((await servedFromProject.body()).byteLength).toBe((await served.body()).byteLength);

    expect(blocked.requests).toEqual([]);
    expect(blocked.webSockets).toEqual([]);
  } finally {
    // Best effort, and never the reported failure: a cleanup that throws would replace whatever
    // the journey itself found.
    await removeResidue(page.request, origin, residue).catch((error: unknown) => {
      console.warn(`Real-stack residue was not removed: ${String(error)}`);
    });
  }
});
