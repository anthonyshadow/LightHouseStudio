import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  VIDEO_JOB_TTL_MS,
  videoJobStatusResponseSchema,
  type VideoJobStatusResponse,
} from '@studio/contracts';
import type { AiUsageEntry, AiUsageOutcomeCounts } from '@studio/domain';
import { createApp } from '../../app.js';
import { testConfig } from '../../test/fakes.js';
import {
  VideoJobProviderError,
  type ExistingVideoJobProvider,
  type VideoJobProviderStatus,
} from '../../providers/video-jobs/video-job-provider.js';
import type {
  AiUsageLedgerCursor,
  AiUsageLedgerPage,
  AiUsageLedgerRepository,
} from '../ai-usage/ai-usage-ledger-repository.js';
import { AiUsageReconciler } from '../ai-usage/ai-usage-reconciler.js';
import { FileAiUsageLedgerRepository } from '../ai-usage/file-ai-usage-ledger-repository.js';
import { FileProcessingJobRepository } from '../processing-jobs/file-processing-job-repository.js';
import { AI_USAGE_RECONCILE_BATCH } from '../ai-usage/ai-usage-reconciler.js';

/**
 * Slice 2.5, verified at the application boundary: an accepted submission reaches a retrievable
 * result with nobody watching it, that result survives its first download, and one paid submission
 * leaves exactly one usage row however many writers race for it.
 *
 * Everything upstream is a fake in this file. The provider answers from memory and the harness
 * blocks `fetch` outright, so no check here can reach a paid service.
 */

const browserHost = 'localhost:5173';
const ownerDigest = createHash('sha256').update(browserHost).digest('hex');
/** The identity `installAuthentication` derives from the host under `nodeEnv: 'test'`. */
const ownerUserId = `${ownerDigest.slice(0, 8)}-${ownerDigest.slice(8, 12)}-4${ownerDigest.slice(13, 16)}-a${ownerDigest.slice(17, 20)}-${ownerDigest.slice(20, 32)}`;
const providerHeaders = {
  host: browserHost,
  origin: `http://${browserHost}`,
  'x-lightframe-provider-intent': 'video',
};

/** Earlier than any row this suite writes, so a read sees the whole journal. */
const LEDGER_EPOCH = '1970-01-01T00:00:00.000Z';

let fixture: Buffer;

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

/**
 * A provider that answers from memory and hands back the shared decodable fixture.
 *
 * Its status answers are a script rather than a single field: the point of these tests is what
 * happens across `queued`, `processing` and `ready`, and the last entry answers every read after
 * it so a job parked in its final phase stays there.
 */
class ScriptedVideoProvider implements ExistingVideoJobProvider {
  submissions = 0;
  statusCalls = 0;
  downloads = 0;
  statusScript: readonly VideoJobProviderStatus[] = ['completed'];
  submissionFailure: VideoJobProviderError | null = null;

  submit(): Promise<{ readonly providerJobId: string; readonly status: VideoJobProviderStatus }> {
    this.submissions += 1;
    if (this.submissionFailure !== null) return Promise.reject(this.submissionFailure);
    return Promise.resolve({
      providerJobId: `provider-job-${this.submissions}`,
      status: 'pending',
    });
  }

  status(): Promise<{ readonly status: VideoJobProviderStatus }> {
    const index = Math.min(this.statusCalls, this.statusScript.length - 1);
    this.statusCalls += 1;
    return Promise.resolve({ status: this.statusScript[index] ?? 'completed' });
  }

  async download(_providerJobId: string, destinationPath: string): Promise<void> {
    this.downloads += 1;
    await writeFile(destinationPath, fixture, { flag: 'wx', mode: 0o600 });
  }
}

/**
 * The real journal, plus the writes that reached it.
 *
 * Two writers close a row — the path that observed the terminal status and the reconciler — and
 * both propose a `submittedAt`. Only a record of the calls themselves can say which proposal the
 * stored row kept, which is why this wraps the file repository rather than replacing it.
 */
class RecordingAiUsageLedger implements AiUsageLedgerRepository {
  readonly writes: AiUsageEntry[] = [];
  /** Stands in for a journal that cannot be written at the moment a submission needs recording. */
  refuseOpenWrites = false;
  readonly #inner: AiUsageLedgerRepository;

  constructor(inner: AiUsageLedgerRepository) {
    this.#inner = inner;
  }

  async record(entry: AiUsageEntry): Promise<void> {
    this.writes.push(entry);
    if (this.refuseOpenWrites && entry.outcome === null) {
      throw new Error('The usage journal is unavailable.');
    }
    await this.#inner.record(entry);
  }

  listForOwner(
    ownerId: string,
    options: {
      readonly since: string;
      readonly cursor?: AiUsageLedgerCursor | undefined;
      readonly pageSize: number;
    },
  ): Promise<AiUsageLedgerPage> {
    return this.#inner.listForOwner(ownerId, options);
  }

  countByOutcome(ownerId: string, since: string): Promise<AiUsageOutcomeCounts> {
    return this.#inner.countByOutcome(ownerId, since);
  }

  listOpen(limit: number): Promise<readonly AiUsageEntry[]> {
    return this.#inner.listOpen(limit);
  }
}

describe('durable AI outcomes at the application boundary', () => {
  let directory: string;
  let applications: ReturnType<typeof createApp>[];

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'lightframe-durable-ai-outcomes-'));
    applications = [];
    fixture = Buffer.from(
      (
        await readFile(
          new URL('../../../../../e2e/fixtures/decodable-h264-video.base64', import.meta.url),
          'utf8',
        )
      ).replaceAll(/\s/gu, ''),
      'base64',
    );
  });

  afterEach(async () => {
    // The ledger, the traces and the job bytes all live under this directory, so it has to go.
    await Promise.all(applications.map((app) => app.close()));
    await rm(directory, { recursive: true, force: true });
  });

  const application = (
    provider: ExistingVideoJobProvider,
    options: {
      readonly progressionIntervalMs: number;
      readonly usageLedger?: AiUsageLedgerRepository;
    },
  ): ReturnType<typeof createApp> => {
    const app = createApp({
      config: testConfig({
        lightframeDataDir: directory,
        videoJobProgressionIntervalMs: options.progressionIntervalMs,
      }),
      decartVideoProvider: provider,
      ...(options.usageLedger === undefined
        ? {}
        : { persistence: { aiUsageLedger: options.usageLedger } }),
    });
    applications.push(app);
    return app;
  };

  const submitStandalone = (app: ReturnType<typeof createApp>, jobId: string) => {
    const form = new FormData();
    const bytes = new Uint8Array(fixture.byteLength);
    bytes.set(fixture);
    form.append(
      'request',
      JSON.stringify({
        operation: 'character-swap',
        inputKind: 'character',
        prompt: 'Change the lighting',
        enhancePrompt: false,
        hasReferenceImage: false,
        outputResolution: '720p',
      }),
    );
    form.append('data', new Blob([bytes], { type: 'video/mp4' }), 'standalone-source.mp4');
    return app.inject({
      method: 'PUT',
      url: `/api/video-jobs/${jobId}`,
      headers: providerHeaders,
      payload: form,
    });
  };

  const requestStatus = async (
    app: ReturnType<typeof createApp>,
    jobId: string,
  ): Promise<VideoJobStatusResponse> => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/video-jobs/${jobId}`,
      headers: providerHeaders,
    });
    expect(response.statusCode).toBe(200);
    return videoJobStatusResponseSchema.parse(response.json());
  };

  const requestContent = (app: ReturnType<typeof createApp>, jobId: string) =>
    app.inject({
      method: 'GET',
      url: `/api/video-jobs/${jobId}/content`,
      headers: providerHeaders,
    });

  /** Every row this owner's journal holds for one job, read back through the file repository. */
  const ledgerRows = async (jobId: string): Promise<readonly AiUsageEntry[]> => {
    const page = await new FileAiUsageLedgerRepository(directory).listForOwner(ownerUserId, {
      since: LEDGER_EPOCH,
      pageSize: 50,
    });
    return page.entries.filter((entry) => entry.jobId === jobId);
  };

  it('progresses an accepted job to a retrievable, retained result with no client watching', async () => {
    const provider = new ScriptedVideoProvider();
    const app = application(provider, { progressionIntervalMs: 5 });
    // Recorded by the server, not by the caller: an accidental status request from anywhere in
    // this test — a helper, a wait, a retry — lands here and fails the assertion below.
    const served: string[] = [];
    app.addHook('onRequest', (request) => {
      served.push(`${request.method} ${request.url}`);
    });
    const jobId = randomUUID();
    const submittedAtMs = Date.now();

    const accepted = await submitStandalone(app, jobId);
    expect(accepted.statusCode).toBe(202);

    // The client is gone from here. Readiness is observed through the durable trace the server
    // writes for its own recovery, which is a file read rather than a request.
    const traces = new FileProcessingJobRepository(directory);
    await vi.waitFor(
      async () =>
        expect((await traces.findOutcomes(ownerUserId, [jobId])).get(jobId)?.status).toBe('ready'),
      { timeout: 10_000, interval: 10 },
    );
    expect(provider.statusCalls).toBeGreaterThan(0);
    expect(provider.downloads).toBe(1);

    const first = await requestContent(app, jobId);
    expect(first.statusCode).toBe(200);
    expect(first.rawPayload).toEqual(fixture);
    expect(Date.now() - submittedAtMs).toBeLessThan(VIDEO_JOB_TTL_MS);

    expect(served.filter((entry) => entry === `GET /api/video-jobs/${jobId}`)).toEqual([]);

    // The retention half: a delivered standalone result stays admissible until its deadline.
    const second = await requestContent(app, jobId);
    expect(second.statusCode).toBe(200);
    expect(second.rawPayload).toEqual(fixture);
    expect(served.filter((entry) => entry === `GET /api/video-jobs/${jobId}`)).toEqual([]);
    expect(provider.submissions).toBe(1);
    expect(provider.downloads).toBe(1);
  }, 30_000);

  it('leaves the same job where it was when the deployment runs no tick', async () => {
    // The control for the test above. Without it, a job that reached a result unattended proves
    // only that something moved it; with it, the interval is the only thing that changed.
    const provider = new ScriptedVideoProvider();
    const app = application(provider, { progressionIntervalMs: 0 });
    const jobId = randomUUID();

    expect((await submitStandalone(app, jobId)).statusCode).toBe(202);
    const traces = new FileProcessingJobRepository(directory);
    await vi.waitFor(
      async () =>
        expect((await traces.findOutcomes(ownerUserId, [jobId])).get(jobId)?.status).toBe('queued'),
      { timeout: 10_000, interval: 10 },
    );
    await delay(200);

    expect((await traces.findOutcomes(ownerUserId, [jobId])).get(jobId)?.status).toBe('queued');
    expect(provider.submissions).toBe(1);
    expect(provider.statusCalls).toBe(0);
    expect(provider.downloads).toBe(0);
  }, 30_000);

  it('writes one usage row per submission under a tick and client racing for the same job', async () => {
    const provider = new ScriptedVideoProvider();
    // One provider answer per phase, so the client below polls a job that is genuinely queued,
    // then genuinely processing, then ready — rather than one that jumps straight to a result.
    provider.statusScript = ['pending', 'processing', 'completed'];
    const ledger = new RecordingAiUsageLedger(new FileAiUsageLedgerRepository(directory));
    const app = application(provider, { progressionIntervalMs: 5, usageLedger: ledger });
    const jobId = randomUUID();

    const accepted = await submitStandalone(app, jobId);
    expect(accepted.statusCode).toBe(202);

    // The tick keeps running throughout. Both it and this loop reach the job through the same
    // refresh, which is where a second row would appear if the open write were not idempotent.
    const observed = new Set<VideoJobStatusResponse['status']>();
    let ready: VideoJobStatusResponse | null = null;
    for (let attempt = 0; attempt < 1_500 && ready === null; attempt += 1) {
      const body = await requestStatus(app, jobId);
      observed.add(body.status);
      if (body.status === 'ready') ready = body;
      else if (body.error !== null) throw new Error(`The job settled as ${body.status}.`);
      else await delay(10);
    }
    expect(ready).not.toBeNull();
    expect([...observed]).toEqual(expect.arrayContaining(['queued', 'processing', 'ready']));

    await vi.waitFor(async () => expect((await ledgerRows(jobId))[0]?.outcome).toBe('succeeded'), {
      timeout: 10_000,
      interval: 10,
    });
    const rows = await ledgerRows(jobId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      ownerUserId,
      jobId,
      operation: 'character-swap',
      provider: 'decart',
      outcome: 'succeeded',
      completedAt: ready?.updatedAt,
    });
    expect(
      await new FileAiUsageLedgerRepository(directory).countByOutcome(ownerUserId, LEDGER_EPOCH),
    ).toEqual({ running: 0, succeeded: 1, failed: 0, ambiguous: 0, expired: 0, cancelled: 0 });

    // Which writer's instant the row kept. The opener stamps the moment before the provider call;
    // every close proposes the job's creation instant instead, and must not be able to win.
    const opens = ledger.writes.filter((entry) => entry.jobId === jobId && entry.outcome === null);
    const closes = ledger.writes.filter((entry) => entry.jobId === jobId && entry.outcome !== null);
    expect(opens).toHaveLength(1);
    expect(closes.length).toBeGreaterThanOrEqual(1);
    expect(closes.map((entry) => entry.submittedAt)).toContain(ready?.createdAt);
    expect(rows[0]?.submittedAt).toBe(opens[0]?.submittedAt);
    expect(Date.parse(rows[0]?.submittedAt ?? '')).toBeGreaterThanOrEqual(
      Date.parse(ready?.createdAt ?? ''),
    );
    expect(provider.submissions).toBe(1);

    // Restart over the same data directory. Restore resumes the retrieval of a result whose bytes
    // did not survive, and the boot sweep reads the journal; neither may resubmit or re-close.
    await app.close();
    const restarted = application(provider, { progressionIntervalMs: 0 });
    await vi.waitFor(() => expect(provider.downloads).toBe(2), { timeout: 10_000, interval: 10 });
    // Closing awaits both the startup reconciliation and every tracked ledger write.
    await restarted.close();
    expect(provider.submissions).toBe(1);
    expect(await ledgerRows(jobId)).toEqual(rows);

    // And one more explicit sweep, over the stores a restarted deployment would hand it.
    const reconciler = new AiUsageReconciler(
      new FileAiUsageLedgerRepository(directory),
      new FileProcessingJobRepository(directory),
    );
    // A settled row is not open work, so a sweep has nothing to close and writes nothing.
    expect(await reconciler.reconcile(Date.now(), AI_USAGE_RECONCILE_BATCH)).toBe(0);
    expect(await ledgerRows(jobId)).toEqual(rows);
  }, 60_000);

  it('records a refused submission once, as failed, without submitting it again', async () => {
    const provider = new ScriptedVideoProvider();
    provider.submissionFailure = new VideoJobProviderError('rejected');
    const app = application(provider, { progressionIntervalMs: 5 });
    const jobId = randomUUID();

    expect((await submitStandalone(app, jobId)).statusCode).toBe(202);
    await vi.waitFor(async () => expect((await requestStatus(app, jobId)).status).toBe('failed'), {
      timeout: 10_000,
      interval: 10,
    });
    // The job is failed before its row is: closing a row is deliberately fire-and-forget, so that
    // a journal which is slow or down cannot change what the operator's submission did.
    await vi.waitFor(async () => expect((await ledgerRows(jobId))[0]?.outcome).toBe('failed'), {
      timeout: 10_000,
      interval: 10,
    });

    const rows = await ledgerRows(jobId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ outcome: 'failed', provider: 'decart' });
    expect(rows[0]?.completedAt).not.toBeNull();
    // The row was opened before the provider was contacted, so a rejection still has to answer for
    // the attempt — and the rejection itself is never retried.
    expect(provider.submissions).toBe(1);
    expect(
      await new FileAiUsageLedgerRepository(directory).countByOutcome(ownerUserId, LEDGER_EPOCH),
    ).toEqual({ running: 0, succeeded: 0, failed: 1, ambiguous: 0, expired: 0, cancelled: 0 });
  }, 30_000);

  it('never contacts the provider when the ledger refuses to open the row', async () => {
    const provider = new ScriptedVideoProvider();
    const ledger = new RecordingAiUsageLedger(new FileAiUsageLedgerRepository(directory));
    ledger.refuseOpenWrites = true;
    const app = application(provider, { progressionIntervalMs: 5, usageLedger: ledger });
    const jobId = randomUUID();

    expect((await submitStandalone(app, jobId)).statusCode).toBe(202);
    await vi.waitFor(async () => expect((await requestStatus(app, jobId)).status).toBe('failed'), {
      timeout: 10_000,
      interval: 10,
    });

    expect((await requestStatus(app, jobId)).error).toEqual({
      code: 'provider_unavailable',
      message:
        'Visual processing is unavailable because this submission could not be recorded. Nothing was submitted.',
    });
    expect(provider.submissions).toBe(0);
    expect(provider.statusCalls).toBe(0);
    // One refused open and nothing else: no row exists, so there is nothing to close either.
    expect(ledger.writes.filter((entry) => entry.jobId === jobId)).toHaveLength(1);
    expect(await ledgerRows(jobId)).toEqual([]);
  }, 30_000);
});
