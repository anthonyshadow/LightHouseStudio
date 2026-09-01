import {
  attachProjectAssetResponseSchema,
  detachProjectAssetResponseSchema,
  projectConflictResponseSchema,
  projectCurrentResponseSchema,
  projectHistoryResponseSchema,
  projectAssetsResponseSchema,
  projectOutputHistoryResponseSchema,
  projectRenditionUploadResponseSchema,
  projectSourceResponseSchema,
  saveProjectOutputResponseSchema,
  projectWorkingMediaResponseSchema,
  projectsResponseSchema,
  type AdoptProjectWorkingMediaRequest,
  type AttachProjectAssetRequest,
  type AppendProjectRevisionRequest,
  type ProjectConflictContract,
  type ProjectCurrentResponse,
  type ProjectAssetsResponse,
  type ProjectHistoryResponse,
  type ProjectOutputHistoryResponse,
  type ProjectPreviewContract,
  type ProjectExportSpecificationValue,
  type ProjectRenditionUploadResponse,
  type ProjectSourceResponse,
  type SaveProjectOutputRequest,
  type SaveProjectOutputResponse,
  type ProjectWorkingMediaResponse,
  type ProjectsQuery,
  type ListTotal,
} from '@studio/contracts';
import { VIDEO_RESULT_MAX_BYTES } from '@studio/contracts';
import {
  ApiClientError,
  invalidApiResponse,
  requestJson,
  type ApiErrorPayloadParser,
} from '../../adapters/api-client/apiClient';
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

export class ProjectApiConflictError extends ApiClientError {
  readonly conflict: ProjectConflictContract;

  constructor(message: string, conflict: ProjectConflictContract) {
    super(message, 409, 'conflict');
    this.name = 'ProjectApiConflictError';
    this.conflict = conflict;
  }
}

const parseProjectConflict: ApiErrorPayloadParser = (payload, status) => {
  if (status !== 409) return null;
  const parsed = projectConflictResponseSchema.safeParse(payload);
  return parsed.success
    ? new ProjectApiConflictError(parsed.data.error.message, parsed.data.conflict)
    : null;
};

const invalidProjectResponse = invalidApiResponse(
  'The Project response was invalid.',
  'invalid-response',
);

const jsonHeaders = { Accept: 'application/json', 'Content-Type': 'application/json' } as const;

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

export const getProject = (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectCurrentResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(projectId)}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    },
    projectCurrentResponseSchema,
    invalidProjectResponse,
  );

export const listProjectAssets = (input: {
  readonly projectId: string;
  readonly kind?: AttachProjectAssetRequest['kind'];
  readonly cursor?: string;
  readonly pageSize?: number;
  readonly signal?: AbortSignal;
}): Promise<ProjectAssetsResponse> => {
  const query = new URLSearchParams({ pageSize: String(input.pageSize ?? 24) });
  if (input.kind) query.set('kind', input.kind);
  if (input.cursor) query.set('cursor', input.cursor);
  return requestJson(
    `/api/projects/${encodeURIComponent(input.projectId)}/assets?${query.toString()}`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectAssetsResponseSchema,
    invalidProjectResponse,
  );
};

export const attachProjectAsset = (
  projectId: string,
  input: AttachProjectAssetRequest,
  signal?: AbortSignal,
) =>
  requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/assets`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: jsonHeaders,
      body: JSON.stringify(input),
      ...(signal ? { signal } : {}),
    },
    attachProjectAssetResponseSchema,
    invalidProjectResponse,
  );

export const detachProjectAsset = (projectId: string, membershipId: string, signal?: AbortSignal) =>
  requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(membershipId)}`,
    {
      method: 'DELETE',
      cache: 'no-store',
      headers: jsonHeaders,
      body: '{}',
      ...(signal ? { signal } : {}),
    },
    detachProjectAssetResponseSchema,
    invalidProjectResponse,
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

export const getProjectSource = (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectSourceResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(projectId)}/source`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    },
    projectSourceResponseSchema,
    invalidProjectResponse,
  );

export const uploadProjectSource = (input: {
  readonly projectId: string;
  readonly file: File;
  readonly operationKey: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly kind: 'uploaded' | 'recorded';
  readonly signal?: AbortSignal;
}): Promise<ProjectSourceResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(input.projectId)}/source`,
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

export const reuseSavedVideoAsProjectSource = (input: {
  readonly projectId: string;
  readonly operationKey: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly savedVideoId: string;
  readonly videoVersionId: string;
  readonly signal?: AbortSignal;
}): Promise<ProjectSourceResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(input.projectId)}/source/reuse`,
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

/**
 * Detaches the current source. Carries no `Idempotency-Key`: no bytes and no provider work are
 * created, and the server converges when the source is already gone, so a lost response is safe
 * to replay.
 */
export const removeProjectSource = (input: {
  readonly projectId: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly signal?: AbortSignal;
}): Promise<ProjectCurrentResponse> =>
  requestJson(
    `/api/projects/${encodeURIComponent(input.projectId)}/source/remove`,
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
 * adopting it would move the stage and bump the revision. The operation key is the asset id on the
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
