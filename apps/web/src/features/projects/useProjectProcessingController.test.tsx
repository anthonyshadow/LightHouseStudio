// @vitest-environment jsdom

import type {
  ProjectCurrentResponse,
  ProjectProcessingAttempt,
  ProjectProcessingCurrentResponse,
} from '@studio/contracts';
import { act, renderHook, waitFor } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { jsonScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';
import type { ProjectSessionPort } from './useProjectSession';
import { useProjectProcessingController } from './useProjectProcessingController';

const ids = {
  project: '18b120ac-1578-46e3-8c3d-42307772f391',
  revision: '89a972fe-bfb5-4214-94f7-4bd54f12ce06',
  resultRevision: '4a31b6c7-8a54-4878-b240-182652a34d31',
  operation: '2efcc6c3-e82c-419a-8807-c0026170fb75',
  retry: '3efcc6c3-e82c-419a-8807-c0026170fb75',
  asset: '5efcc6c3-e82c-419a-8807-c0026170fb75',
};
const now = '2026-08-13T12:00:00.000Z';

const currentProject = (
  revisionId = ids.revision,
  revisionNumber = 2,
  version = 3,
  projectId = ids.project,
): ProjectCurrentResponse => ({
  project: {
    id: projectId,
    campaignId: null,
    title: 'Launch cut',
    status: revisionId === ids.resultRevision ? 'ready' : 'processing',
    version,
    currentRevisionId: revisionId,
    currentRevisionNumber: revisionNumber,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  },
  revision: {
    id: revisionId,
    projectId,
    revisionNumber,
    parentRevisionId: null,
    parentRevisionNumber: null,
    snapshot: {
      schemaVersion: 2,
      sourceAssetId: ids.asset,
      workingMedia: { kind: 'asset', assetId: ids.asset },
      presentedMedia: { kind: 'asset', assetId: ids.asset },
      selectedCharacter: {
        characterId: 'character-one',
        characterLabel: 'Presenter',
        characterRevision: now,
        variantId: null,
        variantLabel: null,
        variantRevision: null,
        referenceAssetId: null,
      },
      selectedOutfit: null,
      selectedVoice: null,
      visualTreatment: {
        kind: 'character-swap',
        providerId: null,
        outputResolution: null,
      },
      liveMode: null,
      creativeIntent: {
        promptId: null,
        promptLabel: null,
        recipeId: null,
        recipeLabel: null,
        userIntent: 'Use the saved character',
        appliedPrompt: 'Use the saved character',
        referenceAssetId: null,
        resourceRevision: null,
      },
      localEdit: null,
      exportSpecification: null,
      lastSuccessfulOutput: null,
      workflowPhase: revisionId === ids.resultRevision ? 'review' : 'creative',
      createdAt: now,
      updatedAt: now,
    },
    authorKind: 'user',
    source: revisionId === ids.resultRevision ? 'job-result' : 'user-edit',
    createdAt: now,
  },
});

const attempt = (overrides: Partial<ProjectProcessingAttempt> = {}): ProjectProcessingAttempt => ({
  operationId: ids.operation,
  projectId: ids.project,
  capability: 'character-swap',
  attemptNumber: 1,
  retryOfOperationId: null,
  initiatingRevisionId: ids.revision,
  initiatingRevisionNumber: 2,
  phase: 'accepted',
  isCurrent: true,
  ambiguous: false,
  cancellation: 'unsupported',
  retryPolicy: 'not-allowed',
  blocksArchive: true,
  createdAt: now,
  updatedAt: now,
  acceptedAt: now,
  completedAt: null,
  expiresAt: '2026-08-13T13:00:00.000Z',
  nextPollAfterMs: 10_000,
  result: null,
  error: null,
  ...overrides,
});

const currentResponse = (
  processingAttempt: ProjectProcessingAttempt | null,
  projectId = ids.project,
): ProjectProcessingCurrentResponse => ({
  projectId,
  currentProjectVersion: 3,
  currentRevisionId: ids.revision,
  currentRevisionNumber: 2,
  attempt: processingAttempt,
});

const createSession = (projectId = ids.project) => {
  let current = currentProject(ids.revision, 2, 3, projectId);
  const acceptCurrent = vi.fn((next: ProjectCurrentResponse) => {
    current = next;
  });
  const session = {
    projectId,
    phase: 'saved',
    current,
    proposal: null,
    hasLocalProposal: false,
    message: null,
    propose: vi.fn(() => true),
    flush: vi.fn(() => Promise.resolve(true)),
    retry: vi.fn(() => Promise.resolve(true)),
    discard: vi.fn(() => true),
    getCurrent: () => current,
    acceptCurrent,
  } as ProjectSessionPort;
  return { session, acceptCurrent };
};

const historyPath = `/api/projects/${ids.project}/processing/history`;
const currentPath = `/api/projects/${ids.project}/processing/current`;

afterEach(() => vi.restoreAllMocks());

describe('useProjectProcessingController', () => {
  it('reconnects a queued operation on hydrate without creating another submission', async () => {
    const { session } = createSession();
    let submitCount = 0;
    mockApiServer.use(
      jsonScenario('GET', currentPath, { body: currentResponse(attempt()) }),
      http.post(`*${`/api/projects/${ids.project}/processing/submit`}`, () => {
        submitCount += 1;
        return HttpResponse.json(
          { error: { code: 'unexpected', message: 'Do not submit.' } },
          { status: 500 },
        );
      }),
    );

    const hook = renderHook(() =>
      useProjectProcessingController({
        projectId: ids.project,
        session,
        checkpointCreative: vi.fn(() => Promise.resolve(true)),
      }),
    );

    await waitFor(() => expect(hook.result.current.attempt?.phase).toBe('accepted'));
    expect(hook.result.current.active).toBe(true);
    expect(submitCount).toBe(0);
  });

  it('replays the same pre-linked operation after response loss and never uses the legacy job path', async () => {
    const { session } = createSession();
    const checkpointCreative = vi.fn(() => Promise.resolve(true));
    const operationKeys: string[] = [];
    let requestCount = 0;
    let legacySubmitCount = 0;
    mockApiServer.use(
      jsonScenario('GET', currentPath, { body: currentResponse(null) }),
      jsonScenario('GET', historyPath, { body: { attempts: [], nextCursor: null } }),
      jsonScenario('GET', `/api/projects/${ids.project}`, { body: currentProject() }),
      http.post(`*/api/projects/${ids.project}/processing/submit`, ({ request }) => {
        requestCount += 1;
        operationKeys.push(request.headers.get('idempotency-key') ?? '');
        if (requestCount === 1) return HttpResponse.error();
        return HttpResponse.json(
          { replayed: true, attempt: attempt({ operationId: operationKeys[0]! }) },
          { status: 200 },
        );
      }),
      http.put('*/api/video-jobs/*', () => {
        legacySubmitCount += 1;
        return HttpResponse.json(
          { error: { code: 'legacy_path', message: 'Legacy path used.' } },
          { status: 500 },
        );
      }),
    );

    const hook = renderHook(() =>
      useProjectProcessingController({
        projectId: ids.project,
        session,
        checkpointCreative,
      }),
    );
    await waitFor(() => expect(hook.result.current.phase).toBe('idle'));

    await act(async () => {
      await hook.result.current.start('character-swap');
    });

    expect(checkpointCreative).toHaveBeenCalledOnce();
    expect(operationKeys).toHaveLength(2);
    expect(legacySubmitCount).toBe(0);
    expect(operationKeys[0]).toMatch(/^[0-9a-f-]{36}$/u);
    expect(operationKeys[1]).toBe(operationKeys[0]);
    expect(hook.result.current.attempt).toMatchObject({
      operationId: operationKeys[0],
      phase: 'accepted',
    });
  });

  it('does not replay a deterministic active-job conflict and preserves its actionable reason', async () => {
    const { session } = createSession();
    let submitCount = 0;
    mockApiServer.use(
      jsonScenario('GET', currentPath, { body: currentResponse(null) }),
      jsonScenario('GET', historyPath, { body: { attempts: [], nextCursor: null } }),
      http.post(`*/api/projects/${ids.project}/processing/submit`, () => {
        submitCount += 1;
        return HttpResponse.json(
          {
            error: {
              code: 'generation_in_progress',
              message:
                'Another video edit is still processing. Wait for it to finish, then start this Project edit again.',
            },
          },
          { status: 409 },
        );
      }),
    );
    const hook = renderHook(() =>
      useProjectProcessingController({
        projectId: ids.project,
        session,
        checkpointCreative: vi.fn(() => Promise.resolve(true)),
      }),
    );
    await waitFor(() => expect(hook.result.current.phase).toBe('idle'));

    await act(async () => {
      await hook.result.current.start('character-swap');
    });

    expect(submitCount).toBe(1);
    expect(hook.result.current.phase).toBe('error');
    expect(hook.result.current.message).toBe(
      'Another video edit is still processing. Wait for it to finish, then start this Project edit again.',
    );
    expect(hook.result.current.unverifiedOperationId).toBeNull();
  });

  it('locks an unverified server failure after exact replay so Start cannot create another operation', async () => {
    const { session } = createSession();
    let submitCount = 0;
    mockApiServer.use(
      jsonScenario('GET', currentPath, { body: currentResponse(null) }),
      jsonScenario('GET', historyPath, { body: { attempts: [], nextCursor: null } }),
      http.post(`*/api/projects/${ids.project}/processing/submit`, () => {
        submitCount += 1;
        return HttpResponse.json(
          { error: { code: 'feature_unavailable', message: 'Status could not be verified.' } },
          { status: 503 },
        );
      }),
    );
    const hook = renderHook(() =>
      useProjectProcessingController({
        projectId: ids.project,
        session,
        checkpointCreative: vi.fn(() => Promise.resolve(true)),
      }),
    );
    await waitFor(() => expect(hook.result.current.phase).toBe('idle'));

    await act(async () => {
      await hook.result.current.start('character-swap');
    });
    await waitFor(() =>
      expect(hook.result.current.unverifiedOperationId).toMatch(/^[0-9a-f-]{36}$/u),
    );
    await act(async () => {
      await hook.result.current.start('character-swap');
    });

    expect(submitCount).toBe(2);
    expect(hook.result.current.authorityReady).toBe(false);
  });

  it('does not auto-retry ambiguity and sends a new acknowledged operation only on explicit retry', async () => {
    const { session } = createSession();
    const ambiguous = attempt({
      phase: 'needs-attention',
      ambiguous: true,
      retryPolicy: 'explicit-cost-confirmation',
      blocksArchive: true,
      acceptedAt: null,
      completedAt: now,
      nextPollAfterMs: null,
      error: {
        code: 'submission_ambiguous',
        message: 'Submission may have been accepted. Review cost before another attempt.',
      },
    });
    const retryBodies: unknown[] = [];
    mockApiServer.use(
      jsonScenario('GET', currentPath, { body: currentResponse(ambiguous) }),
      jsonScenario('GET', `/api/projects/${ids.project}`, { body: currentProject() }),
      http.post(`*/api/projects/${ids.project}/processing/retry`, async ({ request }) => {
        retryBodies.push(await request.json());
        return HttpResponse.json(
          {
            replayed: false,
            attempt: attempt({
              operationId: ids.retry,
              retryOfOperationId: ids.operation,
              attemptNumber: 2,
            }),
          },
          { status: 202 },
        );
      }),
    );

    const hook = renderHook(() =>
      useProjectProcessingController({
        projectId: ids.project,
        session,
        checkpointCreative: vi.fn(() => Promise.resolve(true)),
      }),
    );
    await waitFor(() => expect(hook.result.current.attempt?.ambiguous).toBe(true));
    expect(retryBodies).toHaveLength(0);

    await act(async () => {
      await hook.result.current.retry();
    });

    expect(retryBodies).toEqual([
      expect.objectContaining({
        previousOperationId: ids.operation,
        acknowledgePossibleDuplicateCost: true,
      }),
    ]);
    expect(hook.result.current.attempt).toMatchObject({
      operationId: ids.retry,
      retryOfOperationId: ids.operation,
      attemptNumber: 2,
    });
  });

  it('requests cancellation only when authority advertises it and preserves the verified result', async () => {
    const { session, acceptCurrent } = createSession();
    const cancellable = attempt({ cancellation: 'available' });
    const cancelled = attempt({
      phase: 'cancelled',
      cancellation: 'cancelled',
      retryPolicy: 'explicit',
      blocksArchive: false,
      completedAt: now,
      nextPollAfterMs: null,
    });
    const cancelBodies: unknown[] = [];
    mockApiServer.use(
      jsonScenario('GET', currentPath, { body: currentResponse(cancellable) }),
      http.post(`*/api/projects/${ids.project}/processing/cancel`, async ({ request }) => {
        cancelBodies.push(await request.json());
        return HttpResponse.json({ replayed: true, attempt: cancelled });
      }),
      jsonScenario('GET', `/api/projects/${ids.project}`, { body: currentProject() }),
    );

    const hook = renderHook(() =>
      useProjectProcessingController({
        projectId: ids.project,
        session,
        checkpointCreative: vi.fn(() => Promise.resolve(true)),
      }),
    );
    await waitFor(() => expect(hook.result.current.attempt?.cancellation).toBe('available'));

    await act(async () => {
      await hook.result.current.cancel();
    });

    expect(cancelBodies).toEqual([{ operationId: ids.operation }]);
    expect(hook.result.current.attempt).toMatchObject({
      phase: 'cancelled',
      cancellation: 'cancelled',
      blocksArchive: false,
    });
    expect(acceptCurrent).toHaveBeenCalledOnce();
  });

  it('refreshes Project authority after a current result is retained', async () => {
    const { session, acceptCurrent } = createSession();
    const retained = attempt({
      phase: 'complete',
      blocksArchive: false,
      nextPollAfterMs: null,
      completedAt: now,
      result: {
        assetId: ids.asset,
        retainedAt: now,
        historical: false,
        contentUrl: `/api/projects/${ids.project}/processing/${ids.operation}/result/content`,
        media: {
          mimeType: 'video/mp4',
          container: 'mp4',
          videoCodec: 'avc',
          audioCodec: 'aac',
          durationMs: 1_000,
          width: 1280,
          height: 720,
          sizeBytes: 10_000,
          hasAudio: true,
        },
      },
    });
    mockApiServer.use(
      jsonScenario('GET', currentPath, { body: currentResponse(attempt()) }),
      jsonScenario('POST', `/api/projects/${ids.project}/processing/reconcile`, {
        body: { replayed: true, attempt: retained },
      }),
      jsonScenario('GET', `/api/projects/${ids.project}`, {
        body: currentProject(ids.resultRevision, 3, 4),
      }),
    );

    const hook = renderHook(() =>
      useProjectProcessingController({
        projectId: ids.project,
        session,
        checkpointCreative: vi.fn(() => Promise.resolve(true)),
      }),
    );
    await waitFor(() => expect(hook.result.current.attempt?.phase).toBe('accepted'));

    await act(async () => {
      await hook.result.current.reconcile();
    });

    expect(hook.result.current.attempt).toMatchObject({
      phase: 'complete',
      result: { historical: false },
    });
    expect(hook.result.current.message).toBeNull();
    const acceptedCurrent = acceptCurrent.mock.calls.at(-1)?.[0];
    expect(acceptedCurrent?.project.currentRevisionId).toBe(ids.resultRevision);
    expect(acceptedCurrent?.project.status).toBe('ready');
    expect(acceptedCurrent?.revision.source).toBe('job-result');
  });

  it('isolates a late submission response after Project context switches', async () => {
    const secondProjectId = '68b120ac-1578-46e3-8c3d-42307772f391';
    const first = createSession();
    const second = createSession(secondProjectId);
    let resolveSubmission!: (response: Response) => void;
    let submissionStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      submissionStarted = resolve;
    });
    const response = new Promise<Response>((resolve) => {
      resolveSubmission = resolve;
    });
    mockApiServer.use(
      jsonScenario('GET', currentPath, { body: currentResponse(null) }),
      jsonScenario('GET', historyPath, { body: { attempts: [], nextCursor: null } }),
      jsonScenario('GET', `/api/projects/${secondProjectId}/processing/current`, {
        body: currentResponse(null, secondProjectId),
      }),
      jsonScenario('GET', `/api/projects/${secondProjectId}/processing/history`, {
        body: { attempts: [], nextCursor: null },
      }),
      http.post(`*/api/projects/${ids.project}/processing/submit`, () => {
        submissionStarted();
        return response;
      }),
    );

    const hook = renderHook(
      ({ projectId, session }: { projectId: string; session: ProjectSessionPort }) =>
        useProjectProcessingController({
          projectId,
          session,
          checkpointCreative: vi.fn(() => Promise.resolve(true)),
        }),
      { initialProps: { projectId: ids.project, session: first.session } },
    );
    await waitFor(() => expect(hook.result.current.phase).toBe('idle'));

    let startPromise!: Promise<boolean>;
    act(() => {
      startPromise = hook.result.current.start('character-swap');
    });
    await started;
    hook.rerender({ projectId: secondProjectId, session: second.session });
    await waitFor(() => expect(hook.result.current.phase).toBe('idle'));

    resolveSubmission(HttpResponse.json({ replayed: false, attempt: attempt() }, { status: 202 }));
    await act(async () => {
      await startPromise;
    });

    expect(hook.result.current.attempt).toBeNull();
    expect(second.acceptCurrent).not.toHaveBeenCalled();
  });

  it('polls an accepted operation without ever reporting it as a user-visible command', async () => {
    const { session } = createSession();
    let resolveReconcile!: (response: Response) => void;
    let reconcileStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      reconcileStarted = resolve;
    });
    const response = new Promise<Response>((resolve) => {
      resolveReconcile = resolve;
    });
    mockApiServer.use(
      jsonScenario('GET', currentPath, {
        body: currentResponse(attempt({ phase: 'processing', nextPollAfterMs: 20 })),
      }),
      jsonScenario('GET', `/api/projects/${ids.project}`, { body: currentProject() }),
      http.post(`*/api/projects/${ids.project}/processing/reconcile`, () => {
        reconcileStarted();
        return response;
      }),
    );

    const hook = renderHook(() =>
      useProjectProcessingController({
        projectId: ids.project,
        session,
        checkpointCreative: vi.fn(() => Promise.resolve(true)),
      }),
    );

    await waitFor(() => expect(hook.result.current.attempt?.phase).toBe('processing'));
    await started;

    // The automatic poll is in flight right now. It reads status; it is not work the user started,
    // so the accepted operation stays presented exactly as it was rather than the surface being
    // told to tear that down and show a command running.
    expect(hook.result.current.phase).toBe('idle');
    expect(hook.result.current.busy).toBe(false);
    expect(hook.result.current.active).toBe(true);
    expect(hook.result.current.attempt?.phase).toBe('processing');

    resolveReconcile(
      HttpResponse.json(
        {
          replayed: true,
          attempt: attempt({
            phase: 'cancelled',
            cancellation: 'cancelled',
            blocksArchive: false,
            nextPollAfterMs: null,
          }),
        },
        { status: 200 },
      ),
    );
    await waitFor(() => expect(hook.result.current.attempt?.phase).toBe('cancelled'));
    expect(hook.result.current.active).toBe(false);
  });

  it('keeps an accepted operation presented when one background status check fails', async () => {
    const { session } = createSession();
    let reconcileCount = 0;
    mockApiServer.use(
      jsonScenario('GET', currentPath, {
        body: currentResponse(attempt({ phase: 'processing', nextPollAfterMs: 20 })),
      }),
      http.post(`*/api/projects/${ids.project}/processing/reconcile`, () => {
        reconcileCount += 1;
        return HttpResponse.json(
          { error: { code: 'unexpected', message: 'Status unavailable.' } },
          { status: 503 },
        );
      }),
    );

    const hook = renderHook(() =>
      useProjectProcessingController({
        projectId: ids.project,
        session,
        checkpointCreative: vi.fn(() => Promise.resolve(true)),
      }),
    );

    await waitFor(() => expect(reconcileCount).toBeGreaterThanOrEqual(1));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(hook.result.current.phase).toBe('idle');
    expect(hook.result.current.attempt?.phase).toBe('processing');
    expect(hook.result.current.active).toBe(true);
    // Backed off rather than retried against the 20ms cadence of the operation itself.
    expect(reconcileCount).toBe(1);
  });

  it('withholds Start until the durable operation authority has actually been read', async () => {
    const { session } = createSession();
    let submitCount = 0;
    mockApiServer.use(
      jsonScenario('GET', currentPath, { body: currentResponse(null) }),
      jsonScenario('GET', historyPath, { body: { attempts: [], nextCursor: null } }),
      http.post(`*/api/projects/${ids.project}/processing/submit`, () => {
        submitCount += 1;
        return HttpResponse.json({ replayed: false, attempt: attempt() }, { status: 202 });
      }),
    );

    const hook = renderHook(
      ({ session: port }: { session: ProjectSessionPort | null }) =>
        useProjectProcessingController({
          projectId: ids.project,
          session: port,
          checkpointCreative: vi.fn(() => Promise.resolve(true)),
        }),
      { initialProps: { session: null as ProjectSessionPort | null } },
    );

    // No session yet: nothing is loading and no attempt is held, which is exactly the state that
    // must not read as "this Project has no accepted operation, go ahead and submit".
    expect(hook.result.current.phase).toBe('idle');
    expect(hook.result.current.attempt).toBeNull();
    expect(hook.result.current.authorityReady).toBe(false);
    await act(async () => {
      expect(await hook.result.current.start('character-swap')).toBe(false);
    });
    expect(submitCount).toBe(0);

    hook.rerender({ session });
    await waitFor(() => expect(hook.result.current.authorityReady).toBe(true));
  });
});
