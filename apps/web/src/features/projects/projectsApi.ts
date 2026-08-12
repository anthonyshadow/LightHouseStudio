import {
  projectConflictResponseSchema,
  projectCurrentResponseSchema,
  projectSourceResponseSchema,
  projectsResponseSchema,
  type ProjectConflictContract,
  type ProjectCurrentResponse,
  type ProjectSourceResponse,
  type ProjectsQuery,
} from '@studio/contracts';
import {
  ApiClientError,
  requestJson,
  type ApiErrorPayloadParser,
} from '../../adapters/api-client/apiClient';

export interface ProjectsPage {
  readonly projects: ProjectCurrentResponse['project'][];
  readonly nextCursor: string | null;
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

const invalidProjectResponse = () =>
  new ApiClientError('The Project response was invalid.', 502, 'invalid-response');

const jsonHeaders = { Accept: 'application/json', 'Content-Type': 'application/json' } as const;

export const listProjects = (
  input: Pick<ProjectsQuery, 'lifecycle' | 'pageSize'> & {
    readonly campaignId?: ProjectsQuery['campaignId'];
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
