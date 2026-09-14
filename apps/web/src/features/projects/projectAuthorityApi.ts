import {
  projectConflictResponseSchema,
  projectCurrentResponseSchema,
  type ProjectConflictContract,
  type ProjectCurrentResponse,
} from '@studio/contracts';
import {
  ApiClientError,
  invalidApiResponse,
  requestJson,
  type ApiErrorPayloadParser,
} from '../../adapters/api-client/apiClient';

/**
 * Reading a Project's current authority, and the two error shapes every Project call answers with.
 *
 * A module of its own because of who needs it. The shell owns durable Project processing, which
 * outlives any Project surface and so is static in every authenticated route's closure — and its
 * one call here used to reach through `projectsApi`, pulling every source, working-media, output,
 * rendition and membership call onto the Dashboard, the Assets page and every Project list. This is
 * the part the shell genuinely needs; `projectsApi` re-exports it so nothing else had to move.
 */
export class ProjectApiConflictError extends ApiClientError {
  readonly conflict: ProjectConflictContract;

  constructor(message: string, conflict: ProjectConflictContract) {
    super(message, 409, 'conflict');
    this.name = 'ProjectApiConflictError';
    this.conflict = conflict;
  }
}

export const parseProjectConflict: ApiErrorPayloadParser = (payload, status) => {
  if (status !== 409) return null;
  const parsed = projectConflictResponseSchema.safeParse(payload);
  return parsed.success
    ? new ProjectApiConflictError(parsed.data.error.message, parsed.data.conflict)
    : null;
};

export const invalidProjectResponse = invalidApiResponse(
  'The Project response was invalid.',
  'invalid-response',
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
