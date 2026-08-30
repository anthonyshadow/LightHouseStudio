import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  projectCurrentResponseSchema,
  projectProcessingCurrentResponseSchema,
  projectProcessingHistoryResponseSchema,
  projectProcessingMutationResponseSchema,
  type ProjectProcessingCurrentResponse,
  type ProjectProcessingMutationResponse,
} from '@studio/contracts';
import { createApp } from '../../app.js';
import {
  type ExistingVideoJobProvider,
  VideoJobProviderError,
} from '../../providers/video-jobs/video-job-provider.js';
import { testConfig } from '../../test/fakes.js';
import { FileProjectRepository } from './file-project-repository.js';

const ownerDigest = createHash('sha256').update('localhost:5173').digest('hex');
const ownerUserId = `${ownerDigest.slice(0, 8)}-${ownerDigest.slice(8, 12)}-4${ownerDigest.slice(13, 16)}-a${ownerDigest.slice(17, 20)}-${ownerDigest.slice(20, 32)}`;
const browserHeaders = {
  host: 'localhost:5173',
  origin: 'http://localhost:5173',
};
const providerHeaders = {
  ...browserHeaders,
  'x-lightframe-provider-intent': 'video',
};

class DeterministicVideoProvider implements ExistingVideoJobProvider {
  submissions = 0;
  statusCalls = 0;
  nextStatus: 'pending' | 'processing' | 'completed' | 'failed' = 'pending';
  rejectSubmission = false;
  submissionFailure: VideoJobProviderError | null = null;
  observeSubmission?: () => Promise<void>;

  async submit(): Promise<{ providerJobId: string; status: 'pending' }> {
    this.submissions += 1;
    await this.observeSubmission?.();
    if (this.submissionFailure !== null) throw this.submissionFailure;
    if (this.rejectSubmission) throw new TypeError('private response loss');
    return { providerJobId: `provider-job-${this.submissions}`, status: 'pending' };
  }

  status(): Promise<{ status: 'pending' | 'processing' | 'completed' | 'failed' }> {
    this.statusCalls += 1;
    return Promise.resolve({ status: this.nextStatus });
  }

  async download(
    _providerJobId: string,
    destinationPath: string,
    _signal: AbortSignal,
  ): Promise<void> {
    await writeFile(destinationPath, fixture, { flag: 'wx', mode: 0o600 });
  }
}

let fixture: Buffer;

const proposal = (prompt: string) => ({
  workflowPhase: 'creative' as const,
  liveMode: null,
  selectedCharacter: {
    characterId: randomUUID(),
    characterLabel: 'Studio character',
    characterRevision: null,
    variantId: null,
    variantLabel: null,
    variantRevision: null,
    referenceAssetId: null,
  },
  selectedOutfit: null,
  selectedVoice: null,
  visualTreatment: {
    kind: 'character-swap' as const,
    providerId: 'decart',
    outputResolution: '720p' as const,
  },
  creativeIntent: {
    promptId: null,
    promptLabel: null,
    recipeId: null,
    recipeLabel: null,
    userIntent: prompt,
    appliedPrompt: prompt,
    referenceAssetId: null,
    resourceRevision: null,
  },
  localEdit: null,
  exportSpecification: null,
});

describe('Project processing route authority', () => {
  let directory: string;
  let applications: ReturnType<typeof createApp>[];

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-project-processing-'));
    applications = [];
    fixture = Buffer.from(
      (
        await readFile(
          new URL('../../../../../e2e/fixtures/decodable-h264-video.base64', import.meta.url),
          'utf8',
        )
      ).replaceAll(/\s/gu, ''),
      'base64',
    );
  });

  afterEach(async () => {
    await Promise.all(applications.map(async (app) => app.close()));
    await rm(directory, { recursive: true, force: true });
  });

  const application = (
    provider: DeterministicVideoProvider,
    repository = new FileProjectRepository(directory),
  ) => {
    const app = createApp({
      config: testConfig({ lightframeDataDir: directory }),
      decartVideoProvider: provider,
      persistence: { projects: repository, projectProcessing: repository },
    });
    applications.push(app);
    return { app, repository };
  };

  const prepareProject = async (
    app: ReturnType<typeof createApp>,
    prompt = 'Replace the on-screen character',
  ) => {
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects',
      headers: {
        ...browserHeaders,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: { title: 'Recoverable processing' },
    });
    const projectId = projectCurrentResponseSchema.parse(created.json()).project.id;
    const sourceAssetId = randomUUID();
    const source = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/source`,
      headers: {
        ...browserHeaders,
        'content-type': 'video/mp4',
        'idempotency-key': sourceAssetId,
        'x-lightframe-project-source': encodeURIComponent(
          JSON.stringify({
            expectedVersion: 1,
            expectedRevisionNumber: 1,
            kind: 'uploaded',
            filename: 'source.mp4',
          }),
        ),
      },
      payload: fixture,
    });
    expect(source.statusCode).toBe(201);
    const checkpoint = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/revisions`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: {
        expectedVersion: 2,
        expectedRevisionNumber: 2,
        proposal: proposal(prompt),
      },
    });
    expect(checkpoint.statusCode).toBe(200);
    return { projectId, sourceAssetId };
  };

  const submit = (app: ReturnType<typeof createApp>, projectId: string, operationId: string) =>
    app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/processing/submit`,
      headers: {
        ...providerHeaders,
        'content-type': 'application/json',
        'idempotency-key': operationId,
      },
      payload: {
        expectedVersion: 3,
        expectedRevisionNumber: 3,
        capability: 'character-swap',
      },
    });

  const submitStandalone = (app: ReturnType<typeof createApp>, jobId: string) => {
    const form = new FormData();
    const bytes = new Uint8Array(fixture.byteLength);
    bytes.set(fixture);
    form.append(
      'request',
      JSON.stringify({
        operation: 'character-swap',
        inputKind: 'character',
        prompt: 'Change the lighting',
        enhancePrompt: false,
        hasReferenceImage: false,
        outputResolution: '720p',
      }),
    );
    form.append('data', new Blob([bytes], { type: 'video/mp4' }), 'standalone-source.mp4');
    return app.inject({
      method: 'PUT',
      url: `/api/video-jobs/${jobId}`,
      headers: providerHeaders,
      payload: form,
    });
  };

  const current = (app: ReturnType<typeof createApp>, projectId: string) =>
    app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/processing/current`,
      headers: providerHeaders,
    });

  const waitForPhase = async (
    app: ReturnType<typeof createApp>,
    projectId: string,
    expected: ProjectProcessingCurrentResponse['attempt'] extends infer Attempt
      ? Attempt extends { phase: infer Phase }
        ? Phase
        : never
      : never,
  ): Promise<ProjectProcessingCurrentResponse> => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await current(app, projectId);
      const body = projectProcessingCurrentResponseSchema.parse(response.json());
      if (body.attempt?.phase === expected) return body;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error(`Project attempt did not reach ${String(expected)}.`);
  };

  it('pre-links before submission, reconnects a durable provider ID, and retains current success', async () => {
    const provider = new DeterministicVideoProvider();
    const first = application(provider);
    const { projectId } = await prepareProject(first.app);
    const operationId = randomUUID();
    let observedAtSubmission: Awaited<ReturnType<FileProjectRepository['getProjectAttempt']>> =
      null;
    provider.observeSubmission = async () => {
      observedAtSubmission = await first.repository.getProjectAttempt(
        ownerUserId,
        projectId,
        operationId,
      );
    };

    const started = await submit(first.app, projectId, operationId);
    expect(started.statusCode).toBe(202);
    await vi.waitFor(() => expect(observedAtSubmission).not.toBeNull());
    expect(observedAtSubmission).toMatchObject({
      operationId,
      projectId,
      initiatingRevisionNumber: 3,
      status: 'submitting',
      providerJobId: null,
    });
    await vi.waitFor(async () =>
      expect(
        (await first.repository.getProjectAttempt(ownerUserId, projectId, operationId))
          ?.providerJobId,
      ).toBe('provider-job-1'),
    );

    const replay = await submit(first.app, projectId, operationId);
    expect(replay.statusCode).toBe(200);
    expect(projectProcessingMutationResponseSchema.parse(replay.json()).replayed).toBe(true);
    expect(provider.submissions).toBe(1);

    await first.app.close();
    provider.nextStatus = 'completed';
    const restarted = application(provider, new FileProjectRepository(directory));
    const complete = await waitForPhase(restarted.app, projectId, 'complete');
    expect(provider.submissions).toBe(1);
    expect(provider.statusCalls).toBeGreaterThan(0);
    expect(complete).toMatchObject({
      currentRevisionNumber: 4,
      attempt: {
        operationId,
        phase: 'complete',
        isCurrent: true,
        result: { state: 'current' as const },
      },
    });

    const detail = await restarted.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}`,
      headers: { host: browserHeaders.host },
    });
    const detailBody = projectCurrentResponseSchema.parse(detail.json());
    expect(detailBody).toMatchObject({
      project: { version: 5, currentRevisionNumber: 4, status: 'ready' },
      revision: { source: 'job-result', snapshot: { lastSuccessfulOutput: null } },
    });
    const resultAssetId = complete.attempt?.result?.assetId;
    expect(detailBody.revision.snapshot).toMatchObject({
      workingMedia: { kind: 'asset', assetId: resultAssetId },
      presentedMedia: { kind: 'asset', assetId: resultAssetId },
    });

    const content = await restarted.app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/processing/${operationId}/result/content`,
      headers: browserHeaders,
    });
    expect(content.statusCode).toBe(200);
    expect(content.rawPayload).toEqual(fixture);
    const videos = await restarted.app.inject({
      method: 'GET',
      url: '/api/videos',
      headers: { host: browserHeaders.host },
    });
    expect(videos.json()).toMatchObject({ videos: [], total: 0 });

    const links = await restarted.repository.listLinkHistory(ownerUserId, projectId, {
      kind: 'asset',
      pageSize: 40,
    });
    expect(links?.links).toContainEqual(
      expect.objectContaining({
        assetId: resultAssetId,
        role: 'job-output',
        revisionNumber: 3,
      }),
    );
  });

  it('refuses a Project whose creative setup cannot describe a run, without failing the request', async () => {
    const { app } = application(new DeterministicVideoProvider());
    // No prompt and no reference asset: the recipe this Project describes is not runnable. The
    // schema used to reject it by throwing, which reached the operator as a bare 500.
    const { projectId } = await prepareProject(app, '');

    const response = await submit(app, projectId, randomUUID());

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: 'conflict',
        message: 'Character Swap cannot start yet. A prompt, reference image, or both is required.',
      },
    });
  });

  it('removes an accepted Project operation from the local queue without claiming provider cancellation', async () => {
    const provider = new DeterministicVideoProvider();
    const { app, repository } = application(provider);
    const { projectId } = await prepareProject(app);
    const operationId = randomUUID();

    expect((await submit(app, projectId, operationId)).statusCode).toBe(202);
    await vi.waitFor(async () =>
      expect(
        (await repository.getProjectAttempt(ownerUserId, projectId, operationId))?.providerJobId,
      ).toBe('provider-job-1'),
    );

    const cancellation = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/processing/cancel`,
      headers: { ...providerHeaders, 'content-type': 'application/json' },
      payload: { operationId },
    });

    expect(cancellation.statusCode).toBe(200);
    expect(projectProcessingMutationResponseSchema.parse(cancellation.json())).toMatchObject({
      replayed: true,
      attempt: {
        operationId,
        phase: 'cancelled',
        cancellation: 'cancelled',
        blocksArchive: false,
        nextPollAfterMs: null,
      },
    });
    expect(provider.statusCalls).toBe(0);
    expect((await repository.getCurrent(ownerUserId, projectId))?.project).toMatchObject({
      status: 'ready',
    });
  });

  it('reconciles an abandoned standalone edit before admitting Project processing', async () => {
    const provider = new DeterministicVideoProvider();
    const { app } = application(provider);
    const standaloneJobId = randomUUID();
    const standalone = await submitStandalone(app, standaloneJobId);
    expect(standalone.statusCode).toBe(202);
    await vi.waitFor(() => expect(provider.submissions).toBe(1));

    const { projectId } = await prepareProject(app);
    provider.nextStatus = 'failed';
    const projectSubmission = await submit(app, projectId, randomUUID());

    expect(projectSubmission.statusCode).toBe(202);
    expect(provider.statusCalls).toBeGreaterThan(0);
    await vi.waitFor(() => expect(provider.submissions).toBe(2));
  });

  it('returns one actionable active-job conflict without admitting duplicate Project work', async () => {
    const provider = new DeterministicVideoProvider();
    const { app } = application(provider);
    expect((await submitStandalone(app, randomUUID())).statusCode).toBe(202);
    await vi.waitFor(() => expect(provider.submissions).toBe(1));
    const { projectId } = await prepareProject(app);

    const blocked = await submit(app, projectId, randomUUID());

    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toEqual({
      error: {
        code: 'generation_in_progress',
        message:
          'Another video edit is still processing. Wait for it to finish, then start this Project edit again.',
      },
    });
    expect(provider.submissions).toBe(1);
  });

  it('retains an obsolete paid success as history without promoting current Project media', async () => {
    const provider = new DeterministicVideoProvider();
    const { app, repository } = application(provider);
    const { projectId, sourceAssetId } = await prepareProject(app);
    const operationId = randomUUID();
    await submit(app, projectId, operationId);
    await vi.waitFor(async () =>
      expect(
        (await repository.getProjectAttempt(ownerUserId, projectId, operationId))?.providerJobId,
      ).toBe('provider-job-1'),
    );

    const newer = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/revisions`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: {
        expectedVersion: 4,
        expectedRevisionNumber: 3,
        proposal: proposal('A newer exact intent'),
      },
    });
    expect(newer.statusCode).toBe(200);
    expect(newer.json()).toMatchObject({
      project: { version: 5, currentRevisionNumber: 4, status: 'ready' },
      revision: { source: 'user-edit' },
    });
    const archive = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/archive`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: 5 },
    });
    expect(archive.statusCode).toBe(409);
    expect(archive.json()).toMatchObject({ conflict: { kind: 'active-jobs' } });
    // Unresolved provider work blocks moving the source out from under it, the same way it
    // blocks archive.
    const removeSource = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/source/remove`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: 5, expectedRevisionNumber: 4 },
    });
    expect(removeSource.statusCode).toBe(409);
    expect(removeSource.json()).toMatchObject({ conflict: { kind: 'active-jobs' } });

    provider.nextStatus = 'completed';
    let retained: ProjectProcessingMutationResponse | null = null;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/projects/${projectId}/processing/reconcile`,
        headers: { ...providerHeaders, 'content-type': 'application/json' },
        payload: { operationId },
      });
      retained = projectProcessingMutationResponseSchema.parse(response.json());
      if (retained.attempt.phase === 'complete') break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(retained).toMatchObject({
      attempt: { phase: 'complete', result: { state: 'unapplied' as const } },
    });
    const currentProject = await repository.getCurrent(ownerUserId, projectId);
    expect(currentProject).toMatchObject({
      project: { version: 5, currentRevisionNumber: 4, status: 'ready' },
      revision: {
        source: 'user-edit',
        snapshot: {
          workingMedia: { kind: 'asset', assetId: sourceAssetId },
          presentedMedia: { kind: 'asset', assetId: sourceAssetId },
        },
      },
    });
  });

  it('enforces session ownership, provider intent, and strict processing bodies before submission', async () => {
    const provider = new DeterministicVideoProvider();
    const prepared = application(provider);
    const { projectId } = await prepareProject(prepared.app);
    const request = {
      expectedVersion: 3,
      expectedRevisionNumber: 3,
      capability: 'character-swap' as const,
    };

    const missingIntent = await prepared.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/processing/submit`,
      headers: {
        ...browserHeaders,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: request,
    });
    const unknownField = await prepared.app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/processing/submit`,
      headers: {
        ...providerHeaders,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: { ...request, ownerUserId },
    });
    expect(missingIntent.statusCode).toBe(403);
    expect(unknownField.statusCode).toBe(400);
    expect(provider.submissions).toBe(0);

    const authenticated = createApp({
      config: testConfig({
        demoAuthEnabled: true,
        lightframeDataDir: directory,
      }),
      decartVideoProvider: provider,
      persistence: {
        projects: prepared.repository,
        projectProcessing: prepared.repository,
      },
    });
    applications.push(authenticated);
    const unauthenticated = await authenticated.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/processing/current`,
      headers: providerHeaders,
    });
    expect(unauthenticated.statusCode).toBe(401);

    const login = await authenticated.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { login: 'demo@lightframe.local', password: 'lightframe-demo' },
    });
    const cookie = String(login.headers['set-cookie']).split(';', 1)[0]!;
    const isolatedCurrent = await authenticated.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/processing/current`,
      headers: { ...providerHeaders, cookie },
    });
    const isolatedHistory = await authenticated.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/processing/history`,
      headers: { ...browserHeaders, cookie },
    });
    const isolatedSubmit = await authenticated.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/processing/submit`,
      headers: {
        ...providerHeaders,
        cookie,
        'content-type': 'application/json',
        'idempotency-key': randomUUID(),
      },
      payload: request,
    });
    expect(isolatedCurrent.statusCode).toBe(404);
    expect(isolatedHistory.statusCode).toBe(404);
    expect(isolatedSubmit.statusCode).toBe(404);
    expect(provider.submissions).toBe(0);
  });

  it('surfaces unknown acceptance as ambiguous and requires a new cost-confirmed retry identity', async () => {
    const provider = new DeterministicVideoProvider();
    provider.rejectSubmission = true;
    const { app, repository } = application(provider);
    const { projectId } = await prepareProject(app);
    const firstOperationId = randomUUID();

    const untrusted = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/processing/submit`,
      headers: {
        ...providerHeaders,
        origin: 'https://malicious.example',
        'content-type': 'application/json',
        'idempotency-key': firstOperationId,
      },
      payload: {
        expectedVersion: 3,
        expectedRevisionNumber: 3,
        capability: 'character-swap',
      },
    });
    expect(untrusted.statusCode).toBe(403);
    expect(provider.submissions).toBe(0);

    await submit(app, projectId, firstOperationId);
    const ambiguous = await waitForPhase(app, projectId, 'needs-attention');
    expect(ambiguous.attempt).toMatchObject({
      operationId: firstOperationId,
      ambiguous: true,
      retryPolicy: 'explicit-cost-confirmation',
      error: { code: 'submission_ambiguous' },
    });
    expect(provider.submissions).toBe(1);

    const retryOperationId = randomUUID();
    const retryPayload = {
      previousOperationId: firstOperationId,
      expectedVersion: ambiguous.currentProjectVersion,
      expectedRevisionNumber: ambiguous.currentRevisionNumber,
      capability: 'character-swap',
    } as const;
    const refused = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/processing/retry`,
      headers: {
        ...providerHeaders,
        'content-type': 'application/json',
        'idempotency-key': retryOperationId,
      },
      payload: { ...retryPayload, acknowledgePossibleDuplicateCost: false },
    });
    expect(refused.statusCode).toBe(409);
    expect(provider.submissions).toBe(1);

    provider.rejectSubmission = false;
    const retried = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/processing/retry`,
      headers: {
        ...providerHeaders,
        'content-type': 'application/json',
        'idempotency-key': retryOperationId,
      },
      payload: { ...retryPayload, acknowledgePossibleDuplicateCost: true },
    });
    expect(retried.statusCode).toBe(202);
    await vi.waitFor(() => expect(provider.submissions).toBe(2));
    expect(retried.json()).toMatchObject({
      replayed: false,
      attempt: {
        operationId: retryOperationId,
        retryOfOperationId: firstOperationId,
        attemptNumber: 2,
      },
    });

    const replay = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/processing/retry`,
      headers: {
        ...providerHeaders,
        'content-type': 'application/json',
        'idempotency-key': retryOperationId,
      },
      payload: { ...retryPayload, acknowledgePossibleDuplicateCost: true },
    });
    expect(replay.statusCode).toBe(200);
    expect(provider.submissions).toBe(2);

    const currentAttemptReads = vi.spyOn(repository, 'getCurrentProjectAttempt');
    const supersessionReads = vi.spyOn(repository, 'isProjectAttemptSuperseded');
    const history = await app.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/processing/history?pageSize=20`,
      headers: browserHeaders,
    });
    expect(history.statusCode).toBe(200);
    const historyBody = projectProcessingHistoryResponseSchema.parse(history.json());
    expect(historyBody.attempts).toHaveLength(2);
    expect(
      historyBody.attempts.find(({ operationId }) => operationId === firstOperationId),
    ).toMatchObject({ isCurrent: false, blocksArchive: false });
    expect(
      historyBody.attempts.find(({ operationId }) => operationId === retryOperationId),
    ).toMatchObject({ isCurrent: true });
    expect(currentAttemptReads).not.toHaveBeenCalled();
    expect(supersessionReads).not.toHaveBeenCalled();

    const firstPage = projectProcessingHistoryResponseSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/projects/${projectId}/processing/history?pageSize=1`,
          headers: browserHeaders,
        })
      ).json(),
    );
    expect(firstPage).toMatchObject({
      attempts: [{ operationId: retryOperationId, isCurrent: true }],
    });
    expect(firstPage.nextCursor).not.toBeNull();
    const secondPage = projectProcessingHistoryResponseSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/projects/${projectId}/processing/history?pageSize=1&cursor=${encodeURIComponent(firstPage.nextCursor!)}`,
          headers: browserHeaders,
        })
      ).json(),
    );
    expect(secondPage).toMatchObject({
      attempts: [{ operationId: firstOperationId, isCurrent: false, blocksArchive: false }],
    });
    expect(currentAttemptReads).not.toHaveBeenCalled();
    expect(supersessionReads).not.toHaveBeenCalled();
  });

  it('lets a later durable attempt release an older-revision ambiguity before archive', async () => {
    const provider = new DeterministicVideoProvider();
    provider.rejectSubmission = true;
    const { app } = application(provider);
    const { projectId } = await prepareProject(app);
    const ambiguousOperationId = randomUUID();

    await submit(app, projectId, ambiguousOperationId);
    const ambiguous = await waitForPhase(app, projectId, 'needs-attention');
    expect(ambiguous.attempt).toMatchObject({
      operationId: ambiguousOperationId,
      ambiguous: true,
      blocksArchive: true,
    });

    const nextRevisionResponse = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/revisions`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: {
        expectedVersion: ambiguous.currentProjectVersion,
        expectedRevisionNumber: ambiguous.currentRevisionNumber,
        proposal: proposal('Continue with a newer exact intent'),
      },
    });
    expect(nextRevisionResponse.statusCode).toBe(200);
    const nextRevision = projectCurrentResponseSchema.parse(nextRevisionResponse.json());

    provider.rejectSubmission = false;
    provider.submissionFailure = new VideoJobProviderError('billing', 402);
    const laterOperationId = randomUUID();
    const laterSubmission = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/processing/submit`,
      headers: {
        ...providerHeaders,
        'content-type': 'application/json',
        'idempotency-key': laterOperationId,
      },
      payload: {
        expectedVersion: nextRevision.project.version,
        expectedRevisionNumber: nextRevision.revision.revisionNumber,
        capability: 'character-swap',
      },
    });
    expect(laterSubmission.statusCode).toBe(202);
    const later = await waitForPhase(app, projectId, 'needs-attention');
    expect(later.attempt).toMatchObject({ operationId: laterOperationId, ambiguous: false });

    const history = projectProcessingHistoryResponseSchema.parse(
      (
        await app.inject({
          method: 'GET',
          url: `/api/projects/${projectId}/processing/history?pageSize=20`,
          headers: browserHeaders,
        })
      ).json(),
    );
    expect(
      history.attempts.find(({ operationId }) => operationId === ambiguousOperationId),
    ).toMatchObject({ blocksArchive: false });

    const archive = await app.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/archive`,
      headers: { ...browserHeaders, 'content-type': 'application/json' },
      payload: { expectedVersion: later.currentProjectVersion },
    });
    expect(archive.statusCode).toBe(200);
    expect(archive.json()).toMatchObject({ project: { status: 'archived' } });
  });

  it('marks a restarted submitting record without provider identity ambiguous without resubmitting', async () => {
    const provider = new DeterministicVideoProvider();
    const first = application(provider);
    const { projectId } = await prepareProject(first.app);
    const currentProject = await first.repository.getCurrent(ownerUserId, projectId);
    const source = await first.repository.getSource(ownerUserId, projectId);
    if (currentProject === null || source === null) throw new Error('Expected a prepared Project.');
    const operationId = randomUUID();
    const createdAt = new Date().toISOString();
    const expiresAt = new Date(Date.parse(createdAt) + 60 * 60 * 1_000).toISOString();
    const admitted = await first.repository.admitProjectAttempt({
      expectedVersion: currentProject.project.version,
      expectedRevisionNumber: currentProject.revision.revisionNumber,
      attempt: {
        operationId,
        ownerUserId,
        projectId,
        capability: 'character-swap',
        provider: 'decart',
        providerJobId: null,
        requestFingerprint: 'a'.repeat(64),
        inputAssetId: source.assetId,
        resultAssetId: randomUUID(),
        outputAssetId: null,
        result: null,
        retryOfOperationId: null,
        attemptNumber: 1,
        initiatingRevisionId: currentProject.revision.id,
        initiatingRevisionNumber: currentProject.revision.revisionNumber,
        resultRevisionId: null,
        resultRevisionNumber: null,
        status: 'submitting',
        safeErrorCode: null,
        outputResolution: '720p',
        providerOutputLocation: null,
        sourceDurationMs: source.durationMs,
        sourceOrientation: source.width > source.height ? 'landscape' : 'portrait',
        createdAt,
        updatedAt: createdAt,
        acceptedAt: null,
        completedAt: null,
        expiresAt,
      },
      link: {
        projectId,
        ownerUserId,
        jobId: operationId,
        initiatingRevisionId: currentProject.revision.id,
        initiatingRevisionNumber: currentProject.revision.revisionNumber,
        createdAt,
      },
    });
    expect(admitted.kind).toBe('admitted');
    await first.app.close();

    const restarted = application(provider, new FileProjectRepository(directory));
    const restored = await waitForPhase(restarted.app, projectId, 'needs-attention');
    expect(restored.attempt).toMatchObject({
      operationId,
      ambiguous: true,
      retryPolicy: 'explicit-cost-confirmation',
      error: { code: 'submission_ambiguous' },
    });
    expect(provider.submissions).toBe(0);
  });

  it('surfaces provider billing with actionable safe copy and a normalized server diagnostic', async () => {
    const provider = new DeterministicVideoProvider();
    provider.submissionFailure = new VideoJobProviderError('billing', 402);
    const { app } = application(provider);
    const { projectId } = await prepareProject(app);
    const operationId = randomUUID();
    const report = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await submit(app, projectId, operationId);
    const rejected = await waitForPhase(app, projectId, 'needs-attention');

    expect(rejected.attempt).toMatchObject({
      operationId,
      ambiguous: false,
      retryPolicy: 'explicit',
      nextPollAfterMs: null,
      error: {
        code: 'provider_billing',
        message:
          'Decart rejected this attempt because the configured account needs billing or credits. Resolve the provider account before retrying.',
      },
    });
    expect(provider.submissions).toBe(1);
    expect(report).toHaveBeenCalledWith('[video-jobs] Provider submission failed.', {
      jobId: operationId,
      provider: 'decart',
      operation: 'character-swap',
      reason: 'billing',
    });
    report.mockRestore();
  });
});
