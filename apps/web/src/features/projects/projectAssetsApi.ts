import {
  attachProjectAssetResponseSchema,
  detachProjectAssetResponseSchema,
  projectAssetsResponseSchema,
  type AttachProjectAssetRequest,
  type ProjectAssetsResponse,
} from '@studio/contracts';
import { requestJson } from '../../adapters/api-client/apiClient';
import { invalidProjectResponse } from './projectAuthorityApi';

/**
 * What a Project *uses* — the membership list, and attaching and detaching one.
 *
 * Split out for the same reason as {@link ./projectAuthorityApi}: the shell's own creation
 * launcher reads this list, and reaching it through `projectsApi` put every source, working-media,
 * output and rendition call into the static closure of every authenticated route. Memberships are
 * organizational and never change what a Project is built from, which is why they sit apart from
 * the media calls rather than beside them.
 */
const jsonHeaders = { Accept: 'application/json', 'Content-Type': 'application/json' } as const;

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
