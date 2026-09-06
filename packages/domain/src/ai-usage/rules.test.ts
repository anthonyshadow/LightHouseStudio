import { describe, expect, it } from 'vitest';
import { PROJECT_PROCESSING_JOB_STATUSES } from '../video-processing';
import {
  aiUsageDurationMs,
  aiUsageOutcomeForJobStatus,
  applyAiUsageTransition,
  type AiUsageEntry,
} from '.';

const SUBMITTED_AT = '2026-09-05T10:00:00.000Z';

const entry = (overrides: Partial<AiUsageEntry> = {}): AiUsageEntry => ({
  ownerUserId: 'owner-1',
  jobId: 'job-1',
  operation: 'character-swap',
  provider: 'wiro',
  outcome: null,
  submittedAt: SUBMITTED_AT,
  completedAt: null,
  ...overrides,
});

describe('aiUsageOutcomeForJobStatus', () => {
  it('settles the five terminal statuses and leaves the other seven open', () => {
    const mapped = Object.fromEntries(
      PROJECT_PROCESSING_JOB_STATUSES.map((status) => [status, aiUsageOutcomeForJobStatus(status)]),
    );

    // Spelled out rather than derived: a thirteenth status must fail this list, not join it.
    expect(mapped).toEqual({
      pending: null,
      validating: null,
      submitting: null,
      accepted: null,
      ambiguous: 'ambiguous',
      queued: null,
      processing: null,
      retrieving: null,
      ready: 'succeeded',
      failed: 'failed',
      expired: 'expired',
      cancelled: 'cancelled',
    });
  });

  it('counts only a delivered result as success', () => {
    const succeeded = PROJECT_PROCESSING_JOB_STATUSES.filter(
      (status) => aiUsageOutcomeForJobStatus(status) === 'succeeded',
    );

    expect(succeeded).toEqual(['ready']);
  });
});

describe('applyAiUsageTransition', () => {
  it('inserts the incoming row when the account has none for the job', () => {
    const incoming = entry();

    expect(applyAiUsageTransition(null, incoming)).toEqual(incoming);
  });

  it('closes an open row while keeping what the opener recorded about the submission', () => {
    const stored = entry();

    const closed = applyAiUsageTransition(
      stored,
      entry({
        // A closer working from a durable trace may carry a worse copy of all of these.
        operation: 'virtual-try-on',
        provider: 'decart',
        submittedAt: '2026-09-05T10:05:00.000Z',
        outcome: 'succeeded',
        completedAt: '2026-09-05T10:04:00.000Z',
      }),
    );

    expect(closed).toEqual({
      ownerUserId: 'owner-1',
      jobId: 'job-1',
      operation: 'character-swap',
      provider: 'wiro',
      outcome: 'succeeded',
      submittedAt: SUBMITTED_AT,
      completedAt: '2026-09-05T10:04:00.000Z',
    });
    expect(stored.outcome).toBeNull();
  });

  it('drops a second close so the first terminal outcome stands', () => {
    const closed = entry({ outcome: 'succeeded', completedAt: '2026-09-05T10:04:00.000Z' });

    const transition = applyAiUsageTransition(
      closed,
      entry({ outcome: 'failed', completedAt: '2026-09-05T10:06:00.000Z' }),
    );

    expect(transition).toBeNull();
  });

  it('refuses to reopen a settled row', () => {
    const closed = entry({ outcome: 'expired', completedAt: '2026-09-05T11:00:00.000Z' });

    expect(applyAiUsageTransition(closed, entry())).toBeNull();
  });

  it('writes nothing when a running submission is observed running again', () => {
    expect(applyAiUsageTransition(entry(), entry())).toBeNull();
  });
});

describe('aiUsageDurationMs', () => {
  it('is unknown while the submission is still running', () => {
    expect(aiUsageDurationMs(entry())).toBeNull();
  });

  it('measures a settled submission in milliseconds', () => {
    expect(
      aiUsageDurationMs({ submittedAt: SUBMITTED_AT, completedAt: '2026-09-05T10:01:30.500Z' }),
    ).toBe(90_500);
  });

  it('clamps a backwards clock to zero instead of reporting a negative duration', () => {
    expect(
      aiUsageDurationMs({ submittedAt: SUBMITTED_AT, completedAt: '2026-09-05T09:59:59.000Z' }),
    ).toBe(0);
  });

  it('reports an unreadable timestamp as unknown rather than NaN', () => {
    expect(aiUsageDurationMs({ submittedAt: 'whenever', completedAt: SUBMITTED_AT })).toBeNull();
    expect(aiUsageDurationMs({ submittedAt: SUBMITTED_AT, completedAt: 'whenever' })).toBeNull();
  });
});
