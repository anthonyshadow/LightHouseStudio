import { describe, expect, it } from 'vitest';
import {
  projectProcessingAttemptSchema,
  projectProcessingCurrentResponseSchema,
  retryProjectProcessingRequestSchema,
  submitProjectProcessingRequestSchema,
} from './project-processing';

const ids = {
  operation: '2efcc6c3-e82c-419a-8807-c0026170fb75',
  project: '3efcc6c3-e82c-419a-8807-c0026170fb75',
  revision: '4efcc6c3-e82c-419a-8807-c0026170fb75',
  asset: '5efcc6c3-e82c-419a-8807-c0026170fb75',
};

const timestamp = '2026-08-13T12:00:00.000Z';

const attempt = {
  operationId: ids.operation,
  projectId: ids.project,
  capability: 'character-swap' as const,
  attemptNumber: 1,
  retryOfOperationId: null,
  initiatingRevisionId: ids.revision,
  initiatingRevisionNumber: 2,
  phase: 'submitting' as const,
  isCurrent: true,
  ambiguous: false,
  cancellation: 'unsupported' as const,
  retryPolicy: 'not-allowed' as const,
  blocksArchive: true,
  createdAt: timestamp,
  updatedAt: timestamp,
  acceptedAt: null,
  completedAt: null,
  expiresAt: '2026-08-13T13:00:00.000Z',
  nextPollAfterMs: 2_000,
  result: null,
  error: null,
};

describe('Project processing contracts', () => {
  it('keeps submission owner/project correlation finite and rejects undeclared provider data', () => {
    expect(
      submitProjectProcessingRequestSchema.parse({
        expectedVersion: 3,
        expectedRevisionNumber: 2,
        capability: 'virtual-try-on',
      }),
    ).toEqual({
      expectedVersion: 3,
      expectedRevisionNumber: 2,
      capability: 'virtual-try-on',
    });
    expect(
      submitProjectProcessingRequestSchema.safeParse({
        expectedVersion: 3,
        expectedRevisionNumber: 2,
        capability: 'character-swap',
        providerJobId: 'raw-upstream-id',
      }).success,
    ).toBe(false);
  });

  it('requires explicit cost acknowledgement only as an app-owned retry decision', () => {
    expect(
      retryProjectProcessingRequestSchema.parse({
        previousOperationId: ids.operation,
        expectedVersion: 3,
        expectedRevisionNumber: 2,
        capability: 'character-swap',
      }),
    ).toMatchObject({ acknowledgePossibleDuplicateCost: false });
  });

  it('represents ambiguity and retained completion without raw provider state', () => {
    expect(projectProcessingAttemptSchema.parse(attempt)).toEqual(attempt);
    expect(
      projectProcessingAttemptSchema.safeParse({
        ...attempt,
        phase: 'needs-attention',
        ambiguous: true,
        retryPolicy: 'explicit-cost-confirmation',
        error: {
          code: 'submission_ambiguous',
          message: 'Submission may have been accepted. Review cost before another attempt.',
        },
      }).success,
    ).toBe(true);
    expect(
      projectProcessingAttemptSchema.safeParse({
        ...attempt,
        phase: 'complete',
        result: null,
      }).success,
    ).toBe(false);
    expect(
      projectProcessingCurrentResponseSchema.safeParse({
        projectId: ids.project,
        currentProjectVersion: 4,
        currentRevisionId: ids.revision,
        currentRevisionNumber: 2,
        attempt,
        rawProviderPayload: { secret: true },
      }).success,
    ).toBe(false);
  });

  it('accepts inspected retained result metadata only through the app-owned media contract', () => {
    expect(
      projectProcessingAttemptSchema.safeParse({
        ...attempt,
        phase: 'complete',
        blocksArchive: false,
        nextPollAfterMs: null,
        completedAt: timestamp,
        result: {
          assetId: ids.asset,
          retainedAt: timestamp,
          state: 'current' as const,
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
      }).success,
    ).toBe(true);
  });
});
