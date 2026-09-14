import {
  projectCurrentResponseSchema,
  projectHistoryResponseSchema,
  projectOutputHistoryResponseSchema,
  projectRenditionUploadResponseSchema,
  projectSourceListResponseSchema,
  projectSourceResponseSchema,
  saveProjectOutputResponseSchema,
  projectWorkingMediaResponseSchema,
  projectsResponseSchema,
  type AdoptProjectWorkingMediaRequest,
  type AppendProjectRevisionRequest,
  type ProjectCurrentResponse,
  type ProjectHistoryResponse,
  type ProjectOutputHistoryResponse,
  type ProjectPreviewContract,
  type ProjectExportSpecificationValue,
  type ProjectRenditionUploadResponse,
  type ProjectSourceCollectionItem,
  type ProjectSourceListResponse,
  type ProjectSourceResponse,
  type SaveProjectOutputRequest,
  type SaveProjectOutputResponse,
  type ProjectWorkingMediaResponse,
  type ProjectsQuery,
  type ListTotal,
} from '@studio/contracts';
import { VIDEO_RESULT_MAX_BYTES } from '@studio/contracts';
import { ApiClientError, requestJson } from '../../adapters/api-client/apiClient';
import { invalidProjectResponse, parseProjectConflict } from './projectAuthorityApi';
import { apiFetch } from '../../adapters/api-client/transport';
import { readBoundedBlob } from '../../adapters/api-client/readBoundedBlob';

export interface ProjectsPage {
  readonly projects: ProjectCurrentResponse['project'][];
  /** Keyed by Project id, and only for the Projects in this page that have something to show. */
  readonly previews: readonly ProjectPreviewContract[];
  readonly nextCursor: string | null;
  /** How many Projects match the query, counted to a ceiling rather than censused. */
  readonly total: ListTotal;
}

const jsonHeaders = { Accept: 'application/json', 'Content-Type': 'application/json' } as const;

// Re-exported so every caller keeps one import site for the Project HTTP surface; the shell's own
// static closure reaches only the module below, which is the point of it being a module.
export { getProject, ProjectApiConflictError } from './projectAuthorityApi';
export { attachProjectAsset, detachProjectAsset, listProjectAssets } from './projectAssetsApi';

export const listProjects = (
  input: Pick<ProjectsQuery, 'lifecycle' | 'pageSize'> & {
    readonly campaignId?: ProjectsQuery['campaignId'];
    readonly search?: string | undefined;
    readonly cursor?: string | undefined;
    readonly signal?: AbortSignal | undefined;
  },
): Promise<ProjectsPage> => {
  const query = new URLSearchParams({
    lifecycle: input.lifecycle,
    pageSize: String(input.pageSize),
  });
  if (input.cursor) query.set('cursor', input.cursor);
  if (input.campaignId) query.set('campaignId', input.campaignId);
  if (input.search) query.set('search', input.search);
  return requestJson(
    `/api/projects?${query.toString()}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectsResponseSchema,
    invalidProjectResponse,
  );
};

export const createProject = (
  title: string,
  operationKey: string,
  campaignId: string | null = null,
  signal?: AbortSignal,
): Promise<ProjectCurrentResponse> =>
  requestJson(
    '/api/projects',
    {
      method: 'POST',
      cache: 'no-store',
      headers: { ...jsonHeaders, 'Idempotency-Key': operationKey },
      body: JSON.stringify({ title, campaignId }),
      ...(signal ? { signal } : {}),
    },
    projectCurrentResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

export const duplicateProject = (
  projectId: string,
  input: {
    readonly title: string;
    readonly campaignId: string | null;
    readonly expectedVersion: number;
  },
  operationKey: string,
  signal?: AbortSignal,
): Promise<ProjectCurrentResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/duplicate`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { ...jsonHeaders, 'Idempotency-Key': operationKey },
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    },
    projectCurrentResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

export const checkpointProject = (
  projectId: string,
  input: AppendProjectRevisionRequest,
  signal?: AbortSignal,
): Promise<ProjectCurrentResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/revisions`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: jsonHeaders,
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    },
    projectCurrentResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

export const renameProject = (
  projectId: string,
  title: string,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<ProjectCurrentResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(projectId)}`,
    {
      method: 'PATCH',
      cache: 'no-store',
      headers: jsonHeaders,
      body: JSON.stringify({ title, expectedVersion }),
      ...(signal ? { signal } : {}),
    },
    projectCurrentResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

const changeProjectLifecycle = (
  projectId: string,
  operation: 'archive' | 'restore',
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<ProjectCurrentResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/${operation}`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: jsonHeaders,
      body: JSON.stringify({ expectedVersion }),
      ...(signal ? { signal } : {}),
    },
    projectCurrentResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

export const archiveProject = (
  projectId: string,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<ProjectCurrentResponse> =>
  changeProjectLifecycle(projectId, 'archive', expectedVersion, signal);

export const restoreProject = (
  projectId: string,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<ProjectCurrentResponse> =>
  changeProjectLifecycle(projectId, 'restore', expectedVersion, signal);

export const tombstoneProject = (
  projectId: string,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<ProjectCurrentResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/tombstone`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: jsonHeaders,
      body: JSON.stringify({ expectedVersion, confirmation: 'permanent-delete' }),
      ...(signal ? { signal } : {}),
    },
    projectCurrentResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

export const moveProjectToCampaign = (
  projectId: string,
  campaignId: string | null,
  expectedVersion: number,
  signal?: AbortSignal,
): Promise<ProjectCurrentResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/campaign`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: jsonHeaders,
      body: JSON.stringify({ campaignId, expectedVersion }),
      ...(signal ? { signal } : {}),
    },
    projectCurrentResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

/**
 * The compare-and-set pair every Project mutation carries, named once so a caller cannot send one
 * revision's expectation in the request and another's in the idempotency key it is signed with.
 */
export interface ProjectRevisionExpectation {
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
}

type ProjectSourceDetachment = ProjectRevisionExpectation & {
  readonly projectId: string;
  readonly signal?: AbortSignal;
};

type ProjectSourceAcceptance = ProjectSourceDetachment & { readonly operationKey: string };

/**
 * The two source contracts, which differ in their path and in nothing else.
 *
 * `source` is the original-video contract a browser built before slice 3.2 still speaks: a second
 * acceptance is refused, and the read describes the one the snapshot names. `sources` is the
 * collection, which takes a first piece of media just as readily as a fifth — the server decides
 * which of the two acts it is from what the Project already holds, not from the caller. Both answer
 * the same shape, so the calls below are one request builder each rather than two.
 */
const projectSourcePath = (projectId: string, contract: 'source' | 'sources'): string =>
  `/api/projects/${encodeURIComponent(projectId)}/${contract}`;

const acceptProjectSourceUpload = (
  contract: 'source' | 'sources',
  input: ProjectSourceAcceptance & {
    readonly file: File;
    readonly kind: 'uploaded' | 'recorded';
  },
): Promise<ProjectSourceResponse> =>
  requestJson(
    projectSourcePath(input.projectId, contract),
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': input.file.type,
        'Idempotency-Key': input.operationKey,
        'X-Lightframe-Project-Source': encodeURIComponent(
          JSON.stringify({
            expectedVersion: input.expectedVersion,
            expectedRevisionNumber: input.expectedRevisionNumber,
            kind: input.kind,
            filename: input.file.name,
          }),
        ),
      },
      body: input.file,
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectSourceResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

const acceptSavedVideoAsProjectSource = (
  contract: 'source' | 'sources',
  input: ProjectSourceAcceptance & {
    readonly savedVideoId: string;
    readonly videoVersionId: string;
  },
): Promise<ProjectSourceResponse> =>
  requestJson(
    `${projectSourcePath(input.projectId, contract)}/reuse`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { ...jsonHeaders, 'Idempotency-Key': input.operationKey },
      body: JSON.stringify({
        expectedVersion: input.expectedVersion,
        expectedRevisionNumber: input.expectedRevisionNumber,
        savedVideoId: input.savedVideoId,
        videoVersionId: input.videoVersionId,
      }),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectSourceResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

export const uploadProjectSource = (
  input: ProjectSourceAcceptance & { readonly file: File; readonly kind: 'uploaded' | 'recorded' },
): Promise<ProjectSourceResponse> => acceptProjectSourceUpload('source', input);

export const reuseSavedVideoAsProjectSource = (
  input: ProjectSourceAcceptance & {
    readonly savedVideoId: string;
    readonly videoVersionId: string;
  },
): Promise<ProjectSourceResponse> => acceptSavedVideoAsProjectSource('source', input);

/** Takes on one more piece of media, or the Project's first if it holds none. */
export const addProjectSourceUpload = (
  input: ProjectSourceAcceptance & { readonly file: File; readonly kind: 'uploaded' | 'recorded' },
): Promise<ProjectSourceResponse> => acceptProjectSourceUpload('sources', input);

export const addSavedVideoAsProjectSource = (
  input: ProjectSourceAcceptance & {
    readonly savedVideoId: string;
    readonly videoVersionId: string;
  },
): Promise<ProjectSourceResponse> => acceptSavedVideoAsProjectSource('sources', input);

const readProjectSource = <T>(
  path: string,
  schema: Parameters<typeof requestJson<T>>[2],
  signal?: AbortSignal,
): Promise<T> =>
  requestJson(
    path,
    { cache: 'no-store', headers: { Accept: 'application/json' }, ...(signal ? { signal } : {}) },
    schema,
    invalidProjectResponse,
  );

/** Describes the original, and refuses a Project that has none. */
export const getProjectSource = (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectSourceResponse> =>
  readProjectSource(projectSourcePath(projectId, 'source'), projectSourceResponseSchema, signal);

/** Everything the Project holds, beside the revision that names one of them as the original. */
export const listProjectSources = (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectSourceListResponse> =>
  readProjectSource(
    projectSourcePath(projectId, 'sources'),
    projectSourceListResponseSchema,
    signal,
  );

/**
 * Whether a Project already works from this exact Saved Video Version.
 *
 * The question both paths into the collection have to ask: the Videos library's dialog asks it as a
 * preflight, so a retry after a lost answer converges instead of storing the same video twice, and
 * the Media area asks it as a before-and-after, so a failure at a Version already held is not read
 * as an acceptance. One spelling, because the two disagreeing is the bug it exists to prevent.
 */
export const projectHoldsSavedVideoVersion = (
  sources: readonly ProjectSourceCollectionItem[],
  video: { readonly id: string; readonly currentVersion: { readonly id: string } },
): boolean =>
  sources.some(
    (source) =>
      source.savedVideoId === video.id && source.videoVersionId === video.currentVersion.id,
  );

/** The ranged bytes of one piece of a Project's media, whether or not it is the original. */
export const projectSourceContentUrl = (projectId: string, assetId: string): string =>
  `${projectSourcePath(projectId, 'sources')}/${encodeURIComponent(assetId)}/content`;

/**
 * Lets go of one piece of a Project's source media, named by its path.
 *
 * Carries no `Idempotency-Key`: no bytes and no provider work are created, and the server converges
 * when the media is already gone, so a lost response is safe to replay.
 */
const detachProjectSource = (
  path: string,
  input: ProjectRevisionExpectation & { readonly signal?: AbortSignal },
): Promise<ProjectCurrentResponse> =>
  requestJson(
    path,
    {
      method: 'POST',
      cache: 'no-store',
      headers: jsonHeaders,
      body: JSON.stringify({
        expectedVersion: input.expectedVersion,
        expectedRevisionNumber: input.expectedRevisionNumber,
      }),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectCurrentResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

/** Detaches the original, which the server refuses while the Project holds other media. */
export const removeProjectSource = (
  input: ProjectSourceDetachment,
): Promise<ProjectCurrentResponse> =>
  detachProjectSource(`${projectSourcePath(input.projectId, 'source')}/remove`, input);

/** Lets go of one named piece of media, original or not. */
export const removeProjectSourceById = (
  input: ProjectSourceDetachment & { readonly assetId: string },
): Promise<ProjectCurrentResponse> =>
  detachProjectSource(
    `${projectSourcePath(input.projectId, 'sources')}/${encodeURIComponent(input.assetId)}/remove`,
    input,
  );

export const getProjectWorkingMedia = (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectWorkingMediaResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/working-media`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    },
    projectWorkingMediaResponseSchema,
    invalidProjectResponse,
  );

export const uploadProjectWorkingMedia = (input: {
  readonly projectId: string;
  readonly file: File;
  readonly operationKey: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly localEdit: NonNullable<ProjectCurrentResponse['revision']['snapshot']['localEdit']>;
  readonly signal?: AbortSignal;
}): Promise<ProjectWorkingMediaResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(input.projectId)}/working-media`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': input.file.type,
        'Idempotency-Key': input.operationKey,
        'X-Lightframe-Project-Working-Media': encodeURIComponent(
          JSON.stringify({
            expectedVersion: input.expectedVersion,
            expectedRevisionNumber: input.expectedRevisionNumber,
            filename: input.file.name,
            localEdit: input.localEdit,
          }),
        ),
      },
      body: input.file,
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectWorkingMediaResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

export const reuseProjectWorkingMedia = (input: {
  readonly projectId: string;
  readonly operationKey: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly media: AdoptProjectWorkingMediaRequest['media'];
  readonly localEdit: ProjectCurrentResponse['revision']['snapshot']['localEdit'];
  readonly signal?: AbortSignal;
}): Promise<ProjectWorkingMediaResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(input.projectId)}/working-media/reuse`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { ...jsonHeaders, 'Idempotency-Key': input.operationKey },
      body: JSON.stringify({
        expectedVersion: input.expectedVersion,
        expectedRevisionNumber: input.expectedRevisionNumber,
        media: input.media,
        localEdit: input.localEdit,
      }),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectWorkingMediaResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

export const saveProjectOutput = (input: {
  readonly projectId: string;
  readonly operationId: string;
  readonly request: SaveProjectOutputRequest;
  readonly signal?: AbortSignal;
}): Promise<SaveProjectOutputResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(input.projectId)}/outputs`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { ...jsonHeaders, 'Idempotency-Key': input.operationId },
      body: JSON.stringify(input.request),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    saveProjectOutputResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );

export const getProjectHistory = (input: {
  readonly projectId: string;
  readonly cursor?: string;
  readonly signal?: AbortSignal;
}): Promise<ProjectHistoryResponse> => {
  const query = new URLSearchParams({ pageSize: '20' });
  if (input.cursor) query.set('cursor', input.cursor);
  return requestJson(
    `/api/projects/${encodeURIComponent(input.projectId)}/history?${query.toString()}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectHistoryResponseSchema,
    invalidProjectResponse,
  );
};

export const getProjectOutputs = (input: {
  readonly projectId: string;
  readonly cursor?: string;
  /** Defaults to a full page; a surface showing only the most recent output asks for one. */
  readonly pageSize?: number;
  readonly signal?: AbortSignal;
}): Promise<ProjectOutputHistoryResponse> => {
  const query = new URLSearchParams({ pageSize: String(input.pageSize ?? 20) });
  if (input.cursor) query.set('cursor', input.cursor);
  return requestJson(
    `/api/projects/${encodeURIComponent(input.projectId)}/outputs?${query.toString()}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectOutputHistoryResponseSchema,
    invalidProjectResponse,
  );
};

export const projectOutputContentUrl = (
  projectId: string,
  videoVersionId: string,
  download = false,
): string => {
  const url = `/api/projects/${encodeURIComponent(projectId)}/outputs/${encodeURIComponent(videoVersionId)}/content`;
  return download ? `${url}?download=true` : url;
};

/**
 * The bytes of the cut currently on the stage, for re-framing before a save.
 *
 * Bounded by the same 300 MB ceiling the upload contract states, so a response that could not be
 * stored again is refused on the way in rather than after a render has already been paid for.
 */
export const readProjectWorkingMediaContent = async ({
  contentUrl,
  mimeType,
  signal,
}: Readonly<{
  contentUrl: string;
  mimeType: string;
  signal: AbortSignal;
}>): Promise<Blob> => {
  const response = await apiFetch(contentUrl, {
    cache: 'no-store',
    headers: { Accept: mimeType },
    signal,
  });
  return readBoundedBlob(response, {
    maximumBytes: VIDEO_RESULT_MAX_BYTES,
    signal,
    acceptsContentType: (contentType) => contentType === mimeType,
    createError: (failure) =>
      new ApiClientError(
        failure === 'too-large'
          ? 'This video exceeded the app-owned 300 MB safety limit.'
          : 'This video could not be read.',
        502,
        failure === 'too-large' ? 'result_too_large' : 'result_invalid',
      ),
    abortMessage: 'Preparing the placement was cancelled.',
  });
};

/**
 * Stores re-framed bytes for a placement and hands back the reference a save can carry.
 *
 * Not the working-media path: a rendition is a deliverable, not the Project's current cut, and
 * adopting it would move the stage and bump the revision. The operation key determines the asset id on the
 * server, so replaying this upload returns the same bytes rather than storing a second copy.
 */
export const uploadProjectRendition = (input: {
  readonly projectId: string;
  readonly file: File;
  readonly operationKey: string;
  readonly specification: ProjectExportSpecificationValue;
  readonly signal?: AbortSignal;
}): Promise<ProjectRenditionUploadResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(input.projectId)}/outputs/renditions`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': input.file.type,
        'Idempotency-Key': input.operationKey,
        'X-Lightframe-Project-Rendition': encodeURIComponent(
          JSON.stringify({ filename: input.file.name, specification: input.specification }),
        ),
      },
      body: input.file,
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectRenditionUploadResponseSchema,
    invalidProjectResponse,
    parseProjectConflict,
  );
