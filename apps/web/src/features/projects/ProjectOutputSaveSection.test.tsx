// @vitest-environment jsdom

import {
  SAVED_VIDEO_TITLE_MAX_LENGTH,
  type ProjectCurrentResponse,
  type SavedVideoSummary,
  type SaveProjectOutputResponse,
} from '@studio/contracts';
import {
  defaultProjectOutputTitle,
  SAVED_VIDEO_TITLE_MAX_LENGTH as DOMAIN_TITLE_MAX_LENGTH,
} from '@studio/domain';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { useState, type ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { downloadSavedVideoUrl } from '../../adapters/api-client/savedVideosApi';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { renderVideoEdit } from '../video-editor/renderVideoEdit';
import { ProjectOutputSaveSection } from './ProjectOutputSaveSection';
import { projectOutputOperationStorageKey } from './projectOutputOperationStorage';
import type { ProjectSessionPort } from './useProjectSession';

// jsdom has no WebGL, so the render capability is stated explicitly rather than left to the
// environment: both the offered and the degraded path have to be exercised deliberately.
const renderCapable = vi.fn(() => true);
vi.mock('../video-editor/videoEditShader', () => ({
  videoEditPreviewSupported: () => renderCapable(),
}));
vi.mock('../video-editor/renderVideoEdit', () => ({
  renderVideoEdit: vi.fn(),
  videoEditRenderingSupported: () => renderCapable(),
}));

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const sourceAssetId = 'a1289672-bfb5-4214-94f7-4bd54f12ce06';
const producingRevisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const resultRevisionId = '99a972fe-bfb5-5214-94f7-4bd54f12ce06';
const savedVideoId = '62f18176-14c6-4a2a-b615-0058e89ea46c';
const versionId = 'b2289672-bfb5-4214-94f7-4bd54f12ce06';
const now = '2026-08-13T16:00:00.000Z';
const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

const useMobileViewport = () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string): MediaQueryList => ({
      matches: query === '(max-width: 39.99rem)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(() => true),
    })),
  });
};

const current = (): ProjectCurrentResponse => ({
  project: {
    id: projectId,
    campaignId: null,
    title: 'Launch cut',
    status: 'ready',
    version: 2,
    currentRevisionId: producingRevisionId,
    currentRevisionNumber: 2,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  revision: {
    id: producingRevisionId,
    projectId,
    revisionNumber: 2,
    parentRevisionId: '79a972fe-bfb5-4214-94f7-4bd54f12ce06',
    parentRevisionNumber: 1,
    snapshot: {
      schemaVersion: 2,
      sourceAssetId,
      workingMedia: { kind: 'asset', assetId: sourceAssetId },
      presentedMedia: { kind: 'asset', assetId: sourceAssetId },
      selectedCharacter: null,
      selectedOutfit: null,
      selectedVoice: null,
      visualTreatment: { kind: 'none' },
      liveMode: null,
      creativeIntent: {
        promptId: null,
        promptLabel: null,
        recipeId: null,
        recipeLabel: null,
        userIntent: '',
        appliedPrompt: null,
        referenceAssetId: null,
        resourceRevision: null,
      },
      localEdit: null,
      exportSpecification: null,
      lastSuccessfulOutput: null,
      workflowPhase: 'review',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: 'user-edit',
    createdAt: now,
  },
});

const savedSummary = (): SavedVideoSummary => ({
  id: savedVideoId,
  title: 'Existing master',
  status: 'ready',
  currentVersion: {
    id: versionId,
    videoId: savedVideoId,
    ordinal: 3,
    origin: 'editor',
    characterName: null,
    characterVariantName: null,
    sourceVersionId: null,
    mimeType: 'video/mp4',
    filename: 'existing.mp4',
    sizeBytes: 1_024,
    durationMs: 10_000,
    width: 1_280,
    height: 720,
    exportSpecification: null,
    createdAt: now,
  },
  sourceVideoId: null,
  versionCount: 3,
  thumbnailAvailable: false,
  createdAt: now,
  updatedAt: now,
});

const outputResponse = (
  operationId: string,
  options: { readonly append?: boolean; readonly replayed?: boolean } = {},
): SaveProjectOutputResponse => {
  const video = savedSummary();
  const outputVersionId = options.append ? 'c3289672-bfb5-5214-94f7-4bd54f12ce06' : versionId;
  const outputVersion = {
    ...video.currentVersion,
    id: outputVersionId,
    ordinal: options.append ? 4 : 1,
    sourceVersionId: options.append ? versionId : null,
  };
  const outputVideo = {
    ...video,
    title: options.append ? video.title : 'Launch master',
    currentVersion: outputVersion,
    versionCount: options.append ? 4 : 1,
    versions: options.append ? [video.currentVersion, outputVersion] : [outputVersion],
  };
  const outputReference = { savedVideoId, videoVersionId: outputVersionId };
  return {
    operationId,
    project: {
      ...current().project,
      status: 'completed',
      version: 3,
      currentRevisionId: resultRevisionId,
      currentRevisionNumber: 3,
    },
    revision: {
      ...current().revision,
      id: resultRevisionId,
      revisionNumber: 3,
      parentRevisionId: producingRevisionId,
      parentRevisionNumber: 2,
      source: 'output-save',
      snapshot: {
        ...current().revision.snapshot,
        workingMedia: { kind: 'saved-video-version', ...outputReference },
        presentedMedia: { kind: 'saved-video-version', ...outputReference },
        lastSuccessfulOutput: outputReference,
        workflowPhase: 'complete',
      },
    },
    output: {
      projectId,
      ...outputReference,
      producingRevisionId,
      producingRevisionNumber: 2,
      createdAt: now,
    },
    savedVideo: outputVideo,
    contentUrl: `/api/projects/${projectId}/outputs/${outputVersionId}/content`,
    replayed: options.replayed ?? false,
  };
};

const session = (acceptCurrent = vi.fn()): ProjectSessionPort => ({
  projectId,
  phase: 'saved',
  current: current(),
  proposal: null,
  hasLocalProposal: false,
  message: null,
  propose: vi.fn(() => true),
  flush: vi.fn(() => Promise.resolve(true)),
  retry: vi.fn(() => Promise.resolve(true)),
  discard: vi.fn(() => true),
  getCurrent: () => current(),
  acceptCurrent,
});

const workspacePath = `/projects/${projectId}/workspace`;

const renderRouted = (element: ReactElement) => {
  const router = createMemoryRouter(
    [
      { path: '/projects/:projectId/workspace', element },
      { path: '/assets/videos', element: <p>Videos library</p> },
    ],
    { initialEntries: [workspacePath] },
  );
  return {
    ...render(
      <StudioDesignProvider>
        <RemoteStateTestProvider>
          <RouterProvider router={router} />
        </RemoteStateTestProvider>
      </StudioDesignProvider>,
    ),
    router,
  };
};

const renderSection = (
  port = session(),
  {
    currentValue = current(),
    owner = ownerUserId,
    archived = false,
  }: {
    readonly currentValue?: ProjectCurrentResponse;
    readonly owner?: string | null;
    readonly archived?: boolean;
  } = {},
) =>
  renderRouted(
    <ProjectOutputSaveSection
      current={currentValue}
      session={port}
      archived={archived}
      {...(owner === null ? {} : { ownerUserId: owner })}
    />,
  );

/**
 * Adopts each settled save the way `useProjectSession` does, so the second save proposes its title
 * from the Project state the first one produced rather than from a fixture.
 */
const AdoptingSection = ({ port }: { readonly port: ProjectSessionPort }) => {
  const [value, setValue] = useState(current());
  return (
    <ProjectOutputSaveSection
      current={value}
      session={{ ...port, acceptCurrent: setValue }}
      archived={false}
      ownerUserId={ownerUserId}
    />
  );
};

type TestUser = ReturnType<typeof userEvent.setup>;

const openSaveDestination = async (user: TestUser) => {
  await user.click(screen.getByRole('button', { name: /^Save video ·/u }));
  return screen.findByRole('form', { name: 'Save destination' });
};

const submitNewVideo = async (user: TestUser, nextTitle?: string) => {
  const form = await openSaveDestination(user);
  if (nextTitle !== undefined) {
    const title = within(form).getByRole('textbox', { name: 'Video title' });
    await user.clear(title);
    await user.type(title, nextTitle);
  }
  await user.click(screen.getByRole('button', { name: 'Save video · New video' }));
  return form;
};

const chooseVersionTarget = async (user: TestUser) => {
  const form = await openSaveDestination(user);
  await user.click(within(form).getByRole('radio', { name: 'New version of an existing video' }));
  await user.click(await within(form).findByRole('button', { name: /Existing master/u }));
  return form;
};

beforeEach(() => {
  const values = new Map<string, string>();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
      removeItem: (key: string) => {
        values.delete(key);
      },
      clear: () => values.clear(),
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
    } satisfies Storage,
  });
  mockApiServer.use(http.get(`*/api/projects/${projectId}`, () => HttpResponse.json(current())));
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  if (originalMatchMedia) Object.defineProperty(window, 'matchMedia', originalMatchMedia);
  else Reflect.deleteProperty(window, 'matchMedia');
  vi.restoreAllMocks();
});

describe('Project output save UI', () => {
  it('reveals one destination choice and sends one exact current-media command', async () => {
    let requestBody: unknown;
    let operationId = '';
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, async ({ request }) => {
        operationId = request.headers.get('idempotency-key') ?? '';
        requestBody = await request.json();
        return HttpResponse.json(outputResponse(operationId), { status: 201 });
      }),
    );
    const acceptCurrent = vi.fn();
    const user = userEvent.setup();
    renderSection(session(acceptCurrent));

    expect(screen.getByRole('heading', { name: 'Current cut' })).toBeVisible();
    expect(screen.queryByText(/“Autosaved” refers/u)).not.toBeInTheDocument();
    let form = await openSaveDestination(user);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('form', { name: 'Save destination' })).not.toBeInTheDocument();

    form = await openSaveDestination(user);
    const title = within(form).getByRole('textbox', { name: 'Video title' });
    await user.clear(title);
    await user.type(title, 'Launch master');
    await user.click(screen.getByRole('button', { name: 'Save video · New video' }));

    expect(await screen.findByText('Saved “Launch master” as Version 1.')).toBeVisible();
    expect(operationId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(requestBody).toEqual({
      expectedVersion: 2,
      expectedRevisionNumber: 2,
      media: { kind: 'asset', assetId: sourceAssetId },
      target: { kind: 'new', title: 'Launch master' },
      renditions: [],
    });
    expect(acceptCurrent).toHaveBeenCalledWith({
      project: outputResponse(operationId).project,
      revision: outputResponse(operationId).revision,
    });
  });

  it('names one existing target inline and saves without a modal chain', async () => {
    const target = savedSummary();
    let posted: unknown = null;
    mockApiServer.use(
      http.get('*/api/videos', () =>
        HttpResponse.json({
          videos: [target],
          nextCursor: null,
          total: 1,
          facets: { characterNames: [], formats: ['landscape'] },
        }),
      ),
      http.post(`*/api/projects/${projectId}/outputs`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(
          outputResponse(request.headers.get('idempotency-key') ?? '', { append: true }),
          { status: 201 },
        );
      }),
    );
    const user = userEvent.setup();
    renderSection();

    const form = await openSaveDestination(user);
    const versionChoice = within(form).getByRole('radio', {
      name: 'New version of an existing video',
    });
    await user.click(versionChoice);
    expect(posted).toBeNull();
    await user.click(await within(form).findByRole('button', { name: /Existing master/u }));
    expect(form).toHaveTextContent('New version of “Existing master”');
    expect(form).toHaveTextContent('Target: Existing master · Current Version 3');
    expect(posted).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save video · Existing master' }));

    await waitFor(() =>
      expect(posted).toEqual({
        expectedVersion: 2,
        expectedRevisionNumber: 2,
        media: { kind: 'asset', assetId: sourceAssetId },
        target: {
          kind: 'version',
          savedVideoId,
          expectedVersionId: versionId,
        },
        renditions: [],
      }),
    );
  });

  it('uses one focused bottom sheet for the destination choice on mobile', async () => {
    useMobileViewport();
    const user = userEvent.setup();
    renderSection();

    await waitFor(() => expect(window.matchMedia).toHaveBeenCalled());
    await user.click(screen.getByRole('button', { name: /^Save video ·/u }));

    const sheet = await screen.findByRole('dialog', { name: 'Save video' });
    const form = within(sheet).getByRole('form', { name: 'Save destination' });
    expect(within(form).getByRole('radio', { name: 'New video' })).toBeChecked();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await user.click(within(sheet).getByRole('button', { name: 'Close panel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Save video' })).toBeNull());
    expect(screen.getByRole('button', { name: /^Save video ·/u })).toHaveFocus();
  });

  it('reuses the persisted operation ID and exact request after response loss and remount', async () => {
    const operations: string[] = [];
    const bodies: unknown[] = [];
    let attempts = 0;
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, async ({ request }) => {
        attempts += 1;
        const operationId = request.headers.get('idempotency-key') ?? '';
        operations.push(operationId);
        bodies.push(await request.json());
        return attempts === 1
          ? HttpResponse.error()
          : HttpResponse.json(outputResponse(operationId, { replayed: true }));
      }),
    );
    const user = userEvent.setup();
    const first = renderSection();
    await submitNewVideo(user, 'Launch master');
    expect(await screen.findByText(/save reply never arrived/u)).toBeVisible();
    expect(
      window.localStorage.getItem(projectOutputOperationStorageKey(ownerUserId, projectId)),
    ).not.toBeNull();

    first.unmount();
    const acceptCurrent = vi.fn();
    renderSection(session(acceptCurrent));
    expect(await screen.findByText('Saved “Launch master” as Version 1.')).toBeVisible();
    expect(operations).toHaveLength(2);
    expect(operations[1]).toBe(operations[0]);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(
      window.localStorage.getItem(projectOutputOperationStorageKey(ownerUserId, projectId)),
    ).toBeNull();
    // One settled result: `acceptCurrent` immediately precedes the two query invalidations, so a
    // single call is a single invalidation pair — and the recovered save offers one set of actions.
    expect(acceptCurrent).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('link', { name: /^Download/u })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'View in Assets' })).toHaveLength(1);
  });

  it('refuses to start an output save without an authenticated owner binding', async () => {
    let outputRequests = 0;
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, () => {
        outputRequests += 1;
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    renderSection(session(), { owner: null });

    await submitNewVideo(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your account could not be confirmed for this save.',
    );
    expect(outputRequests).toBe(0);
  });

  it('preserves a Project proposal instead of saving output through a failed flush', async () => {
    const flush = vi.fn().mockResolvedValue(false);
    const port = { ...session(), flush };
    let outputRequests = 0;
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, () => {
        outputRequests += 1;
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    renderSection(port);

    await submitNewVideo(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Save or discard your pending Project changes before saving.',
    );
    expect(flush).toHaveBeenCalledOnce();
    expect(outputRequests).toBe(0);
  });

  it('revalidates ready media after flush before creating an output operation', async () => {
    const stale = current();
    const staleCurrent: ProjectCurrentResponse = {
      ...stale,
      revision: {
        ...stale.revision,
        snapshot: {
          ...stale.revision.snapshot,
          workingMedia: null,
          presentedMedia: null,
        },
      },
    };
    const port = { ...session(), getCurrent: () => staleCurrent };
    let outputRequests = 0;
    mockApiServer.use(
      http.get(`*/api/projects/${projectId}`, () => HttpResponse.json(staleCurrent)),
      http.post(`*/api/projects/${projectId}/outputs`, () => {
        outputRequests += 1;
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    renderSection(port);

    await submitNewVideo(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Project no longer has the media this save was for.',
    );
    expect(outputRequests).toBe(0);
  });

  it('does not submit when reload-safe browser operation storage is unavailable', async () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage unavailable.', 'QuotaExceededError');
    });
    let outputRequests = 0;
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, () => {
        outputRequests += 1;
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    renderSection();

    await submitNewVideo(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This browser cannot store the save record, so nothing was saved.',
    );
    expect(outputRequests).toBe(0);
  });

  it('reconciles a retained operation explicitly without creating a second save command', async () => {
    const operationIds: string[] = [];
    let attempts = 0;
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, ({ request }) => {
        attempts += 1;
        const operationId = request.headers.get('idempotency-key') ?? '';
        operationIds.push(operationId);
        return attempts === 1
          ? HttpResponse.error()
          : HttpResponse.json(outputResponse(operationId, { replayed: true }));
      }),
    );
    const user = userEvent.setup();
    renderSection();

    await submitNewVideo(user);
    expect(await screen.findByText(/save reply never arrived/u)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Check this save' }));

    expect(await screen.findByText('Saved “Launch master” as Version 1.')).toBeVisible();
    expect(operationIds).toHaveLength(2);
    expect(operationIds[1]).toBe(operationIds[0]);
  });

  it('clears a retained operation after a final Project conflict', async () => {
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, () =>
        HttpResponse.json(
          {
            error: { code: 'conflict', message: 'The Project changed before output save.' },
            conflict: {
              kind: 'project-version',
              projectId,
              expectedVersion: 2,
              actualVersion: 3,
            },
          },
          { status: 409 },
        ),
      ),
    );
    const acceptCurrent = vi.fn();
    const user = userEvent.setup();
    renderSection(session(acceptCurrent));

    await submitNewVideo(user);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Project changed before output save.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The latest Project state is loaded; review it and save again.',
    );
    expect(acceptCurrent).toHaveBeenCalledWith(current());
    expect(
      window.localStorage.getItem(projectOutputOperationStorageKey(ownerUserId, projectId)),
    ).toBeNull();
  });

  it('ends a new-Video save with the file in hand and a way into the library', async () => {
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, ({ request }) =>
        HttpResponse.json(outputResponse(request.headers.get('idempotency-key') ?? ''), {
          status: 201,
        }),
      ),
    );
    const user = userEvent.setup();
    const { router } = renderSection();

    await submitNewVideo(user);

    expect(await screen.findByText('Saved “Launch master” as Version 1.')).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Save destination' })).not.toBeInTheDocument();
    const download = screen.getByRole('link', { name: 'Download Launch master, Version 1' });
    expect(download).toHaveAttribute('href', downloadSavedVideoUrl(savedVideoId, versionId));
    expect(download).toHaveAttribute('download', 'existing.mp4');
    // The operator keeps the focus they had; the actions arrive beside the announcement.
    expect(screen.getByRole('button', { name: /^Save video ·/u })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'View in Assets' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/assets/videos'));
    expect(router.state.location.search).toBe(`?video=${savedVideoId}`);
  });

  it('offers the added Version itself after saving a new Version', async () => {
    const appendedVersionId = 'c3289672-bfb5-5214-94f7-4bd54f12ce06';
    mockApiServer.use(
      http.get('*/api/videos', () =>
        HttpResponse.json({
          videos: [savedSummary()],
          nextCursor: null,
          total: 1,
          facets: { characterNames: [], formats: ['landscape'] },
        }),
      ),
      http.post(`*/api/projects/${projectId}/outputs`, ({ request }) =>
        HttpResponse.json(
          outputResponse(request.headers.get('idempotency-key') ?? '', { append: true }),
        ),
      ),
    );
    const user = userEvent.setup();
    renderSection();

    await chooseVersionTarget(user);
    await user.click(screen.getByRole('button', { name: 'Save video · Existing master' }));

    expect(await screen.findByText('Added Version 4 to “Existing master”.')).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Save destination' })).not.toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Download Existing master, Version 4' }),
    ).toHaveAttribute('href', downloadSavedVideoUrl(savedVideoId, appendedVersionId));
    expect(screen.getByRole('button', { name: 'View in Assets' })).toBeVisible();
  });

  it('proposes a different title for each successive save from one Project', async () => {
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, ({ request }) =>
        HttpResponse.json(outputResponse(request.headers.get('idempotency-key') ?? ''), {
          status: 201,
        }),
      ),
    );
    const user = userEvent.setup();
    renderRouted(<AdoptingSection port={session()} />);

    const first = await openSaveDestination(user);
    const proposed = within(first).getByRole('textbox', { name: 'Video title' });
    expect(proposed).toHaveValue('Launch cut · change 2');
    await user.clear(proposed);
    await user.type(proposed, 'Launch master');
    await user.click(screen.getByRole('button', { name: 'Save video · New video' }));
    expect(await screen.findByText('Saved “Launch master” as Version 1.')).toBeVisible();
    expect(screen.queryByRole('form', { name: 'Save destination' })).not.toBeInTheDocument();

    const second = await openSaveDestination(user);
    expect(within(second).getByRole('textbox', { name: 'Video title' })).toHaveValue(
      'Launch cut · change 3',
    );
  });

  it('bounds the proposed title by the same number the save request is validated against', () => {
    // The naming rule itself is covered headlessly in `packages/domain`. What this asserts is the
    // pairing the dialog depends on: two packages that deliberately do not import each other each
    // state this bound, and nothing else would catch them drifting into a proposal the server
    // refuses.
    expect(DOMAIN_TITLE_MAX_LENGTH).toBe(SAVED_VIDEO_TITLE_MAX_LENGTH);
    expect(
      defaultProjectOutputTitle({ title: 'L'.repeat(400), currentRevisionNumber: 12 }).length,
    ).toBeLessThanOrEqual(SAVED_VIDEO_TITLE_MAX_LENGTH);
  });
});

describe('ProjectOutputSaveSection placement', () => {
  it('records a chosen placement through the session rather than the save request', async () => {
    const user = userEvent.setup();
    const propose = vi.fn(() => true);
    renderSection({ ...session(), propose });

    expect(screen.getByRole('group', { name: 'Where is this going?' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Keep as it is' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.click(screen.getByRole('button', { name: 'Phone, full screen' }));

    // The revision-append path owns the write, so optimistic concurrency is never bypassed here.
    expect(propose).toHaveBeenCalledExactlyOnceWith({
      exportSpecification: {
        container: 'video/mp4',
        aspect: '9:16',
        resolution: { width: 1_080, height: 1_920 },
        includeAudio: true,
      },
    });
  });

  it('restates the recorded placement at the moment the save is confirmed', async () => {
    const user = userEvent.setup();
    const placed = current();
    renderSection(session(), {
      currentValue: {
        ...placed,
        revision: {
          ...placed.revision,
          snapshot: {
            ...placed.revision.snapshot,
            exportSpecification: {
              container: 'video/mp4',
              aspect: '4:5',
              resolution: { width: 1_080, height: 1_350 },
              includeAudio: true,
            },
          },
        },
      },
    });

    expect(screen.getByRole('button', { name: 'Tall feed post' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Save video · Tall feed post' })).toBeVisible();
    const form = await openSaveDestination(user);
    expect(within(form).getByText('Tall feed post')).toBeVisible();
  });

  it('keeps the unchanged server download when no placement was recorded', async () => {
    const user = userEvent.setup();
    let saved = 0;
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, () => {
        saved += 1;
        return HttpResponse.json(outputResponse(crypto.randomUUID()), { status: 201 });
      }),
    );
    renderSection();

    await submitNewVideo(user);

    await waitFor(() => expect(saved).toBe(1));
    const download = await screen.findByRole('link', { name: /^Download Launch master/u });
    expect(download).toHaveAttribute('href', downloadSavedVideoUrl(savedVideoId, versionId));
    expect(screen.queryByRole('button', { name: /Download .* for /u })).not.toBeInTheDocument();
  });
  const phoneSpecification = {
    container: 'video/mp4' as const,
    aspect: '9:16' as const,
    resolution: { width: 1_080, height: 1_920 },
    includeAudio: true,
  };
  const renditionAssetId = 'f5d1a6ce-1a5e-4a2f-9df0-6f2b6b0f3d21';

  const placedCurrent = (): ProjectCurrentResponse => {
    const placed = current();
    return {
      ...placed,
      revision: {
        ...placed.revision,
        snapshot: { ...placed.revision.snapshot, exportSpecification: phoneSpecification },
      },
    };
  };

  /** The working-media read, the render and the rendition upload the placement path depends on. */
  const installPlacementProduction = () => {
    vi.mocked(renderVideoEdit).mockClear();
    const uploads: unknown[] = [];
    mockApiServer.use(
      // `begin` re-reads the Project before producing anything, so the placement has to be on the
      // authoritative copy, not only on the rendered prop.
      http.get(`*/api/projects/${projectId}`, () => HttpResponse.json(placedCurrent())),
      // The ordinary flow has a source and no working-media adoption, so that is what is offered.
      http.get(`*/api/projects/${projectId}/source`, () =>
        HttpResponse.json({
          ...placedCurrent(),
          source: {
            kind: 'uploaded',
            savedVideoId: null,
            videoVersionId: null,
            mimeType: 'video/mp4',
            filename: 'cut.mp4',
            sizeBytes: 8,
            container: 'mp4',
            videoCodec: 'avc',
            audioCodec: 'aac',
            durationMs: 8_000,
            width: 1_280,
            height: 720,
            hasAudio: true,
            acceptedAt: now,
            contentUrl: `/api/projects/${projectId}/source/content`,
          },
        }),
      ),
      http.get(`*/api/projects/${projectId}/source/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4' },
        }),
      ),
      http.get(`*/api/projects/${projectId}/working-media`, () =>
        HttpResponse.json({
          ...placedCurrent(),
          isCurrent: true,
          media: {
            kind: 'media-asset',
            reference: { kind: 'asset', assetId: sourceAssetId },
            assetId: sourceAssetId,
            savedVideoId: null,
            videoVersionId: null,
            mimeType: 'video/mp4',
            filename: 'cut.mp4',
            sizeBytes: 8,
            checksumSha256: 'a'.repeat(64),
            container: 'mp4',
            videoCodec: 'avc',
            audioCodec: 'aac',
            durationMs: 8_000,
            width: 1_280,
            height: 720,
            hasAudio: true,
            adoptedRevisionId: producingRevisionId,
            adoptedRevisionNumber: 2,
            adoptedAt: now,
            contentUrl: `/api/projects/${projectId}/working-media/${producingRevisionId}/content`,
          },
        }),
      ),
      http.get(`*/api/projects/${projectId}/working-media/${producingRevisionId}/content`, () =>
        HttpResponse.arrayBuffer(new Uint8Array([1, 2, 3, 4]).buffer, {
          headers: { 'Content-Type': 'video/mp4' },
        }),
      ),
      http.post(`*/api/projects/${projectId}/outputs/renditions`, async ({ request }) => {
        uploads.push(request.headers.get('x-lightframe-project-rendition'));
        return HttpResponse.json(
          {
            media: { kind: 'asset', assetId: renditionAssetId },
            assetId: renditionAssetId,
            specification: phoneSpecification,
            filename: 'cut-phone.mp4',
            sizeBytes: 12,
            checksumSha256: 'b'.repeat(64),
            durationMs: 8_000,
            width: 1_080,
            height: 1_920,
            hasAudio: true,
          },
          { status: 201 },
        );
      }),
    );
    vi.mocked(renderVideoEdit).mockResolvedValue({
      blob: new Blob([new Uint8Array(12)], { type: 'video/mp4' }),
      width: 1_080,
      height: 1_920,
      durationMs: 8_000,
    } as unknown as Awaited<ReturnType<typeof renderVideoEdit>>);
    return uploads;
  };

  it('re-frames and stores the placement before the save request names it', async () => {
    const user = userEvent.setup();
    const uploads = installPlacementProduction();
    let posted: unknown = null;
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, async ({ request }) => {
        posted = await request.json();
        return HttpResponse.json(outputResponse(crypto.randomUUID()), { status: 201 });
      }),
    );
    renderSection(session(), { currentValue: placedCurrent() });

    await submitNewVideo(user);

    await waitFor(() => expect(posted).not.toBeNull());
    expect(vi.mocked(renderVideoEdit)).toHaveBeenCalledTimes(1);
    expect(uploads).toHaveLength(1);
    expect(posted).toMatchObject({
      renditions: [
        { media: { kind: 'asset', assetId: renditionAssetId }, specification: phoneSpecification },
      ],
    });
  });

  it('replays a recovered save without re-framing or storing a second rendition', async () => {
    const uploads = installPlacementProduction();
    let saves = 0;
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, () => {
        saves += 1;
        return HttpResponse.json(outputResponse(crypto.randomUUID()), { status: 201 });
      }),
    );
    // A receipt written after the bytes were produced is exactly what a reload leaves behind.
    window.localStorage.setItem(
      projectOutputOperationStorageKey(ownerUserId, projectId),
      JSON.stringify({
        schemaVersion: 1,
        ownerUserId,
        projectId,
        operationId: crypto.randomUUID(),
        createdAt: now,
        request: {
          expectedVersion: 2,
          expectedRevisionNumber: 2,
          media: { kind: 'asset', assetId: sourceAssetId },
          target: { kind: 'new', title: 'Launch master' },
          renditions: [
            {
              media: { kind: 'asset', assetId: renditionAssetId },
              specification: phoneSpecification,
            },
          ],
        },
      }),
    );

    renderSection(session(), { currentValue: placedCurrent() });

    await waitFor(() => expect(saves).toBe(1));
    expect(vi.mocked(renderVideoEdit)).not.toHaveBeenCalled();
    expect(uploads).toHaveLength(0);
  });

  it('degrades to the original shape when the browser cannot re-frame, and still saves', async () => {
    const user = userEvent.setup();
    renderCapable.mockReturnValue(false);
    const propose = vi.fn(() => true);
    let saved = 0;
    mockApiServer.use(
      http.post(`*/api/projects/${projectId}/outputs`, () => {
        saved += 1;
        return HttpResponse.json(outputResponse(crypto.randomUUID()), { status: 201 });
      }),
    );
    renderSection({ ...session(), propose });

    expect(screen.getByText('Local editor unavailable')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Phone, full screen' })).toBeDisabled();

    await submitNewVideo(user);

    await waitFor(() => expect(saved).toBe(1));
    expect(propose).not.toHaveBeenCalled();
    expect(await screen.findByRole('link', { name: /^Download Launch master/u })).toBeVisible();
  });
});
