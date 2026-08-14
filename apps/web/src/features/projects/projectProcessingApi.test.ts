// @vitest-environment jsdom

import type { ProjectProcessingAttempt } from '@studio/contracts';
import { describe, expect, it } from 'vitest';
import { captureRequests, jsonScenario } from '../../test/msw/handlers';
import { mockApiServer } from '../../test/msw/server';
import {
  getCurrentProjectProcessing,
  retryProjectProcessing,
  submitProjectProcessing,
} from './projectProcessingApi';

const ids = {
  project: '18b120ac-1578-46e3-8c3d-42307772f391',
  revision: '89a972fe-bfb5-4214-94f7-4bd54f12ce06',
  operation: '2efcc6c3-e82c-419a-8807-c0026170fb75',
  retry: '3efcc6c3-e82c-419a-8807-c0026170fb75',
};
const now = '2026-08-13T12:00:00.000Z';

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

describe('Project processing API adapter', () => {
  it('uses one app-owned operation key and provider intent without sending provider identity', async () => {
    const observed = captureRequests();
    mockApiServer.use(
      jsonScenario(
        'POST',
        `/api/projects/${ids.project}/processing/submit`,
        { status: 202, body: { replayed: false, attempt: attempt() } },
        observed.observe,
      ),
    );

    await expect(
      submitProjectProcessing({
        projectId: ids.project,
        operationId: ids.operation,
        expectedVersion: 3,
        expectedRevisionNumber: 2,
        capability: 'character-swap',
      }),
    ).resolves.toMatchObject({ attempt: { operationId: ids.operation, phase: 'accepted' } });

    expect(observed.requests).toHaveLength(1);
    expect(observed.requests[0]!.headers.get('idempotency-key')).toBe(ids.operation);
    expect(observed.requests[0]!.headers.get('x-lightframe-provider-intent')).toBe('video');
    const body: unknown = await observed.requests[0]!.json();
    expect(body).toEqual({
      expectedVersion: 3,
      expectedRevisionNumber: 2,
      capability: 'character-swap',
    });
    expect(JSON.stringify(body)).not.toContain('provider');
  });

  it('reads current status without submission and makes duplicate-cost acknowledgement explicit', async () => {
    const observed = captureRequests();
    const ambiguous = attempt({
      phase: 'needs-attention',
      ambiguous: true,
      retryPolicy: 'explicit-cost-confirmation',
      nextPollAfterMs: null,
      acceptedAt: null,
      completedAt: now,
      error: {
        code: 'submission_ambiguous',
        message: 'Submission may have been accepted. Review cost before another attempt.',
      },
    });
    mockApiServer.use(
      jsonScenario('GET', `/api/projects/${ids.project}/processing/current`, {
        body: {
          projectId: ids.project,
          currentProjectVersion: 3,
          currentRevisionId: ids.revision,
          currentRevisionNumber: 2,
          attempt: ambiguous,
        },
      }),
      jsonScenario(
        'POST',
        `/api/projects/${ids.project}/processing/retry`,
        {
          status: 202,
          body: {
            replayed: false,
            attempt: attempt({
              operationId: ids.retry,
              attemptNumber: 2,
              retryOfOperationId: ids.operation,
            }),
          },
        },
        observed.observe,
      ),
    );

    await expect(getCurrentProjectProcessing(ids.project)).resolves.toMatchObject({
      attempt: { ambiguous: true },
    });
    expect(observed.requests).toHaveLength(0);

    await retryProjectProcessing({
      projectId: ids.project,
      operationId: ids.retry,
      previousOperationId: ids.operation,
      expectedVersion: 3,
      expectedRevisionNumber: 2,
      capability: 'character-swap',
      acknowledgePossibleDuplicateCost: true,
    });
    await expect(observed.requests[0]!.json()).resolves.toMatchObject({
      previousOperationId: ids.operation,
      acknowledgePossibleDuplicateCost: true,
    });
  });
});
