import type {
  AppendProjectRevisionRequest,
  ProjectCurrentResponse,
  ProjectProcessingAttempt,
  ProjectProcessingCapability,
  ProjectSourceResponse,
  ProjectWorkingMediaResponse,
} from '@studio/contracts';
import type { Page } from '@playwright/test';

export const TEST_PROJECT_ID = '18b120ac-1578-46e3-8c3d-42307772f391';
const PROJECT_REVISION_ID = '89a972fe-bfb5-4214-94f7-4bd54f12ce06';
const PROJECT_SOURCE_REVISION_ID = '4159225b-60f4-4f94-a3d5-08feee91a91d';
const PROJECT_CREATIVE_REVISION_ID = '3ac244b9-ec36-4a1e-b95e-7bcf37eb0b2d';
const PROJECT_WORKING_MEDIA_REVISION_ID = '80eb98cb-0dd4-4aac-8507-084789045d71';
const PROJECT_POST_ADOPTION_CREATIVE_REVISION_ID = '66517242-ccf5-4fa5-bcee-5831039119c9';
const PROJECT_PROCESSING_RESULT_REVISION_ID = '77117242-ccf5-4fa5-bcee-5831039119c9';
const PROJECT_PROCESSING_RESULT_ASSET_ID = '88117242-ccf5-4fa5-bcee-5831039119c9';
const PROJECT_TIMESTAMP = '2030-01-01T00:00:00.000Z';

interface ProjectHarnessOptions {
  readonly completeProcessingAfterReopen?: boolean;
}

export const emptyProjectFixture = (): ProjectCurrentResponse => ({
  project: {
    id: TEST_PROJECT_ID,
    campaignId: null,
    title: 'Untitled Project',
    status: 'draft',
    version: 1,
    currentRevisionId: PROJECT_REVISION_ID,
    currentRevisionNumber: 1,
    archivedAt: null,
    deletedAt: null,
    createdAt: PROJECT_TIMESTAMP,
    updatedAt: PROJECT_TIMESTAMP,
  },
  revision: {
    id: PROJECT_REVISION_ID,
    projectId: TEST_PROJECT_ID,
    revisionNumber: 1,
    parentRevisionId: null,
    parentRevisionNumber: null,
    snapshot: {
      schemaVersion: 2,
      sourceAssetId: null,
      workingMedia: null,
      presentedMedia: null,
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
      workflowPhase: 'source',
      createdAt: PROJECT_TIMESTAMP,
      updatedAt: PROJECT_TIMESTAMP,
    },
    authorKind: 'user',
    source: 'create',
    createdAt: PROJECT_TIMESTAMP,
  },
});

export const installProjectHarness = async (
  page: Page,
  seed = false,
  options: ProjectHarnessOptions = {},
) => {
  let current: ProjectCurrentResponse | null = seed ? emptyProjectFixture() : null;
  let source: ProjectSourceResponse | null = null;
  let sourceBytes: Buffer | null = null;
  let workingMedia: ProjectWorkingMediaResponse | null = null;
  let workingMediaBytes: Buffer | null = null;
  const operationKeys: string[] = [];
  const sourceOperationKeys: string[] = [];
  const checkpointRequests: AppendProjectRevisionRequest[] = [];
  const workingMediaOperationKeys: string[] = [];
  const processingOperationKeys: string[] = [];
  const processingProviderIntents: string[] = [];
  let processingAttempt: ProjectProcessingAttempt | null = null;
  let processingReconcileCount = 0;
  let processingInitiatingRevisionId: string | null = null;
  await page.route('**/api/projects**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const detailPath = `/api/projects/${TEST_PROJECT_ID}`;
    const sourcePath = `${detailPath}/source`;
    const sourceContentPath = `${sourcePath}/content`;
    const revisionsPath = `${detailPath}/revisions`;
    const workingMediaPath = `${detailPath}/working-media`;
    const processingPath = `${detailPath}/processing`;
    if (url.pathname === `${processingPath}/current` && method === 'GET' && current) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          projectId: TEST_PROJECT_ID,
          currentProjectVersion: current.project.version,
          currentRevisionId: current.revision.id,
          currentRevisionNumber: current.revision.revisionNumber,
          attempt: processingAttempt,
        }),
      });
      return;
    }
    if (url.pathname === `${processingPath}/history` && method === 'GET' && current) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          attempts: processingAttempt ? [processingAttempt] : [],
          nextCursor: null,
        }),
      });
      return;
    }
    if (
      options.completeProcessingAfterReopen &&
      url.pathname === `${processingPath}/submit` &&
      method === 'POST' &&
      current
    ) {
      const body = request.postDataJSON() as {
        expectedVersion: number;
        expectedRevisionNumber: number;
        capability: ProjectProcessingCapability;
      };
      const operationId = request.headers()['idempotency-key'] ?? '';
      processingOperationKeys.push(operationId);
      processingProviderIntents.push(request.headers()['x-lightframe-provider-intent'] ?? '');
      processingInitiatingRevisionId = current.revision.id;
      processingAttempt = {
        operationId,
        projectId: TEST_PROJECT_ID,
        capability: body.capability,
        attemptNumber: 1,
        retryOfOperationId: null,
        initiatingRevisionId: current.revision.id,
        initiatingRevisionNumber: current.revision.revisionNumber,
        phase: 'accepted',
        isCurrent: true,
        ambiguous: false,
        cancellation: 'unsupported',
        retryPolicy: 'not-allowed',
        blocksArchive: true,
        createdAt: '2030-01-01T00:06:00.000Z',
        updatedAt: '2030-01-01T00:06:00.000Z',
        acceptedAt: '2030-01-01T00:06:00.000Z',
        completedAt: null,
        expiresAt: '2030-01-01T01:06:00.000Z',
        nextPollAfterMs: 8_000,
        result: null,
        error: null,
      };
      current = {
        ...current,
        project: {
          ...current.project,
          status: 'processing',
          version: body.expectedVersion + 1,
          updatedAt: '2030-01-01T00:06:00.000Z',
        },
      };
      if (source) source = { ...source, project: current.project, revision: current.revision };
      await route.fulfill({
        status: 202,
        contentType: 'application/json',
        body: JSON.stringify({ replayed: false, attempt: processingAttempt }),
      });
      return;
    }
    if (
      options.completeProcessingAfterReopen &&
      url.pathname === `${processingPath}/reconcile` &&
      method === 'POST' &&
      current &&
      processingAttempt &&
      source &&
      sourceBytes
    ) {
      processingReconcileCount += 1;
      const previous = current;
      const operationId = processingAttempt.operationId;
      const resultContentUrl = `${processingPath}/${operationId}/result/content`;
      current = {
        project: {
          ...previous.project,
          status: 'ready',
          version: previous.project.version + 1,
          currentRevisionId: PROJECT_PROCESSING_RESULT_REVISION_ID,
          currentRevisionNumber: previous.revision.revisionNumber + 1,
          updatedAt: '2030-01-01T00:07:00.000Z',
        },
        revision: {
          id: PROJECT_PROCESSING_RESULT_REVISION_ID,
          projectId: TEST_PROJECT_ID,
          revisionNumber: previous.revision.revisionNumber + 1,
          parentRevisionId: previous.revision.id,
          parentRevisionNumber: previous.revision.revisionNumber,
          snapshot: {
            ...previous.revision.snapshot,
            workingMedia: { kind: 'asset', assetId: PROJECT_PROCESSING_RESULT_ASSET_ID },
            presentedMedia: { kind: 'asset', assetId: PROJECT_PROCESSING_RESULT_ASSET_ID },
            workflowPhase: 'review',
            updatedAt: '2030-01-01T00:07:00.000Z',
          },
          authorKind: 'system',
          source: 'job-result',
          createdAt: '2030-01-01T00:07:00.000Z',
        },
      };
      workingMediaBytes = sourceBytes;
      const workingContentUrl = `${workingMediaPath}/${PROJECT_PROCESSING_RESULT_REVISION_ID}/content`;
      workingMedia = {
        ...current,
        isCurrent: true,
        media: {
          kind: 'media-asset',
          reference: { kind: 'asset', assetId: PROJECT_PROCESSING_RESULT_ASSET_ID },
          assetId: PROJECT_PROCESSING_RESULT_ASSET_ID,
          savedVideoId: null,
          videoVersionId: null,
          mimeType: source.source.mimeType,
          filename: 'character-swap-result.mp4',
          sizeBytes: sourceBytes.byteLength,
          checksumSha256: '1'.repeat(64),
          container: source.source.container,
          videoCodec: source.source.videoCodec,
          audioCodec: source.source.audioCodec,
          durationMs: source.source.durationMs,
          width: source.source.width,
          height: source.source.height,
          hasAudio: source.source.hasAudio,
          adoptedRevisionId: PROJECT_PROCESSING_RESULT_REVISION_ID,
          adoptedRevisionNumber: current.revision.revisionNumber,
          adoptedAt: '2030-01-01T00:07:00.000Z',
          contentUrl: workingContentUrl,
        },
      };
      source = { ...source, project: current.project, revision: current.revision };
      processingAttempt = {
        ...processingAttempt,
        initiatingRevisionId:
          processingInitiatingRevisionId ?? processingAttempt.initiatingRevisionId,
        phase: 'complete',
        blocksArchive: false,
        updatedAt: '2030-01-01T00:07:00.000Z',
        completedAt: '2030-01-01T00:07:00.000Z',
        nextPollAfterMs: null,
        result: {
          assetId: PROJECT_PROCESSING_RESULT_ASSET_ID,
          retainedAt: '2030-01-01T00:07:00.000Z',
          historical: false,
          media: {
            mimeType: source.source.mimeType,
            container: source.source.container,
            videoCodec: source.source.videoCodec,
            audioCodec: source.source.audioCodec,
            durationMs: source.source.durationMs,
            width: source.source.width,
            height: source.source.height,
            sizeBytes: sourceBytes.byteLength,
            hasAudio: source.source.hasAudio,
          },
          contentUrl: resultContentUrl,
        },
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ replayed: true, attempt: processingAttempt }),
      });
      return;
    }
    if (url.pathname === '/api/projects' && method === 'GET') {
      const lifecycle = url.searchParams.get('lifecycle');
      const projects =
        current && (current.project.archivedAt === null ? 'active' : 'archived') === lifecycle
          ? [current.project]
          : [];
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ projects, nextCursor: null }),
      });
      return;
    }
    if (url.pathname === '/api/projects' && method === 'POST') {
      operationKeys.push(request.headers()['idempotency-key'] ?? '');
      current ??= emptyProjectFixture();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(current),
      });
      return;
    }
    if (url.pathname === detailPath && method === 'GET' && current) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(current),
      });
      return;
    }
    if (url.pathname === sourcePath && method === 'POST' && current) {
      const operationKey = request.headers()['idempotency-key'] ?? '';
      sourceOperationKeys.push(operationKey);
      const metadata = JSON.parse(
        decodeURIComponent(request.headers()['x-lightframe-project-source'] ?? ''),
      ) as {
        expectedVersion: number;
        expectedRevisionNumber: number;
        kind: 'uploaded' | 'recorded';
        filename: string;
      };
      sourceBytes = request.postDataBuffer() ?? Buffer.from('project-source');
      current = {
        project: {
          ...current.project,
          status: 'ready',
          version: metadata.expectedVersion + 1,
          currentRevisionId: PROJECT_SOURCE_REVISION_ID,
          currentRevisionNumber: metadata.expectedRevisionNumber + 1,
          updatedAt: '2030-01-01T00:03:00.000Z',
        },
        revision: {
          ...current.revision,
          id: PROJECT_SOURCE_REVISION_ID,
          revisionNumber: metadata.expectedRevisionNumber + 1,
          parentRevisionId: current.revision.id,
          parentRevisionNumber: current.revision.revisionNumber,
          snapshot: {
            ...current.revision.snapshot,
            sourceAssetId: operationKey,
            workingMedia: { kind: 'asset', assetId: operationKey },
            presentedMedia: { kind: 'asset', assetId: operationKey },
            workflowPhase: 'creative',
            updatedAt: '2030-01-01T00:03:00.000Z',
          },
          source: 'user-edit',
          createdAt: '2030-01-01T00:03:00.000Z',
        },
      };
      source = {
        ...current,
        source: {
          kind: metadata.kind,
          savedVideoId: null,
          videoVersionId: null,
          mimeType: 'video/mp4',
          filename: metadata.filename,
          sizeBytes: sourceBytes.byteLength,
          container: 'mp4',
          videoCodec: 'avc',
          audioCodec: 'aac',
          durationMs: 1_000,
          width: 1_280,
          height: 720,
          hasAudio: true,
          acceptedAt: '2030-01-01T00:03:00.000Z',
          contentUrl: sourceContentPath,
        },
      };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(source),
      });
      return;
    }
    if (url.pathname === revisionsPath && method === 'POST' && current) {
      const body = request.postDataJSON() as AppendProjectRevisionRequest;
      checkpointRequests.push(body);
      const previous = current;
      const revisionId =
        previous.revision.id === PROJECT_WORKING_MEDIA_REVISION_ID
          ? PROJECT_POST_ADOPTION_CREATIVE_REVISION_ID
          : PROJECT_CREATIVE_REVISION_ID;
      current = {
        project: {
          ...previous.project,
          version: body.expectedVersion + 1,
          currentRevisionId: revisionId,
          currentRevisionNumber: body.expectedRevisionNumber + 1,
          updatedAt: '2030-01-01T00:04:00.000Z',
        },
        revision: {
          id: revisionId,
          projectId: TEST_PROJECT_ID,
          revisionNumber: body.expectedRevisionNumber + 1,
          parentRevisionId: previous.revision.id,
          parentRevisionNumber: previous.revision.revisionNumber,
          snapshot: {
            ...previous.revision.snapshot,
            ...body.proposal,
            sourceAssetId: previous.revision.snapshot.sourceAssetId,
            workingMedia: previous.revision.snapshot.workingMedia,
            presentedMedia: previous.revision.snapshot.presentedMedia,
            lastSuccessfulOutput: null,
            updatedAt: '2030-01-01T00:04:00.000Z',
          },
          authorKind: 'user',
          source: 'user-edit',
          createdAt: '2030-01-01T00:04:00.000Z',
        },
      };
      if (source) source = { ...source, project: current.project, revision: current.revision };
      if (workingMedia) {
        const isCurrent =
          JSON.stringify(current.revision.snapshot.workingMedia) ===
            JSON.stringify(workingMedia.media.reference) &&
          JSON.stringify(current.revision.snapshot.presentedMedia) ===
            JSON.stringify(workingMedia.media.reference);
        workingMedia = {
          ...workingMedia,
          project: current.project,
          revision: current.revision,
          isCurrent,
        };
      }
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(current),
      });
      return;
    }
    if (url.pathname === workingMediaPath && method === 'POST' && current) {
      const operationKey = request.headers()['idempotency-key'] ?? '';
      workingMediaOperationKeys.push(operationKey);
      const metadata = JSON.parse(
        decodeURIComponent(request.headers()['x-lightframe-project-working-media'] ?? ''),
      ) as {
        expectedVersion: number;
        expectedRevisionNumber: number;
        filename: string;
        localEdit: NonNullable<ProjectCurrentResponse['revision']['snapshot']['localEdit']>;
      };
      workingMediaBytes = request.postDataBuffer() ?? Buffer.from('project-working-media');
      const previous = current;
      current = {
        project: {
          ...previous.project,
          status: 'ready',
          version: metadata.expectedVersion + 1,
          currentRevisionId: PROJECT_WORKING_MEDIA_REVISION_ID,
          currentRevisionNumber: metadata.expectedRevisionNumber + 1,
          updatedAt: '2030-01-01T00:05:00.000Z',
        },
        revision: {
          id: PROJECT_WORKING_MEDIA_REVISION_ID,
          projectId: TEST_PROJECT_ID,
          revisionNumber: metadata.expectedRevisionNumber + 1,
          parentRevisionId: previous.revision.id,
          parentRevisionNumber: previous.revision.revisionNumber,
          snapshot: {
            ...previous.revision.snapshot,
            workingMedia: { kind: 'asset', assetId: operationKey },
            presentedMedia: { kind: 'asset', assetId: operationKey },
            localEdit: metadata.localEdit,
            lastSuccessfulOutput: null,
            workflowPhase: 'review',
            updatedAt: '2030-01-01T00:05:00.000Z',
          },
          authorKind: 'user',
          source: 'user-edit',
          createdAt: '2030-01-01T00:05:00.000Z',
        },
      };
      const contentUrl = `${workingMediaPath}/${PROJECT_WORKING_MEDIA_REVISION_ID}/content`;
      workingMedia = {
        ...current,
        isCurrent: true,
        media: {
          kind: 'local-render',
          reference: { kind: 'asset', assetId: operationKey },
          assetId: operationKey,
          savedVideoId: null,
          videoVersionId: null,
          mimeType: 'video/mp4',
          filename: metadata.filename,
          sizeBytes: workingMediaBytes.byteLength,
          checksumSha256: '0'.repeat(64),
          container: 'mp4',
          videoCodec: 'avc',
          audioCodec: 'aac',
          durationMs: 1_000,
          width: 1_280,
          height: 720,
          hasAudio: true,
          adoptedRevisionId: PROJECT_WORKING_MEDIA_REVISION_ID,
          adoptedRevisionNumber: metadata.expectedRevisionNumber + 1,
          adoptedAt: '2030-01-01T00:05:00.000Z',
          contentUrl,
        },
      };
      if (source) source = { ...source, project: current.project, revision: current.revision };
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify(workingMedia),
      });
      return;
    }
    if (url.pathname === workingMediaPath && method === 'GET' && workingMedia) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(workingMedia),
      });
      return;
    }
    if (workingMedia && workingMediaBytes && url.pathname === workingMedia.media.contentUrl) {
      const range = request.headers().range;
      const match = range?.match(/^bytes=(\d+)-(\d+)$/u);
      const start = match ? Number(match[1]) : 0;
      const end = match ? Number(match[2]) : workingMediaBytes.byteLength - 1;
      const body = workingMediaBytes.subarray(start, end + 1);
      await route.fulfill({
        status: match ? 206 : 200,
        contentType: 'video/mp4',
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(body.byteLength),
          ...(match
            ? { 'Content-Range': `bytes ${start}-${end}/${workingMediaBytes.byteLength}` }
            : {}),
        },
        ...(method === 'HEAD' ? {} : { body }),
      });
      return;
    }
    if (url.pathname === sourcePath && method === 'GET' && source) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(source),
      });
      return;
    }
    if (url.pathname === sourceContentPath && source && sourceBytes) {
      const range = request.headers().range;
      const match = range?.match(/^bytes=(\d+)-(\d+)$/u);
      const start = match ? Number(match[1]) : 0;
      const end = match ? Number(match[2]) : sourceBytes.byteLength - 1;
      const body = sourceBytes.subarray(start, end + 1);
      await route.fulfill({
        status: match ? 206 : 200,
        contentType: 'video/mp4',
        headers: {
          'Accept-Ranges': 'bytes',
          'Content-Length': String(body.byteLength),
          ...(match ? { 'Content-Range': `bytes ${start}-${end}/${sourceBytes.byteLength}` } : {}),
        },
        ...(method === 'HEAD' ? {} : { body }),
      });
      return;
    }
    if (url.pathname === detailPath && method === 'PATCH' && current) {
      const body = request.postDataJSON() as { title: string; expectedVersion: number };
      current = {
        ...current,
        project: {
          ...current.project,
          title: body.title,
          version: body.expectedVersion + 1,
          updatedAt: '2030-01-01T00:01:00.000Z',
        },
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(current),
      });
      return;
    }
    const lifecycle = url.pathname.match(new RegExp(`^${detailPath}/(archive|restore)$`, 'u'))?.[1];
    if (lifecycle && method === 'POST' && current) {
      const body = request.postDataJSON() as { expectedVersion: number };
      current = {
        ...current,
        project: {
          ...current.project,
          status: lifecycle === 'archive' ? 'archived' : 'draft',
          version: body.expectedVersion + 1,
          archivedAt: lifecycle === 'archive' ? '2030-01-01T00:02:00.000Z' : null,
          updatedAt: '2030-01-01T00:02:00.000Z',
        },
      };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(current),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { code: 'not_found', message: 'Project unavailable.' } }),
    });
  });
  return {
    operationKeys,
    sourceOperationKeys,
    checkpointRequests,
    workingMediaOperationKeys,
    processingOperationKeys,
    processingProviderIntents,
    get processingReconcileCount() {
      return processingReconcileCount;
    },
  };
};
