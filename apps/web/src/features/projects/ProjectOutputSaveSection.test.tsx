// @vitest-environment jsdom

import type {
  ProjectCurrentResponse,
  SavedVideoSummary,
  SaveProjectOutputResponse,
} from '@studio/contracts';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteStateTestProvider } from '../../test/RemoteStateTestProvider';
import { mockApiServer } from '../../test/msw/server';
import { StudioDesignProvider } from '../../ui';
import { ProjectOutputSaveSection } from './ProjectOutputSaveSection';
import { projectOutputOperationStorageKey } from './projectOutputOperationStorage';
import type { ProjectSessionPort } from './useProjectSession';

const ownerUserId = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const projectId = '18b120ac-1578-46e3-8c3d-42307772f391';
const sourceAssetId = 'a1289672-bfb5-4214-94f7-4bd54f12ce06';
const producingRevisionId = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const resultRevisionId = '99a972fe-bfb5-5214-94f7-4bd54f12ce06';
const savedVideoId = '62f18176-14c6-4a2a-b615-0058e89ea46c';
const versionId = 'b2289672-bfb5-4214-94f7-4bd54f12ce06';
const now = '2026-08-13T16:00:00.000Z';

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
  render(
    <StudioDesignProvider>
      <RemoteStateTestProvider>
        <ProjectOutputSaveSection
          current={currentValue}
          session={port}
          archived={archived}
          {...(owner === null ? {} : { ownerUserId: owner })}
        />
      </RemoteStateTestProvider>
    </StudioDesignProvider>,
  );

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
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('Project output save UI', () => {
  it('keeps Save as New Video separate and sends one exact current-media command', async () => {
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

    expect(screen.getByText('All changes saved', { exact: false })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save as New Video' }));
    await user.click(screen.getByRole('button', { name: 'Close panel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Save as New Video' })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Save as New Video' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Save as New Video' })).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Save as New Video' })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Save as New Video' }));
    const dialog = screen.getByRole('dialog', { name: 'Save as New Video' });
    const title = within(dialog).getByRole('textbox', { name: 'Video title' });
    await user.clear(title);
    await user.type(title, 'Launch master');
    await user.click(within(dialog).getByRole('button', { name: 'Save as New Video' }));

    expect(await screen.findByText('Saved “Launch master” as Version 1.')).toBeVisible();
    expect(operationId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(requestBody).toEqual({
      expectedVersion: 2,
      expectedRevisionNumber: 2,
      media: { kind: 'asset', assetId: sourceAssetId },
      target: { kind: 'new', title: 'Launch master' },
    });
    expect(acceptCurrent).toHaveBeenCalledWith({
      project: outputResponse(operationId).project,
      revision: outputResponse(operationId).revision,
    });
  });

  it('requires target selection and a second confirmation before Add Version', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Add Version' }));
    let picker = await screen.findByRole('dialog', { name: 'Choose Add Version target' });
    await user.click(within(picker).getByRole('button', { name: 'Close panel' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Choose Add Version target' }),
      ).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Add Version' }));
    picker = await screen.findByRole('dialog', { name: 'Choose Add Version target' });
    await user.click(within(picker).getByRole('button', { name: /Existing master/u }));
    let confirmation = await screen.findByRole('dialog', { name: 'Confirm Add Version' });
    expect(confirmation).toHaveTextContent('Target: Existing master');
    expect(confirmation).toHaveTextContent('Current Version 3');
    expect(posted).toBeNull();
    await user.click(within(confirmation).getByRole('button', { name: 'Cancel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Confirm Add Version' })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Add Version' }));
    picker = await screen.findByRole('dialog', { name: 'Choose Add Version target' });
    await user.click(within(picker).getByRole('button', { name: /Existing master/u }));
    confirmation = await screen.findByRole('dialog', { name: 'Confirm Add Version' });
    await user.click(within(confirmation).getByRole('button', { name: 'Close panel' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Confirm Add Version' })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Add Version' }));
    picker = await screen.findByRole('dialog', { name: 'Choose Add Version target' });
    await user.click(within(picker).getByRole('button', { name: /Existing master/u }));
    confirmation = await screen.findByRole('dialog', { name: 'Confirm Add Version' });
    await user.click(within(confirmation).getByRole('button', { name: 'Add Version' }));

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
      }),
    );
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
    await user.click(screen.getByRole('button', { name: 'Save as New Video' }));
    const dialog = screen.getByRole('dialog', { name: 'Save as New Video' });
    const title = within(dialog).getByRole('textbox', { name: 'Video title' });
    await user.clear(title);
    await user.type(title, 'Launch master');
    await user.click(within(dialog).getByRole('button', { name: 'Save as New Video' }));
    expect(await screen.findByText(/save response was unavailable/u)).toBeVisible();
    expect(
      window.localStorage.getItem(projectOutputOperationStorageKey(ownerUserId, projectId)),
    ).not.toBeNull();

    first.unmount();
    renderSection();
    expect(await screen.findByText('Saved “Launch master” as Version 1.')).toBeVisible();
    expect(operations).toHaveLength(2);
    expect(operations[1]).toBe(operations[0]);
    expect(bodies[1]).toEqual(bodies[0]);
    expect(
      window.localStorage.getItem(projectOutputOperationStorageKey(ownerUserId, projectId)),
    ).toBeNull();
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

    await user.click(screen.getByRole('button', { name: 'Save as New Video' }));
    const dialog = screen.getByRole('dialog', { name: 'Save as New Video' });
    await user.click(within(dialog).getByRole('button', { name: 'Save as New Video' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The authenticated owner could not be bound to this save operation.',
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

    await user.click(screen.getByRole('button', { name: 'Save as New Video' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Save as New Video' })).getByRole('button', {
        name: 'Save as New Video',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Resolve the preserved Project proposal before saving an output.',
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
      http.post(`*/api/projects/${projectId}/outputs`, () => {
        outputRequests += 1;
        return HttpResponse.error();
      }),
    );
    const user = userEvent.setup();
    renderSection(port);

    await user.click(screen.getByRole('button', { name: 'Save as New Video' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Save as New Video' })).getByRole('button', {
        name: 'Save as New Video',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Project no longer has the exact ready media selected for this save.',
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

    await user.click(screen.getByRole('button', { name: 'Save as New Video' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Save as New Video' })).getByRole('button', {
        name: 'Save as New Video',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Browser operation storage is unavailable, so the reload-safe output save was not started.',
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

    await user.click(screen.getByRole('button', { name: 'Save as New Video' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Save as New Video' })).getByRole('button', {
        name: 'Save as New Video',
      }),
    );
    expect(await screen.findByText(/save response was unavailable/u)).toBeVisible();
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Save as New Video' })).not.toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Reconcile saved operation' }));

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
    const user = userEvent.setup();
    renderSection();

    await user.click(screen.getByRole('button', { name: 'Save as New Video' }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Save as New Video' })).getByRole('button', {
        name: 'Save as New Video',
      }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The Project changed before output save.',
    );
    expect(
      window.localStorage.getItem(projectOutputOperationStorageKey(ownerUserId, projectId)),
    ).toBeNull();
  });
});
