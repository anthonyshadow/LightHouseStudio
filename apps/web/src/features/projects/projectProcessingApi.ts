import {
  VIDEO_PROVIDER_INTENT_HEADER,
  VIDEO_PROVIDER_INTENT_VALUE,
  projectProcessingCurrentResponseSchema,
  projectProcessingHistoryResponseSchema,
  projectProcessingMutationResponseSchema,
  type ProjectProcessingCapability,
  type ProjectProcessingCurrentResponse,
  type ProjectProcessingHistoryResponse,
  type ProjectProcessingMutationResponse,
} from '@studio/contracts';
import { ApiClientError, requestJson } from '../../adapters/api-client/apiClient';

const invalidResponse = () =>
  new ApiClientError('The Project processing response was invalid.', 502, 'invalid-response');

const intentHeaders = {
  [VIDEO_PROVIDER_INTENT_HEADER]: VIDEO_PROVIDER_INTENT_VALUE,
  Accept: 'application/json',
  'Content-Type': 'application/json',
} as const;

const processingUrl = (projectId: string): string =>
  `/api/projects/${encodeURIComponent(projectId)}/processing`;

export const getCurrentProjectProcessing = (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectProcessingCurrentResponse> =>
  requestJson(
    `${processingUrl(projectId)}/current`,
    {
      cache: 'no-store',
      headers: intentHeaders,
      ...(signal ? { signal } : {}),
    },
    projectProcessingCurrentResponseSchema,
    invalidResponse,
  );

export const getProjectProcessingHistory = (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectProcessingHistoryResponse> =>
  requestJson(
    `${processingUrl(projectId)}/history?pageSize=20`,
    {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      ...(signal ? { signal } : {}),
    },
    projectProcessingHistoryResponseSchema,
    invalidResponse,
  );

export const submitProjectProcessing = (input: {
  readonly projectId: string;
  readonly operationId: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly capability: ProjectProcessingCapability;
  readonly signal?: AbortSignal;
}): Promise<ProjectProcessingMutationResponse> =>
  requestJson(
    `${processingUrl(input.projectId)}/submit`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { ...intentHeaders, 'Idempotency-Key': input.operationId },
      body: JSON.stringify({
        expectedVersion: input.expectedVersion,
        expectedRevisionNumber: input.expectedRevisionNumber,
        capability: input.capability,
      }),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectProcessingMutationResponseSchema,
    invalidResponse,
  );

export const reconcileProjectProcessing = (input: {
  readonly projectId: string;
  readonly operationId: string;
  readonly signal?: AbortSignal;
}): Promise<ProjectProcessingMutationResponse> =>
  requestJson(
    `${processingUrl(input.projectId)}/reconcile`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: intentHeaders,
      body: JSON.stringify({ operationId: input.operationId }),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectProcessingMutationResponseSchema,
    invalidResponse,
  );

export const retryProjectProcessing = (input: {
  readonly projectId: string;
  readonly operationId: string;
  readonly previousOperationId: string;
  readonly expectedVersion: number;
  readonly expectedRevisionNumber: number;
  readonly capability: ProjectProcessingCapability;
  readonly acknowledgePossibleDuplicateCost: boolean;
  readonly signal?: AbortSignal;
}): Promise<ProjectProcessingMutationResponse> =>
  requestJson(
    `${processingUrl(input.projectId)}/retry`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: { ...intentHeaders, 'Idempotency-Key': input.operationId },
      body: JSON.stringify({
        previousOperationId: input.previousOperationId,
        expectedVersion: input.expectedVersion,
        expectedRevisionNumber: input.expectedRevisionNumber,
        capability: input.capability,
        acknowledgePossibleDuplicateCost: input.acknowledgePossibleDuplicateCost,
      }),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectProcessingMutationResponseSchema,
    invalidResponse,
  );

export const cancelProjectProcessing = (input: {
  readonly projectId: string;
  readonly operationId: string;
  readonly signal?: AbortSignal;
}): Promise<ProjectProcessingMutationResponse> =>
  requestJson(
    `${processingUrl(input.projectId)}/cancel`,
    {
      method: 'POST',
      cache: 'no-store',
      headers: intentHeaders,
      body: JSON.stringify({ operationId: input.operationId }),
      ...(input.signal ? { signal: input.signal } : {}),
    },
    projectProcessingMutationResponseSchema,
    invalidResponse,
  );
