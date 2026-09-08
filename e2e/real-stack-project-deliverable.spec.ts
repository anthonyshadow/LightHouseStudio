import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import {
  DEFAULT_INK_THRESHOLDS,
  readRenderedFrameInk,
  type FrameBand,
} from './support/browserMediaProbe';
import { loadPortraitH264VideoFixture } from './support/existingVideoHarness';

/**
 * The one journey that runs against the stack CI provisions — a real login, real Project routes,
 * real bytes stored and served back — rather than the in-page simulators every other spec uses.
 *
 * The simulators exist for failure injection: a lost response, a provider that never settles, a
 * disconnect mid-upload. None of them can prove the server honours its own contract, because each
 * one *is* the contract, restated in the test. This spec is where that proof lives: if the API
 * changed what it stores or serves for a Project's deliverable, this is the check that goes red.
 *
 * It drives only what needs no provider: create a Project, upload a portrait source, adopt a
 * captioned on-device render as the current cut, save that cut for three placements at once, read
 * the pixels of all three back, and download the bytes the server kept. Every external host is
 * blocked and reported, so a regression that started contacting one fails here too.
 */

const ORIGIN_FALLBACK = 'http://127.0.0.1:4173';
const DEMO_LOGIN = { login: 'demo@lightframe.local', password: 'lightframe-demo' } as const;

/*
 * One band pair that holds for all three members of the set.
 *
 * On the portrait cut itself a bottom cue sits at 0.724 to 0.78 of the frame — from
 * `SUBTITLE_LAYOUT.portraitInsets.bottom` (0.22) and the region depth (3 × 0.045 × 1.25). A
 * centred square crop keeps 0.219 to 0.781 of that frame and a tall one keeps 0.148 to 0.852, so
 * the same text lands at roughly 0.90 and 0.82 of those shorter frames. The lower band covers all
 * three; the upper band is frame that every member leaves untouched.
 */
const PLACEMENT_FRAME_BANDS: Readonly<{ caption: FrameBand; control: FrameBand }> = {
  caption: { fromRatio: 0.55, toRatio: 1 },
  control: { fromRatio: 0.02, toRatio: 0.45 },
};

/**
 * Wall clock per phase, so the budget this journey asks for is argued from a measurement rather
 * than from whatever number made a run stop failing. Reported on every run, pass or fail.
 */
const phaseClock = (): Readonly<{ mark: (phase: string) => void; report: () => string }> => {
  const started = Date.now();
  let previous = started;
  const phases: string[] = [];
  const seconds = (from: number): string => `${((Date.now() - from) / 1_000).toFixed(1)}s`;
  return {
    mark: (phase) => {
      phases.push(`${phase} ${seconds(previous)}`);
      previous = Date.now();
    },
    report: () => `${phases.join(', ')}; total ${seconds(started)}`,
  };
};

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
type Residue = {
  readonly title: string;
  projectId: string | null;
  savedVideoId: string | null;
  /**
   * Re-framed bytes the server accepted before any save named them. A placement set uploads one
   * per member ahead of the single save request, so a failure in between leaves them stored with
   * nothing pointing at them — and this runs against a real database and byte store.
   */
  readonly renditionAssetIds: string[];
};

const renditionAssetId = (body: unknown): string | null =>
  typeof body === 'object' && body !== null && 'assetId' in body && typeof body.assetId === 'string'
    ? body.assetId
    : null;

/** Records every accepted rendition, so the cleanup can account for all of them by id. */
const recordRenditionUploads = (page: Page, residue: Residue): void => {
  page.on('response', (response) => {
    if (!new URL(response.url()).pathname.endsWith('/outputs/renditions')) return;
    if (response.status() !== 201) return;
    void response
      .json()
      .then((body: unknown) => {
        const assetId = renditionAssetId(body);
        if (assetId !== null) residue.renditionAssetIds.push(assetId);
      })
      .catch(() => undefined);
  });
};

const removeResidue = async (
  context: APIRequestContext,
  origin: string,
  residue: Residue,
): Promise<void> => {
  const headers = { Origin: origin };
  const videoIds = new Set(residue.savedVideoId === null ? [] : [residue.savedVideoId]);
  /*
   * The Video is normally named by the read that follows the save, but a failure between the two
   * would leave it — and the rendition bytes now behind its Versions — with nothing to delete it
   * by. This run's title is unique, so ask the server what wears it rather than trusting a
   * variable the failure may have skipped.
   */
  const matches = await context.get(
    `/api/videos?search=${encodeURIComponent(residue.title)}&pageSize=40`,
    { headers },
  );
  if (matches.ok()) {
    const found = (await matches.json()) as {
      readonly videos?: readonly { readonly id: string; readonly title: string }[];
    };
    for (const video of found.videos ?? []) {
      if (video.title === residue.title) videoIds.add(video.id);
    }
  }
  for (const videoId of videoIds) {
    await context.delete(`/api/videos/${videoId}`, { headers });
  }
  /*
   * Renditions are Project-scoped bytes rather than asset memberships, and no route deletes one:
   * a save is what gives them an owner. Deleting the Video above releases the ones a save claimed,
   * so anything left is residue from a run that never got that far — name it rather than leave it
   * unaccounted for, because nothing automated here can remove it.
   */
  if (videoIds.size === 0 && residue.renditionAssetIds.length > 0) {
    console.warn(
      'Real-stack renditions were stored but never saved into a Version, and no route removes ' +
        `them: ${residue.renditionAssetIds.join(', ')}.`,
    );
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

test('a Project goes from an uploaded source to a downloadable captioned placement set through the running API', async ({
  page,
  baseURL,
}) => {
  /*
   * Four real encodes and five real uploads, and the budget is unchanged from when it was one
   * encode: the set costs far less than the headroom already here. Measured on a workstation
   * against the running stack, from the `phase timings` line this test prints on every run —
   * 15.6s in total, of which the three-placement save was 4.9s and reading all three back was
   * 1.3s. Adding the set moved the total by seconds, not minutes, because the fixture is six
   * frames. The 240s stays because a CI runner is slower and colder than this measurement, not
   * because anything here needs it; re-read the printed line before changing it either way.
   */
  test.setTimeout(240_000);
  const clock = phaseClock();
  const origin = new URL(baseURL ?? ORIGIN_FALLBACK).origin;
  const title = `Real-stack captioned set ${Date.now()}`;
  const residue: Residue = { title, projectId: null, savedVideoId: null, renditionAssetIds: [] };
  recordRenditionUploads(page, residue);
  const blocked = await blockExternalHosts(page);
  const fixture = await loadPortraitH264VideoFixture();

  try {
    // 1. Create — the Project exists on the server before anything else happens to it.
    await page.goto('/projects');
    await page.getByRole('button', { name: 'New Project' }).click();
    await page.getByRole('button', { name: 'Create without a name' }).click();
    await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}$/u);
    residue.projectId = /\/projects\/([0-9a-f-]{36})$/u.exec(new URL(page.url()).pathname)![1]!;
    await expect(page.getByRole('heading', { name: 'Untitled Project' })).toBeVisible();

    clock.mark('create');

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
    clock.mark('upload source');

    // 3. Adopt — an on-device render becomes the current cut, uploaded as working media. The cut
    // carries a caption, because a placement set's whole risk is what a re-frame does to one.
    await page
      .getByRole('navigation', { name: 'Creative workspace tools' })
      .getByRole('button', { name: 'Edit video', exact: true })
      .click();
    await expect(page.getByRole('heading', { name: 'Edit video' })).toBeVisible();
    await page.getByRole('button', { name: 'Lighting', exact: true }).click();
    await page.getByRole('slider', { name: 'Brightness' }).fill('12');
    await page.getByRole('button', { name: 'Subtitles', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Subtitles settings' })).toBeVisible();
    await page.getByRole('button', { name: 'Add subtitle at playhead' }).click();
    const cueText = page.getByRole('textbox', { name: 'Text' });
    await expect(cueText).toBeFocused();
    await cueText.fill('Keep this line');
    await cueText.blur();
    await page.getByRole('button', { name: 'Render preview' }).click();
    const adoption = page.getByRole('dialog', { name: 'Make this render the current cut?' });
    await expect(adoption).toBeVisible({ timeout: 60_000 });
    await adoption.getByRole('button', { name: 'Use as the current cut' }).click();
    await expect(adoption).toBeHidden({ timeout: 60_000 });
    // The editor keeps the workspace covered until the render has actually been stored — a real
    // upload takes longer than a simulator's reply — and hands back to the task the operator was
    // on. That is deliberate: the workspace latches its task on entry and a phase change never
    // pulls the open panel away; only the operator's own choice moves it. This journey launched the
    // editor from Original, and the adoption notice lives in Create, so choose that task to read it.
    await expect(page.locator('[data-project-route]')).toBeVisible({ timeout: 60_000 });
    await openProjectTask(page, 'Create');
    await expect(page.getByText('Edit is now the current cut', { exact: true })).toBeVisible();
    const workingMedia = await page.request.get(`/api/projects/${residue.projectId}/working-media`);
    expect(workingMedia.ok(), await workingMedia.text()).toBe(true);
    clock.mark('caption and adopt');

    /*
     * 4. Save — one captioned portrait cut, three placements, one save.
     *
     * The vertical trio on purpose. A phone cut keeps a deep band clear at both ends
     * (`SUBTITLE_LAYOUT.portraitInsets`), which is exactly the band a centred square or tall
     * re-frame removes — so these three shapes are the set whose members can all still carry the
     * caption, and the pixels below are what says whether they did.
     */
    await openProjectTask(page, 'Save');
    await expect(page.getByRole('heading', { name: 'Current cut' })).toBeVisible();
    const chooser = page.getByRole('group', { name: 'Where is this going?' });
    await chooser.getByRole('button', { name: 'Phone, full screen' }).click();
    await page.getByRole('button', { name: /^Save video ·/u }).click();
    const destination = page.getByRole('form', { name: 'Save destination' });
    await expect(destination).toBeVisible();
    await destination.getByLabel('Video title').fill(title);
    const extras = destination.getByRole('group', { name: 'Also save for' });
    await extras.getByRole('checkbox', { name: 'Square post' }).click();
    await extras.getByRole('checkbox', { name: 'Tall feed post' }).click();
    await page.getByRole('button', { name: 'Save video · New video' }).click();
    await expect(page.getByText(new RegExp(`^Saved “${title}” as Version 3\\.`, 'u'))).toBeVisible({
      timeout: 120_000,
    });
    clock.mark('placement set');

    /*
     * The server, not the client, says what was saved. Every dimension below was measured by the
     * API from the bytes it received (`saved-video-inspection.ts`), and a file that did not match
     * the placement it claimed would have been refused before it got here — so three rows with
     * three shapes is three real files, not three identifiers.
     */
    const outputs = await page.request.get(`/api/projects/${residue.projectId}/outputs?pageSize=5`);
    expect(outputs.ok(), await outputs.text()).toBe(true);
    const history = (await outputs.json()) as {
      readonly outputs: readonly {
        readonly savedVideo: { readonly id: string; readonly title: string };
        readonly version: {
          readonly ordinal: number;
          readonly width: number;
          readonly height: number;
          readonly exportSpecification: { readonly aspect: string } | null;
        };
        readonly isCurrentForProject: boolean;
        readonly contentUrl: string;
      }[];
    };
    expect(history.outputs).toHaveLength(3);
    expect(new Set(history.outputs.map(({ savedVideo }) => savedVideo.id)).size).toBe(1);
    expect(history.outputs.every(({ savedVideo }) => savedVideo.title === title)).toBe(true);
    expect(
      new Set(
        history.outputs.map(
          ({ version }) =>
            `${version.exportSpecification?.aspect ?? 'source'} ${version.width}x${version.height}`,
        ),
      ),
    ).toEqual(new Set(['9:16 1080x1920', '1:1 1080x1080', '4:5 1080x1350']));

    // The chosen placement is the one the Project points at, and the Video's current Version.
    const current = history.outputs.filter(({ isCurrentForProject }) => isCurrentForProject);
    expect(current).toHaveLength(1);
    expect(current[0]?.version.exportSpecification?.aspect).toBe('9:16');
    const currentOrdinal = current[0]!.version.ordinal;
    residue.savedVideoId = history.outputs[0]!.savedVideo.id;
    const video = await page.request.get(`/api/videos/${residue.savedVideoId}`);
    expect(video.ok(), await video.text()).toBe(true);
    expect(await video.json()).toMatchObject({ title, versionCount: 3, revision: 1 });

    /*
     * 5. Read the pixels back — every member still carries the caption the cut was given.
     *
     * The bands are wide because each placement puts the text somewhere different: a centred crop
     * moves it down the frame as the frame gets shorter. What is being checked is that ink arrived
     * below the middle and that the top of every frame is still the fixture's own flat colour —
     * a re-frame that cut the caption away leaves the lower band as clean as the upper one.
     */
    for (const output of history.outputs) {
      const aspect = output.version.exportSpecification?.aspect ?? 'source';
      // The shared floors suit this fixture: every pixel of it decodes to rgb(51, 94, 109) — luma
      // 86, and about 100 once this journey's brightness lift is applied — against a caption box at
      // roughly 45 and white glyphs. See `./fixtures/README.md`.
      const ink = await readRenderedFrameInk(
        page,
        output.contentUrl,
        PLACEMENT_FRAME_BANDS,
        DEFAULT_INK_THRESHOLDS,
      );
      expect(ink, aspect).toMatchObject({
        width: output.version.width,
        height: output.version.height,
      });
      expect(ink.control, aspect).toMatchObject({ bright: 0, dark: 0 });
      expect(ink.caption.dark, aspect).toBeGreaterThan(2_000);
      expect(ink.caption.bright, aspect).toBeGreaterThan(300);
    }
    clock.mark('read placement pixels');

    // 6. Download — the bytes come back from where the server put them, as a file.
    const download = page.getByRole('link', {
      name: `Download ${title}, Version ${currentOrdinal}`,
    });
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
    const overviewDownload = page.getByRole('link', {
      name: `Download ${title}, Version ${currentOrdinal}`,
    });
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
    clock.mark('download');
  } finally {
    // The measurement, not the budget: printed on every run, pass or fail, so the timeout above
    // can be argued from a number this machine actually produced.
    console.log(`Real-stack phase timings: ${clock.report()}`);
    // Best effort, and never the reported failure: a cleanup that throws would replace whatever
    // the journey itself found.
    await removeResidue(page.request, origin, residue).catch((error: unknown) => {
      console.warn(`Real-stack residue was not removed: ${String(error)}`);
    });
  }
});
