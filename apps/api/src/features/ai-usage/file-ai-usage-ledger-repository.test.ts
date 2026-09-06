import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { AiUsageEntry } from '@studio/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FileProcessingJobRepository,
  type VideoProcessingJobTrace,
} from '../processing-jobs/file-processing-job-repository.js';
import { FileProjectRepository } from '../projects/file-project-repository.js';
import { FileSavedVideoRepository } from '../saved-videos/saved-video-repository.js';
import { FileSavedVoiceRepository } from '../voices/saved-voice-repository.js';
import { FileAiUsageLedgerRepository } from './file-ai-usage-ledger-repository.js';

const OWNER = '2d7914b2-f912-4b96-b17d-54100a2ffea3';
const OTHER_OWNER = '5f2f1f0e-6a48-4f2f-9c2b-1f3d6f0b8a11';
const JOB = '720620f6-446b-4987-828e-bc23470e613d';
const OTHER_JOB = '9826fc75-4759-47cc-b07d-d7325ce0ad14';
const SUBMITTED_AT = '2026-09-05T10:00:00.000Z';
const COMPLETED_AT = '2026-09-05T10:04:00.000Z';
const VOICE_ID = '0f4a5f52-3a52-4d3b-9c8f-2b7f39a4c1de';

const roots: string[] = [];

const temporaryRoot = (): string => {
  const root = path.join(tmpdir(), `lightframe-ai-usage-${crypto.randomUUID()}`);
  roots.push(root);
  return root;
};

const entry = (overrides: Partial<AiUsageEntry> = {}): AiUsageEntry => ({
  ownerUserId: OWNER,
  jobId: JOB,
  operation: 'character-swap',
  provider: 'decart',
  outcome: null,
  submittedAt: SUBMITTED_AT,
  completedAt: null,
  ...overrides,
});

const journalDirectory = (root: string): string => path.join(root, 'metadata', 'v1', 'ai-usage');
const journalPath = (root: string, ownerUserId = OWNER): string =>
  path.join(journalDirectory(root), `${ownerUserId}.json`);

const readJournal = async (root: string, ownerUserId = OWNER): Promise<unknown> =>
  JSON.parse(await readFile(journalPath(root, ownerUserId), 'utf8')) as unknown;

const writeJournal = async (root: string, ownerUserId: string, value: unknown): Promise<void> => {
  await mkdir(journalDirectory(root), { recursive: true, mode: 0o700 });
  await writeFile(journalPath(root, ownerUserId), `${JSON.stringify(value)}\n`, 'utf8');
};

const trace = (): VideoProcessingJobTrace => ({
  schemaVersion: 1,
  jobId: JOB,
  ownerUserId: OWNER,
  operation: 'character-swap',
  provider: 'decart',
  providerJobId: null,
  requestFingerprint: null,
  outputResolution: null,
  providerOutputLocation: null,
  sourceDurationMs: null,
  sourceOrientation: null,
  status: 'processing',
  safeErrorCode: null,
  createdAt: SUBMITTED_AT,
  updatedAt: SUBMITTED_AT,
  completedAt: null,
});

describe('FileAiUsageLedgerRepository', () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('keeps one journal per owner beside the traces, private to the account', async () => {
    const root = temporaryRoot();

    await new FileAiUsageLedgerRepository(root).record(entry());

    expect(await readJournal(root)).toEqual({
      schemaVersion: 1,
      // The owner is the file name, so the row carries only what the submission was.
      entries: [
        {
          jobId: JOB,
          operation: 'character-swap',
          provider: 'decart',
          outcome: null,
          submittedAt: SUBMITTED_AT,
          completedAt: null,
        },
      ],
    });
    expect((await stat(journalDirectory(root))).mode & 0o777).toBe(0o700);
    expect((await stat(journalPath(root))).mode & 0o777).toBe(0o600);
  });

  it('serializes concurrent writes and leaves no partial file behind', async () => {
    const root = temporaryRoot();
    const repository = new FileAiUsageLedgerRepository(root);

    await Promise.all([
      repository.record(entry()),
      repository.record(entry({ jobId: OTHER_JOB, submittedAt: '2026-09-05T10:02:00.000Z' })),
    ]);

    const page = await repository.listForOwner(OWNER, { since: SUBMITTED_AT, pageSize: 10 });
    expect(page.entries.map(({ jobId }) => jobId)).toEqual([OTHER_JOB, JOB]);
    // A journal only ever appears under its final name; the temporary write is renamed into place.
    expect(await readdir(journalDirectory(root))).toEqual([`${OWNER}.json`]);
  });

  it('lets the first terminal outcome stand however the writers are ordered', async () => {
    const succeeded = entry({ outcome: 'succeeded', completedAt: COMPLETED_AT });
    const failed = entry({ outcome: 'failed', completedAt: '2026-09-05T10:06:00.000Z' });
    const settled = {
      ownerUserId: OWNER,
      jobId: JOB,
      operation: 'character-swap',
      provider: 'decart',
      outcome: 'succeeded',
      submittedAt: SUBMITTED_AT,
      completedAt: COMPLETED_AT,
    };
    const only = async (repository: FileAiUsageLedgerRepository): Promise<readonly unknown[]> =>
      (await repository.listForOwner(OWNER, { since: SUBMITTED_AT, pageSize: 10 })).entries;

    const openThenClose = new FileAiUsageLedgerRepository(temporaryRoot());
    await openThenClose.record(entry());
    await openThenClose.record(succeeded);
    expect(await only(openThenClose)).toEqual([settled]);

    // A close that arrives first owns the row, and the opener may not overwrite what it recorded.
    const closeThenOpen = new FileAiUsageLedgerRepository(temporaryRoot());
    await closeThenOpen.record(succeeded);
    await closeThenOpen.record(entry({ operation: 'virtual-try-on', provider: 'wiro' }));
    expect(await only(closeThenOpen)).toEqual([settled]);

    const closeThenClose = new FileAiUsageLedgerRepository(temporaryRoot());
    await closeThenClose.record(succeeded);
    await closeThenClose.record(failed);
    expect(await only(closeThenClose)).toEqual([settled]);

    const closeThenOpenAgain = new FileAiUsageLedgerRepository(temporaryRoot());
    await closeThenOpenAgain.record(succeeded);
    await closeThenOpenAgain.record(entry());
    await closeThenOpenAgain.record(entry());
    expect(await only(closeThenOpenAgain)).toEqual([settled]);
  });

  it('never lets one account read or count another account rows', async () => {
    const root = temporaryRoot();
    const repository = new FileAiUsageLedgerRepository(root);

    await repository.record(entry());
    await repository.record(
      entry({
        ownerUserId: OTHER_OWNER,
        jobId: OTHER_JOB,
        outcome: 'failed',
        completedAt: COMPLETED_AT,
      }),
    );

    const page = await repository.listForOwner(OWNER, { since: SUBMITTED_AT, pageSize: 10 });
    expect(page.entries).toEqual([entry()]);
    await expect(repository.countByOutcome(OWNER, SUBMITTED_AT)).resolves.toEqual({
      running: 1,
      succeeded: 0,
      failed: 0,
      ambiguous: 0,
      expired: 0,
      cancelled: 0,
    });
    await expect(repository.countByOutcome(OTHER_OWNER, SUBMITTED_AT)).resolves.toMatchObject({
      running: 0,
      failed: 1,
    });
    expect(await readdir(journalDirectory(root))).toHaveLength(2);
  });

  it('pages newest first and hands back a cursor only while older rows remain', async () => {
    const repository = new FileAiUsageLedgerRepository(temporaryRoot());
    const jobIds = [
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
      '44444444-4444-4444-8444-444444444444',
    ];
    // The last two share an instant, so only the job id separates them.
    const submitted = [
      '2026-09-05T10:00:00.000Z',
      '2026-09-05T10:01:00.000Z',
      '2026-09-05T10:02:00.000Z',
      '2026-09-05T10:02:00.000Z',
    ];
    for (const [index, jobId] of jobIds.entries()) {
      await repository.record(entry({ jobId, submittedAt: submitted[index] ?? SUBMITTED_AT }));
    }

    const first = await repository.listForOwner(OWNER, { since: SUBMITTED_AT, pageSize: 2 });
    expect(first.entries.map(({ jobId }) => jobId)).toEqual([jobIds[3], jobIds[2]]);
    expect(first.nextCursor).toEqual({ submittedAt: submitted[2], jobId: jobIds[2] });

    const second = await repository.listForOwner(OWNER, {
      since: SUBMITTED_AT,
      cursor: first.nextCursor ?? undefined,
      pageSize: 2,
    });
    expect(second.entries.map(({ jobId }) => jobId)).toEqual([jobIds[1], jobIds[0]]);
    expect(second.nextCursor).toBeNull();
  });

  it('counts the whole window and nothing submitted before it', async () => {
    const repository = new FileAiUsageLedgerRepository(temporaryRoot());
    const outcomes = ['succeeded', 'failed', 'ambiguous', 'expired', 'cancelled'] as const;
    for (const [index, outcome] of outcomes.entries()) {
      await repository.record(
        entry({
          jobId: `0000000${index}-0000-4000-8000-000000000000`,
          outcome,
          submittedAt: `2026-09-0${index + 2}T10:00:00.000Z`,
          completedAt: `2026-09-0${index + 2}T10:04:00.000Z`,
        }),
      );
    }
    await repository.record(entry({ submittedAt: '2026-09-06T10:00:00.000Z' }));

    await expect(repository.countByOutcome(OWNER, '2026-09-02T00:00:00.000Z')).resolves.toEqual({
      running: 1,
      succeeded: 1,
      failed: 1,
      ambiguous: 1,
      expired: 1,
      cancelled: 1,
    });
    // A window that starts later drops the earlier submissions from both the counts and the page.
    await expect(repository.countByOutcome(OWNER, '2026-09-05T00:00:00.000Z')).resolves.toEqual({
      running: 1,
      succeeded: 0,
      failed: 0,
      ambiguous: 0,
      expired: 1,
      cancelled: 1,
    });
  });

  it('sweeps unsettled rows across owners, oldest first and bounded by the limit', async () => {
    const repository = new FileAiUsageLedgerRepository(temporaryRoot());
    await repository.record(entry({ submittedAt: '2026-09-05T10:03:00.000Z' }));
    await repository.record(
      entry({ jobId: OTHER_JOB, outcome: 'succeeded', completedAt: COMPLETED_AT }),
    );
    await repository.record(
      entry({
        ownerUserId: OTHER_OWNER,
        jobId: '11111111-1111-4111-8111-111111111111',
        submittedAt: '2026-09-05T10:01:00.000Z',
      }),
    );
    await repository.record(
      entry({
        ownerUserId: OTHER_OWNER,
        jobId: '22222222-2222-4222-8222-222222222222',
        submittedAt: '2026-09-05T10:02:00.000Z',
      }),
    );

    await expect(repository.listOpen(2)).resolves.toEqual([
      entry({
        ownerUserId: OTHER_OWNER,
        jobId: '11111111-1111-4111-8111-111111111111',
        submittedAt: '2026-09-05T10:01:00.000Z',
      }),
      entry({
        ownerUserId: OTHER_OWNER,
        jobId: '22222222-2222-4222-8222-222222222222',
        submittedAt: '2026-09-05T10:02:00.000Z',
      }),
    ]);
  });

  it('reads an account with no journal as an empty ledger', async () => {
    const repository = new FileAiUsageLedgerRepository(temporaryRoot());

    await expect(
      repository.listForOwner(OWNER, { since: SUBMITTED_AT, pageSize: 10 }),
    ).resolves.toEqual({ entries: [], nextCursor: null });
    await expect(repository.listOpen(10)).resolves.toEqual([]);
  });

  it('leaves every other file repository reading exactly what it read without the ledger', async () => {
    // The four file stores each own a sibling of `metadata/v1/ai-usage`, so an API build that
    // predates the ledger must not notice the directory at all.
    const readEverything = async (root: string) => {
      await new FileProcessingJobRepository(root).upsert(trace());
      await new FileSavedVoiceRepository(root).save(OWNER, VOICE_ID, null, SUBMITTED_AT);
      return {
        resumable: await new FileProcessingJobRepository(root).listResumable(
          '2026-09-05T10:05:00.000Z',
        ),
        projects: await new FileProjectRepository(root).list(OWNER, {
          lifecycle: 'active',
          pageSize: 10,
        }),
        voices: (await new FileSavedVoiceRepository(root).list(OWNER)).map((voice) => ({
          ...voice,
          // Saving mints a fresh record id, so it differs between two data directories by design.
          id: 'minted',
        })),
        videos: await new FileSavedVideoRepository(root).list(OWNER),
      };
    };

    const without = temporaryRoot();
    const withLedger = temporaryRoot();
    await new FileAiUsageLedgerRepository(withLedger).record(entry());

    expect(await readEverything(withLedger)).toEqual(await readEverything(without));
    expect(await readdir(journalDirectory(withLedger))).toEqual([`${OWNER}.json`]);
  });

  it('refuses a journal written to a schema it does not know, and sweeps past it', async () => {
    const root = temporaryRoot();
    const repository = new FileAiUsageLedgerRepository(root);
    await repository.record(entry({ ownerUserId: OTHER_OWNER, jobId: OTHER_JOB }));
    await writeJournal(root, OWNER, { schemaVersion: 2, entries: [] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    // No repair, no rewrite: an unrecognised journal is a fault its owner's reads must report.
    await expect(
      repository.listForOwner(OWNER, { since: SUBMITTED_AT, pageSize: 10 }),
    ).rejects.toThrow();
    await expect(repository.countByOutcome(OWNER, SUBMITTED_AT)).rejects.toThrow();
    await expect(repository.record(entry())).rejects.toThrow();
    expect(await readJournal(root)).toEqual({ schemaVersion: 2, entries: [] });

    // The reconciler still reaches every other account.
    await expect(repository.listOpen(10)).resolves.toEqual([
      entry({ ownerUserId: OTHER_OWNER, jobId: OTHER_JOB }),
    ]);
    expect(warn).toHaveBeenCalledWith('[ai-usage] Usage journal could not be read.', {
      ownerUserId: OWNER,
      errorClass: 'ZodError',
    });
  });
});
